/* OnePrintPOS PWA: register the root-scoped service worker. */
if ("serviceWorker" in navigator) {
  const registerOnePrintWorker = () => {
    navigator.serviceWorker.register("/sw.js", { scope: "/" })
      .catch(error => console.error("OnePrintPOS service worker gagal didaftarkan:", error));
  };
  if (document.readyState === "complete") {
    registerOnePrintWorker();
  } else {
    window.addEventListener("load", registerOnePrintWorker, { once: true });
  }
}
