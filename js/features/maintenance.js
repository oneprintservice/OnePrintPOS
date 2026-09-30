import { listServices, removeService } from "./services.js";

const TERMINAL = new Set(["DIAMBIL", "CANCEL"]);

function parseDate(value) {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const raw = String(value).trim();
  if (!raw) return null;

  if (/^\d{10,13}$/.test(raw)) {
    const n = Number(raw);
    const d = new Date(raw.length === 10 ? n * 1000 : n);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  let m = raw.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})(?:\s+.*)?$/);
  if (m) {
    const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), 12, 0, 0);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  m = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/);
  if (m) {
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function referenceDate(service) {
  const status = String(service?.status || "").trim().toUpperCase();
  if (status === "DIAMBIL") return parseDate(service.diambilAt || service.updatedAt || service.tanggal);
  if (status === "CANCEL") return parseDate(service.updatedAt || service.tanggal);
  return null;
}

function cutoffDate(now = new Date()) {
  // Three calendar months ago, preserving the current day where possible.
  return new Date(now.getFullYear(), now.getMonth() - 3, now.getDate(), 23, 59, 59, 999);
}

export function findCleanupCandidates(services, now = new Date()) {
  const cutoff = cutoffDate(now);
  return services
    .filter(service => TERMINAL.has(String(service?.status || "").trim().toUpperCase()))
    .map(service => ({ ...service, _cleanupDate: referenceDate(service) }))
    .filter(service => service._cleanupDate && service._cleanupDate.getTime() < cutoff.getTime())
    .sort((a, b) => a._cleanupDate.getTime() - b._cleanupDate.getTime());
}

export function formatCleanupDate(value) {
  const d = parseDate(value);
  return d ? d.toLocaleDateString("id-ID") : "-";
}

export async function getCleanupCandidates() {
  const services = await listServices();
  return {
    all: services,
    candidates: findCleanupCandidates(services)
  };
}

export async function exportCleanupBackup(candidates) {
  const payload = {
    exportedAt: new Date().toISOString(),
    rule: "DIAMBIL/CANCEL lebih dari 3 bulan",
    count: candidates.length,
    services: candidates.map(({ _cleanupDate, ...service }) => service)
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `oneprint-backup-servis-lama-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function cleanupCandidates(candidates) {
  if (!candidates.length) return 0;
  let removed = 0;
  for (const service of candidates) {
    await removeService(service.key);
    removed++;
  }
  return removed;
}
