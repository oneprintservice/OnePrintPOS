import { db } from "../core/firebase.js";

export async function listRestocks(limit = 50) {
  const snap = await db.ref("restock").once("value");
  if (!snap.exists()) return [];
  const rows = [];
  snap.forEach(child => {
    const value = child.val();
    // Ignore malformed/null legacy children instead of failing the entire
    // history read. One bad node must never make the UI show only a locally
    // created record.
    if (!value || typeof value !== "object" || Array.isArray(value)) return;
    rows.push({ key: child.key, ...value });
  });
  const sorted = rows.sort((a, b) => {
    const byDate = (Date.parse(b.tanggal || 0) || 0) - (Date.parse(a.tanggal || 0) || 0);
    return byDate || String(b.key || "").localeCompare(String(a.key || ""));
  });
  return Number.isFinite(limit) ? sorted.slice(0, limit) : sorted;
}

export async function createRestock({
  item,
  kategori,
  qty,
  hargaBeli,
  supplier,
  tanggal,
  catatan,
  isiKemasan
}) {
  const packages = Math.max(0, Number(qty) || 0);
  const unitCost = Math.max(0, Number(hargaBeli) || 0);
  if (!item?.key || !kategori || packages <= 0) throw new Error("Data restock tidak lengkap");

  const baseUnit = String(item.satuan || "pcs").toLowerCase();
  const liquid = baseUnit === "ml" || baseUnit === "gram";
  const packSize = liquid
    ? Math.max(1, Number(isiKemasan) || Number(item.isi_kemasan_beli) || 1000)
    : 1;

  const stockAdded = packages * packSize;
  const stockSnap = await db.ref(`inventori/${kategori}/${item.key}/stok`).once("value");
  const current = Number(stockSnap.val() || 0);
  const next = current + stockAdded;

  const id = db.ref("restock").push().key;
  if (!id) throw new Error("Gagal membuat ID restock");
  const date = tanggal ? new Date(`${tanggal}T12:00:00`).toISOString() : new Date().toISOString();
  const total = packages * unitCost;

  const restock = {
    tanggal: date,
    itemKey: item.key,
    nama: item.nama || "",
    kategori,
    qty: stockAdded,
    qty_kemasan: packages,
    isi_kemasan: packSize,
    satuan: baseUnit,
    satuan_kemasan: liquid ? `${packSize} ${baseUnit}/kemasan` : baseUnit,
    harga_beli: unitCost,
    harga_beli_per_dasar: liquid ? unitCost / packSize : unitCost,
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
      supplier: supplier || "",
      itemKey: item.key,
      nama: item.nama || "",
      kategori_item: kategori,
      qty: stockAdded,
      qty_kemasan: packages,
      isi_kemasan: packSize,
      satuan: baseUnit,
      harga_beli: unitCost
    };
  }
  await db.ref().update(updates);
  return { key: id, ...restock, stokBaru: next };
}


export async function removeRestock(restock) {
  if (!restock?.key || !restock?.itemKey || !restock?.kategori) {
    throw new Error("Data restock tidak lengkap untuk rollback");
  }

  const amount = Math.max(0, Number(restock.qty) || 0);
  if (amount <= 0) throw new Error("Qty restock tidak valid");

  const stockRef = db.ref(`inventori/${restock.kategori}/${restock.itemKey}/stok`);
  const result = await stockRef.transaction(current => {
    const stock = Number(current || 0);
    return Math.max(0, stock - amount);
  });

  if (!result.committed) throw new Error("Rollback stok dibatalkan");

  const updates = {};
  updates[`restock/${restock.key}`] = null;
  updates[`keuangan/${restock.key}`] = null;
  await db.ref().update(updates);

  return {
    ...restock,
    stokBaru: Number(result.snapshot.val() || 0)
  };
}
