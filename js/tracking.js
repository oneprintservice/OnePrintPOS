import { getService } from "./features/services.js";

const $ = (selector) => document.querySelector(selector);

const form = $("#form");
const search = $("#search");
const result = $("#result");
const manualPanel = $("#manual-panel");
const scanPanel = $("#scan-panel");
const startScanButton = $("#start-scan");
const stopScanButton = $("#stop-scan");
const scannerBox = $("#scanner-box");
const scanMessage = $("#scan-message");

let scanner = null;
let scanning = false;

function escapeHtml(value) {
  return String(value ?? "-")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function cleanCode(value) {
  let raw = String(value || "").trim();
  if (!raw) return "";

  try {
    raw = decodeURIComponent(raw);
  } catch (_) {}

  // QR nota OnePrint biasanya berisi URL tracking?tt=...
  try {
    const url = new URL(raw);
    const fromQuery =
      url.searchParams.get("tt") ||
      url.searchParams.get("nomor") ||
      url.searchParams.get("invoice") ||
      url.searchParams.get("code");
    if (fromQuery) raw = fromQuery;
  } catch (_) {}

  // Tetap toleran terhadap QR yang hanya berisi TT-xxxx / INV-xxxx
  const prefixed = raw.match(/\b(?:TT|INV)\s*[-:#]?\s*([A-Za-z0-9_-]+)\b/i);
  if (prefixed) return prefixed[1].trim();

  return raw
    .replace(/^https?:\/\/[^/]+/i, "")
    .replace(/^[/#?]+/, "")
    .trim();
}

function displayCode(service, fallback) {
  const nomor = service?.nomor || fallback || "-";
  return /^TT-/i.test(nomor) || /^INV-/i.test(nomor) ? nomor : `TT-${nomor}`;
}

function rupiah(value) {
  return `Rp ${Number(value || 0).toLocaleString("id-ID")}`;
}

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "long",
    year: "numeric"
  });
}

function statusClass(status) {
  return `status status-${String(status || "")
    .toLowerCase()
    .replaceAll(" ", "-")}`;
}

function renderLoading() {
  result.innerHTML = `
    <div class="track-loading">
      <span class="track-spinner"></span>
      <div>
        <strong>Mencari data servis...</strong>
        <small>Mohon tunggu sebentar.</small>
      </div>
    </div>`;
}

function renderEmpty(code) {
  result.innerHTML = `
    <div class="track-empty">
      <div class="track-empty-icon">?</div>
      <div>
        <strong>Nomor servis tidak ditemukan</strong>
        <p>${escapeHtml(code || "Nomor belum diisi")} belum ditemukan di data OnePrint.</p>
        <small>Periksa kembali nomor pada nota, atau scan ulang QR.</small>
      </div>
    </div>`;
}

function renderError() {
  result.innerHTML = `
    <div class="track-empty track-error">
      <div class="track-empty-icon">!</div>
      <div>
        <strong>Data belum dapat dimuat</strong>
        <p>Terjadi gangguan saat mengambil data servis.</p>
        <small>Coba lagi beberapa saat lagi.</small>
      </div>
    </div>`;
}

function renderService(service, fallbackCode) {
  const status = String(service.status || "-").trim();
  const code = displayCode(service, fallbackCode);
  const device = [service.merk, service.model].filter(Boolean).join(" ") || service.perangkat || "-";
  const serial = service.serial || service.noSerial || service.serialNumber || "";
  const customer = service.pelanggan || service.namaPelanggan || "-";
  const technician = service.teknisi || "-";
  const phone = service.telp || service.telepon || "";
  const complaint = service.keluhan || "-";
  const note = service.keterangan || service.catatan || "Belum ada keterangan tambahan.";

  result.innerHTML = `
    <article class="track-result-card">
      <header class="track-result-head">
        <div>
          <span class="track-label">NOMOR TANDA TERIMA</span>
          <h2>${escapeHtml(code)}</h2>
          <small>Diperbarui dari data servis OnePrint</small>
        </div>
        <span class="${statusClass(status)}">${escapeHtml(status)}</span>
      </header>

      <div class="track-summary">
        <div class="track-summary-main">
          <span class="track-label">PERANGKAT</span>
          <strong>${escapeHtml(device)}</strong>
          ${serial ? `<small>Serial: ${escapeHtml(serial)}</small>` : ""}
        </div>
        <div class="track-summary-price">
          <span class="track-label">TOTAL</span>
          <strong>${rupiah(service.total)}</strong>
        </div>
      </div>

      <div class="track-info-grid">
        <div>
          <span>Pelanggan</span>
          <b>${escapeHtml(customer)}</b>
          ${phone ? `<small>${escapeHtml(phone)}</small>` : ""}
        </div>
        <div>
          <span>Tanggal masuk</span>
          <b>${escapeHtml(formatDate(service.tanggal))}</b>
        </div>
        <div>
          <span>Teknisi</span>
          <b>${escapeHtml(technician)}</b>
        </div>
        <div>
          <span>Status</span>
          <b>${escapeHtml(status)}</b>
        </div>
      </div>

      <div class="track-detail">
        <div>
          <span class="track-label">KELUHAN / PEKERJAAN</span>
          <p>${escapeHtml(complaint).replaceAll("\\n", "<br>")}</p>
        </div>
        <div>
          <span class="track-label">KETERANGAN TERBARU</span>
          <p>${escapeHtml(note).replaceAll("\\n", "<br>")}</p>
        </div>
      </div>
    </article>`;
}

async function lookup(rawValue) {
  const code = cleanCode(rawValue);
  if (!code) {
    result.innerHTML = `
      <div class="track-empty">
        <div class="track-empty-icon">i</div>
        <div>
          <strong>Nomor belum diisi</strong>
          <p>Masukkan nomor tanda terima atau scan QR pada nota.</p>
        </div>
      </div>`;
    return null;
  }

  search.value = /^TT-|^INV-/i.test(String(rawValue).trim())
    ? String(rawValue).trim()
    : code;

  renderLoading();

  try {
    const service = await getService(code);
    if (!service) {
      renderEmpty(code);
      return null;
    }
    renderService(service, code);
    return service;
  } catch (error) {
    console.error("Tracking lookup failed:", error);
    renderError();
    return null;
  }
}

function setMethod(method) {
  document.querySelectorAll(".track-method").forEach((button) => {
    const active = button.dataset.method === method;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
  });

  const manual = method === "manual";
  manualPanel.classList.toggle("active", manual);
  scanPanel.classList.toggle("active", !manual);
  manualPanel.hidden = !manual;
  scanPanel.hidden = manual;

  if (manual) {
    stopScanner();
    setTimeout(() => search.focus(), 50);
  }
}

async function startScanner() {
  if (scanning) return;

  if (!window.Html5Qrcode) {
    scanMessage.textContent = "Modul kamera belum siap. Muat ulang halaman lalu coba lagi.";
    return;
  }

  scannerBox.hidden = false;
  scanMessage.textContent = "Meminta izin kamera...";
  startScanButton.disabled = true;

  try {
    scanner = new window.Html5Qrcode("qr-reader");

    const config = {
      fps: 10,
      qrbox: (viewfinderWidth, viewfinderHeight) => {
        const size = Math.floor(Math.min(viewfinderWidth, viewfinderHeight) * 0.68);
        return { width: size, height: size };
      },
      aspectRatio: 1
    };

    const onSuccess = async (decodedText) => {
      const code = cleanCode(decodedText);
      if (!code || scanning === false) return;

      scanMessage.textContent = "QR terbaca. Mencari data servis...";
      await stopScanner();
      setMethod("manual");
      search.value = /^TT-|^INV-/i.test(code) ? code : code;
      await lookup(code);
    };

    const onFailure = () => {
      // Jangan menampilkan error setiap frame; scanner memang terus mencoba.
    };

    try {
      await scanner.start({ facingMode: "environment" }, config, onSuccess, onFailure);
    } catch (_) {
      const cameras = await window.Html5Qrcode.getCameras();
      const backCamera =
        cameras.find((camera) => /back|rear|environment/i.test(camera.label)) ||
        cameras[0];

      if (!backCamera) throw new Error("Kamera tidak ditemukan.");

      await scanner.start(backCamera.id, config, onSuccess, onFailure);
    }

    scanning = true;
    scanMessage.textContent = "Arahkan QR ke dalam kotak.";
  } catch (error) {
    console.error("Camera start failed:", error);
    scanner = null;
    scanning = false;
    scannerBox.hidden = true;
    scanMessage.textContent =
      "Kamera tidak dapat dibuka. Pastikan izin kamera diizinkan dan halaman dibuka melalui HTTPS.";
  } finally {
    startScanButton.disabled = false;
  }
}

async function stopScanner() {
  if (!scanner) {
    scanning = false;
    scannerBox.hidden = true;
    return;
  }

  scanning = false;
  try {
    await scanner.stop();
    await scanner.clear();
  } catch (error) {
    console.warn("Camera stop:", error);
  }
  scanner = null;
  scannerBox.hidden = true;
}

document.querySelectorAll(".track-method").forEach((button) => {
  button.addEventListener("click", () => setMethod(button.dataset.method));
});

form.addEventListener("submit", (event) => {
  event.preventDefault();
  lookup(search.value);
});

startScanButton.addEventListener("click", startScanner);
stopScanButton.addEventListener("click", stopScanner);

window.addEventListener("pagehide", stopScanner);

const initialCode = new URLSearchParams(location.search).get("tt");
if (initialCode) {
  search.value = initialCode;
  lookup(initialCode);
} else {
  setMethod("manual");
}
