import { findServiceByCode } from "./features/services.js";

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
let scanHandled = false;

function escapeHtml(value) {
  return String(value ?? "-")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function decodeMaybe(value) {
  let text = String(value || "").trim();
  for (let i = 0; i < 2; i++) {
    try {
      const decoded = decodeURIComponent(text);
      if (decoded === text) break;
      text = decoded;
    } catch (_) {
      break;
    }
  }
  return text.trim();
}

function normalizeTrackingCode(value) {
  let raw = decodeMaybe(value);
  if (!raw) return "";

  // QR may contain the full tracking URL.
  try {
    const url = new URL(raw, window.location.origin);
    const params = url.searchParams;
    const fromQuery =
      params.get("tt") ||
      params.get("no") ||
      params.get("nota") ||
      params.get("nomor") ||
      params.get("invoice") ||
      params.get("code");
    if (fromQuery) raw = decodeMaybe(fromQuery);
  } catch (_) {
    // Not a URL; continue as plain text.
  }

  raw = raw
    .replace(/^https?:\/\/[^/]+/i, "")
    .replace(/^[/#?]+/, "")
    .trim();

  // Accept TT-xxxx, INV-xxxx and the bare service number.
  const prefixed = raw.match(/(?:^|[\s=:\/])(?:TT|INV)\s*[-:]?\s*([A-Za-z0-9._-]+)/i);
  if (prefixed) return prefixed[1].trim();

  return raw.replace(/^(TT|INV)\s*[-:]?\s*/i, "").trim();
}

function displayNumber(service, fallback = "") {
  const value =
    service?.nomor ||
    service?.noNota ||
    service?.no_tanda_terima ||
    service?.tandaTerima ||
    service?.tt ||
    service?.invoice ||
    fallback ||
    "-";
  const text = String(value).trim();
  return /^TT[-:\s]/i.test(text) || /^INV[-:\s]/i.test(text) ? text : `TT-${text}`;
}

function rupiah(value) {
  return `Rp ${Number(value || 0).toLocaleString("id-ID")}`;
}

function formatDate(value) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString("id-ID", {
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
        <small>Periksa nomor pada nota atau scan QR sekali lagi.</small>
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
  const code = displayNumber(service, fallbackCode);
  const device = [
    service.merk,
    service.model || service.tipe || service.perangkat
  ].filter(Boolean).join(" ") || "-";
  const serial = service.serial || service.noSerial || service.serialNumber || "";
  const customer = service.pelanggan || service.namaPelanggan || service.nama || "-";
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
          <small>Status servis terbaru</small>
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
          <p>${escapeHtml(complaint).replaceAll("\n", "<br>")}</p>
        </div>
        <div>
          <span class="track-label">KETERANGAN TERBARU</span>
          <p>${escapeHtml(note).replaceAll("\n", "<br>")}</p>
        </div>
      </div>
    </article>`;
}

async function lookup(rawValue) {
  const code = normalizeTrackingCode(rawValue);
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

  search.value = code;
  renderLoading();

  try {
    // Keep the proven OnePrint service lookup as the single source of truth.
    const service = await findServiceByCode(code);
    if (!service) {
      renderEmpty(code);
      return null;
    }
    renderService(service, code);
    return service;
  } catch (error) {
    console.error("OnePrint tracking lookup:", error);
    renderError();
    return null;
  }
}

function setMethod(method) {
  const manual = method === "manual";

  document.querySelectorAll(".track-method").forEach((button) => {
    const active = button.dataset.method === method;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
  });

  manualPanel.hidden = !manual;
  scanPanel.hidden = manual;
  manualPanel.classList.toggle("active", manual);
  scanPanel.classList.toggle("active", !manual);

  if (manual) {
    stopScanner();
    setTimeout(() => search.focus(), 60);
  }
}

function setScanMessage(message, type = "") {
  scanMessage.textContent = message;
  scanMessage.dataset.type = type;
}

function loadScannerLibrary() {
  if (window.Html5Qrcode) return Promise.resolve(window.Html5Qrcode);

  return new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-tracking-scanner]');
    if (existing) {
      existing.addEventListener("load", () => resolve(window.Html5Qrcode), { once: true });
      existing.addEventListener("error", () => reject(new Error("Scanner library gagal dimuat.")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = "https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js";
    script.async = true;
    script.dataset.trackingScanner = "1";
    script.onload = () => window.Html5Qrcode ? resolve(window.Html5Qrcode) : reject(new Error("Html5Qrcode tidak tersedia."));
    script.onerror = () => reject(new Error("Scanner library gagal dimuat."));
    document.head.appendChild(script);
  });
}

async function startScanner() {
  if (scanning) return;

  if (!window.isSecureContext && location.hostname !== "localhost") {
    setScanMessage("Kamera hanya bisa dipakai melalui HTTPS. Buka tracking lewat https://oneprintservice.web.id.", "error");
    return;
  }

  startScanButton.disabled = true;
  scannerBox.hidden = false;
  setScanMessage("Meminta izin kamera...");

  try {
    const Html5Qrcode = await loadScannerLibrary();

    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("Browser tidak menyediakan akses kamera.");
    }

    const reader = document.getElementById("qr-reader");
    if (!reader) throw new Error("Area kamera tidak ditemukan.");

    // Clear any previous scanner DOM before creating a new instance.
    reader.innerHTML = "";
    scanner = new Html5Qrcode("qr-reader");
    scanHandled = false;

    const config = {
      fps: 10,
      qrbox: (viewfinderWidth, viewfinderHeight) => {
        const size = Math.max(
          180,
          Math.min(300, Math.floor(Math.min(viewfinderWidth, viewfinderHeight) * 0.72))
        );
        return { width: size, height: size };
      },
      aspectRatio: 1,
      disableFlip: false
    };

    const onSuccess = async (decodedText) => {
      if (!scanning || scanHandled) return;
      scanHandled = true;

      const code = normalizeTrackingCode(decodedText);
      setScanMessage("QR terbaca. Mencari data servis...", "success");
      await stopScanner();

      if (!code) {
        scanHandled = false;
        scannerBox.hidden = false;
        setScanMessage("QR terbaca, tetapi tidak berisi nomor tracking OnePrint.", "error");
        return;
      }

      setMethod("manual");
      search.value = code;
      await lookup(code);
    };

    const onFailure = () => {
      // Continuous scan: frame misses are normal and intentionally ignored.
    };

    try {
      await scanner.start({ facingMode: { exact: "environment" } }, config, onSuccess, onFailure);
    } catch (firstError) {
      console.warn("OnePrint camera facingMode start failed:", firstError);

      // Some Android browsers reject exact facingMode. Retry with a plain
      // environment request before falling back to enumerated camera IDs.
      try {
        await scanner.stop().catch(() => {});
        await scanner.clear().catch(() => {});
      } catch (_) {}

      scanner = new Html5Qrcode("qr-reader");

      try {
        await scanner.start({ facingMode: "environment" }, config, onSuccess, onFailure);
      } catch (secondError) {
        console.warn("OnePrint camera environment start failed:", secondError);

        try {
          await scanner.stop().catch(() => {});
          await scanner.clear().catch(() => {});
        } catch (_) {}

        const cameras = await Html5Qrcode.getCameras();
        if (!cameras?.length) throw new Error("Kamera tidak ditemukan atau izin kamera ditolak.");

        const preferred =
          cameras.find((camera) => /back|rear|environment|belakang/i.test(camera.label)) ||
          cameras[cameras.length - 1];

        scanner = new Html5Qrcode("qr-reader");
        await scanner.start(preferred.id, config, onSuccess, onFailure);
      }
    }

    scanning = true;
    setScanMessage("Kamera aktif. Arahkan QR nota ke kotak putih.");
  } catch (error) {
    console.error("OnePrint tracking camera:", error);
    await stopScanner();
    setScanMessage(
      "Kamera belum bisa dibuka. Izinkan kamera untuk browser ini, lalu tekan Buka kamera lagi.",
      "error"
    );
  } finally {
    startScanButton.disabled = false;
  }
}

async function stopScanner() {
  scanning = false;
  scanHandled = false;

  if (scanner) {
    try {
      await scanner.stop();
    } catch (_) {}
    try {
      await scanner.clear();
    } catch (_) {}
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
stopScanButton.addEventListener("click", () => stopScanner());

window.addEventListener("pagehide", () => {
  stopScanner();
});

const params = new URLSearchParams(window.location.search);
const initialCode =
  params.get("tt") ||
  params.get("no") ||
  params.get("nota") ||
  params.get("nomor") ||
  params.get("invoice") ||
  params.get("code") ||
  "";

if (initialCode) {
  search.value = initialCode;
  lookup(initialCode);
} else {
  setMethod("manual");
}
