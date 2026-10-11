
import { getPrinterConfig, savePrinterConfig, testPrinterBridge, printTestReceipt, printThermal } from "./js/features/printer.js?v=20261009-cleanter-label3";

const $ = id => document.getElementById(id);
let html5QrCode = null;
let scannerRunning = false;

function getConfigFromForm(){
  const existing=getPrinterConfig();
  const transport=$("printer-transport").value;
  return {
    ...existing,
    mode:$("printer-mode").value,
    bridgeUrl:transport==="cleanter" ? ($("printer-bridge-url").value.trim()||"http://localhost:9100") : $("printer-bridge-url").value.trim(),
    thermal:{
      transport:$("printer-transport").value,
      printerName:$("printer-name").value.trim(),
      host:$("printer-host").value.trim(),
      port:Number($("printer-port").value||9100),
      serialPath:$("printer-serial").value.trim(),
      baudRate:Number($("printer-baud").value||9600),
      paper:$("printer-paper").value
    },
    token:$("printer-token").value
  };
}
function fillPrinter(){
  const c=getPrinterConfig();
  const t=c.thermal||{};
  const legacySerial=(t.transport==="serial" && !t.serialPath && /:(18181|9100)\/?$/i.test(c.bridgeUrl||""));
  const legacyCleanter=t.transport==="cleanter" && /:18181\/?$/i.test(c.bridgeUrl||"");
  $("printer-mode").value=(t.transport==="cleanter")?"bridge":c.mode;
  $("printer-bridge-url").value=(legacySerial||legacyCleanter)?"http://localhost:9100":(c.bridgeUrl||"http://localhost:9100");
  $("printer-transport").value=legacySerial?"cleanter":(t.transport||"cups");
  $("printer-name").value=t.printerName||"";
  $("printer-host").value=t.host||"";
  $("printer-port").value=t.port||9100;
  $("printer-serial").value=t.serialPath||"";
  $("printer-baud").value=t.baudRate||9600;
  $("printer-paper").value=t.paper||"58";
  $("printer-token").value=c.token||"";
  updateTransport();
}
function updateTransport(){
  const t=$("printer-transport").value;
  $("printer-name-wrap").hidden=!["winspool","cups"].includes(t);
  $("printer-host-wrap").hidden=t!=="network";
  $("printer-port-wrap").hidden=t!=="network";
  $("printer-serial-wrap").hidden=t!=="serial";
  $("printer-baud-wrap").hidden=t!=="serial";
  const url=$("printer-bridge-url");
  if(t==="cleanter"){
    if(url && (!url.value || /:18181\/?$/i.test(url.value))) url.value="http://localhost:9100";
    $("printer-mode").value="bridge";
  }
}
$("printer-transport").addEventListener("change",updateTransport);

window.generateRandomCode=function(){
  const d=new Date();
  $("manualCode").value=`OPS-${String(d.getFullYear()).slice(-2)}${String(d.getMonth()+1).padStart(2,"0")}${String(d.getDate()).padStart(2,"0")}-${Math.floor(Math.random()*900+100)}`;
  generateQR();
};
function escapeLabelText(value){
  return String(value).replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
}
window.generateQR=async function(){
  const code=$("manualCode").value.trim();
  if(!code) throw new Error("Masukkan atau buat serial/ID terlebih dahulu.");
  const customer=$("customer").value.trim();
  const unit=$("unit").value.trim();
  await Promise.all([
    new Promise((resolve,reject)=>QRCode.toCanvas($("qrcode"),code,{width:220,margin:1},err=>err?reject(err):resolve())),
    new Promise((resolve,reject)=>QRCode.toCanvas($("printQR"),code,{width:160,margin:2},err=>err?reject(err):resolve()))
  ]);
  $("previewCode").textContent=code;
  $("previewInfo").textContent=`${customer||"-"} · ${unit||"-"}`;
  $("printCode").innerHTML=`<span class="print-key">Serial:</span> ${escapeLabelText(code)}`;
  $("printCustomer").innerHTML=`<span class="print-key">Pelanggan:</span> ${escapeLabelText(customer||"-")}`;
  $("printUnit").innerHTML=`<span class="print-key">Merk/Tipe:</span> ${escapeLabelText(unit||"-")}`;
  return code;
};
window.printBrowser=async function(){
  try{
    await generateQR();
    // Jalur browser tetap menggunakan dialog cetak Chrome; thermal bridge terpisah.
    setTimeout(()=>window.print(),150);
  }catch(e){ alert(e.message||"QR belum siap dicetak."); }
};
window.printThermal=async function(){
  try{
    await generateQR();
    const cfg=savePrinterConfig(getConfigFromForm());
    if(cfg.thermal?.transport!=="cleanter") throw new Error("Pilih transport Cleanter Bluetooth (Android) pada pengaturan printer thermal.");
    const code=$("manualCode").value.trim();
    await printThermal({
      nomor:code, pelanggan:$("customer").value.trim(), merk:$("unit").value.trim(), serial:code
    },"label",{...cfg,mode:"bridge",bridgeUrl:cfg.bridgeUrl||"http://localhost:9100"});
    alert("Label QR dikirim ke printer RPP02.");
  }catch(e){ alert(e.message||"Cetak QR Bluetooth gagal."); }
};
window.savePrinterSettings=async function(){
  const cfg=savePrinterConfig(getConfigFromForm());
  const btn=document.querySelector('[onclick="savePrinterSettings()"]');
  const oldText=btn?.textContent;
  if(btn){btn.disabled=true;btn.textContent="Menguji koneksi…";}
  try{
    if(cfg.thermal?.transport!=="cleanter") throw new Error("Pilih Cleanter Bluetooth (Android) untuk tes dari HP.");
    const health=await testPrinterBridge({...cfg,bridgeUrl:cfg.bridgeUrl||"http://localhost:9100"});
    if(!health.ok) throw new Error("Cleanter tidak merespons status OK.");
    await printTestReceipt({...cfg,mode:"bridge",bridgeUrl:cfg.bridgeUrl||"http://localhost:9100"});
    alert("Cleanter terhubung. Label tes dikirim ke RPP02.");
  }catch(e){ alert(e.message||"Bridge belum tersambung."); }
  finally{if(btn){btn.disabled=false;btn.textContent=oldText||"Simpan & Tes";}}
};

window.toggleScanner=async function(){
  if(scannerRunning) return stopScanner();
  if(!window.Html5Qrcode) return alert("Scanner library belum tersedia.");
  const reader=$("reader"); reader.innerHTML="";
  html5QrCode=new Html5Qrcode("reader");
  try{
    scannerRunning=true; $("scanToggleBtn").textContent="Hentikan Scan"; $("scanStatus").textContent="Kamera aktif. Arahkan ke barcode / QR...";
    let camera={facingMode:"environment"};
    try{
      const cams=await Html5Qrcode.getCameras();
      if(cams.length) camera=(cams.find(x=>/back|rear|environment|belakang/i.test(x.label))||cams[0]).id;
    }catch{}
    await html5QrCode.start(camera,{fps:15,qrbox:{width:Math.min(260,window.innerWidth-70),height:140},aspectRatio:1.777},
      async text=>{
        $("scanResult").textContent=text.trim();
        $("manualCode").value=text.trim();
        if(navigator.vibrate) navigator.vibrate(100);
        await stopScanner();
      },()=>{});
  }catch(e){
    console.error(e); await stopScanner(); alert("Kamera tidak dapat dibuka. Periksa izin kamera.");
  }
};
async function stopScanner(){
  if(html5QrCode){try{await html5QrCode.stop()}catch{} try{await html5QrCode.clear()}catch{}}
  html5QrCode=null; scannerRunning=false; $("scanToggleBtn").textContent="Mulai Scan"; $("scanStatus").textContent="Kamera belum aktif."; $("reader").innerHTML="";
}
window.fillManualCode=function(){
  const v=$("scanResult").textContent;
  if(v && v!=="Belum ada hasil") $("manualCode").value=v;
};
fillPrinter(); generateRandomCode();
