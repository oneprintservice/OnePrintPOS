import { db, safeKey } from "../core/firebase.js";

export async function listRestocks(limit = 80) {
  const snap = await db.ref("restock").once("value");
  if (!snap.exists()) return [];
  const rows = [];
  snap.forEach(child => rows.push({ key: child.key, ...child.val() }));
  return rows.sort((a,b) => new Date(b.tanggal || 0) - new Date(a.tanggal || 0)).slice(0, limit);
}

export async function createRestock({ item, kategori, qty, hargaBeli, supplier, tanggal, catatan }) {
  const amount = Math.max(0, Number(qty) || 0);
  const unitCost = Math.max(0, Number(hargaBeli) || 0);
  if (!item?.key || !kategori || amount <= 0) throw new Error("Data restock tidak lengkap");

  const stockSnap = await db.ref(`inventori/${kategori}/${item.key}/stok`).once("value");
  const current = Number(stockSnap.val() || 0);
  const next = current + amount;
  const id = `${Date.now()}_${safeKey(item.key)}`;
  const date = tanggal ? new Date(`${tanggal}T12:00:00`).toISOString() : new Date().toISOString();
  const total = amount * unitCost;

  const restock = {
    tanggal: date, itemKey: item.key, nama: item.nama || "", kategori,
    qty: amount, satuan: item.satuan || "pcs", harga_beli: unitCost,
    total, supplier: supplier || "", catatan: catatan || ""
  };
  const updates = {};
  updates[`restock/${id}`] = restock;
  updates[`inventori/${kategori}/${item.key}/stok`] = next;
  if (total > 0) {
    updates[`keuangan/${id}`] = {
      tanggal: date, tipe: "PENGELUARAN", kategori: "RESTOCK",
      sumber: "RESTOCK", referensi: id, keterangan: `Restock ${item.nama || item.key}`,
      jumlah: total, supplier: supplier || ""
    };
  }
  await db.ref().update(updates);
  return { key: id, ...restock, stokBaru: next };
}
