import { getService } from "./features/services.js";
const $=s=>document.querySelector(s);
const key=new URLSearchParams(location.search).get("tt");
$("#search").value=key||"";
async function run(){
 const value=$("#search").value.trim(); if(!value)return;
 $("#result").innerHTML="<div class='loading'>Mencari...</div>";
 const d=await getService(value);
 if(!d){$("#result").innerHTML="<div class='empty'>Nomor servis tidak ditemukan.</div>";return}
 $("#result").innerHTML=`<div class="track-card"><div class="track-head"><div><small>Nomor servis</small><h2>TT-${d.nomor||value}</h2></div><span class="status">${d.status||"-"}</span></div>
 <div class="track-grid"><div><small>Pelanggan</small><b>${d.pelanggan||"-"}</b></div><div><small>Perangkat</small><b>${d.merk||"-"}</b></div><div><small>Teknisi</small><b>${d.teknisi||"-"}</b></div><div><small>Total</small><b>Rp ${Number(d.total||0).toLocaleString("id-ID")}</b></div></div>
 <div class="track-note"><small>Keterangan</small><p>${d.keterangan||"Belum ada keterangan tambahan."}</p></div></div>`;
}
$("#form").addEventListener("submit",e=>{e.preventDefault();run()}); if(key)run();
