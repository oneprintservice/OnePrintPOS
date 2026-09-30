import { db } from "../core/firebase.js";

const SERVICE_ROOTS = ["servis", "services", "service"];
const TERMINAL_STATUSES = new Set(["DIAMBIL", "CANCEL"]);

function looksLikeService(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Boolean(value.nomor || value.pelanggan || value.status || value.merk || value.keluhan || value.telp || value.serial);
}

function collectServices(node, path = "", out = []) {
  if (!node || typeof node !== "object") return out;
  if (looksLikeService(node)) {
    out.push({ key: path, ...node });
    return out;
  }
  Object.entries(node).forEach(([key, value]) => collectServices(value, path ? `${path}/${key}` : key, out));
  return out;
}

async function readRoot(root) {
  const snap = await db.ref(root).once("value");
  return snap.exists() ? collectServices(snap.val(), root) : [];
}

function parseDate(value) {
  if (!value) return 0;
  const direct = new Date(value).getTime();
  if (!Number.isNaN(direct)) return direct;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function dedupe(rows) {
  const map = new Map();
  rows.forEach(row => {
    const identity = row.nomor || row.key || `${row.pelanggan || ""}-${row.tanggal || ""}`;
    const old = map.get(identity);
    if (!old || parseDate(row.updatedAt || row.tanggal) >= parseDate(old.updatedAt || old.tanggal)) map.set(identity, row);
  });
  return [...map.values()].sort((a, b) => parseDate(b.tanggal) - parseDate(a.tanggal));
}

export async function listServices() {
  // Read all known roots so legacy databases are not silently ignored.
  const groups = await Promise.all(SERVICE_ROOTS.map(readRoot));
  return dedupe(groups.flat());
}

export async function getService(key) {
  if (!key) return null;
  const clean = String(key).replace(/^TT-|^INV-/i, "");
  for (const root of SERVICE_ROOTS) {
    const directPath = clean.startsWith(`${root}/`) ? clean : `${root}/${clean}`;
    const snap = await db.ref(directPath).once("value");
    if (snap.exists() && looksLikeService(snap.val())) return { key: directPath, ...snap.val() };
  }
  const rows = await listServices();
  return rows.find(row =>
    row.key === key || row.key === clean || row.nomor === clean || row.nomor === key
  ) || null;
}

export async function findServiceByCode(code) {
  const normalized = String(code || "").trim().replace(/^(TT|INV)[-:]/i, "");
  if (!normalized) return null;
  return getService(normalized);
}

export async function saveService(key, data) {
  const target = key
    ? (key.includes("/") ? key : `servis/${key}`)
    : `servis/${data.nomor}`;
  await db.ref(target).set(data);
  return target;
}

export async function removeService(key) {
  const target = key.includes("/") ? key : `servis/${key}`;
  await db.ref(target).remove();
}

export function makeServiceNumber(date = new Date()) {
  return `${String(date.getFullYear()).slice(-2)}${String(date.getMonth()+1).padStart(2,"0")}${String(date.getDate()).padStart(2,"0")}${String(date.getHours()).padStart(2,"0")}${String(date.getMinutes()).padStart(2,"0")}${String(date.getSeconds()).padStart(2,"0")}`;
}

export function isVisibleService(service, now = new Date()) {
  const status = String(service.status || "").trim().toUpperCase();
  // Dashboard/list keeps the current month + previous calendar month.
  // Older records remain visible only while not DIAMBIL/CANCEL.
  if (!TERMINAL_STATUSES.has(status)) return true;
  const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const date = parseDate(service.tanggal);
  return date >= start.getTime();
}

export function filterOperationalServices(services, now = new Date()) {
  return services.filter(x => isVisibleService(x, now));
}

export function stats(services, now = new Date()) {
  const rows = filterOperationalServices(services, now);
  return rows.reduce((s, x) => {
    const status = String(x.status || "").trim().toUpperCase();
    s.total++;
    if (["MASUK","DIAGNOSA","DIKERJAKAN"].includes(status)) s.aktif++;
    if (status === "MASUK") s.baru++;
    if (status === "MENUNGGU SPAREPART") s.sparepart++;
    if (status === "SELESAI") s.selesai++;
    if (status === "DIAMBIL") s.diambil++;
    return s;
  }, { total: 0, aktif: 0, baru: 0, sparepart: 0, selesai: 0, diambil: 0 });
}
