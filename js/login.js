import { auth } from "./core/firebase.js";
const $=s=>document.querySelector(s);
$("#login").addEventListener("submit",async e=>{
  e.preventDefault(); $("#error").hidden=true;
  const username=$("#username").value.trim(), pass=$("#password").value;
  if(!username||!pass)return;
  const email=username.includes("@")?username:`${username}@oneprint.com`;
  try{await auth.signInWithEmailAndPassword(email,pass);location.href="app.html"}
  catch(err){console.error(err);$("#error").hidden=false;$("#error").textContent="Username atau password salah."}
});
auth.onAuthStateChanged(user=>{if(user)location.href="app.html"});
