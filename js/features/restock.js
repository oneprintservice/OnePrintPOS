import { db, safeKey } from "../core/firebase.js";

export async function listRestocks(limit = 80) {
  const snap = await db.ref("restock").once("value");
  if (!snap.exists()) return [];
  const rows = [];
  snap.forEach(child => rows.push({ key: child.key, ...child.val() }));
  return rows
    .sort((a, b) => (Date.parse(b.tanggal || "") || 0) - (Date.parse(a.tanggal || "") || 0))
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

  const updates = {
    [`restock/${id}`]: restock,
    [`inventori/${kategori}/${item.key}/stok`]: next
  };

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
  return { key: id, ...restock, stokBaru: next };
}

export async function removeRestock(restockKey) {
  if (!restockKey) throw new Error("Data restock tidak ditemukan.");

  const restockRef = db.ref(`restock/${restockKey}`);
  const snap = await restockRef.once("value");
  if (!snap.exists()) throw new Error("Riwayat restock sudah tidak ada.");

  const row = snap.val() || {};
  const kategori = String(row.kategori || "").trim();
  const itemKey = String(row.itemKey || "").trim();
  const qty = Number(row.qty || 0);

  if (!kategori || !itemKey || !Number.isFinite(qty) || qty <= 0) {
    throw new Error("Data restock tidak lengkap untuk mengembalikan stok.");
  }

  const stockRef = db.ref(`inventori/${kategori}/${itemKey}/stok`);
  let previousStock = 0;
  let newStock = 0;

  const tx = await stockRef.transaction(current => {
    previousStock = Number(current || 0);
    if (previousStock < qty) return;
    newStock = previousStock - qty;
    return newStock;
  });

  if (!tx.committed) {
    throw new Error(`Stok saat ini (${previousStock}) kurang dari qty restock (${qty}). Restock tidak dihapus.`);
  }

  try {
    // New restocks use the same deterministic key in both paths.
    // Also remove any ledger entry that references this restock, which
    // covers older data where the ledger key and restock key differ.
    const ledgerSnap = await db.ref("keuangan")
      .orderByChild("referensi")
      .equalTo(String(restockKey))
      .once("value");

    const updates = {
      [`restock/${restockKey}`]: null,
      [`keuangan/${restockKey}`]: null
    };

    if (ledgerSnap.exists()) {
      ledgerSnap.forEach(child => {
        updates[`keuangan/${child.key}`] = null;
      });
    }

    await db.ref().update(updates);
  } catch (err) {
    // Never leave the stock reduced when deleting the history/ledger failed.
    await stockRef.set(previousStock);
    throw err;
  }

  return {
    key: restockKey,
    ...row,
    stokSebelum: previousStock,
    stokSesudah: newStock
  };
}
