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


export async function deleteRestock(restockKey) {
  const key = String(restockKey || "").trim();
  if (!key) throw new Error("Data restock tidak ditemukan.");

  const restockRef = db.ref(`restock/${key}`);
  const snap = await restockRef.once("value");
  if (!snap.exists()) throw new Error("Restock ini sudah dihapus atau tidak ditemukan.");

  const row = snap.val() || {};
  if (row.fromLedger || !row.itemKey || !row.kategori || Number(row.qty) <= 0) {
    throw new Error("Riwayat restock ini tidak memiliki data item yang aman untuk dikembalikan.");
  }

  const qty = Number(row.qty);
  const stockRef = db.ref(`inventori/${row.kategori}/${row.itemKey}/stok`);

  // Atomically check the current stock so we never restore a negative stock.
  let previousStock = 0;
  const tx = await stockRef.transaction(current => {
    const currentStock = Number(current || 0);
    previousStock = currentStock;
    if (currentStock < qty) return;
    return currentStock - qty;
  });

  if (!tx.committed) {
    throw new Error(`Stok saat ini tidak cukup untuk membatalkan restock ${qty} ${row.satuan || "pcs"}.`);
  }

  try {
    // Restock and its automatic expense share the same deterministic key.
    await db.ref().update({
      [`restock/${key}`]: null,
      [`keuangan/${key}`]: null
    });
  } catch (error) {
    // Compensate if the final delete fails after stock was decremented.
    await stockRef.set(previousStock);
    throw error;
  }

  return {
    key,
    itemKey: row.itemKey,
    kategori: row.kategori,
    qty,
    nama: row.nama || row.itemKey,
    stokBaru: Number(tx.snapshot.val() || 0)
  };
}
