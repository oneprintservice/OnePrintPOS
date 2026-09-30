/* OnePrint V2 - Firebase boundary */
const firebaseConfig = {
  apiKey: "AIzaSyBcyS36JnJNGZPdSxd_g9UmCq4BJRiG2rA",
  authDomain: "oneprintservice-db.firebaseapp.com",
  databaseURL: "https://oneprintservice-db-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "oneprintservice-db",
  storageBucket: "oneprintservice-db.firebasestorage.app",
  messagingSenderId: "330853999249",
  appId: "1:330853999249:web:4503ed115d2694d9cb5530"
};

if (!window.firebase) throw new Error("Firebase SDK belum dimuat.");
if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);

export const auth = firebase.auth();
export const db = firebase.database();
export const safeKey = (value = "") => String(value).trim().replace(/[.#$[\]]/g, "_");
