import { db, safeKey } from "../core/firebase.js";
import { listServices } from "./services.js";
import { getPrinter, savePrinter } from "./printers.js";

function normalize(value) {
  return String(value ?? "").trim();
}

export async function getUnit(code) {
  const id = normalize(code);
  if (!id) return null;
  const snap = await db.ref(`unit/${safeKey(id)}`).once("value");
  if (snap.exists()) return { key: snap.key, ...snap.val() };

  // Backward compatibility with the existing printer-identity records.
  const legacy = await getPrinter(id);
  if (!legacy) return null;
  return {
    ...legacy,
    unitId: legacy.unitId || legacy.barcode || id,
    barcode: legacy.barcode || id
  };
}

export async function saveUnit(data) {
  const unitId = normalize(data?.unitId || data?.barcode);
  if (!unitId) return null;

  const key = safeKey(unitId);
  const ref = db.ref(`unit/${key}`);
  const oldSnap = await ref.once("value");
  const old = oldSnap.exists() ? oldSnap.val() : {};
  const now = new Date().toISOString();

  const unit = {
    unitId,
    barcode: unitId,
    serial: normalize(data.serial),
    merk: normalize(data.merk),
    pelanggan: normalize(data.pelanggan),
    telp: normalize(data.telp),
    kelengkapan: normalize(data.kelengkapan),
    catatan: normalize(data.catatan),
    createdAt: old.createdAt || now,
    updatedAt: now
  };

  await ref.set(unit);

  // Keep the legacy /printers path synchronized so existing data/tools remain usable.
  await savePrinter({
    barcode: unitId,
    serial: unit.serial,
    merk: unit.merk,
    pelanggan: unit.pelanggan,
    telp: unit.telp,
    kelengkapan: unit.kelengkapan
  });

  return { key, ...unit };
}

export async function getUnitHistory(unitId) {
  const id = normalize(unitId);
  if (!id) return [];

  const services = await listServices();
  return services
    .filter(item =>
      String(item.unitId || item.printerId || "").trim() === id ||
      (!item.unitId && !item.printerId && String(item.serial || "").trim() === id)
    )
    .sort((a, b) => {
      const da = new Date(a.tanggal || 0).getTime();
      const db = new Date(b.tanggal || 0).getTime();
      return db - da;
    });
}
