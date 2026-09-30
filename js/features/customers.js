import { db, safeKey } from "../core/firebase.js";

export async function saveCustomer(serial, data) {
  if (!serial?.trim()) return;
  await db.ref(`pelanggan/${safeKey(serial)}`).update({
    nama: data.nama || "",
    telp: data.telp || "",
    merk: data.merk || "",
    kelengkapan: data.kelengkapan || ""
  });
}

export async function findCustomer(serial) {
  if (!serial?.trim()) return null;
  const snap = await db.ref(`pelanggan/${safeKey(serial)}`).once("value");
  return snap.exists() ? snap.val() : null;
}
