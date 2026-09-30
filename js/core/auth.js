import { auth } from "./firebase.js";

export function watchAuth({ onUser, onSignedOut }) {
  return auth.onAuthStateChanged(user => user ? onUser?.(user) : onSignedOut?.());
}

export async function signOut() {
  await auth.signOut();
}

export function startIdleTimeout(minutes = 30, onTimeout) {
  let idle = 0;
  const reset = () => { idle = 0; };
  ["mousemove", "click", "keypress", "touchstart"].forEach(e => window.addEventListener(e, reset, { passive: true }));
  const timer = setInterval(async () => {
    if (!auth.currentUser) return;
    idle += 1;
    document.dispatchEvent(new CustomEvent("oneprint:idle", { detail: idle }));
    if (idle >= minutes) {
      clearInterval(timer);
      await auth.signOut();
      onTimeout?.();
    }
  }, 60000);
  return () => clearInterval(timer);
}
