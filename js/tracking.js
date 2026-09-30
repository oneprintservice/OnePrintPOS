const $ = selector => document.querySelector(selector);

const firebaseConfig = {
  apiKey: "AIzaSyBcyS36JnJNGZPdSxd_g9UmCq4BJRiG2rA",
  authDomain: "oneprintservice-db.firebaseapp.com",
  databaseURL: "https://oneprintservice-db-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "oneprintservice-db",
  storageBucket: "oneprintservice-db.firebasestorage.app",
  messagingSenderId: "330853999249",
  appId: "1:330853999249:web:4503ed115d2694d9cb5530"
};

if (!window.firebase) {
  throw new Error("Firebase SDK belum dimuat.");
}
if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const db = firebase.database();

function normalizeCode(value) {
  return String(value ?? "")
    .trim()
    .replace(/^https?:\/\/[^/]+\/tracking(?:\.htr|\.html)?\?tt=/i, "")
    .replace(/^(TT|INV)[-:\s]*/i, "")
    .trim()
    .toUpperCase();
}

function serviceLooksValid(value) {
  return value && typeof value === "object" && !Array.isArray(value) &&
    Boolean(
      value.nomor || value.noNota || value.no_tanda_terima ||
      value.tandaTerima || value.tt || value.invoice ||
      value.pelanggan || value.status || value.merk || value.keluhan
    );
}

function collectServices(node, path = "", out = []) {
  if (!node || typeof node !== "object") return out;
  if (serviceLooksValid(node)) {
    out.push({ key: path, ...node });
    return out;
  }
  Object.entries(node).forEach(([key, value]) => {
    collectServices(value, path ? `${path}/${key}` : key, out);
  });
  return out;
}

function candidateValues(row) {
  const key = String(row.key || "");
  const leaf = key.split("/").pop() || key;
  return [
    key,
    leaf,
    row.nomor,
    row.noNota,
    row.no_tanda_terima,
    row.tandaTerima,
    row.tt,
    row.invoice
  ].filter(v => v !== undefined && v !== null).map(normalizeCode);
}

async function readServices() {
  const roots = ["servis", "services", "service"];
  const results = await Promise.allSettled(
    roots.map(async root => {
      const snap = await db.ref(root).once("value");
      return snap.exists() ? collectServices(snap.val(), root) : [];
    })
  );

  const errors = results.filter(x => x.status === "rejected");
  if (errors.length && !results.some(x => x.status === "fulfilled")) {
    throw errors[0].reason;
  }

  const rows = results
    .filter(x => x.status === "fulfilled")
    .flatMap(x => x.value);

  // Same service can exist in legacy roots; prefer the newest record.
  const map = new Map();
  for (const row of rows) {
    const identity = normalizeCode(
      row.nomor || row.noNota || row.no_tanda_terima ||
      row.tandaTerima || row.tt || row.invoice || row.key
    );
    const old = map.get(identity);
    const rowTime = Date.parse(row.updatedAt || row.tanggal || "") || 0;
    const oldTime = Date.parse(old?.updatedAt || old?.tanggal || "") || 0;
    if (!old || rowTime >= oldTime) map.set(identity, row);
  }
  return [...map.values()];
}

async function findServiceByCode(code) {
  const wanted = normalizeCode(code);
  if (!wanted) return null;

  // Fast path for the normal database structure.
  for (const root of ["servis", "services", "service"]) {
    for (const key of [wanted, `TT-${wanted}`, `INV-${wanted}`]) {
      const snap = await db.ref(`${root}/${key}`).once("value");
      if (snap.exists() && serviceLooksValid(snap.val())) {
        return { key: `${root}/${key}`, ...snap.val() };
      }
    }
  }

  const rows = await readServices();
  return rows.find(row => candidateValues(row).includes(wanted)) || null;
}

function displayNumber(service, fallback = "") {
  const value =
    service?.nomor || service?.noNota || service?.no_tanda_terima ||
    service?.tandaTerima || service?.tt || service?.invoice || fallback || "-";
  const text = String(value).trim();
  return /^TT[-:\s]/i.test(text) ? text : `TT-${text}`;
}

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function run() {
  const value = $("#search").value.trim();
  if (!value) {
    $("#result").innerHTML = "<div class='empty'>Masukkan nomor tanda terima terlebih dahulu.</div>";
    return;
  }

  $("#result").innerHTML = "<div class='loading'>Mencari...</div>";

  try {
    const service = await findServiceByCode(value);

    if (!service) {
      $("#result").innerHTML =
        `<div class='empty'>Nomor tanda terima <b>${esc(value)}</b> tidak ditemukan.</div>`;
      return;
    }

    $("#result").innerHTML = `<div class="track-card">
      <div class="track-head">
        <div><small>Nomor tanda terima</small><h2>${esc(displayNumber(service, value))}</h2></div>
        <span class="status">${esc(service.status || "-")}</span>
      </div>
      <div class="track-grid">
        <div><small>Pelanggan</small><b>${esc(service.pelanggan || service.nama || "-")}</b></div>
        <div><small>Perangkat</small><b>${esc(service.merk || service.tipe || "-")}</b></div>
        <div><small>Teknisi</small><b>${esc(service.teknisi || "-")}</b></div>
        <div><small>Total</small><b>Rp ${Number(service.total || 0).toLocaleString("id-ID")}</b></div>
      </div>
      <div class="track-note">
        <small>Keterangan</small>
        <p>${esc(service.keterangan || service.catatan || "Belum ada keterangan tambahan.")}</p>
      </div>
    </div>`;
  } catch (err) {
    console.error("OnePrint tracking:", err);
    $("#result").innerHTML =
      "<div class='empty'>Tracking gagal dimuat. Periksa koneksi atau izin akses database.</div>";
  }
}

const params = new URLSearchParams(location.search);
const initialCode = params.get("tt") || params.get("no") || params.get("nota") || "";
$("#search").value = initialCode;
$("#form").addEventListener("submit", event => {
  event.preventDefault();
  run();
});

if (initialCode) run();
