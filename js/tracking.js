import { getService } from "./features/services.js?v=20261002-fix2";

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

$("#search").value = initialCode;
$("#form").addEventListener("submit", event => {
  event.preventDefault();
  run();
});
if (initialCode) run();
