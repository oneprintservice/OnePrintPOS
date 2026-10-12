const OFFLINE_HTML = `<!doctype html>
<html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#0b73ff"><title>OnePrintPOS — Offline</title>
<style>body{font:16px/1.5 system-ui,sans-serif;margin:0;padding:24px;background:#f4f6f9;color:#172033;display:grid;min-height:calc(100vh - 48px);place-items:center}main{max-width:420px;background:white;border-radius:16px;padding:24px;box-shadow:0 8px 32px #17203312}h1{font-size:22px;margin-top:0}button{border:0;border-radius:10px;padding:12px 18px;background:#0b73ff;color:white;font:inherit;font-weight:650}</style></head>
<body><main><h1>OnePrintPOS membutuhkan internet</h1><p>Koneksi sedang tidak tersedia. Data Firebase dan fungsi transaksi tidak disimpan secara offline. Sambungkan internet, lalu coba buka ulang halaman.</p><button onclick="location.reload()">Coba lagi</button></main></body></html>`;

self.addEventListener("install", event => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", event => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET" || request.mode !== "navigate") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(request).catch(() => new Response(OFFLINE_HTML, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store"
      }
    }))
  );
});
