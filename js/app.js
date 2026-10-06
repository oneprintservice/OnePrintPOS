import { auth } from "./core/firebase.js";
import { watchAuth, signOut, startIdleTimeout } from "./core/auth.js";
import { listInventory, saveInventory, removeInventory, changeStock } from "./features/inventory.js";
import { saveCustomer, findCustomer } from "./features/customers.js";
import {
  listServices, getService, findServiceByCode, saveService, removeService,
  makeServiceNumber, stats, filterOperationalServices
} from "./features/services.js?v=20261003-fix8";
import { printReceipt, printReceiptSmart } from "./features/receipt.js?v=20261005-premium2";
import { getUnit, saveUnit, getUnitHistory } from "./features/units.js";
import { getPrinterConfig, savePrinterConfig, testPrinterBridge, printTestReceipt } from "./features/printer.js?v=20261005-premium2";
import { createRestock, listRestocks, removeRestock } from "./features/restock.js?v=20261005-premium2";
import { listLedger, saveLedger, removeLedger, ledgerMonth, ledgerDate, formatLedgerDate } from "./features/accounting.js";
import { findCleanupCandidates, formatCleanupDate, exportCleanupBackup, cleanupCandidates } from "./features/maintenance.js";

const $ = s => document.querySelector(s);
const money = n => `Rp ${Number(n || 0).toLocaleString("id-ID")}`;

// Business dates follow the browser's local calendar (WIB for the shop),
// while event timestamps remain ISO/UTC. Never derive a business date/month
// from toISOString(), because UTC can still be the previous calendar day.
const localDateInput = (date = new Date()) => {
  const d = date instanceof Date ? date : new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const localMonthInput = (date = new Date()) => localDateInput(date).slice(0, 7);
let uiBound = false;
let scanner = null;
let idleCleanup = null;

const state = {
  tab: "jasa",
  items: { jasa: [], sparepart: [] },
  inventory: [],
  services: [],
  restocks: [],
  ledger: [],
  selectedInventory: null,
  editInventoryKey: null,
  editInventoryCategory: null,
  editServiceKey: null,
  editServiceOriginal: null,
  user: null,
  printerBarcode: "",
  selectedPrinter: null,
  editLedgerKey: null,
  maintenanceCandidates: [],
  maintenanceBackupExported: false
};

const view = {
  toast(message, type = "info") {
    const el = $("#toast");
    if (!el) return;
    el.textContent = message;
    el.dataset.type = type;
    el.classList.add("show");
    clearTimeout(el._timer);
    el._timer = setTimeout(() => el.classList.remove("show"), 2800);
  },
  stat(id, value) {
    const el = $(`#${id}`);
    if (el) el.textContent = value;
  },
  modal(title, html) {
    $("#modal-title").textContent = title;
    $("#modal-body").innerHTML = html;
    $("#modal").classList.add("open");
  },
  closeModal() {
    $("#modal").classList.remove("open");
  }
};

const statusOf = x => String(x?.status || "").trim().toUpperCase();
const dateInput = value => {
  const d = ledgerDate(value) || new Date();
  return localDateInput(d);
};

function currentForm() {
  return {
    pelanggan: $("#input-nama").value.trim(),
    telp: $("#input-telp").value.trim(),
    merk: $("#input-merk").value.trim(),
    serial: $("#barcode-input").value.trim(),
    unitId: state.printerBarcode || $("#barcode-input").value.trim(),
    printerId: state.printerBarcode || $("#barcode-input").value.trim(),
    kelengkapan: $("#input-kelengkapan").value.trim(),
    keluhan: $("#input-keluhan").value.trim(),
    status: $("#status-servis").value,
    keterangan: $("#keterangan-servis").value.trim()
  };
}

function total() {
  return [...state.items.jasa, ...state.items.sparepart].reduce(
    (sum, item) => sum + (Number(item.harga || 0) * Math.max(1, Number(item.qty) || 1)),
    0
  );
}

function escapeHtml(v) {
  return String(v ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function renderCart() {
  const el = $("#cart");
  if (!el) return;
  el.innerHTML = "";
  for (const cat of ["jasa", "sparepart"]) {
    if (!state.items[cat].length) continue;
    const head = document.createElement("div");
    head.className = "cart-section";
    head.textContent = cat === "jasa" ? "JASA" : "SPAREPART / TINTA";
    el.append(head);
    state.items[cat].forEach((item, i) => {
      const row = document.createElement("div");
      row.className = "cart-row";
      const qty = Math.max(1, Number(item.qty) || 1);
      const subtotal = Number(item.harga || 0) * qty;
      row.innerHTML = `<div><strong>${escapeHtml(item.nama)}</strong>${item.dariInventori ? "<small> • inventory</small>" : ""}</div><div><span class="cart-qty">${qty} ×</span> ${money(subtotal)} <button class="icon-btn danger" data-remove="${cat}:${i}" title="Hapus">×</button></div>`;
      el.append(row);
    });
  }
  $("#total").textContent = money(total());
}

async function loadAll() {
  const tasks = await Promise.allSettled([listInventory(), listServices(), listRestocks(), listLedger()]);
  state.inventory = tasks[0].status === "fulfilled" ? tasks[0].value : [];
  state.services = tasks[1].status === "fulfilled" ? tasks[1].value : [];
  // Preserve already-visible history if a Firebase read temporarily fails.
  if (tasks[2].status === "fulfilled") state.restocks = tasks[2].value;
  if (tasks[3].status === "fulfilled") state.ledger = tasks[3].value;

  // Restock history is sourced from canonical /restock records only.
  // Firebase push keys are chronological, so use them as the tie-breaker when
  // several records share the same selected calendar date.
  state.restocks = state.restocks
    .sort((a, b) => {
      const byDate = (Date.parse(b.tanggal) || 0) - (Date.parse(a.tanggal) || 0);
      return byDate || String(b.key || "").localeCompare(String(a.key || ""));
    })
    .slice(0, 50);

  if (tasks.some(x => x.status === "rejected")) {
    console.error("OnePrint: sebagian data gagal dimuat", tasks.filter(x => x.status === "rejected").map(x => x.reason));
    view.toast("Sebagian data gagal dimuat. Periksa koneksi Firebase.", "error");
  }

  console.info(`OnePrint: ${state.services.length} data servis, ${state.inventory.length} inventori`);
  renderInventory();
  renderStats();
  renderServiceTable();
  renderRestock();
  renderAccounting();
  renderMaintenance(state.services);
}

function renderStats() {
  const s = stats(state.services);
  view.stat("stat-total", s.total);
  view.stat("stat-aktif", s.aktif);
  view.stat("stat-sparepart", s.sparepart);
  view.stat("stat-selesai", s.selesai);
  const badge = $("#new-badge");
  if (badge) {
    badge.textContent = s.baru > 0 ? `${s.baru} SERVIS BARU` : "Tidak ada servis baru";
    badge.hidden = false;
    badge.dataset.empty = String(s.baru === 0);
  }
}

function renderInventory() {
  const q = ($("#inventory-search")?.value || "").toLowerCase();
  const rows = state.inventory.filter(x => String(x.nama || "").toLowerCase().includes(q));
  $("#inventory-count").textContent = `${rows.length} item`;
  $("#inventory-list").innerHTML = rows.map(x => `<tr>
    <td><strong>${escapeHtml(x.nama)}</strong><small>${escapeHtml(x.kategori)} · stok ${escapeHtml(x.satuan || "pcs")} · jual ${escapeHtml(x.satuan_jual || x.satuan || "pcs")}</small></td>
    <td>${money(x.harga_jual)}<small>${escapeHtml(x.satuan_jual || x.satuan || "pcs")}</small></td><td>${Number(x.stok || 0).toLocaleString("id-ID")} ${escapeHtml(x.satuan || "pcs")}</td><td>${money(x.harga_beli)}<small>/ kemasan</small></td>
    <td><span class="stock ${Number(x.stok || 0) <= Number(x.minimum || 1) ? "low" : ""}">${Number(x.stok || 0) <= Number(x.minimum || 1) ? "Menipis" : "Aman"}</span></td>
    <td><button class="table-action" data-edit-inv="${x.kategori}:${x.key}">Edit</button><button class="table-action danger" data-del-inv="${x.kategori}:${x.key}">Hapus</button></td>
  </tr>`).join("") || `<tr><td colspan="6" class="empty">Belum ada inventori.</td></tr>`;
}

function renderSuggestions() {
  const q = $("#input-item-nama").value.trim().toLowerCase();
  const box = $("#suggestions");
  if (q.length < 2) { box.hidden = true; return; }
  const rows = state.inventory.filter(x => String(x.nama || "").toLowerCase().includes(q)).slice(0, 10);
  box.innerHTML = rows.map(x => `<button class="suggestion" data-pick="${x.kategori}:${x.key}"><b>${escapeHtml(x.nama)}</b><span>${money(x.harga_jual)} / ${escapeHtml(x.satuan_jual || x.satuan || "pcs")} · stok ${Number(x.stok || 0).toLocaleString("id-ID")} ${escapeHtml(x.satuan || "")}</span></button>`).join("");
  box.hidden = !rows.length;
}

function renderServiceTable() {
  const q = ($("#service-search")?.value || "").toLowerCase();
  const selectedStatus = $("#service-status-filter")?.value || "";
  const rows = filterOperationalServices(state.services).filter(x =>
    (!selectedStatus || statusOf(x) === selectedStatus) &&
    [x.nomor, x.unitId, x.printerId, x.pelanggan, x.telp, x.merk, x.serial, x.status].some(v => String(v || "").toLowerCase().includes(q))
  ).slice(0, 120);

  const serviceCount = $("#service-count");
  if (serviceCount) serviceCount.textContent = `${rows.length} tampil`;

  let serviceList = document.querySelector("#page-services #service-list");
  if (!serviceList) {
    const page = document.querySelector("#page-services");
    if (page) {
      let wrap = page.querySelector(".table-wrap");
      if (!wrap) {
        wrap = document.createElement("div");
        wrap.className = "table-wrap";
        page.querySelector(".panel")?.appendChild(wrap);
      }

      let table = wrap.querySelector("table");
      if (!table) {
        table = document.createElement("table");
        table.innerHTML = `<thead><tr><th>Nomor</th><th>Pelanggan</th><th>Status</th><th>Total</th><th></th></tr></thead>`;
        wrap.appendChild(table);
      }

      serviceList = document.createElement("tbody");
      serviceList.id = "service-list";
      table.appendChild(serviceList);
    }
  }
  if (!serviceList) return;
  serviceList.innerHTML = rows.map(x => `<tr>
    <td><strong>${escapeHtml(x.nomor)}</strong><small>${new Date(x.tanggal || 0).toLocaleString("id-ID")}</small></td>
    <td>${escapeHtml(x.pelanggan)}<small>${escapeHtml(x.merk)}</small></td>
    <td><span class="status status-${statusOf(x).toLowerCase().replaceAll(" ", "-")}">${escapeHtml(x.status || "-")}</span></td>
    <td>${money(x.total)}</td><td><button class="table-action" data-open-service="${escapeHtml(x.key)}">Buka</button></td>
  </tr>`).join("") || `<tr><td colspan="5" class="empty">Tidak ada servis pada periode tampilan.</td></tr>`;
}

function renderRestock() {
  const select = $("#restock-item");
  if (select) {
    const current = select.value;
    const keyword = ($("#restock-search")?.value || "").trim().toLowerCase();

    const items = state.inventory
      .filter(x => x.kategori !== "jasa")
      .filter(x => {
        if (!keyword) return true;
        return [x.nama, x.kode, x.serial, x.merk, x.kategori]
          .filter(Boolean)
          .some(v => String(v).toLowerCase().includes(keyword));
      });

    select.innerHTML =
      `<option value="">${items.length ? "Pilih barang..." : "Barang tidak ditemukan"}</option>` +
      items.map(x =>
        `<option value="${escapeHtml(x.kategori)}|${escapeHtml(x.key)}">
          ${escapeHtml(x.nama)} · stok ${x.stok ?? 0}
        </option>`
      ).join("");

    if ([...select.options].some(o => o.value === current)) select.value = current;
  }
  // Riwayat restock: 50 transaksi terbaru, tanpa filter bulan.
  // Hanya transaksi paling baru yang boleh dihapus. Setelah dihapus,
  // tombol otomatis berpindah ke transaksi terbaru berikutnya.
  const rows = state.restocks
    .slice()
    .sort((a, b) => {
      const byDate = (Date.parse(b.tanggal) || 0) - (Date.parse(a.tanggal) || 0);
      return byDate || String(b.key || "").localeCompare(String(a.key || ""));
    })
    .slice(0, 50);

  state.restocks = rows;
  const historyTitle = document.querySelector("#page-restock .panel:nth-child(2) .panel-head h2");
  if (historyTitle) historyTitle.textContent = `Restock Terbaru (${rows.length})`;

  $("#restock-list").innerHTML = rows.map((x, index) => `<tr data-restock-row="${escapeHtml(x.key)}">
    <td>${new Date(x.tanggal || 0).toLocaleDateString("id-ID")}</td>
    <td><strong>${escapeHtml(x.nama || x.itemKey || "-")}</strong><small>${escapeHtml(x.supplier || "-")}</small></td>
    <td><strong>${Number(x.qty_kemasan ?? x.qty ?? 0).toLocaleString("id-ID")}</strong> ${x.qty_kemasan != null ? "kemasan" : escapeHtml(x.satuan || "")}<small>${x.qty_kemasan != null ? `${Number(x.qty || 0).toLocaleString("id-ID")} ${escapeHtml(x.satuan || "")} masuk stok` : "riwayat lama"}</small></td>
    <td>${money(x.total)}</td>
    <td class="restock-action-cell">${
      index === 0
        ? `<button type="button" class="table-action danger" data-del-restock="${escapeHtml(x.key)}">Hapus</button>`
        : `<span class="table-action-placeholder" aria-hidden="true">—</span>`
    }</td>
  </tr>`).join("") || `<tr><td colspan="5" class="empty">Belum ada riwayat restock.</td></tr>`;
}


function renderMaintenance(services = state.services) {
  const candidates = findCleanupCandidates(services);
  state.maintenanceCandidates = candidates;

  const total = services.length;
  const active = services.filter(x => !["DIAMBIL", "CANCEL"].includes(statusOf(x))).length;

  const totalEl = $("#maintenance-total");
  const activeEl = $("#maintenance-active");
  const candidateEl = $("#maintenance-candidates");
  const countEl = $("#maintenance-count");
  if (totalEl) totalEl.textContent = total;
  if (activeEl) activeEl.textContent = active;
  if (candidateEl) candidateEl.textContent = candidates.length;
  if (countEl) countEl.textContent = `${candidates.length} kandidat`;

  const list = $("#maintenance-list");
  if (!list) return;
  list.innerHTML = candidates.map(x => `<tr>
    <td><strong>${escapeHtml(x.nomor || x.key || "-")}</strong></td>
    <td>${escapeHtml(x.pelanggan || "-")}</td>
    <td><span class="status status-${statusOf(x).toLowerCase()}">${escapeHtml(statusOf(x))}</span></td>
    <td>${formatCleanupDate(x._cleanupDate)}</td>
    <td>${money(x.total)}</td>
  </tr>`).join("") || `<tr><td colspan="5" class="empty">Tidak ada servis DIAMBIL/CANCEL yang lebih dari 3 bulan.</td></tr>`;

  const cleanBtn = $("#maintenance-clean");
  const exportBtn = $("#maintenance-export");
  if (cleanBtn) cleanBtn.disabled = candidates.length === 0;
  if (exportBtn) exportBtn.disabled = candidates.length === 0;
}

function accountingMonthForService(service) {
  const value = service?.diambilAt || service?.updatedAt || service?.tanggal;
  return ledgerMonth(value);
}

function accountingDateForService(service) {
  return ledgerDate(service?.diambilAt || service?.updatedAt || service?.tanggal);
}

function selectedAccountingMonth() {
  return $("#accounting-month")?.value || localMonthInput();
}

function renderAccounting() {
  const month = selectedAccountingMonth();

  // MANUAL + RESTOCK come from the finance ledger.
  // SERVICE income is derived from the actual service status/payment date
  // so legacy ledger date mistakes cannot move income to the wrong month.
  const ledgerRows = state.ledger.filter(x => ledgerMonth(x.tanggal) === month);
  const nonServiceRows = ledgerRows.filter(x => String(x.sumber || "").toUpperCase() !== "SERVIS");

  const serviceRows = state.services
    .filter(x => statusOf(x) === "DIAMBIL" && accountingMonthForService(x) === month)
    .map(x => ({
      key: `service-income-${x.key || x.nomor}`,
      tanggal: x.diambilAt || x.updatedAt || x.tanggal,
      tipe: "PEMASUKAN",
      kategori: "SERVIS",
      sumber: "SERVIS",
      referensi: x.nomor || x.key || "",
      keterangan: `Pembayaran servis ${x.nomor || x.key || "-"} - ${x.pelanggan || "-"}`,
      jumlah: Number(x.total || 0),
      _service: true
    }));

  const income = [
    ...nonServiceRows.filter(x => String(x.tipe || "").toUpperCase() === "PEMASUKAN"),
    ...serviceRows
  ].reduce((sum, x) => sum + Number(x.jumlah || 0), 0);

  const expense = nonServiceRows
    .filter(x => String(x.tipe || "").toUpperCase() === "PENGELUARAN")
    .reduce((sum, x) => sum + Number(x.jumlah || 0), 0);

  view.stat("account-income", money(income));
  view.stat("account-expense", money(expense));
  view.stat("account-net", money(income - expense));

  const ml = $("#account-month-label");
  if (ml) ml.textContent = month;

  const displayRows = [...nonServiceRows, ...serviceRows]
    .sort((a, b) => (ledgerDate(b.tanggal)?.getTime() || 0) - (ledgerDate(a.tanggal)?.getTime() || 0));

  const list = $("#ledger-list");
  if (list) {
    list.innerHTML = displayRows.slice(0, 300).map(x => `<tr>
      <td>${formatLedgerDate(x.tanggal)}</td>
      <td><span class="ledger-type ${x.tipe === "PEMASUKAN" ? "in" : "out"}">${escapeHtml(x.tipe)}</span></td>
      <td>${escapeHtml(x.keterangan)}<small>${escapeHtml(x.sumber || "")}</small></td>
      <td>${money(x.jumlah)}</td>
      <td>${x.sumber === "MANUAL" && x.key ? `
        <div class="table-actions">
          <button type="button" class="table-action" data-edit-ledger="${escapeHtml(x.key)}">Edit</button>
          <button type="button" class="table-action danger" data-del-ledger="${escapeHtml(x.key)}">Hapus</button>
        </div>` : ""}</td>
    </tr>`).join("") || `<tr><td colspan="5" class="empty">Belum ada transaksi keuangan bulan ini.</td></tr>`;
  }

  const saveBtn = $("#save-manual-ledger");
  if (saveBtn) saveBtn.textContent = state.editLedgerKey ? "Simpan Perubahan" : "Catat Transaksi";

  const cancelBtn = $("#cancel-manual-ledger");
  if (cancelBtn) cancelBtn.hidden = !state.editLedgerKey;
}

function resetManualLedgerForm() {
  state.editLedgerKey = null;
  const type = $("#ledger-type");
  const category = $("#ledger-category");
  const date = $("#ledger-date");
  const amount = $("#ledger-amount");
  const note = $("#ledger-note");

  if (type) type.value = "PEMASUKAN";
  if (category) category.value = "OPERASIONAL";
  if (date) date.value = localDateInput();
  if (amount) amount.value = "";
  if (note) note.value = "";

  const saveBtn = $("#save-manual-ledger");
  if (saveBtn) saveBtn.textContent = "Catat Transaksi";
  const cancelBtn = $("#cancel-manual-ledger");
  if (cancelBtn) cancelBtn.hidden = true;
}

function resetServiceForm() {
  ["input-nama","input-telp","input-merk","barcode-input","input-kelengkapan","input-keluhan","keterangan-servis"].forEach(id => { const el = $(`#${id}`); if (el) el.value = ""; });
  $("#status-servis").value = "MASUK";
  state.items = { jasa: [], sparepart: [] };
  state.printerBarcode = "";
  state.selectedPrinter = null;
  const printerContext = $("#printer-context");
  if (printerContext) { printerContext.hidden = true; printerContext.innerHTML = ""; }
  state.editServiceKey = null;
  state.editServiceOriginal = null;
  $("#service-mode").textContent = "Transaksi Baru";
  $("#delete-service").hidden = true;
  renderCart();
}

function fillService(data) {
  $("#input-nama").value = data.pelanggan || "";
  $("#input-telp").value = data.telp || "";
  $("#input-merk").value = data.merk || "";
  $("#barcode-input").value = data.serial || data.printerId || "";
  state.printerBarcode = data.printerId || data.serial || "";
  state.selectedPrinter = data.printerId ? { barcode: data.printerId, serial: data.serial, merk: data.merk, pelanggan: data.pelanggan, telp: data.telp, kelengkapan: data.kelengkapan } : null;
  renderPrinterContext(state.selectedPrinter, []);
  $("#input-kelengkapan").value = data.kelengkapan || "";
  $("#input-keluhan").value = data.keluhan || "";
  $("#status-servis").value = data.status || "MASUK";
  $("#keterangan-servis").value = data.keterangan || "";
  state.items = {
    jasa: (data.jasa || []).map(item => ({ ...item, qty: Math.max(1, Number(item.qty) || 1) })),
    sparepart: (data.sparepart || []).map(item => ({ ...item, qty: Math.max(1, Number(item.qty) || 1) }))
  };
  state.editServiceKey = data.key;
  state.editServiceOriginal = { ...data };
  $("#service-mode").textContent = `Edit ${data.nomor || data.key}`;
  $("#delete-service").hidden = false;
  renderCart();
}

async function addCartItem() {
  const name = $("#input-item-nama").value.trim();
  const qty = Math.max(1, Number($("#input-item-qty").value) || 0);
  const price = Number($("#input-item-harga").value) || 0;
  if (!name || qty <= 0 || price <= 0) return view.toast("Nama, qty, dan harga wajib diisi", "error");
  const item = { nama: name, harga: price, qty };
  if (state.selectedInventory) {
    const inv = state.inventory.find(x => x.key === state.selectedInventory.key && x.kategori === state.selectedInventory.kategori);
    if (inv) {
      item.key = inv.key; item.kategori = inv.kategori; item.dariInventori = true;
      if (inv.kategori !== "jasa") {
        const unit = String(inv.satuan || "").toLowerCase();
        const stockPerQty = (unit === "ml" || unit === "gram") ? Math.max(1, Number(inv.isi_jual) || 100) : 1;
        if (Number(inv.stok || 0) < qty * stockPerQty) {
          return view.toast(`Stok tidak cukup. Tersedia ${Number(inv.stok || 0).toLocaleString("id-ID")} ${inv.satuan || "unit"}.`, "error");
        }
      }
    }
  }
  state.items[state.tab].push(item);
  state.selectedInventory = null;
  $("#input-item-nama").value = ""; $("#input-item-qty").value = "1"; $("#input-item-harga").value = ""; $("#suggestions").hidden = true;
  renderCart();
}

async function syncInventoryUsage(previousItems, nextItems) {
  const oldCounts = new Map();
  const newCounts = new Map();
  [...(previousItems || [])].forEach(i => {
    if (i.dariInventori && i.kategori !== "jasa") {
      const qty = Math.max(1, Number(i.qty) || 1);
      oldCounts.set(`${i.kategori}/${i.key}`, (oldCounts.get(`${i.kategori}/${i.key}`) || 0) + qty);
    }
  });
  [...(nextItems || [])].forEach(i => {
    if (i.dariInventori && i.kategori !== "jasa") {
      const qty = Math.max(1, Number(i.qty) || 1);
      newCounts.set(`${i.kategori}/${i.key}`, (newCounts.get(`${i.kategori}/${i.key}`) || 0) + qty);
    }
  });
  const keys = new Set([...oldCounts.keys(), ...newCounts.keys()]);
  for (const key of keys) {
    const [kategori, invKey] = key.split("/");
    const deltaUsed = (newCounts.get(key) || 0) - (oldCounts.get(key) || 0);
    if (!deltaUsed) continue;
    const inv = state.inventory.find(x => x.kategori === kategori && x.key === invKey);
    if (inv) await changeStock(inv, -deltaUsed);
  }
}

async function syncServicePayment(data, oldData) {
  if (statusOf(data) !== "DIAMBIL") return;

  const amount = Number(data.total || 0);
  const ledgerKey = `SERVIS_${String(data.nomor).replace(/[.#$[\]\/]/g, "_")}`;

  // Penting: gunakan waktu DIAMBIL, bukan tanggal awal servis.
  // Ledger memakai key deterministik per nomor servis sehingga update
  // transaksi yang sama tidak membuat pemasukan ganda.
  await saveLedger({
    tanggal: dateInput(data.diambilAt || data.tanggal),
    tipe: "PEMASUKAN",
    kategori: "SERVIS",
    sumber: "SERVIS",
    referensi: data.nomor,
    keterangan: `Pembayaran servis ${data.nomor} - ${data.pelanggan}`,
    jumlah: amount
  }, ledgerKey);
}


function renderPrinterContext(printer, history = [], barcode = "") {
  const el = $("#printer-context");
  if (!el) return;

  if (!printer) {
    const code = String(barcode || state.printerBarcode || $("#barcode-input")?.value || "").trim();
    if (!code) {
      el.hidden = true;
      el.innerHTML = "";
      return;
    }

    el.hidden = false;
    el.innerHTML = `
      <div class="printer-context-head">
        <span class="printer-found printer-new">＋ UNIT BARU</span>
        <strong>Identitas belum terdaftar</strong>
      </div>
      <div class="printer-context-grid">
        <span>ID Barcode</span><b>${escapeHtml(code)}</b>
        <span>Status</span><b>Siap didaftarkan</b>
      </div>
      <small class="printer-history-empty">
        Kode ini akan disimpan sebagai identitas unit saat transaksi servis disimpan.
      </small>
    `;
    return;
  }

  const recent = history.slice(0, 5).map(item =>
    `<li><strong>${escapeHtml(item.nomor || "-")}</strong> · ${escapeHtml(item.status || "-")} · ${escapeHtml(item.tanggal ? new Date(item.tanggal).toLocaleDateString("id-ID") : "-")}</li>`
  ).join("");

  el.hidden = false;
  el.innerHTML = `
    <div class="printer-context-head">
      <span class="printer-found">✓ UNIT DITEMUKAN</span>
      <strong>${escapeHtml(printer.merk || "Printer")}</strong>
    </div>
    <div class="printer-context-grid">
      <span>ID Unit</span><b>${escapeHtml(printer.unitId || printer.barcode || "-")}</b>
      <span>Serial</span><b>${escapeHtml(printer.serial || "-")}</b>
      <span>Pemilik</span><b>${escapeHtml(printer.pelanggan || "-")}</b>
      <span>Riwayat</span><b>${history.length} servis</b>
    </div>
    ${history.length ? `<div class="printer-history"><small>Riwayat servis terbaru</small><ol>${recent}</ol></div>` : `<small class="printer-history-empty">Belum ada riwayat servis untuk unit ini.</small>`}
  `;
}

async function loadPrinterIdentity(code, { notify = true } = {}) {
  const unitId = String(code || "").trim();
  if (!unitId) return null;

  let unit = await getUnit(unitId);

  if (!unit) {
    // Compatibility with old pelanggan/{serial} records.
    const legacy = await findCustomer(unitId);
    if (legacy) {
      unit = {
        unitId,
        barcode: unitId,
        serial: unitId,
        nama: legacy.nama,
        pelanggan: legacy.nama,
        telp: legacy.telp,
        merk: legacy.merk,
        kelengkapan: legacy.kelengkapan
      };
    }
  }

  if (!unit) {
    state.printerBarcode = unitId;
    state.selectedPrinter = null;
    const input = $("#barcode-input");
    if (input) input.value = unitId;
    renderPrinterContext(null, [], unitId);
    if (notify) view.toast(`Unit ${unitId} baru. Identitas siap didaftarkan.`, "info");
    return null;
  }

  const history = await getUnitHistory(unitId);
  state.printerBarcode = unitId;
  state.selectedPrinter = unit;

  $("#barcode-input").value = unit.serial || unitId;
  $("#input-nama").value = unit.pelanggan || unit.nama || "";
  $("#input-telp").value = unit.telp || "";
  $("#input-merk").value = unit.merk || "";
  $("#input-kelengkapan").value = unit.kelengkapan || "";

  renderPrinterContext(unit, history);
  if (notify) view.toast(`Unit ${unitId} dikenali. ${history.length} riwayat servis ditemukan.`, "success");
  return unit;
}

async function saveCurrentService(print = false, type = "nota") {
  const f = currentForm();
  if (!f.pelanggan || !f.merk) return view.toast("Nama pelanggan dan merk/tipe wajib diisi", "error");

  const old = state.editServiceOriginal || {};
  const oldStatus = statusOf(old);
  const newStatus = statusOf(f);
  const number = state.editServiceKey ? (old.nomor || state.editServiceKey.split("/").pop()) : makeServiceNumber();
  const now = new Date().toISOString();
  const data = {
    ...f,
    nomor: number,
    tanggal: old.tanggal || now,
    updatedAt: now,
    jasa: state.items.jasa,
    sparepart: state.items.sparepart,
    total: total(),
    teknisi: state.user?.email?.split("@")[0]?.toUpperCase() || "TEKNISI",
    unitId: state.printerBarcode || f.serial || "",
    printerId: state.printerBarcode || f.serial || ""
  };

  // DIAMBIL adalah momen uang servis benar-benar diterima.
  // Simpan waktunya terpisah dari tanggal masuk servis agar laporan
  // akuntansi mengikuti bulan saat pembayaran diterima.
  if (newStatus === "DIAMBIL") {
    data.diambilAt = oldStatus === "DIAMBIL" && old.diambilAt ? old.diambilAt : now;
  } else if (old.diambilAt) {
    data.diambilAt = old.diambilAt;
  }

  if (data.unitId) {
    await saveUnit({
      unitId: data.unitId,
      serial: data.serial,
      merk: data.merk,
      pelanggan: data.pelanggan,
      telp: data.telp,
      kelengkapan: data.kelengkapan
    });
  }

  await saveCustomer(f.serial, f);
  await syncInventoryUsage([...(old.jasa || []), ...(old.sparepart || [])], [...state.items.jasa, ...state.items.sparepart]);
  const savedKey = await saveService(state.editServiceKey, data);
  await syncServicePayment(data, old);
  await loadAll();
  state.editServiceKey = savedKey;

  const changedStatus = statusOf(old) && statusOf(old) !== statusOf(data);
  view.toast(changedStatus ? `Status berubah: ${statusOf(old)} → ${statusOf(data)}` : "Perubahan servis berhasil disimpan", "success");
  if (print) await printReceiptSmart(data, type);
}

async function openService(key) {
  const d = await getService(key);
  if (!d) return view.toast("Servis tidak ditemukan", "error");
  fillService(d);
  switchPage("kasir");
}

async function removeCurrentService() {
  if (!state.editServiceKey) return;
  if (!confirm("Hapus servis ini?")) return;
  const old = state.editServiceOriginal || await getService(state.editServiceKey);
  if (old) await syncInventoryUsage([...(old.jasa || []), ...(old.sparepart || [])], []);
  await removeService(state.editServiceKey);
  resetServiceForm();
  await loadAll();
  view.toast("Servis berhasil dihapus", "success");
}

async function startCodeScanner(mode = "printer") {
  if (!window.Html5Qrcode) return view.toast("Scanner belum siap. Periksa koneksi internet.", "error");

  $("#scanner-modal").classList.add("open");
  $("#scanner-result").textContent = mode === "printer"
    ? "Arahkan kamera ke barcode / QR printer..."
    : "Arahkan kamera ke barcode / QR...";

  const reader = $("#app-reader");
  reader.innerHTML = "";

  try {
    scanner = new Html5Qrcode("app-reader");
    let cameraConfig = { facingMode: "environment" };
    try {
      const cameras = await Html5Qrcode.getCameras();
      if (cameras.length) {
        const camera = cameras.find(x => /back|rear|environment|belakang/i.test(x.label)) || cameras[0];
        cameraConfig = camera.id;
      }
    } catch (cameraError) {
      console.warn("Daftar kamera tidak tersedia, fallback ke environment:", cameraError);
    }

    await scanner.start(
      cameraConfig,
      {
        fps: 20,
        qrbox: { width: Math.min(300, Math.max(220, window.innerWidth - 90)), height: 120 },
        aspectRatio: 1.777,
        experimentalFeatures: { useBarCodeDetectorIfSupported: true },
        formatsToSupport: [
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.CODE_93,
          Html5QrcodeSupportedFormats.CODABAR,
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.QR_CODE
        ]
      },
      async decodedText => {
        await stopCodeScanner();
        const code = decodedText.trim();

        if (mode === "printer") {
          // Scanner printer = pembaca identitas unit, bukan pencarian nomor servis.
          // Selalu tulis hasil scan ke kotak ID/Barcode Printer terlebih dahulu.
          $("#barcode-input").value = code;
          state.printerBarcode = code;
          await loadPrinterIdentity(code);
          switchPage("kasir");
          return;
        }

        const normalized = String(code || "").trim()
          .replace(/^https?:\/\/[^/]+\/servis\//i, "")
          .replace(/^\/?servis\//i, "")
          .replace(/^(TT|INV)[-:]/i, "");
        if (!normalized) return view.toast("QR tidak berisi nomor servis", "error");
        window.location.href = `tracking.html?nomor=${encodeURIComponent(normalized)}`;
      }
    );
  } catch (err) {
    console.error(err);
    view.toast("Kamera tidak dapat dibuka. Pastikan izin kamera diberikan.", "error");
    await stopCodeScanner();
  }
}


async function stopCodeScanner() {
  if (scanner) {
    try { await scanner.stop(); } catch {}
    try { await scanner.clear(); } catch {}
    scanner = null;
  }
  $("#scanner-modal").classList.remove("open");
}

function renderPage(name) {
  document.querySelectorAll(".page").forEach(p => p.classList.toggle("active", p.id === `page-${name}`));
  document.querySelectorAll("[data-page]").forEach(b => b.classList.toggle("active", b.dataset.page === name));
  $("#page-title").textContent = {
    dashboard: "Dashboard", kasir: "Kasir & Servis", services: "Data Servis",
    inventory: "Inventori", restock: "Restock", accounting: "Akuntansi", tools: "Tools"
  }[name] || "OnePrint";
  if (name === "accounting") renderAccounting();
  if (name === "restock") renderRestock();
}

function switchPage(name) {
  renderPage(name);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function serviceCard(x) {
  return `<div class="result-card"><strong>${escapeHtml(x.nomor)}</strong><span>${escapeHtml(x.pelanggan)} · ${escapeHtml(x.merk)}</span><span>${escapeHtml(x.status || "-")} · ${money(x.total)}</span><button class="table-action" data-open-service="${escapeHtml(x.key)}">Buka</button></div>`;
}

function showMoreMenu() {
  view.modal("Menu Lainnya", `<div class="more-grid">
    <button data-page="tools"><b>Tools</b><span>Scanner QR, PLN, Internet, website publik</span></button>
    <a href="tracking.html"><b>Tracking Publik</b><span>Lihat halaman tracking pelanggan</span></a>
    <a href="scanner.html"><b>Generator QR</b><span>Tool QR lama tetap tersedia</span></a>
  </div>`);
}


function setMenu(open) {
  const drawer = document.querySelector(".sidebar");
  const toggle = $("#menu-toggle");
  const backdrop = $("#menu-backdrop");
  if (!drawer || !toggle || !backdrop) return;
  drawer.classList.toggle("menu-open", open);
  toggle.setAttribute("aria-expanded", String(open));
  toggle.setAttribute("aria-label", open ? "Tutup menu" : "Buka menu");
  backdrop.hidden = !open;
  document.body.classList.toggle("menu-lock", open);
}


function isLiquidInventoryUnit(unit) {
  const u = String(unit || "").toLowerCase();
  return u === "ml" || u === "gram";
}

function updateInventoryUnitUI() {
  const category = String($("#inv-kategori")?.value || "").toLowerCase();
  const unit = $("#inv-satuan")?.value || "pcs";
  const liquidCategory = category === "tinta" || category === "cairan";
  const liquid = liquidCategory || isLiquidInventoryUnit(unit);
  const packSize = $("#inv-pack-size");
  const sellSize = $("#inv-sell-size");
  const sellUnit = $("#inv-sell-unit");
  const note = $("#inventory-unit-note");
  const packLabel = $("#inv-pack-size-label");
  const sellSizeLabel = $("#inv-sell-size-label");
  const sellUnitLabel = $("#inv-sell-unit-label");
  const beliLabel = document.querySelector('label[for="inv-beli"]');
  if (!packSize || !sellSize || !sellUnit) return;

  // Tinta dan cairan selalu dikelola sebagai volume dasar.
  if (liquidCategory && !isLiquidInventoryUnit(unit)) {
    $("#inv-satuan").value = "ml";
  }

  const baseUnit = $("#inv-satuan").value || unit;
  const isLiquid = liquidCategory || isLiquidInventoryUnit(baseUnit);

  if (isLiquid) {
    if (!Number(packSize.value) || Number(packSize.value) === 1) packSize.value = 1000;
    if (!Number(sellSize.value) || Number(sellSize.value) === 1) sellSize.value = 100;

    if (!sellUnit.value || /^(pcs|ml|gram|unit)$/i.test(sellUnit.value)) {
      sellUnit.value = `${sellSize.value}${baseUnit}`;
    }

    if (packLabel) packLabel.childNodes[0].nodeValue = "Isi 1 kemasan beli (ml)";
    if (sellSizeLabel) sellSizeLabel.childNodes[0].nodeValue = "Isi per penjualan (ml)";
    if (sellUnitLabel) sellUnitLabel.childNodes[0].nodeValue = "Nama unit jual";
    if (beliLabel) beliLabel.childNodes[0].nodeValue = "Harga beli / kemasan";
    const stockLabel = document.querySelector('label[for="inv-stok"]') || $("#inv-stok")?.closest("label");
    if (stockLabel) stockLabel.childNodes[0].nodeValue = "Stok dasar (ml)";
    const jualLabel = document.querySelector('label[for="inv-jual"]') || $("#inv-jual")?.closest("label");
    if (jualLabel) jualLabel.childNodes[0].nodeValue = `Harga jual / ${sellSize.value || 100}ml`;

    note.textContent =
      `Stok disimpan dalam ml. Setiap qty transaksi menjual ${sellSize.value || 100} ml dan mengurangi stok sebesar itu, walaupun cairan yang dituangkan secara fisik kurang dari ${sellSize.value || 100} ml.`;
  } else {
    packSize.value = 1;
    sellSize.value = 1;
    sellUnit.value = baseUnit;
    if (packLabel) packLabel.childNodes[0].nodeValue = "Isi 1 kemasan beli";
    if (sellSizeLabel) sellSizeLabel.childNodes[0].nodeValue = "Isi per penjualan";
    if (sellUnitLabel) sellUnitLabel.childNodes[0].nodeValue = "Nama unit jual";
    if (beliLabel) beliLabel.childNodes[0].nodeValue = "Harga beli / kemasan";
    const stockLabel = $("#inv-stok")?.closest("label");
    if (stockLabel) stockLabel.childNodes[0].nodeValue = "Stok dasar";
    const jualLabel = $("#inv-jual")?.closest("label");
    if (jualLabel) jualLabel.childNodes[0].nodeValue = "Harga jual / unit jual";

    note.textContent =
      "Barang biasa memakai stok dan harga per unit. Untuk tinta, head cleaner, thinner, atau alkohol IPA, gunakan kategori tinta/cairan dan satuan ml.";
  }
}

function renderRestockCalculation() {
  const box = $("#restock-calculation");
  const select = $("#restock-item");
  if (!box || !select) return;
  const [kategori, key] = select.value.split("|");
  const inv = state.inventory.find(x => x.kategori === kategori && x.key === key);
  if (!inv) {
    box.hidden = true;
    box.innerHTML = "";
    return;
  }

  const packages = Math.max(0, Number($("#restock-qty").value) || 0);
  const packSize = Math.max(1, Number($("#restock-pack-size").value) || Number(inv.isi_kemasan_beli) || 1);
  const price = Math.max(0, Number($("#restock-price").value) || Number(inv.harga_beli) || 0);
  const liquid = isLiquidInventoryUnit(inv.satuan);
  const added = packages * packSize;
  const perBase = liquid ? price / packSize : price;

  box.hidden = false;
  box.innerHTML = `
    <div><span>Akan masuk stok</span><strong>${added.toLocaleString("id-ID")} ${escapeHtml(inv.satuan || "pcs")}</strong></div>
    <div><span>Total pembelian</span><strong>${money(packages * price)}</strong></div>
    <div><span>HPP / ${escapeHtml(inv.satuan || "unit")}</span><strong>${money(perBase)}</strong></div>
    ${liquid ? `<small>Contoh: ${packages || 1} kemasan × ${packSize.toLocaleString("id-ID")} ${escapeHtml(inv.satuan)}. Harga jual dihitung terpisah per unit jual.</small>` : ""}
  `;
}

function getPrinterFormConfig() {
  return {
    mode: $("#printer-mode")?.value || "browser",
    bridgeUrl: $("#printer-bridge-url")?.value.trim() || "http://127.0.0.1:18181",
    document: {
      transport: $("#printer-document-transport")?.value || "cups",
      printerName: $("#printer-document-name")?.value.trim() || "",
      paper: $("#printer-document-paper")?.value || "A5"
    },
    thermal: {
      transport: $("#printer-transport")?.value || "cups",
      printerName: $("#printer-name")?.value.trim() || "",
      host: $("#printer-host")?.value.trim() || "",
      port: Number($("#printer-port")?.value || 9100),
      serialPath: $("#printer-serial")?.value.trim() || "",
      baudRate: Number($("#printer-baud")?.value || 9600),
      paper: $("#printer-paper")?.value || "58"
    },
    token: $("#printer-token")?.value || ""
  };
}

function fillPrinterFormConfig(config = {}) {
  const thermal = config.thermal || {};
  const document = config.document || {};
  const legacy = !config.thermal && !config.document ? config : {};
  const values = {
    "printer-mode": config.mode || "browser",
    "printer-bridge-url": config.bridgeUrl || "http://127.0.0.1:18181",
    "printer-document-transport": document.transport || "cups",
    "printer-document-name": document.printerName || "",
    "printer-document-paper": document.paper || "A5",
    "printer-transport": thermal.transport || legacy.transport || "cups",
    "printer-name": thermal.printerName || legacy.printerName || "",
    "printer-host": thermal.host || legacy.host || "",
    "printer-port": thermal.port || legacy.port || 9100,
    "printer-serial": thermal.serialPath || legacy.serialPath || "",
    "printer-baud": thermal.baudRate || legacy.baudRate || 9600,
    "printer-paper": thermal.paper || legacy.paper || "58",
    "printer-token": config.token || ""
  };
  Object.entries(values).forEach(([id, value]) => {
    const el = $(`#${id}`);
    if (el) el.value = value;
  });
  updatePrinterTransportUI();
}

function updatePrinterTransportUI() {
  const transport = $("#printer-transport")?.value || "cups";
  const cups = transport === "cups";
  const win = transport === "winspool";
  const net = transport === "network";
  const serial = transport === "serial";
  const nameLabel = $("#printer-name-label");
  const nameInput = $("#printer-name");

  $("#printer-name-wrap")?.toggleAttribute("hidden", !(win || cups));
  $("#printer-host-wrap")?.toggleAttribute("hidden", !net);
  $("#printer-port-wrap")?.toggleAttribute("hidden", !net);
  $("#printer-serial-wrap")?.toggleAttribute("hidden", !serial);
  $("#printer-baud-wrap")?.toggleAttribute("hidden", !serial);

  if (nameLabel) {
    nameLabel.textContent = cups
      ? "Nama antrian CUPS"
      : win
        ? "Nama printer Windows"
        : "Nama printer";
  }
  if (nameInput) nameInput.placeholder = cups ? "Thermal_Label" : "POS-80C";
}

async function refreshPrinterBridgeStatus() {
  const badge = $("#printer-bridge-status");
  if (!badge) return;
  try {
    const cfg = getPrinterFormConfig();
    if (cfg.mode !== "bridge") {
      badge.textContent = "Mode browser";
      badge.classList.remove("bridge-ok");
      return;
    }
    const result = await testPrinterBridge(cfg);
    badge.textContent = result.ok ? "Bridge siap" : "Bridge gagal";
    badge.classList.toggle("bridge-ok", !!result.ok);
  } catch (err) {
    badge.textContent = "Bridge gagal";
    badge.classList.remove("bridge-ok");
    console.warn("OnePrint printer bridge:", err);
  }
}

function bind() {
  if (uiBound) return;
  uiBound = true;

  document.addEventListener("click", async e => {
    if (e.target.closest("#menu-toggle")) { setMenu(!document.querySelector(".sidebar")?.classList.contains("menu-open")); return; }
    if (e.target.closest("#menu-backdrop")) { setMenu(false); return; }
    const page = e.target.closest("[data-page]");
    if (page) { view.closeModal(); switchPage(page.dataset.page); setMenu(false); return; }

    if (e.target.closest("#logout")) {
      await stopCodeScanner();
      try { await signOut(); } finally { window.location.href = "login.html"; }
      return;
    }

    if (e.target.closest("#new-service") || e.target.closest("#new-service-3")) {
      resetServiceForm(); switchPage("kasir"); return;
    }

    if (e.target.closest("#more-menu")) { showMoreMenu(); return; }
    if (e.target.closest("#modal-close")) { view.closeModal(); return; }
    if (e.target.closest("#scanner-close")) { await stopCodeScanner(); return; }
    if (e.target.closest("#scan-printer") || e.target.closest("#scan-service-form") || e.target.closest("#scan-serial")) {
      startCodeScanner("printer");
      return;
    }
    if (e.target.closest("#scan-service-list")) {
      startCodeScanner("service");
      return;
    }
    if (e.target.closest("#new-service-bottom")) { resetServiceForm(); switchPage("kasir"); return; }

    const pick = e.target.closest("[data-pick]");
    if (pick) {
      const [kategori, key] = pick.dataset.pick.split(":");
      const x = state.inventory.find(i => i.kategori === kategori && i.key === key);
      if (x) {
        state.selectedInventory = x;
        $("#input-item-nama").value = x.nama;
        $("#input-item-harga").value = x.harga_jual || 0;
        state.tab = x.kategori === "jasa" ? "jasa" : "sparepart";
        $("#tab-jasa").classList.toggle("active", state.tab === "jasa");
        $("#tab-sparepart").classList.toggle("active", state.tab === "sparepart");
        $("#suggestions").hidden = true;
      }
      return;
    }

    const rem = e.target.closest("[data-remove]");
    if (rem) {
      const [cat, i] = rem.dataset.remove.split(":");
      state.items[cat].splice(Number(i), 1);
      renderCart();
      return;
    }

    const delRestock = e.target.closest("[data-del-restock]");
    if (delRestock) {
      const restocks = state.restocks.slice().sort((a, b) => {
        const byDate = (Date.parse(b.tanggal) || 0) - (Date.parse(a.tanggal) || 0);
        return byDate || String(b.key || "").localeCompare(String(a.key || ""));
      });
      const restock = restocks[0];
      if (!restock || restock.key !== delRestock.dataset.delRestock) {
        view.toast("Hapus restock harus dimulai dari transaksi paling baru.", "error");
        return;
      }
      if (!confirm(`Hapus restock ${restock.nama || restock.itemKey}? Stok akan dikurangi ${restock.qty}.`)) return;

      try {
        const result = await removeRestock(restock);
        state.restocks = state.restocks.filter(x => x.key !== restock.key);
        const inv = state.inventory.find(x =>
          x.kategori === restock.kategori && x.key === restock.itemKey
        );
        if (inv) inv.stok = result.stokBaru;
        renderInventory();
        renderRestock();
        await loadAll();
        view.toast(`Restock dihapus. Stok sekarang ${result.stokBaru}.`, "success");
      } catch (error) {
        console.error(error);
        view.toast(error.message || "Gagal menghapus restock.", "error");
      }
      return;
    }

    const open = e.target.closest("[data-open-service]");
    if (open) { await openService(open.dataset.openService); return; }

    const edit = e.target.closest("[data-edit-inv]");
    if (edit) {
      const [cat, key] = edit.dataset.editInv.split(":");
      const x = state.inventory.find(i => i.kategori === cat && i.key === key);
      if (x) {
        state.editInventoryKey = key; state.editInventoryCategory = cat;
        $("#inv-nama").value = x.nama; $("#inv-kategori").value = cat;
        $("#inv-beli").value = x.harga_beli || 0; $("#inv-jual").value = x.harga_jual || 0;
        $("#inv-stok").value = x.stok || 0; $("#inv-satuan").value = x.satuan || "pcs";
        $("#inv-pack-size").value = x.isi_kemasan_beli || ((x.satuan || "").toLowerCase() === "ml" ? 1000 : 1);
        $("#inv-sell-size").value = x.isi_jual || ((x.satuan || "").toLowerCase() === "ml" ? 100 : 1);
        $("#inv-sell-unit").value = x.satuan_jual || (((x.satuan || "").toLowerCase() === "ml") ? `${x.isi_jual || 100}ml` : (x.satuan || "pcs"));
        updateInventoryUnitUI();

        switchPage("inventory");
      }
      return;
    }

    const delInv = e.target.closest("[data-del-inv]");
    if (delInv) {
      const [cat, key] = delInv.dataset.delInv.split(":");
      if (confirm("Hapus barang ini?")) {
        await removeInventory(cat, key); await loadAll(); view.toast("Barang inventori dihapus", "success");
      }
      return;
    }

    if (e.target.closest("#open-maintenance")) {
      switchPage("tools");
      renderMaintenance(state.services);
      document.querySelector("#page-tools .maintenance-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }

    if (e.target.closest("#maintenance-refresh")) {
      try {
        const latest = await listServices();
        state.services = latest;
        renderMaintenance(latest);
        renderStats();
        renderServiceTable();
        view.toast(`Pemeriksaan selesai. ${state.maintenanceCandidates.length} kandidat ditemukan.`, "success");
      } catch (err) {
        console.error("OnePrint maintenance refresh:", err);
        view.toast(`Gagal memeriksa data: ${err?.message || "koneksi Firebase bermasalah."}`, "error");
      }
      return;
    }

    if (e.target.closest("#maintenance-export")) {
      const candidates = state.maintenanceCandidates;
      if (!candidates.length) return view.toast("Tidak ada data lama yang perlu di-backup.", "info");
      try {
        await exportCleanupBackup(candidates);
        state.maintenanceBackupExported = true;
        view.toast(`Backup ${candidates.length} servis berhasil dibuat.`, "success");
      } catch (err) {
        console.error("OnePrint maintenance export:", err);
        view.toast("Backup gagal dibuat.", "error");
      }
      return;
    }

    if (e.target.closest("#maintenance-clean")) {
      const candidates = state.maintenanceCandidates;
      if (!candidates.length) return view.toast("Tidak ada kandidat yang bisa dibersihkan.", "info");

      const confirmed = confirm(
        `Hapus permanen ${candidates.length} servis DIAMBIL/CANCEL yang lebih dari 3 bulan?\\n\\n` +
        `Servis yang masih aktif, SELESAI, atau belum selesai tidak akan disentuh.\\n` +
        `Data yang dihapus tidak dapat dipulihkan. Sebaiknya export backup terlebih dahulu.`
      );
      if (!confirmed) return;

      const second = confirm(`Konfirmasi terakhir: hapus ${candidates.length} data servis lama sekarang?`);
      if (!second) return;

      try {
        const removed = await cleanupCandidates(candidates);
        state.maintenanceBackupExported = false;
        await loadAll();
        view.toast(`${removed} data servis lama berhasil dibersihkan.`, "success");
      } catch (err) {
        console.error("OnePrint maintenance cleanup:", err);
        await loadAll();
        view.toast(`Pembersihan berhenti: ${err?.message || "periksa koneksi Firebase."}`, "error");
      }
      return;
    }

    const manualSave = e.target.closest("#save-manual-ledger");
    if (manualSave) {
      const date = $("#ledger-date")?.value || "";
      const amount = Number($("#ledger-amount")?.value) || 0;
      const note = ($("#ledger-note")?.value || "").trim();
      const tipe = $("#ledger-type")?.value || "PEMASUKAN";
      const kategori = $("#ledger-category")?.value || "LAINNYA";

      if (!date) return view.toast("Tanggal transaksi wajib diisi.", "error");
      if (amount <= 0) return view.toast("Jumlah transaksi harus lebih dari 0.", "error");
      if (!note) return view.toast("Keterangan transaksi wajib diisi.", "error");

      const key = state.editLedgerKey;
      const isEdit = Boolean(key);
      manualSave.disabled = true;
      try {
        const savedLedger = await saveLedger({
          tanggal: date,
          tipe,
          kategori,
          sumber: "MANUAL",
          keterangan: note,
          jumlah: amount
        }, key);

        // Update local state immediately so the UI reflects the write even
        // before the next Firebase read completes.
        state.ledger = [
          savedLedger,
          ...state.ledger.filter(x => String(x.key) !== String(savedLedger.key))
        ];

        resetManualLedgerForm();
        renderAccounting();
        await loadAll();
        // Keep the just-saved record if a transient read returns stale data.
        if (!state.ledger.some(x => String(x.key) === String(savedLedger.key))) {
          state.ledger.unshift(savedLedger);
          renderAccounting();
        }
        view.toast(isEdit ? "Transaksi keuangan diperbarui." : "Transaksi keuangan dicatat.", "success");
      } catch (err) {
        console.error("OnePrint manual ledger:", err);
        view.toast(`Gagal menyimpan transaksi: ${err?.message || "periksa koneksi Firebase."}`, "error");
      } finally {
        manualSave.disabled = false;
      }
      return;
    }

    const editLedger = e.target.closest("[data-edit-ledger]");
    if (editLedger) {
      const row = state.ledger.find(x => String(x.key) === String(editLedger.dataset.editLedger));
      if (!row) return view.toast("Transaksi tidak ditemukan.", "error");

      state.editLedgerKey = row.key;
      const type = $("#ledger-type");
      const category = $("#ledger-category");
      const date = $("#ledger-date");
      const amount = $("#ledger-amount");
      const note = $("#ledger-note");

      if (type) type.value = row.tipe || "PEMASUKAN";
      if (category) category.value = row.kategori || "LAINNYA";
      if (date) date.value = dateInput(row.tanggal);
      if (amount) amount.value = Number(row.jumlah || 0);
      if (note) note.value = row.keterangan || "";

      const saveBtn = $("#save-manual-ledger");
      if (saveBtn) saveBtn.textContent = "Simpan Perubahan";
      const cancelBtn = $("#cancel-manual-ledger");
      if (cancelBtn) cancelBtn.hidden = false;

      document.querySelector("#page-accounting .accounting-grid .panel")?.scrollIntoView({
        behavior: "smooth", block: "start"
      });
      view.toast("Mode edit transaksi aktif.", "info");
      return;
    }

    const delLedger = e.target.closest("[data-del-ledger]");
    if (delLedger) {
      const key = delLedger.dataset.delLedger;
      if (!confirm("Hapus transaksi manual ini? Data yang dihapus tidak dapat dipulihkan.")) return;
      try {
        await removeLedger(key);
        if (state.editLedgerKey === key) resetManualLedgerForm();
        await loadAll();
        view.toast("Transaksi keuangan dihapus.", "success");
      } catch (err) {
        console.error(err);
        view.toast(`Gagal menghapus transaksi: ${err.message || "periksa koneksi Firebase."}`, "error");
      }
      return;
    }

    if (e.target.closest("#dashboard-aktif")) {
      const rows = filterOperationalServices(state.services).filter(x => ["MASUK","DIAGNOSA","DIKERJAKAN"].includes(statusOf(x)));
      view.modal("Servis Aktif", rows.map(serviceCard).join("") || "Tidak ada data");
      return;
    }
    if (e.target.closest("#dashboard-sparepart")) {
      const rows = filterOperationalServices(state.services).filter(x => statusOf(x) === "MENUNGGU SPAREPART");
      view.modal("Menunggu Sparepart", rows.map(serviceCard).join("") || "Tidak ada data");
      return;
    }
    if (e.target.closest("#dashboard-selesai")) {
      const rows = filterOperationalServices(state.services).filter(x => statusOf(x) === "SELESAI");
      view.modal("Selesai / Siap Diambil", rows.map(serviceCard).join("") || "Tidak ada data");
      return;
    }

    if (e.target.closest("#scan-dashboard")) { startCodeScanner("service"); return; }
  });

  $("#input-item-nama").addEventListener("input", renderSuggestions);
  $("#add-item").addEventListener("click", addCartItem);
  $("#tab-jasa").addEventListener("click", () => { state.tab = "jasa"; $("#tab-jasa").classList.add("active"); $("#tab-sparepart").classList.remove("active"); renderSuggestions(); });
  $("#tab-sparepart").addEventListener("click", () => { state.tab = "sparepart"; $("#tab-sparepart").classList.add("active"); $("#tab-jasa").classList.remove("active"); renderSuggestions(); });
  $("#save-service").addEventListener("click", () => saveCurrentService(false));
  $("#save-print-note").addEventListener("click", () => saveCurrentService(true, "tanda-terima"));
  $("#save-print-invoice").addEventListener("click", () => saveCurrentService(true, "nota"));

  $("#reprint-note").addEventListener("click", async () => {
    if (!state.editServiceKey) return view.toast("Buka servis tersimpan terlebih dahulu", "error");
    const data = await getService(state.editServiceKey);
    if (!data) return view.toast("Data servis tidak ditemukan", "error");
    await printReceiptSmart(data, "tanda-terima");
  });

  $("#reprint-invoice").addEventListener("click", async () => {
    if (!state.editServiceKey) return view.toast("Buka servis tersimpan terlebih dahulu", "error");
    const data = await getService(state.editServiceKey);
    if (!data) return view.toast("Data servis tidak ditemukan", "error");
    await printReceiptSmart(data, "nota");
  });

  $("#delete-service").addEventListener("click", removeCurrentService);
  $("#service-search").addEventListener("input", renderServiceTable);
  $("#service-status-filter").addEventListener("change", renderServiceTable);
  $("#inventory-search").addEventListener("input", renderInventory);

  const barcodeInput = $("#barcode-input");
  if (barcodeInput) {
    barcodeInput.addEventListener("keydown", async e => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      const code = barcodeInput.value.trim();
      if (!code) return;
      await loadPrinterIdentity(code);
    });
  }
  $("#accounting-month").addEventListener("change", renderAccounting);

  $("#find-service-code").addEventListener("click", async () => {
    const code = $("#service-code-input").value.trim();
    const d = await findServiceByCode(code);
    if (!d) return view.toast("Nomor servis tidak ditemukan", "error");
    fillService(d); switchPage("kasir"); view.toast(`Servis ${d.nomor} dibuka`, "success");
  });
  $("#service-code-input").addEventListener("keydown", e => { if (e.key === "Enter") $("#find-service-code").click(); });

  $("#save-inventory").addEventListener("click", async () => {
    const item = {
      nama: $("#inv-nama").value, kategori: $("#inv-kategori").value,
      harga_beli: $("#inv-beli").value, harga_jual: $("#inv-jual").value,
      stok: $("#inv-stok").value, satuan: $("#inv-satuan").value,
      isi_kemasan_beli: $("#inv-pack-size").value,
      isi_jual: $("#inv-sell-size").value,
      satuan_jual: $("#inv-sell-unit").value.trim()
    };
    if (!item.nama.trim()) return view.toast("Nama barang wajib diisi", "error");
    await saveInventory(item, state.editInventoryKey, state.editInventoryCategory);
    state.editInventoryKey = null; state.editInventoryCategory = null;
    ["inv-nama","inv-beli","inv-jual","inv-stok","inv-pack-size","inv-sell-size","inv-sell-unit"].forEach(id => $(`#${id}`).value = "");
    await loadAll(); view.toast("Inventori berhasil disimpan", "success");
  });

  $("#clear-inventory").addEventListener("click", () => {
    state.editInventoryKey = null; state.editInventoryCategory = null;
    ["inv-nama","inv-beli","inv-jual","inv-stok"].forEach(id => $(`#${id}`).value = "");
    $("#inv-kategori").value = "sparepart";
    $("#inv-satuan").value = "pcs";
    $("#inv-pack-size").value = "1";
    $("#inv-sell-size").value = "1";
    $("#inv-sell-unit").value = "pcs";
    updateInventoryUnitUI();
  });
  $("#inv-kategori").addEventListener("change", () => {
    const category = String($("#inv-kategori").value || "").toLowerCase();
    const liquidCategory = category === "tinta" || category === "cairan";
    const unit = $("#inv-satuan");
    if (liquidCategory && unit && !isLiquidInventoryUnit(unit.value)) {
      unit.value = "ml";
    }
    updateInventoryUnitUI();
  });
  $("#inv-satuan").addEventListener("change", updateInventoryUnitUI);
  $("#inv-sell-size").addEventListener("input", updateInventoryUnitUI);

  $("#restock-qty").addEventListener("input", renderRestockCalculation);
  $("#restock-pack-size").addEventListener("input", renderRestockCalculation);
  $("#restock-price").addEventListener("input", renderRestockCalculation);

  $("#printer-transport")?.addEventListener("change", updatePrinterTransportUI);
  $("#printer-mode")?.addEventListener("change", refreshPrinterBridgeStatus);
  $("#printer-document-transport")?.addEventListener("change", () => {});

  $("#printer-save")?.addEventListener("click", () => {
    savePrinterConfig(getPrinterFormConfig());
    view.toast("Setting printer disimpan", "success");
    refreshPrinterBridgeStatus();
  });
  $("#printer-test")?.addEventListener("click", async () => {
    try {
      const cfg = getPrinterFormConfig();
      savePrinterConfig(cfg);
      const result = await testPrinterBridge(cfg);
      view.toast(result.ok ? "Bridge printer terhubung" : "Bridge printer tidak merespons", result.ok ? "success" : "error");
      $("#printer-bridge-status").textContent = result.ok ? "Bridge siap" : "Bridge gagal";
    } catch (err) {
      view.toast(err.message || "Tes printer gagal", "error");
    }
  });
  $("#printer-test-print")?.addEventListener("click", async () => {
    try {
      const cfg = getPrinterFormConfig();
      savePrinterConfig(cfg);
      await printTestReceipt(cfg);
      view.toast("Perintah cetak tes terkirim", "success");
    } catch (err) {
      view.toast(err.message || "Cetak tes gagal", "error");
    }
  });

  fillPrinterFormConfig(getPrinterConfig());
  updateInventoryUnitUI();
  renderRestockCalculation();


  $("#restock-search").addEventListener("input", renderRestock);
  $("#restock-item").addEventListener("change", () => {
    const [kategori, key] = $("#restock-item").value.split("|");
    const inv = state.inventory.find(x => x.kategori === kategori && x.key === key);
    if (inv) {
      $("#restock-price").value = Number(inv.harga_beli || 0);
      $("#restock-pack-size").value = Number(inv.isi_kemasan_beli || ((inv.satuan || "").toLowerCase() === "ml" ? 1000 : 1));
      renderRestockCalculation();
    }
  });

  $("#save-restock").addEventListener("click", async () => {
    const inv = state.inventory.find(x => x.kategori === $("#restock-item").value.split("|")[0] && x.key === $("#restock-item").value.split("|")[1]);
    if (!inv) return view.toast("Pilih barang restock", "error");
    const result = await createRestock({
      item: inv, kategori: inv.kategori, qty: $("#restock-qty").value,
      hargaBeli: $("#restock-price").value, supplier: $("#restock-supplier").value.trim(),
      tanggal: $("#restock-date").value, catatan: $("#restock-note").value.trim(),
      isiKemasan: $("#restock-pack-size").value
    });
    $("#restock-qty").value = ""; $("#restock-price").value = ""; $("#restock-pack-size").value = "1"; $("#restock-supplier").value = ""; $("#restock-note").value = "";
    // The multi-path Firebase write has succeeded. Show its result immediately,
    // even if the subsequent history read is delayed or temporarily unavailable.
    state.restocks = [result, ...state.restocks.filter(x => x.key !== result.key)]
      .sort((a, b) => {
        const byDate = (Date.parse(b.tanggal) || 0) - (Date.parse(a.tanggal) || 0);
        return byDate || String(b.key || "").localeCompare(String(a.key || ""));
      })
      .slice(0, 50);
    renderRestock();
    await loadAll();
    view.toast(`Restock ${result.nama} berhasil. Stok sekarang ${result.stokBaru}.`, "success");
  });

  $("#cancel-manual-ledger")?.addEventListener("click", () => {
    resetManualLedgerForm();
    view.toast("Edit dibatalkan.", "info");
  });

  document.addEventListener("keydown", e => { if (e.key === "Escape") setMenu(false); });
}

watchAuth({
  onUser: async user => {
    state.user = user;
    const displayName = user.displayName || (user.email || "user").split("@")[0];
    const greetingName = displayName.trim() || "Pengguna";
    $("#user-name").textContent = greetingName;
    const avatar = $("#user-avatar");
    if (avatar) avatar.textContent = greetingName.slice(0, 2).toUpperCase();
    $("#login-screen").hidden = true;
    $("#app-shell").hidden = false;
    if (idleCleanup) idleCleanup();
    idleCleanup = startIdleTimeout(30, async () => {
      view.toast("Sesi berakhir karena tidak aktif", "info");
      await signOut();
      window.location.href = "login.html";
    });
    bind();
    renderPage("dashboard");
    resetServiceForm();
    $("#accounting-month").value ||= localMonthInput();
    $("#restock-date").value ||= localDateInput();
    $("#ledger-date").value ||= localDateInput();
    await loadAll();
  },
  onSignedOut: () => {
    $("#login-screen").hidden = false;
    $("#app-shell").hidden = true;
    if (location.pathname.endsWith("/app.html") || location.pathname.endsWith("app.html")) {
      window.location.href = "login.html";
    }
  }
});
