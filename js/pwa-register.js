/* OnePrintPOS PWA: register immediately so automated PWA audits can detect it. */
if ("serviceWorker" in navigator) {
  navigator.serviceWorker
    .register("/sw.js", { scope: "/" })
    .catch((error) => {
      console.error("OnePrintPOS service worker gagal didaftarkan:", error);
    });
}
