// Minimal DOM helpers.

export function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export const qs = (sel, root = document) => root.querySelector(sel);
export const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/** Delegated listener. */
export function on(root, type, sel, handler) {
  root.addEventListener(type, ev => {
    const target = ev.target.closest(sel);
    if (target && root.contains(target)) handler(ev, target);
  });
}

let toastTimer;
export function toast(message) {
  const el = qs('#toast');
  if (!el) return;
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}
