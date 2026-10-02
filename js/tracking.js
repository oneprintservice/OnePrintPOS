import { getService } from "./features/services.js?v=20261002-fix5";

const $ = s => document.querySelector(s);
const params = new URLSearchParams(location.search);
const initialCode = params.get("tt") || params.get("nomor") || "";

function normalizeCode(value) {
  return String(value || "")
    .trim()
    .replace(/^https?:\/\/[^/]+\/servis\//i, "")
    .replace(/^\/?servis\//i, "")
    .replace(/^(TT|INV)[-:]/i, "");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function run() {
  const raw = $("#search").value.trim();
  const nomor = normalizeCode(raw);
  if (!nomor) {
    $("#result").innerHTML = "<div class='empty'>Masukkan nomor servis.</div>";
    return;
  }

  $("#result").innerHTML = "<div class='loading'>Mencari...</div>";

  try {
    const service = await getService(nomor);
    if (!service) {
      $("#result").innerHTML = "<div class='empty'>Nomor servis tidak ditemukan.</div>";
      return;
    }

    $("#result").innerHTML = `<div class="track-card">
      <div class="track-head">
        <div><small>Nomor servis</small><h2>${escapeHtml(service.nomor || nomor)}</h2></div>
        <span class="status">${escapeHtml(service.status || "-")}</span>
      </div>
      <div class="track-grid">
        <div><small>Pelanggan</small><b>${escapeHtml(service.pelanggan || "-")}</b></div>
        <div><small>Perangkat</small><b>${escapeHtml(service.merk || "-")}</b></div>
        <div><small>Teknisi</small><b>${escapeHtml(service.teknisi || "-")}</b></div>
        <div><small>Total</small><b>Rp ${Number(service.total || 0).toLocaleString("id-ID")}</b></div>
      </div>
      <div class="track-note"><small>Keterangan</small><p>${escapeHtml(service.keterangan || "Belum ada keterangan tambahan.")}</p></div>
    </div>`;
  } catch (error) {
    console.error(error);
    $("#result").innerHTML = "<div class='empty'>Tracking gagal dimuat. Periksa koneksi.</div>";
  }
}

let qrScanner = null;
let scanning = false;

async function stopScanner() {
  if (qrScanner) {
    try { await qrScanner.stop(); } catch {}
    try { await qrScanner.clear(); } catch {}
    qrScanner = null;
  }
  scanning = false;
  $("#scanner-wrap").hidden = true;
  $("#scan").textContent = "▣ Scan QR";
}

async function startScanner() {
  if (scanning) return stopScanner();
  if (!window.Html5Qrcode) {
    $("#scan-status").textContent = "Scanner tidak tersedia. Periksa koneksi internet.";
    return;
  }

  $("#scanner-wrap").hidden = false;
  $("#scan").textContent = "Tutup Scanner";
  $("#scan-status").textContent = "Meminta akses kamera...";
  qrScanner = new Html5Qrcode("tracking-reader");

  try {
    let camera = { facingMode: "environment" };
    try {
      const cameras = await Html5Qrcode.getCameras();
      if (cameras.length) {
        camera = (cameras.find(x => /back|rear|environment|belakang/i.test(x.label)) || cameras[0]).id;
      }
    } catch {}

    scanning = true;
    await qrScanner.start(camera, {
      fps: 10,
      qrbox: { width: 250, height: 250 },
      aspectRatio: 1
    }, async decodedText => {
      const nomor = normalizeCode(decodedText);
      $("#search").value = nomor;
      await stopScanner();
      await run();
    }, () => {});
  } catch (error) {
    console.error(error);
    await stopScanner();
    $("#scan-status").textContent = "Kamera tidak dapat dibuka. Izinkan kamera dan gunakan HTTPS.";
  }
}

$("#search").value = initialCode;
$("#form").addEventListener("submit", event => {
  event.preventDefault();
  run();
});
$("#scan").addEventListener("click", startScanner);
window.addEventListener("pagehide", stopScanner);
if (initialCode) run();
