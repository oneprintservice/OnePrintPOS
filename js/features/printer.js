const STORAGE_KEY = "oneprint.printer.config.v1";

const DEFAULT_CONFIG = {
  mode: "browser",
  bridgeUrl: "http://127.0.0.1:18181",
  transport: "winspool",
  printerName: "",
  host: "",
  port: 9100,
  serialPath: "",
  baudRate: 9600,
  paper: "58",
  token: ""
};

export function getPrinterConfig() {
  try {
    return { ...DEFAULT_CONFIG, ...(JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}")) };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function savePrinterConfig(config = {}) {
  const next = { ...DEFAULT_CONFIG, ...config };
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
  const fetchOptions = {
    ...options,
    headers,
    mode: "cors"
  };
  if (space) fetchOptions.targetAddressSpace = space;

  const response = await fetch(url, fetchOptions);
  const text = await response.text();
  let body = {};
  try { body = text ? JSON.parse(text) : {}; } catch { body = { message: text }; }
  if (!response.ok) throw new Error(body.message || `Bridge HTTP ${response.status}`);
  return body;
}

function targetFromConfig(config) {
  if (config.transport === "network") {
    if (!config.host) throw new Error("IP printer belum diisi");
    return { type: "network", host: config.host, port: Number(config.port || 9100) };
  }
  if (config.transport === "serial") {
    if (!config.serialPath) throw new Error("Port Bluetooth/serial belum diisi");
    return { type: "serial", path: config.serialPath, baudRate: Number(config.baudRate || 9600) };
  }
  if (!config.printerName) throw new Error("Nama printer Windows belum diisi");
  return { type: "winspool", printerName: config.printerName };
}

export async function testPrinterBridge(config = getPrinterConfig()) {
  const body = await bridgeFetch("/health", { method: "GET" }, config);
  return { ok: body.ok === true, ...body };
}

export async function printThermal(data, tipe = "nota", config = getPrinterConfig()) {
  if (config.mode !== "bridge") throw new Error("Mode printer masih Browser");
  const target = targetFromConfig(config);
  return bridgeFetch("/print", {
    method: "POST",
    body: JSON.stringify({
      target,
      paper: config.paper || "58",
      tipe,
      data
    })
  }, config);
}

export async function printTestReceipt(config = getPrinterConfig()) {
  const target = targetFromConfig(config);
  return bridgeFetch("/print-test", {
    method: "POST",
    body: JSON.stringify({
      target,
      paper: config.paper || "58"
    })
  }, config);
}

export { DEFAULT_CONFIG };
