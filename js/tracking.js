const $ = s => document.querySelector(s);
const params = new URLSearchParams(location.search);
const initialCode = params.get("tt") || params.get("nomor") || "";

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBcyS36JnJNGZPdSxd_g9UmCq4BJRiG2rA",
  authDomain: "oneprintservice-db.firebaseapp.com",
  databaseURL: "https://oneprintservice-db-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "oneprintservice-db",
  storageBucket: "oneprintservice-db.firebasestorage.app",
  messagingSenderId: "330853999249",
  appId: "1:330853999249:web:4503ed115d2694d9cb5530"
};

function normalizeCode(value) {
  return String(value || "")
    .trim()
    .replace(/^https?:\/\/[^/]+\/servis\//i, "")
    .replace(/^\/?servis\//i, "")
    .replace(/^(TT|INV)[-:]/i, "")
    .trim();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function dbReady() {
  if (!window.firebase) throw new Error("Firebase SDK tidak termuat.");
  if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
  return firebase.database();
}

async function lookupService(value) {
  const nomor = normalizeCode(value);
  if (!nomor) return null;
  const db = dbReady();
  const snap = await db.ref(`servis/${nomor}`).once("value");
  if (!snap.exists()) return null;
  const data = snap.val();
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  return { key: `servis/${nomor}`, ...data };
}

async function run() {
  const raw = $("#search").value.trim();
  const nomor = normalizeCode(raw);
  if (!nomor) {
    $("#result").innerHTML = "<div class='empty'>Masukkan nomor servis.</div>";
    return;
  }

  $("#search").value = nomor;
  $("#result").innerHTML = "<div class='loading'>Mencari...</div>";

  try {
    const service = await lookupService(nomor);
    if (!service) {
      $("#result").innerHTML = `<div class='empty'>Nomor servis <strong>${escapeHtml(nomor)}</strong> tidak ditemukan pada /servis/${escapeHtml(nomor)}.</div>`;
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
      <div class="track-note"><small>Keterangan</small><p>${escapeHtml(service.keterangan || service.keluhan || "Belum ada keterangan tambahan.")}</p></div>
    </div>`;
  } catch (error) {
    console.error("Tracking lookup error:", error);
    const message = String(error?.message || error);
    $("#result").innerHTML = `<div class='empty'>Tracking gagal dimuat. ${/permission|denied|permission_denied/i.test(message)
      ? "Firebase menolak akses baca /servis. Periksa Firebase Realtime Database Rules."
      : "Periksa koneksi Firebase."}</div>`;
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
  $("#scan-status").textContent = "Arahkan kamera ke QR nomor servis.";
}

async function startScanner() {
  if (scanning) return stopScanner();

  const status = $("#scan-status");
  if (!window.Html5Qrcode) {
    $("#scanner-wrap").hidden = false;
    status.textContent = "Library scanner belum termuat. Periksa koneksi internet.";
    return;
  }

  $("#scanner-wrap").hidden = false;
  $("#scan").textContent = "Tutup Scanner";
  status.textContent = "Meminta akses kamera...";
  $("#tracking-reader").innerHTML = "";

  try {
    // Explicit permission probe makes Android Chrome show the camera prompt
    // before html5-qrcode initializes.
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("Browser tidak menyediakan akses kamera.");
    }
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" } },
      audio: false
    });
    stream.getTracks().forEach(track => track.stop());

    qrScanner = new Html5Qrcode("tracking-reader");
    scanning = true;
    status.textContent = "Kamera aktif. Arahkan ke QR nomor servis.";

    await qrScanner.start(
      { facingMode: "environment" },
      {
        fps: 10,
        qrbox: { width: Math.min(280, Math.max(220, window.innerWidth - 90)), height: 220 },
        aspectRatio: 1
      },
      async decodedText => {
        const nomor = normalizeCode(decodedText);
        if (!nomor) return;
        $("#search").value = nomor;
        status.textContent = `QR terbaca: ${nomor}`;
        await stopScanner();
        await run();
      },
      () => {}
    );
  } catch (error) {
    console.error("Tracking camera error:", error);
    await stopScanner();
    $("#scanner-wrap").hidden = false;
    status.textContent = /NotAllowed|Permission|denied/i.test(String(error?.name || error?.message))
      ? "Akses kamera ditolak. Izinkan Camera untuk oneprintservice.web.id lalu tekan Scan QR lagi."
      : "Kamera tidak dapat dibuka. Pastikan HTTPS dan izin kamera aktif.";
  }
}

window.startTrackingScanner = startScanner;
window.stopTrackingScanner = stopScanner;

$("#search").value = initialCode;
$("#form").addEventListener("submit", event => {
  event.preventDefault();
  run();
});
$("#scan").addEventListener("click", event => {
  event.preventDefault();
  startScanner();
});
window.addEventListener("pagehide", stopScanner);

if (initialCode) run();
