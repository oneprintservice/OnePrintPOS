import { db } from "../core/firebase.js";

const CATEGORIES = ["sparepart", "tinta", "lisensi", "jasa"];

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
  const data = {
    nama: item.nama.trim(),
    harga_beli: Number(item.harga_beli) || 0,
    harga_jual: Number(item.harga_jual) || 0,
    stok: Number(item.stok) || 0,
    satuan: item.satuan || "pcs",
    minimum: Number(item.minimum) || (kategori === "tinta" ? 100 : 1)
  };
  const targetCategory = editingCategory || kategori;
  await db.ref(`inventori/${targetCategory}/${key}`).set(data);
  if (editingCategory && editingCategory !== kategori) await db.ref(`inventori/${editingCategory}/${editingKey}`).remove();
  return { kategori: targetCategory, key, ...data };
}

export async function removeInventory(kategori, key) {
  await db.ref(`inventori/${kategori}/${key}`).remove();
}

export async function changeStock(item, delta) {
  const unit = (item.satuan || "").toLowerCase();
  const amount = unit === "ml" || unit === "gram" ? 100 : 1;
  const next = Math.max(0, Number(item.stok || 0) + delta * amount);
  await db.ref(`inventori/${item.kategori}/${item.key}/stok`).set(next);
  item.stok = next;
  return next;
}
