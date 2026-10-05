import http from "node:http";
import { createReceipt, print } from "@maxxuxx/node-printer";

const HOST = process.env.HOST || "127.0.0.1";
const PORT = Number(process.env.PORT || 18181);
const TOKEN = process.env.ONEPRINT_BRIDGE_TOKEN || "";

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,X-OnePrint-Token");
}

function json(res, status, body) {
  cors(res);
  res.writeHead(status, {"Content-Type":"application/json; charset=utf-8"});
  res.end(JSON.stringify(body));
}

function authorized(req) {
  return !TOKEN || req.headers["x-oneprint-token"] === TOKEN;
}

async function readJson(req) {
  let body = "";
  for await (const chunk of req) body += chunk;
  if (Buffer.byteLength(body) > 512 * 1024) throw new Error("Payload terlalu besar");
  return body ? JSON.parse(body) : {};
}

function targetFromBody(target) {
  if (!target || !target.type) throw new Error("Target printer belum dipilih");
  if (target.type === "network") {
    if (!target.host) throw new Error("IP printer belum diisi");
    return { type:"network", host:String(target.host), port:Number(target.port || 9100) };
  }
  if (target.type === "cups") {
    if (!target.printerName) throw new Error("Nama antrian printer CUPS belum diisi");
    return { type:"cups", printerName:String(target.printerName), documentName:String(target.documentName || "OnePrint POS") };
  }
  if (target.type === "serial") {
    if (!target.path) throw new Error("Port serial/Bluetooth belum diisi");
    return { type:"serial", path:String(target.path), baudRate:Number(target.baudRate || 9600) };
  }
  if (target.type === "winspool") {
    if (!target.printerName) throw new Error("Nama printer Windows belum diisi");
    return { type:"winspool", printerName:String(target.printerName), documentName:String(target.documentName || "OnePrint POS") };
  }
  throw new Error(`Transport tidak didukung: ${target.type}`);
}

function buildReceipt(data = {}, tipe = "nota", paper = "58") {
  const columns = String(paper) === "80" ? 42 : 32;
  const items = [
    ...(Array.isArray(data.jasa) ? data.jasa.map(x => ({...x, category:"JASA"})) : []),
    ...(Array.isArray(data.sparepart) ? data.sparepart.map(x => ({...x, category:"BARANG"})) : [])
  ];

  const receipt = createReceipt({ columns, encoding:"cp1252" })
    .initialize()
    .align("center")
    .bold()
    .text("ONEPRINT SERVICE")
    .bold(false)
    .text("Printer • Laptop • IT Support")
    .divider()
    .align("left")
    .text(tipe === "nota" ? "INVOICE" : "TANDA TERIMA")
    .text(`# ${tipe === "nota" ? "INV" : "TT"}-${data.nomor || "-"}`)
    .text(`Tanggal : ${data.tanggal ? new Date(data.tanggal).toLocaleDateString("id-ID") : new Date().toLocaleDateString("id-ID")}`)
    .text(`Pelanggan : ${data.pelanggan || "-"}`)
    .text(`Unit : ${data.merk || "-"}`)
    .text(`Serial/ID : ${data.serial || data.printerId || "-"}`)
    .divider();

  if (tipe === "nota") {
    for (const item of items) {
      const qty = Math.max(1, Number(item.qty) || 1);
      const price = Number(item.harga) || 0;
      receipt.row([
        {text:`${item.nama || "-"}`.slice(0, columns - 12), width:columns - 12},
        {text:`${qty}x`, width:5, align:"right"},
        {text:`${price * qty}`.slice(-11), width:11, align:"right"}
      ]);
    }
    receipt.divider()
      .bold()
      .row([
        {text:"TOTAL", width:columns - 12},
        {text:`Rp ${Number(data.total || 0).toLocaleString("id-ID")}`, width:12, align:"right"}
      ])
      .bold(false);
  } else {
    receipt.text(`Keluhan : ${data.keluhan || "-"}`);
    receipt.text("Tracking:");
    receipt.text(`oneprintservice.web.id/tracking.html?tt=${data.nomor || ""}`);
    try {
      receipt.qr(`https://oneprintservice.web.id/tracking.html?tt=${encodeURIComponent(data.nomor || "")}`);
    } catch {}
  }

  return receipt
    .align("center")
    .feed(3)
    .cut()
    .encode();
}

async function handle(req, res) {
  cors(res);
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    return res.end();
  }
  if (!authorized(req)) return json(res, 401, {ok:false,message:"Bridge token salah"});

  const url = new URL(req.url, `http://${HOST}:${PORT}`);
  if (req.method === "GET" && url.pathname === "/health") {
    return json(res, 200, {ok:true,service:"oneprint-printer-bridge",version:"1.2.0"});
  }
  if (req.method !== "POST") return json(res, 404, {ok:false,message:"Not found"});

  try {
    const body = await readJson(req);
    const target = targetFromBody(body.target);

    if (url.pathname === "/print-test") {
      const receipt = createReceipt({columns:String(body.paper)==="80"?42:32,encoding:"cp1252"})
        .initialize().align("center").bold().text("ONEPRINT POS").bold(false)
        .text("PRINTER TEST OK").divider().text(new Date().toLocaleString("id-ID"))
        .feed(3).cut().encode();
      await print(target, receipt);
      return json(res,200,{ok:true,message:"Test print terkirim"});
    }

    if (url.pathname === "/print") {
      const receipt = buildReceipt(body.data || {}, body.tipe || "nota", body.paper || "58");
      await print(target, receipt);
      return json(res,200,{ok:true,message:"Cetak thermal terkirim"});
    }

    return json(res,404,{ok:false,message:"Endpoint tidak ditemukan"});
  } catch (error) {
    console.error(error);
    return json(res,500,{ok:false,message:error?.message || "Gagal mencetak"});
  }
}

http.createServer((req,res)=>handle(req,res).catch(e=>json(res,500,{ok:false,message:e.message})))
  .listen(PORT,HOST,()=>console.log(`OnePrint Printer Bridge: http://${HOST}:${PORT}`));
