import { db, safeKey } from "../core/firebase.js";

function parseDate(value) {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;

  const raw = String(value).trim();
  if (!raw) return null;

  // Firebase timestamps / numeric dates.
  if (/^\d{10,13}$/.test(raw)) {
    const n = Number(raw);
    const d = new Date(raw.length === 10 ? n * 1000 : n);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  // Indonesian date formats: DD/MM/YYYY or DD-MM-YYYY.
  let m = raw.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})(?:\s+.*)?$/);
  if (m) {
    const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), 12, 0, 0);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  // HTML date input: YYYY-MM-DD.
  m = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/);
  if (m) {
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function isoFromDateInput(value) {
  const d = parseDate(value);
  return d ? d.toISOString() : new Date().toISOString();
}

export function ledgerMonth(value) {
  const d = parseDate(value);
  if (!d) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function ledgerDate(value) {
  return parseDate(value);
}

export function formatLedgerDate(value) {
  const d = parseDate(value);
  return d ? d.toLocaleDateString("id-ID") : "-";
}

export async function listLedger(limit = 300) {
  const snap = await db.ref("keuangan").once("value");
  if (!snap.exists()) return [];

  const rows = [];
  snap.forEach(child => {
    const value = child.val();
    if (!value || typeof value !== "object") return;
    rows.push({ key: child.key, ...value });
  });

  return rows
    .sort((a, b) => {
      const da = parseDate(a.tanggal)?.getTime() || 0;
      const dbv = parseDate(b.tanggal)?.getTime() || 0;
      return dbv - da;
    })
    .slice(0, limit);
}

export async function saveLedger(data, key = null) {
  const tipe = data.tipe === "PENGELUARAN" ? "PENGELUARAN" : "PEMASUKAN";
  const jumlah = Math.max(0, Number(data.jumlah) || 0);
  if (jumlah <= 0) throw new Error("Jumlah transaksi harus lebih dari 0.");

  const sumber = String(data.sumber || "MANUAL").toUpperCase();
  const baseKey = safeKey(data.keterangan || "transaksi");
  const id = key || (
    sumber === "MANUAL"
      ? `MANUAL_${Date.now()}_${baseKey}`
      : `${Date.now()}_${baseKey}`
  );

  const payload = {
    tanggal: isoFromDateInput(data.tanggal),
    tipe,
    kategori: data.kategori || "LAINNYA",
    sumber,
    referensi: data.referensi || "",
    keterangan: data.keterangan || "",
    jumlah
  };

  await db.ref(`keuangan/${id}`).set(payload);
  return { key: id, ...payload };
}

export async function removeLedger(key) {
  if (!key) throw new Error("Referensi transaksi tidak ditemukan.");
  await db.ref(`keuangan/${key}`).remove();
}
