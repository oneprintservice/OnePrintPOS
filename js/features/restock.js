import { db, safeKey } from "../core/firebase.js";

const NUM = (...values) => {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== "" && Number.isFinite(Number(value))) {
      return Number(value);
    }
  }
  return 0;
};

function normalizeRow(key, raw = {}) {
  const item = raw.item && typeof raw.item === "object" ? raw.item : {};
  const kategori = String(
    raw.kategori ?? raw.category ?? raw.kategoriBarang ?? item.kategori ?? item.category ?? ""
  ).trim().toLowerCase();

  const itemKey = String(
    raw.itemKey ?? raw.inventoryKey ?? raw.barangKey ?? raw.keyBarang ??
    raw.item_id ?? raw.itemId ?? item.key ?? ""
  ).trim();

  const nama = String(
    raw.nama ?? raw.namaBarang ?? raw.barang ?? raw.itemName ?? item.nama ?? ""
  ).trim();

  const qty = NUM(raw.qty, raw.quantity, raw.jumlah, raw.amountQty, raw.stokMasuk, item.qty, item.quantity);
  const satuan = String(raw.satuan ?? raw.unit ?? item.satuan ?? "pcs").trim();
  const harga = NUM(raw.harga_beli, raw.hargaBeli, raw.price, raw.unitPrice, item.harga_beli);
  const total = NUM(raw.total, raw.subtotal, raw.jumlahHarga, raw.totalHarga, raw.amount, qty * harga);

  return {
    key,
    ...raw,
    tanggal: raw.tanggal ?? raw.date ?? raw.createdAt ?? "",
    itemKey,
    kategori,
    nama,
    qty,
    satuan,
    harga_beli: harga,
    total,
    supplier: raw.supplier ?? "",
    catatan: raw.catatan ?? raw.note ?? ""
  };
}

export async function listRestocks(limit = 200) {
  const snap = await db.ref("restock").once("value");
  if (!snap.exists()) return [];

  const rows = [];
  snap.forEach(child => {
    const raw = child.val();
    if (raw && typeof raw === "object") rows.push(normalizeRow(child.key, raw));
  });

  return rows
    .sort((a, b) => (Date.parse(b.tanggal) || 0) - (Date.parse(a.tanggal) || 0))
    .slice(0, limit);
}

export async function createRestock({ item, kategori, qty, hargaBeli, supplier, tanggal, catatan }) {
  const amount = Math.max(0, Number(qty) || 0);
  const unitCost = Math.max(0, Number(hargaBeli) || 0);
  if (!item?.key || !kategori || amount <= 0) throw new Error("Data restock tidak lengkap");

  const stockRef = db.ref(`inventori/${kategori}/${item.key}/stok`);
  const stockSnap = await stockRef.once("value");
  const current = Number(stockSnap.val() || 0);
  const next = current + amount;
  const id = `${Date.now()}_${safeKey(item.key)}`;
  const date = tanggal ? new Date(`${tanggal}T12:00:00`).toISOString() : new Date().toISOString();
  const total = amount * unitCost;

  const restock = {
    tanggal: date,
    itemKey: item.key,
    nama: item.nama || "",
    kategori,
    qty: amount,
    satuan: item.satuan || "pcs",
    harga_beli: unitCost,
    total,
    supplier: supplier || "",
    catatan: catatan || ""
  };

  const updates = {};
  updates[`restock/${id}`] = restock;
  updates[`inventori/${kategori}/${item.key}/stok`] = next;
  if (total > 0) {
    updates[`keuangan/${id}`] = {
      tanggal: date,
      tipe: "PENGELUARAN",
      kategori: "RESTOCK",
      sumber: "RESTOCK",
      referensi: id,
      keterangan: `Restock ${item.nama || item.key}`,
      jumlah: total,
      supplier: supplier || ""
    };
  }

  await db.ref().update(updates);
  return normalizeRow(id, { ...restock, stokBaru: next });
}

async function resolveInventory(row) {
  if (row.kategori && row.itemKey) {
    const snap = await db.ref(`inventori/${row.kategori}/${row.itemKey}`).once("value");
    if (snap.exists()) return { kategori: row.kategori, key: row.itemKey, data: snap.val() || {} };
  }

  // Compatibility for older restock records that stored only the item name.
  if (!row.nama) return null;
  const categories = row.kategori ? [row.kategori] : ["sparepart", "tinta", "lisensi", "jasa"];
  const candidates = [];
  for (const kategori of categories) {
    const snap = await db.ref(`inventori/${kategori}`).once("value");
    if (!snap.exists()) continue;
    snap.forEach(child => {
      const data = child.val() || {};
      if (String(data.nama || "").trim().toLowerCase() === row.nama.toLowerCase()) {
        candidates.push({ kategori, key: child.key, data });
      }
    });
  }
  return candidates.length === 1 ? candidates[0] : null;
}

export async function deleteRestock(key) {
  if (!key) throw new Error("Restock tidak valid");

  const restockRef = db.ref(`restock/${key}`);
  const snap = await restockRef.once("value");
  if (!snap.exists()) throw new Error("Riwayat restock sudah tidak ada.");

  const row = normalizeRow(key, snap.val());
  if (!(row.qty > 0)) throw new Error("Jumlah restock pada data ini tidak valid.");

  const inventory = await resolveInventory(row);
  if (!inventory) {
    throw new Error("Barang inventori untuk restock ini tidak dapat diidentifikasi dengan aman.");
  }

  const stockRef = db.ref(`inventori/${inventory.kategori}/${inventory.key}/stok`);
  const tx = await stockRef.transaction(current => {
    const stock = Number(current || 0);
    if (stock < row.qty) return; // abort transaction
    return stock - row.qty;
  });

  if (!tx.committed) {
    throw new Error(`Stok ${row.nama || inventory.data.nama || "barang"} saat ini kurang dari ${row.qty}. Restock tidak dihapus.`);
  }

  // Remove the restock record and every ledger entry explicitly referring to it.
  const updates = {};
  updates[`restock/${key}`] = null;

  const ledgerSnap = await db.ref("keuangan").once("value");
  if (ledgerSnap.exists()) {
    ledgerSnap.forEach(child => {
      const value = child.val() || {};
      const isRestock =
        String(value.sumber || "").toUpperCase() === "RESTOCK" ||
        String(value.kategori || "").toUpperCase() === "RESTOCK";
      const refersToThis = String(value.referensi || "") === String(key) || child.key === String(key);
      if (isRestock && refersToThis) updates[`keuangan/${child.key}`] = null;
    });
  }

  try {
    await db.ref().update(updates);
  } catch (error) {
    // Best effort rollback of the stock if deletion write fails.
    await stockRef.transaction(current => Number(current || 0) + row.qty);
    throw error;
  }

  return { ...row, kategori: inventory.kategori, itemKey: inventory.key, stokDikurangi: row.qty };
}
