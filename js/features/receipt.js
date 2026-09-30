const esc = value => String(value ?? "-")
  .replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")
  .replaceAll('"',"&quot;").replaceAll("'","&#39;");

const moneyRaw = n => Number(n || 0).toLocaleString("id-ID");

const PRINT_CSS = `
@page { size: A5 portrait; margin: 5mm; }
#print-container { display:none; }
@media print {
  #app-ui, .no-print { display:none !important; }
  body { background-color:white !important; margin:0 !important; padding:0 !important; }
  #print-container {
    display:block !important;
    width:100%;
    background:white;
  }
  .invoice-page {
    width:130mm;
    margin:0 auto;
    padding-top:5mm;
    box-sizing:border-box;
    position:relative;
    display:flex;
    flex-direction:column;
    font-family:Arial,sans-serif;
    color:#000;
    min-height:190mm;
  }
  .header {
    display:flex;
    justify-content:space-between;
    align-items:flex-start;
    border-bottom:2px solid #000;
    padding-bottom:8px;
    margin-bottom:12px;
  }
  .header-left { display:flex; align-items:flex-start; }
  .logo-image {
    width:55px;
    height:55px;
    margin-right:12px;
    object-fit:contain;
  }
  .company-name {
    font-size:18px;
    font-weight:bold;
    margin-bottom:2px;
    text-transform:uppercase;
  }
  .tagline,.address-info {
    font-size:8.5px;
    margin:0;
    line-height:1.2;
  }
  .header-right {
    text-align:right;
    border:1px dashed #666;
    padding:5px 10px;
    min-width:40mm;
  }
  .invoice-title {
    font-size:16px;
    font-weight:900;
    color:#333;
    margin-bottom:2px;
  }
  .invoice-number {
    font-size:11px;
    font-weight:bold;
    font-family:'Courier New',monospace;
  }
  .client-data {
    display:grid;
    grid-template-columns:auto 1fr auto 1fr;
    gap:5px 8px;
    font-size:10px;
    margin-bottom:15px;
    border:1px solid #eee;
    padding:8px;
  }
  .client-data label { font-weight:bold; white-space:nowrap; }
  .display-data {
    border-bottom:1px dotted #ccc;
    min-height:15px;
    text-transform:uppercase;
    padding-left:2px;
  }
  .service-table {
    width:100%;
    border-collapse:collapse;
    font-size:10px;
    margin-bottom:15px;
  }
  .service-table th,.service-table td {
    border:1px solid #000;
    padding:5px;
  }
  .service-table th {
    text-align:center !important;
    color:#000 !important;
    font-weight:700 !important;
    background-color:#f0f0f0 !important;
    -webkit-print-color-adjust:exact;
    print-color-adjust:exact;
  }
  .category-header {
    background-color:#e5e5e5 !important;
    font-weight:bold;
    -webkit-print-color-adjust:exact;
    print-color-adjust:exact;
  }
  .footer-area {
    display:flex;
    justify-content:space-between;
    align-items:flex-end;
    margin-top:auto;
    padding-bottom:10px;
  }
  .note-box {
    width:4.5cm;
    background-color:#f9f9f9 !important;
    border:1px solid #ccc;
    padding:6px;
    font-size:7.5px;
    -webkit-print-color-adjust:exact;
    print-color-adjust:exact;
  }
  .note-title {
    font-weight:bold;
    text-decoration:underline;
    display:block;
    margin-bottom:4px;
    font-size:8px;
  }
  .note-box ol { margin:0; padding-left:12px; }
  .signature-wrapper { display:flex; gap:20px; font-size:10px; }
  .signature-box { text-align:center; width:3.5cm; }
  .signature-line {
    display:block;
    margin-top:35px;
    border-bottom:1px solid #000;
    font-weight:bold;
    min-height:15px;
    text-transform:uppercase;
  }
  .print-complaint {
    border:1px solid #000;
    padding:10px;
    min-height:160px;
    font-size:10px;
  }
}
`;

function ensurePrintStyle() {
  let style = document.getElementById("oneprint-original-print-style");
  if (!style) {
    style = document.createElement("style");
    style.id = "oneprint-original-print-style";
    document.head.appendChild(style);
  }
  style.textContent = PRINT_CSS;
}

function ensurePrintContainer() {
  let el = document.getElementById("print-container");
  if (!el) {
    el = document.createElement("div");
    el.id = "print-container";
    document.body.appendChild(el);
  }
  return el;
}

export function buildReceipt(data, tipe = "nota") {
  const noNota = data.nomor || "-";
  const nama = data.pelanggan || "-";
  const telp = data.telp || "-";
  const merk = data.merk || "-";
  const kelengkapan = data.kelengkapan || "-";
  const keluhan = data.keluhan || "-";
  const sn = data.serial || "-";
  const total = Number(data.total || 0);
  const teknisi = data.teknisi || "-";
  const jasa = Array.isArray(data.jasa) ? data.jasa : [];
  const sparepart = Array.isArray(data.sparepart) ? data.sparepart : [];
  const tgl = new Date(data.tanggal || Date.now()).toLocaleDateString("id-ID");
  const trackingUrl = `https://oneprintservice.web.id/tracking.html?tt=${encodeURIComponent(noNota)}`;

  const logoPath = "assets/logos.png";

  const kopHeader = `
    <div class="header">
      <div class="header-left">
        <img src="${logoPath}" class="logo-image" onerror="this.src='assets/logos.png'">
        <div class="company-info">
          <div class="company-name">OnePrint Service</div>
          <p class="tagline italic">Melayani Perbaikan Printer, Laptop, dan Komputer</p>
          <p class="address-info">Jl. Jula-Juli No.71 Tambakbayan, Ponorogo</p>
          <p class="address-info font-bold">HP / WA: 082-337-557-178</p>
        </div>
      </div>
      <div class="header-right">
        <div class="invoice-title">${tipe === "nota" ? "INVOICE" : "TANDA TERIMA"}</div>
        <span class="invoice-number"># ${tipe === "nota" ? "INV" : "TT"}-${esc(noNota)}</span>
      </div>
    </div>`;

  const clientGrid = `
    <div class="client-data">
      <label>Pelanggan</label><span class="display-data">: ${esc(nama)}</span>
      <label>Tanggal</label><span class="display-data">: ${esc(tgl)}</span>
      <label>Telepon</label><span class="display-data">: ${esc(telp)}</span>
      <label>Merk/Tipe</label><span class="display-data">: ${esc(merk)}</span>
      <label>Serial No.</label><span class="display-data">: ${esc(sn)}</span>
      <label>Kelengkapan</label><span class="display-data">: ${esc(kelengkapan)}</span>
    </div>`;

  let mainContent = "";
  let noteContent = "";

  if (tipe === "nota") {
    let rows = "";
    [["jasa","A. JASA SERVIS"],["sparepart","B. SPAREPART / TINTA"]].forEach(([cat,title]) => {
      const items = cat === "jasa" ? jasa : sparepart;
      rows += `<tr class="category-header"><td style="text-align:center">-</td><td colspan="2">${title}</td></tr>`;
      if (!items.length) rows += `<tr><td style="text-align:center">-</td><td>-</td><td style="text-align:right">-</td></tr>`;
      items.forEach((item,i) => {
        rows += `<tr><td style="text-align:center">${i+1}</td><td class="uppercase">${esc(item.nama)}</td><td style="text-align:right">Rp ${moneyRaw(item.harga)}</td></tr>`;
      });
    });
    mainContent = `<table class="service-table"><thead><tr><th width="5%">No</th><th width="70%">Rincian</th><th width="25%">Subtotal</th></tr></thead><tbody>${rows}</tbody><tfoot><tr class="font-bold"><td colspan="2" style="text-align:right">TOTAL :</td><td style="text-align:right;background:#eee;">Rp ${moneyRaw(total)}</td></tr></tfoot></table>`;
    noteContent = `<div class="note-box"><span class="note-title">PERHATIAN:</span><ol><li>1. Simpan nota / invoice sebagai bukti garansi.</li><li>2. Garansi tidak berlaku jika segel rusak atau cacat fisik karena pemakaian.</li></ol></div>`;
  } else {
    mainContent = `<div class="print-complaint"><div style="font-weight:bold;border-bottom:1px solid #ccc;margin-bottom:8px;">KELUHAN PERANGKAT:</div><div class="uppercase">${esc(keluhan).replaceAll("\\n","<br>")}</div>
<hr style="margin:10px 0">
<div style="display:flex;justify-content:space-between;align-items:center;gap:15px;">
<div style="font-size:9px;line-height:1.5;flex:1;">
<b>TRACKING SERVIS ONLINE</b><br>
oneprintservice.web.id/tracking<br>
Masukkan nomor tanda terima:<br>
<b>TT-${esc(noNota)}</b><br>
atau scan QR di samping.
</div>
<div id="qr-print"></div>
</div></div>`;
    noteContent = `<div class="note-box"><span class="note-title">SYARAT PENGAMBILAN:</span><ol><li>WAJIB bawa tanda terima ini saat pengambilan.</li><li>Barang tidak diambil &gt;2 bulan setelah konfirmasi bukan tanggung jawab kami.</li></ol></div>`;
  }

  return `<div class="invoice-page">${kopHeader}${clientGrid}${mainContent}<div class="footer-area">${noteContent}<div class="signature-wrapper"><div class="signature-box"><span>Hormat Kami,</span><span class="signature-line">${esc(teknisi)}</span></div><div class="signature-box"><span>Pelanggan,</span><span class="signature-line">(${esc(nama)})</span></div></div></div></div>`;
}

export function printReceipt(data, tipe = "nota") {
  ensurePrintStyle();
  const container = ensurePrintContainer();
  container.innerHTML = buildReceipt(data, tipe);

  const qr = container.querySelector("#qr-print");
  if (qr && window.QRCode) {
    qr.innerHTML = "";
    new window.QRCode(qr, {
      text: `https://oneprintservice.web.id/tracking.html?tt=${encodeURIComponent(data.nomor || "")}`,
      width: 110,
      height: 110
    });
  }

  // Jangan mengosongkan print-container pada "afterprint".
  // Android Chrome pada sebagian perangkat dapat memicu afterprint
  // saat preview baru dibuka, bukan setelah proses cetak benar-benar selesai.
  // Jika container dikosongkan saat itu, preview dapat menjadi kosong.
  const waitForPrintReady = async () => {
    try {
      if (document.fonts?.ready) await document.fonts.ready;
    } catch (_) {}

    const images = Array.from(container.querySelectorAll("img"));
    await Promise.all(images.map(img => new Promise(resolve => {
      if (img.complete) {
        if (img.decode) img.decode().catch(() => {}).finally(resolve);
        else resolve();
        return;
      }
      const done = () => resolve();
      img.addEventListener("load", done, { once: true });
      img.addEventListener("error", done, { once: true });
    })));

    // Beri browser waktu menyelesaikan layout/paint sebelum print.
    await new Promise(resolve => requestAnimationFrame(() =>
      requestAnimationFrame(resolve)
    ));
  };

  waitForPrintReady().then(() => {
    setTimeout(() => window.print(), 120);
  });
}
