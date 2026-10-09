import { db } from "../core/firebase.js";

const CATEGORIES = ["sparepart", "tinta", "cairan", "lisensi", "jasa"];

function looksLikeItem(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Boolean(value.nama || value.harga_jual !== undefined || value.harga_beli !== undefined || value.stok !== undefined);
}

function collectItems(node, path, kategori, out = []) {
  if (!node || typeof node !== "object") return out;
  if (looksLikeItem(node)) {
    const parts = path.split("/");
    out.push({ kategori, key: parts[parts.length - 1], ...node });
    return out;
  }
  Object.entries(node).forEach(([key, value]) => collectItems(value, `${path}/${key}`, kategori, out));
  return out;
}

export async function listInventory() {
  const groups = await Promise.all(CATEGORIES.map(async kategori => {
    const snap = await db.ref(`inventori/${kategori}`).once("value");
    return snap.exists() ? collectItems(snap.val(), `inventori/${kategori}`, kategori) : [];
  }));
  const map = new Map();
  groups.flat().forEach(item => map.set(`${item.kategori}/${item.key}`, item));
  return [...map.values()].sort((a, b) => String(a.nama || "").localeCompare(String(b.nama || ""), "id"));
}

export async function saveInventory(item, editingKey = null, editingCategory = null) {
  const kategori = item.kategori;
  const key = editingKey || item.nama.trim().toUpperCase().replace(/[.#$[\]\/]/g, "_").replace(/\s+/g, "_");
  const baseUnit = String(item.satuan || "pcs").toLowerCase();
  const liquid = baseUnit === "ml" || baseUnit === "gram";
  const sellSize = liquid
    ? Math.max(1, Number(item.isi_jual) || 100)
    : 1;
  const purchasePackSize = liquid
    ? Math.max(1, Number(item.isi_kemasan_beli) || 1000)
    : 1;

  const data = {
    nama: item.nama.trim(),
    harga_beli: Number(item.harga_beli) || 0,
    harga_jual: Number(item.harga_jual) || 0,
    stok: Number(item.stok) || 0,
    satuan: baseUnit,
    isi_jual: sellSize,
    satuan_jual: item.satuan_jual || (liquid ? `${sellSize}${baseUnit}` : baseUnit),
    isi_kemasan_beli: purchasePackSize,
    satuan_kemasan_beli: item.satuan_kemasan_beli || (liquid ? `botol/${purchasePackSize}${baseUnit}` : baseUnit),
    minimum: Number(item.minimum) || (liquid ? sellSize : 1),
    target_margin: Math.min(90, Math.max(0, Number(item.target_margin ?? item.targetMargin) || 25))
  };
  const targetCategory = editingCategory || kategori;
  const existingSnap = editingKey
    ? await db.ref(`inventori/${targetCategory}/${key}`).once("value")
    : null;
  const existing = existingSnap?.val() || {};
  if (Number.isFinite(Number(existing.hpp_rata_rata_per_dasar)) && existing.hpp_rata_rata_per_dasar !== undefined) {
    data.hpp_rata_rata_per_dasar = Number(existing.hpp_rata_rata_per_dasar);
  }
  if (existing.rekomendasi_harga) data.rekomendasi_harga = existing.rekomendasi_harga;
  await db.ref(`inventori/${targetCategory}/${key}`).set(data);
  if (editingCategory && editingCategory !== kategori) await db.ref(`inventori/${editingCategory}/${editingKey}`).remove();
  return { kategori: targetCategory, key, ...data };
}

export async function removeInventory(kategori, key) {
  await db.ref(`inventori/${kategori}/${key}`).remove();
}

export async function changeStock(item, delta) {
  const unit = (item.satuan || "").toLowerCase();
  const amount = (unit === "ml" || unit === "gram")
    ? Math.max(1, Number(item.isi_jual) || 100)
    : 1;
  const next = Math.max(0, Number(item.stok || 0) + delta * amount);
  await db.ref(`inventori/${item.kategori}/${item.key}/stok`).set(next);
  item.stok = next;
  return next;
}


export async function applyPriceRecommendation(kategori, key) {
  const ref = db.ref(`inventori/${kategori}/${key}`);
  const snap = await ref.once("value");
  const item = snap.val();
  const rec = item?.rekomendasi_harga;
  if (!item || !rec || rec.status !== "pending" || !Number.isFinite(Number(rec.harga_saran))) {
    throw new Error("Rekomendasi harga tidak tersedia atau sudah diproses");
  }
  const now = new Date().toISOString();
  const updates = {};
  updates[`inventori/${kategori}/${key}/harga_jual`] = Number(rec.harga_saran);
  updates[`inventori/${kategori}/${key}/rekomendasi_harga/status`] = "applied";
  updates[`inventori/${kategori}/${key}/rekomendasi_harga/diproses_pada`] = now;
  updates[`inventori/${kategori}/${key}/riwayat_harga/${db.ref().push().key}`] = {
    harga_sebelum: Number(item.harga_jual || 0),
    harga_sesudah: Number(rec.harga_saran),
    hpp_rata_rata: Number(rec.hpp_rata_rata || 0),
    target_margin: Number(rec.target_margin || 25),
    sumber: "rekomendasi_restok",
    restock_id: rec.restock_id || "",
    tanggal: now
  };
  await db.ref().update(updates);
  return Number(rec.harga_saran);
}

export async function declinePriceRecommendation(kategori, key) {
  const ref = db.ref(`inventori/${kategori}/${key}`);
  const snap = await ref.once("value");
  const item = snap.val();
  const rec = item?.rekomendasi_harga;
  if (!item || !rec || rec.status !== "pending") {
    throw new Error("Rekomendasi harga tidak tersedia atau sudah diproses");
  }
  await ref.child("rekomendasi_harga").update({
    status: "declined",
    diproses_pada: new Date().toISOString()
  });
}
