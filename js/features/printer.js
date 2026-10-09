const STORAGE_KEY = "oneprint.printer.config.v2";

const DEFAULT_CONFIG = {
  mode: "browser",
  bridgeUrl: "http://127.0.0.1:18181",

  // Printer dokumen: nota / tanda terima A5.
  // Saat ini tetap menggunakan browser print agar layout A5 existing tidak berubah.
  document: {
    transport: "cups",
    printerName: "",
    paper: "A5"
  },

  // Printer label thermal.
  thermal: {
    transport: "cups",
    printerName: "",
    host: "",
    port: 9100,
    serialPath: "",
    baudRate: 9600,
    paper: "58"
  },

  token: ""
};

function normalizeConfig(raw = {}) {
  const legacy = raw && !raw.document && !raw.thermal ? raw : null;
  return {
    ...DEFAULT_CONFIG,
    ...raw,
    document: {
      ...DEFAULT_CONFIG.document,
      ...(raw.document || {}),
      ...(legacy && legacy.transport === "cups"
        ? { printerName: legacy.printerName || "" }
        : {})
    },
    thermal: {
      ...DEFAULT_CONFIG.thermal,
      ...(raw.thermal || {}),
      ...(legacy
        ? {
            transport: legacy.transport || DEFAULT_CONFIG.thermal.transport,
            printerName: legacy.printerName || "",
            host: legacy.host || "",
            port: legacy.port || 9100,
            serialPath: legacy.serialPath || "",
            baudRate: legacy.baudRate || 9600,
            paper: legacy.paper || "58"
          }
        : {})
    }
  };
}

export function getPrinterConfig() {
  try {
    return normalizeConfig(JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"));
  } catch {
    return normalizeConfig();
  }
}

export function savePrinterConfig(config = {}) {
  const next = normalizeConfig(config);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}

function addressSpace(url) {
  try {
    const host = new URL(url).hostname;
    if (host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]") return "loopback";
    if (/^(10|127)\./.test(host) || /^192\.168\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host) || host.endsWith(".local")) return "local";
  } catch {}
  return undefined;
}

async function bridgeFetch(path, options = {}, config = getPrinterConfig()) {
  const base = String(config.bridgeUrl || DEFAULT_CONFIG.bridgeUrl).replace(/\/+$/, "");
  const url = `${base}${path}`;
  const headers = {
    "Content-Type": "application/json",
    ...(config.token ? { "X-OnePrint-Token": config.token } : {}),
    ...(options.headers || {})
  };
  const space = addressSpace(url);
  const fetchOptions = { ...options, headers, mode: "cors" };
  if (space) fetchOptions.targetAddressSpace = space;

  // Bound bridge waits so the UI cannot remain pending indefinitely.
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);
  fetchOptions.signal = controller.signal;
  try {
    const response = await fetch(url, fetchOptions);
    const text = await response.text();
    let body = {};
    try { body = text ? JSON.parse(text) : {}; } catch { body = { message: text }; }
    if (!response.ok) throw new Error(body.message || `Bridge HTTP ${response.status}`);
    return body;
  } catch (error) {
    if (error?.name === "AbortError") throw new Error("Cleanter tidak merespons dalam 15 detik. Pastikan server aktif dan coba lagi.");
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

function targetFromThermal(config) {
  const thermal = config.thermal || DEFAULT_CONFIG.thermal;
  if (thermal.transport === "cleanter") return { type: "cleanter" };
  if (thermal.transport === "network") {
    if (!thermal.host) throw new Error("IP printer label belum diisi");
    return { type: "network", host: thermal.host, port: Number(thermal.port || 9100) };
  }
  if (thermal.transport === "cups") {
    if (!thermal.printerName) throw new Error("Nama antrian CUPS printer label belum diisi");
    return { type: "cups", printerName: thermal.printerName, documentName: "OnePrint Label" };
  }
  if (thermal.transport === "serial") {
    if (!thermal.serialPath) throw new Error("Port Bluetooth/serial printer label belum diisi");
    return { type: "serial", path: thermal.serialPath, baudRate: Number(thermal.baudRate || 9600) };
  }
  if (!thermal.printerName) throw new Error("Nama printer label Windows belum diisi");
  return { type: "winspool", printerName: thermal.printerName, documentName: "OnePrint Label" };
}

export async function testPrinterBridge(config = getPrinterConfig()) {
  const body = await bridgeFetch("/health", { method: "GET" }, config);
  // Cleanter v1.5.x reports {status:"ok"} while OnePrint Bridge reports {ok:true}.
  return { ...body, ok: body.ok === true || body.status === "ok" };
}

export async function printThermal(data, tipe = "label", config = getPrinterConfig()) {
  if (config.mode !== "bridge") throw new Error("Mode printer thermal masih Browser");
  const thermal = config.thermal || DEFAULT_CONFIG.thermal;

  // Cleanter Android API accepts ESC/POS content blocks, not OnePrint PC bridge target objects.
  if (thermal.transport === "cleanter") {
    const code = String(data?.nomor || data?.serial || data?.kode || "").trim();
    if (!code) throw new Error("Kode QR kosong. Buat atau scan kode terlebih dahulu.");
    const customer = String(data?.pelanggan || data?.customer || "").trim() || "-";
    const unit = String(data?.merk || data?.unit || data?.tipe || "").trim() || "-";
    const content = [
      { type: "text", text: "ONEPRINT SERVICE", align: "center", bold: true },
      { type: "text", text: `Pelanggan: ${customer}`, align: "left" },
      { type: "text", text: `Merk/Tipe: ${unit}`, align: "left" },
      { type: "text", text: `Serial: ${code}`, align: "left", bold: true },
      { type: "qr", data: code, size: 4, align: "center" },
      { type: "feed", lines: 1 }
    ];
    return bridgeFetch("/print", {
      method: "POST",
      body: JSON.stringify({ content, cut: true })
    }, { ...config, bridgeUrl: config.bridgeUrl || "http://localhost:9100" });
  }

  const target = targetFromThermal(config);
  return bridgeFetch("/print", {
    method: "POST",
    body: JSON.stringify({
      target,
      paper: thermal.paper || "58",
      tipe,
      data
    })
  }, config);
}

export async function printTestReceipt(config = getPrinterConfig()) {
  const thermal = config.thermal || DEFAULT_CONFIG.thermal;
  if (thermal.transport === "cleanter") {
    return bridgeFetch("/print", {
      method: "POST",
      body: JSON.stringify({
        cut: true,
        content: [
          { type: "text", text: "ONEPRINT TEST", align: "center", bold: true },
          { type: "text", text: "Cleanter Bluetooth OK", align: "center" },
          { type: "qr", data: "ONEPRINT-TEST", size: 4, align: "center" },
          { type: "feed", lines: 1 }
        ]
      })
    }, { ...config, bridgeUrl: config.bridgeUrl || "http://localhost:9100" });
  }
  const target = targetFromThermal(config);
  return bridgeFetch("/print-test", {
    method: "POST",
    body: JSON.stringify({
      target,
      paper: thermal.paper || "58"
    })
  }, config);
}

export { DEFAULT_CONFIG };
