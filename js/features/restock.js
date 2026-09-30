import { db, safeKey } from "../core/firebase.js";

export async function listRestocks(limit = 100) {
  const snap = await db.ref("restock").once("value");
  if (!snap.exists()) return [];

  const rows = [];
  snap.forEach((child) => rows.push({
    key: child.key,
    ...child.val(),
    _source: "restock"
  }));

  return rows
    .sort((a, b) => (Date.parse(b.tanggal) || 0) - (Date.parse(a.tanggal) || 0))
    .slice(0, limit);
}

export async function createRestock({
  item,
  kategori,
  qty,
  hargaBeli,
  supplier,
  tanggal,
  catatan
}) {
  const amount = Math.max(0, Number(qty) || 0);
  const unitCost = Math.max(0, Number(hargaBeli) || 0);

  if (!item?.key || !kategori || amount <= 0) {
    throw new Error("Data restock tidak lengkap.");
  }

  const stockRef = db.ref(`inventori/${kategori}/${item.key}/stok`);
  const stockSnap = await stockRef.once("value");
  const current = Number(stockSnap.val() || 0);
  const next = current + amount;

  const id = `${Date.now()}_${safeKey(item.key)}`;
  const date = tanggal
    ? new Date(`${tanggal}T12:00:00`).toISOString()
    : new Date().toISOString();
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

async function removeMatchingRestockLedger(restockKey) {
  const financeSnap = await db.ref("keuangan").once("value");
  if (!financeSnap.exists()) return [];

  const updates = [];
  financeSnap.forEach((child) => {
    const row = child.val() || {};
    const source = String(row.sumber || row.kategori || "").toUpperCase();
    const reference = String(row.referensi || "");
    if (source === "RESTOCK" && reference === String(restockKey)) {
      updates.push(`keuangan/${child.key}`);
    }
  });
  return updates;
}

/**
 * Deletes a restock safely.
 *
 * New/complete records:
 *   - decrement inventory stock
 *   - remove restock record
 *   - remove every linked RESTOCK expense ledger entry
 *
 * Legacy records without item linkage:
 *   - remove the restock record and linked ledger only
 *   - never guess an inventory item, so stock is not changed incorrectly
 *
 * Ledger-only legacy rows are handled separately by the UI through
 * deleteRestockLedgerOnly().
 */
export async function deleteRestock(restockKey) {
  const key = String(restockKey || "").trim();
  if (!key) throw new Error("Data restock tidak ditemukan.");

  const restockRef = db.ref(`restock/${key}`);
  const snap = await restockRef.once("value");

  if (!snap.exists()) {
    throw new Error("Restock ini sudah dihapus atau tidak ditemukan.");
  }

  const row = snap.val() || {};
  const qty = Number(row.qty || 0);
  const hasStockLink = Boolean(row.itemKey && row.kategori && qty > 0);

  let previousStock = null;
  let newStock = null;
  let stockRef = null;

  if (hasStockLink) {
    stockRef = db.ref(`inventori/${row.kategori}/${row.itemKey}/stok`);

    const tx = await stockRef.transaction((current) => {
      const currentStock = Number(current || 0);
      if (currentStock < qty) return;
      return currentStock - qty;
    });

    if (!tx.committed) {
      const current = Number((await stockRef.once("value")).val() || 0);
      throw new Error(
        `Stok saat ini ${current} ${row.satuan || "pcs"}, ` +
        `sedangkan restock yang dibatalkan ${qty} ${row.satuan || "pcs"}.`
      );
    }

    newStock = Number(tx.snapshot.val() || 0);
    previousStock = newStock + qty;
  }

  try {
    const ledgerPaths = await removeMatchingRestockLedger(key);
    const updates = {
      [`restock/${key}`]: null
    };
    ledgerPaths.forEach((path) => {
      updates[path] = null;
    });

    await db.ref().update(updates);
  } catch (error) {
    if (stockRef && previousStock !== null) {
      try {
        await stockRef.set(previousStock);
      } catch (rollbackError) {
        console.error("OnePrint: rollback stok restock gagal", rollbackError);
      }
    }
    throw error;
  }

  return {
    key,
    itemKey: row.itemKey || "",
    kategori: row.kategori || "",
    qty,
    nama: row.nama || row.itemKey || "Restock",
    stokBaru: newStock,
    stockReverted: hasStockLink
  };
}

/**
 * Legacy ledger-only restock:
 * delete only the ledger row. There is no safe inventory reference to reverse.
 */
export async function deleteRestockLedgerOnly(ledgerKey) {
  const key = String(ledgerKey || "").trim();
  if (!key) throw new Error("Transaksi restock tidak ditemukan.");

  const ref = db.ref(`keuangan/${key}`);
  const snap = await ref.once("value");
  if (!snap.exists()) throw new Error("Transaksi restock sudah dihapus atau tidak ditemukan.");

  const row = snap.val() || {};
  const source = String(row.sumber || row.kategori || "").toUpperCase();
  if (source !== "RESTOCK") {
    throw new Error("Transaksi ini bukan transaksi restock.");
  }

  await ref.remove();
  return { key };
}
