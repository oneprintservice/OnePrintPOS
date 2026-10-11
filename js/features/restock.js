import { db } from "../core/firebase.js";
import { getHistoricalMargin } from "./inventory.js";

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

  const itemRef = db.ref(`inventori/${kategori}/${item.key}`);
  const itemSnap = await itemRef.once("value");
  const latestItem = itemSnap.val() || item;
  const stockSnap = await itemRef.child("stok").once("value");
  const current = Math.max(0, Number(stockSnap.val() || 0));
  const stockAdded = packages * packSize;
  const next = current + stockAdded;
  const oldPackSize = liquid
    ? Math.max(1, Number(latestItem.isi_kemasan_beli) || 1000)
    : 1;
  const legacyHpp = Math.max(0, Number(latestItem.harga_beli) || 0) / oldPackSize;
  const oldHpp = current > 0
    ? Math.max(0, Number(latestItem.hpp_rata_rata_per_dasar ?? legacyHpp) || 0)
    : 0;
  const newUnitCost = liquid ? unitCost / packSize : unitCost;
  const weightedHpp = next > 0
    ? ((current * oldHpp) + (stockAdded * newUnitCost)) / next
    : newUnitCost;
  const sellSize = liquid ? Math.max(1, Number(latestItem.isi_jual) || 100) : 1;
  const currentHppPerSale = oldHpp * sellSize;
  const historicalMargin = getHistoricalMargin({
    ...latestItem,
    hpp_rata_rata_per_dasar: current > 0 ? oldHpp : legacyHpp,
    harga_jual: latestItem.harga_jual
  });
  const hasManualTarget = latestItem.target_margin_source === "manual"
    && latestItem.target_margin !== null
    && latestItem.target_margin !== undefined
    && latestItem.target_margin !== "";
  const targetMargin = hasManualTarget
    ? Math.min(90, Math.max(0, Number(latestItem.target_margin) || 0))
    : historicalMargin;
  const targetAvailable = targetMargin !== null && Number.isFinite(targetMargin);
  const effectiveHpp = weightedHpp * sellSize;
  const basePrice = targetAvailable ? effectiveHpp / (1 - targetMargin / 100) : 0;
  const remainder = basePrice % 10000;
  let suggestedPrice = 0;
  if (targetAvailable) {
    if (remainder <= 1000) suggestedPrice = Math.floor(basePrice / 10000) * 10000;
    else if (remainder <= 5000) suggestedPrice = Math.floor(basePrice / 10000) * 10000 + 5000;
    else if (remainder <= 6000) suggestedPrice = Math.floor(basePrice / 10000) * 10000 + 5000;
    else suggestedPrice = (Math.floor(basePrice / 10000) + 1) * 10000;
    // Never allow custom rounding to undercut the configured/historical target margin.
    if (suggestedPrice + 0.000001 < basePrice) suggestedPrice = Math.ceil(basePrice / 5000) * 5000;
    suggestedPrice = Math.max(0, Math.round(suggestedPrice));
  }
  const currentSalePrice = Math.max(0, Number(latestItem.harga_jual) || 0);
  const previousRecommendation = latestItem.rekomendasi_harga || null;
  const recommendation = !targetAvailable
    ? {
        status: "needs_target",
        harga_sekarang: currentSalePrice,
        harga_saran: null,
        hpp_rata_rata: weightedHpp,
        target_margin: null,
        restock_id: "",
        dibuat_pada: new Date().toISOString()
      }
    : Math.abs(suggestedPrice - currentSalePrice) >= 1
    ? {
        status: "pending",
        harga_sekarang: currentSalePrice,
        harga_saran: suggestedPrice,
        hpp_rata_rata: weightedHpp,
        target_margin: targetMargin,
        margin_sekarang: currentSalePrice > 0 ? ((currentSalePrice - effectiveHpp) / currentSalePrice) * 100 : 0,
        margin_saran: suggestedPrice > 0 ? ((suggestedPrice - effectiveHpp) / suggestedPrice) * 100 : 0,
        restock_id: "",
        dibuat_pada: new Date().toISOString()
      }
    : {
        status: "none",
        harga_sekarang: currentSalePrice,
        harga_saran: suggestedPrice,
        hpp_rata_rata: weightedHpp,
        target_margin: targetMargin,
        restock_id: "",
        dibuat_pada: new Date().toISOString()
      };

  const id = db.ref("restock").push().key;
  if (!id) throw new Error("Gagal membuat ID restock");
  const date = tanggal
    ? new Date(`${tanggal}T12:00:00`).toISOString()
    : (() => {
      const now = new Date();
      return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0).toISOString();
    })();
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

  recommendation.restock_id = id;
  restock.hpp_rata_rata_per_dasar = weightedHpp;
  restock.harga_beli_per_dasar = newUnitCost;
  restock.hpp_per_unit_jual = weightedHpp * sellSize;
  restock.target_margin_sumber = hasManualTarget ? "manual" : (targetAvailable ? "historical" : "needs_target");
  restock.hpp_sebelum = oldHpp;
  restock.hpp_setelah = weightedHpp;
  restock.rekomendasi_sebelumnya = previousRecommendation;

  const updates = {};
  updates[`restock/${id}`] = restock;
  updates[`inventori/${kategori}/${item.key}/stok`] = next;
  updates[`inventori/${kategori}/${item.key}/hpp_rata_rata_per_dasar`] = weightedHpp;
  updates[`inventori/${kategori}/${item.key}/rekomendasi_harga`] = recommendation;
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
  if (restock.hpp_sebelum !== undefined) {
    updates[`inventori/${restock.kategori}/${restock.itemKey}/hpp_rata_rata_per_dasar`] =
      Number(restock.hpp_sebelum) || null;
    updates[`inventori/${restock.kategori}/${restock.itemKey}/rekomendasi_harga`] =
      restock.rekomendasi_sebelumnya || null;
  }
  await db.ref().update(updates);

  return {
    ...restock,
    stokBaru: Number(result.snapshot.val() || 0)
  };
}
