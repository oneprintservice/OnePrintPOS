import { db } from "../core/firebase.js";

export async function listRestocks(limit = Infinity) {
  const snap = await db.ref("restock").once("value");
  if (!snap.exists()) return [];
  const rows = [];
  snap.forEach(child => rows.push({ key: child.key, ...child.val() }));
  const sorted = rows.sort((a,b) => new Date(b.tanggal || 0) - new Date(a.tanggal || 0));
  return Number.isFinite(limit) ? sorted.slice(0, limit) : sorted;
}

export async function createRestock({ item, kategori, qty, hargaBeli, supplier, tanggal, catatan }) {
  const amount = Math.max(0, Number(qty) || 0);
  const unitCost = Math.max(0, Number(hargaBeli) || 0);
  if (!item?.key || !kategori || amount <= 0) throw new Error("Data restock tidak lengkap");

  const stockSnap = await db.ref(`inventori/${kategori}/${item.key}/stok`).once("value");
  const current = Number(stockSnap.val() || 0);
  const next = current + amount;
  // Gunakan key unik Firebase, bukan Date.now(), agar dua input restock
  // yang dibuat sangat berdekatan tidak saling menimpa.
  const id = db.ref("restock").push().key;
  if (!id) throw new Error("Gagal membuat ID restock");
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
      jumlah: total, supplier: supplier || "", itemKey: item.key, nama: item.nama || "", kategori_item: kategori, qty: amount, satuan: item.satuan || "pcs", harga_beli: unitCost
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
