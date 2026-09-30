import { db } from "./core/firebase.js";

const $ = selector => document.querySelector(selector);

function normalizeCode(value = "") {
  let text = String(value || "").trim();
  if (!text) return "";

  // QR may contain the full public tracking URL.
  try {
    const url = new URL(text);
    const params = url.searchParams;
    text =
      params.get("tt") ||
      params.get("no") ||
      params.get("nomor") ||
      params.get("invoice") ||
      params.get("id") ||
      text;
  } catch (_) {}

  text = text.trim();
  text = text.replace(/^.*[?#](?:tt|no|nomor|invoice|id)=/i, "");
  text = text.replace(/^(TT|INV)[\s\-_:]*/i, "");
  return text.trim();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function serviceLooksValid(value) {
  return !!value && typeof value === "object" && !Array.isArray(value) &&
    Boolean(value.nomor || value.noNota || value.invoice || value.tandaTerima ||
      value.status || value.pelanggan || value.merk || value.keluhan);
}

async function directLookup(code) {
  const clean = normalizeCode(code);
  if (!clean) return null;

  const candidates = new Set([
    clean,
    `TT-${clean}`,
    `INV-${clean}`
  ]);

  for (const candidate of candidates) {
    for (const root of ["servis", "services", "service"]) {
      const snap = await db.ref(`${root}/${candidate}`).once("value");
      if (snap.exists() && serviceLooksValid(snap.val())) {
        return { key: `${root}/${candidate}`, ...snap.val() };
      }
    }
  }

  // Legacy-safe fallback: read the service roots and compare all known
  // identifier fields, not just the Firebase key.
  for (const root of ["servis", "services", "service"]) {
    const snap = await db.ref(root).once("value");
    if (!snap.exists()) continue;

    let found = null;
    snap.forEach(child => {
      if (found) return;
      const value = child.val();
      if (!serviceLooksValid(value)) return;

      const identifiers = [
        child.key,
        value.nomor,
        value.noNota,
        value.invoice,
        value.tandaTerima,
        value.tt,
        value.noTT,
        value.nomorTT
      ].filter(Boolean).map(normalizeCode);

      if (identifiers.includes(clean)) {
        found = { key: `${root}/${child.key}`, ...value };
      }
    });
    if (found) return found;
  }

  return null;
}

function serviceNumber(data, fallback) {
  return data.nomor || data.noNota || data.tandaTerima || data.invoice || fallback;
}

function renderResult(data, searchedCode) {
  if (!data) {
    $("#result").innerHTML = `<div class="empty">Nomor servis <strong>${escapeHtml(searchedCode)}</strong> tidak ditemukan.</div>`;
    return;
  }

  const nomor = serviceNumber(data, searchedCode);
  const total = Number(data.total ?? data.grandTotal ?? data.totalHarga ?? 0);

  $("#result").innerHTML = `
    <div class="track-card">
      <div class="track-head">
        <div><small>Nomor tanda terima</small><h2>${escapeHtml(String(nomor).startsWith("TT-") ? nomor : `TT-${nomor}`)}</h2></div>
        <span class="status">${escapeHtml(data.status || "BELUM ADA STATUS")}</span>
      </div>
      <div class="track-grid">
        <div><small>Pelanggan</small><b>${escapeHtml(data.pelanggan || data.namaPelanggan || "-")}</b></div>
        <div><small>Perangkat</small><b>${escapeHtml(data.merk || data.tipe || data.device || "-")}</b></div>
        <div><small>Serial / Barcode</small><b>${escapeHtml(data.serial || data.printerId || data.barcode || "-")}</b></div>
        <div><small>Teknisi</small><b>${escapeHtml(data.teknisi || data.technician || "-")}</b></div>
        <div><small>Tanggal masuk</small><b>${escapeHtml(data.tanggal ? new Date(data.tanggal).toLocaleDateString("id-ID") : "-")}</b></div>
        <div><small>Total</small><b>Rp ${total.toLocaleString("id-ID")}</b></div>
      </div>
      <div class="track-note">
        <small>Keluhan</small><p>${escapeHtml(data.keluhan || "-")}</p>
      </div>
      <div class="track-note">
        <small>Keterangan terbaru</small><p>${escapeHtml(data.keterangan || data.catatan || "Belum ada keterangan tambahan.")}</p>
      </div>
    </div>`;
}

let scanner = null;
let scanning = false;

async function stopCamera() {
  if (!scanner) return;
  try { await scanner.stop(); } catch (_) {}
  try { scanner.clear(); } catch (_) {}
  scanner = null;
  scanning = false;
}

function extractQrValue(text) {
  const value = String(text || "").trim();
  if (!value) return "";

  // If it is a tracking URL, navigate to it. This makes QR scanning work
  // exactly like opening the QR from another camera/scanner app.
  try {
    const url = new URL(value);
    const isTrackingPage =
      /tracking\.html?$/i.test(url.pathname) ||
      /oneprintservice\.web\.id$/i.test(url.hostname);

    if (isTrackingPage && url.searchParams.toString()) {
      return { url: url.href, code: normalizeCode(url.href) };
    }
  } catch (_) {}

  return { url: null, code: normalizeCode(value) };
}

async function startCamera() {
  if (!window.Html5Qrcode) {
    $("#camera-status").textContent = "Scanner kamera belum termuat. Muat ulang halaman lalu coba lagi.";
    return;
  }

  await stopCamera();
  $("#scan-panel").hidden = false;
  $("#camera-status").textContent = "Meminta izin kamera...";

  scanner = new Html5Qrcode("track-reader");

  const onSuccess = async decodedText => {
    const parsed = extractQrValue(decodedText);
    if (!parsed?.code) return;

    await stopCamera();
    $("#scan-panel").hidden = true;
    $("#search").value = parsed.code;

    // A QR containing the actual tracking URL opens that URL directly.
    if (parsed.url) {
      const current = new URL(location.href);
      const target = new URL(parsed.url, location.href);
      if (target.href !== current.href) {
        location.href = target.href;
        return;
      }
    }

    await runTracking(parsed.code);
  };

  const config = {
    fps: 10,
    qrbox: { width: 240, height: 240 },
    aspectRatio: 1
  };

  try {
    await scanner.start({ facingMode: { exact: "environment" } }, config, onSuccess, () => {});
  } catch (firstError) {
    try {
      await scanner.start({ facingMode: "environment" }, config, onSuccess, () => {});
    } catch (secondError) {
      await stopCamera();
      $("#camera-status").textContent =
        "Kamera tidak dapat diaktifkan. Pastikan izin kamera diberikan dan halaman dibuka melalui HTTPS.";
      console.error("Tracking camera error", firstError, secondError);
    }
  }

  if (scanning) $("#camera-status").textContent = "Kamera aktif. Arahkan ke QR pada nota.";
  scanning = true;
}

async function runTracking(value = $("#search").value) {
  const clean = normalizeCode(value);
  if (!clean) {
    $("#result").innerHTML = `<div class="empty">Masukkan nomor tanda terima terlebih dahulu.</div>`;
    return;
  }

  $("#search").value = clean;
  $("#result").innerHTML = `<div class="loading">Mencari data servis...</div>`;

  try {
    const data = await directLookup(clean);
    renderResult(data, clean);
  } catch (error) {
    console.error("Tracking lookup error", error);
    $("#result").innerHTML = `<div class="empty">Gagal mengambil data tracking. Periksa koneksi lalu coba lagi.</div>`;
  }
}

$("#form").addEventListener("submit", event => {
  event.preventDefault();
  stopCamera();
  $("#scan-panel").hidden = true;
  runTracking();
});

$("#open-camera").addEventListener("click", startCamera);
$("#close-camera").addEventListener("click", async () => {
  await stopCamera();
  $("#scan-panel").hidden = true;
});

const initial = new URLSearchParams(location.search).get("tt") ||
  new URLSearchParams(location.search).get("no") ||
  new URLSearchParams(location.search).get("nomor") ||
  new URLSearchParams(location.search).get("invoice");

if (initial) {
  $("#search").value = normalizeCode(initial);
  runTracking(initial);
}
