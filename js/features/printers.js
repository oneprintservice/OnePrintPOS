import { db, safeKey } from "../core/firebase.js";
import { listServices } from "./services.js";

function normalize(value) {
  return String(value || "").trim();
}

export async function getPrinter(barcode) {
  const code = normalize(barcode);
  if (!code) return null;
  const snap = await db.ref(`printers/${safeKey(code)}`).once("value");
  return snap.exists() ? { key: snap.key, ...snap.val() } : null;
}

export async function savePrinter(data) {
  const barcode = normalize(data?.barcode);
  if (!barcode) return null;

  const key = safeKey(barcode);
  const ref = db.ref(`printers/${key}`);
  const oldSnap = await ref.once("value");
  const old = oldSnap.exists() ? oldSnap.val() : {};

  const printer = {
    barcode,
    serial: normalize(data.serial),
    merk: normalize(data.merk),
    pelanggan: normalize(data.pelanggan),
    telp: normalize(data.telp),
    kelengkapan: normalize(data.kelengkapan),
    createdAt: old.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  await ref.set(printer);
  return { key, ...printer };
}

export async function getPrinterHistory(barcode) {
  const code = normalize(barcode);
  if (!code) return [];

  const services = await listServices();
  return services
    .filter(item =>
      String(item.printerId || "").trim() === code ||
      (!item.printerId && String(item.serial || "").trim() === code)
    )
    .sort((a, b) => {
      const da = new Date(a.tanggal || 0).getTime();
      const db = new Date(b.tanggal || 0).getTime();
      return db - da;
    });
}
