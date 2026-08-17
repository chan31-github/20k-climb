// Optional sync: a private GitHub repo holding one log.json, reached through
// the REST API. Local-first — the UI never waits on any of this, and the app
// is fully usable with no token at all.

import { store, mergeLogs } from './store.js';

const TOKEN_KEY = 'lantau-token-v1';
const CFG_KEY = 'lantau-sync-v1';
const DIRTY_KEY = 'lantau-dirty-v1';
const PUSH_DEBOUNCE_MS = 3000;

let status = { state: 'off', message: 'Local only' };
const watchers = new Set();
let pushTimer = null;
let inFlight = false;
let remoteSha = null;

function readJSON(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch { return fallback; }
}

export function getConfig() {
  return Object.assign({ owner: '', repo: '', path: 'log.json', branch: '' }, readJSON(CFG_KEY, {}));
}

export function setConfig(cfg) {
  try { localStorage.setItem(CFG_KEY, JSON.stringify(cfg)); } catch { /* surfaced by the store */ }
  remoteSha = null;
}

export function getToken() {
  try { return localStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; }
}

export function setToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch { /* ignore */ }
  remoteSha = null;
}

export function isConfigured() {
  const c = getConfig();
  return !!(getToken() && c.owner && c.repo && c.path);
}

export function onStatus(fn) { watchers.add(fn); fn(status); return () => watchers.delete(fn); }

function setStatus(state, message) {
  status = { state, message };
  for (const fn of watchers) { try { fn(status); } catch (err) { console.error(err); } }
}

export function getStatus() { return status; }

function dirty() { return localStorage.getItem(DIRTY_KEY) === '1'; }
function setDirty(v) {
  try { v ? localStorage.setItem(DIRTY_KEY, '1') : localStorage.removeItem(DIRTY_KEY); } catch { /* ignore */ }
}

// --- base64 that survives non-ASCII notes ------------------------------------

function encode(text) {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

function decode(b64) {
  const bin = atob(String(b64).replace(/\s/g, ''));
  const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

// --- API ---------------------------------------------------------------------

function apiUrl() {
  const c = getConfig();
  const base = `https://api.github.com/repos/${encodeURIComponent(c.owner)}/${encodeURIComponent(c.repo)}/contents/${c.path.split('/').map(encodeURIComponent).join('/')}`;
  return c.branch ? `${base}?ref=${encodeURIComponent(c.branch)}` : base;
}

function headers() {
  return {
    'Authorization': `Bearer ${getToken()}`,
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28'
  };
}

async function fetchRemote() {
  const res = await fetch(apiUrl(), { headers: headers(), cache: 'no-store' });
  if (res.status === 404) return { log: null, sha: null };
  if (!res.ok) throw new Error(errorText(res.status));
  const data = await res.json();
  remoteSha = data.sha;
  let log = null;
  try { log = JSON.parse(decode(data.content)); } catch { log = null; }
  return { log, sha: data.sha };
}

function errorText(code) {
  if (code === 401) return 'Token rejected (401). Check it has not expired.';
  if (code === 403) return 'Forbidden (403). The token needs Contents: Read and write on that repo.';
  if (code === 404) return 'Repo or file not found (404). Check owner, repo and path.';
  if (code === 409) return 'Conflict (409).';
  return `GitHub API error ${code}.`;
}

async function putRemote(log, sha) {
  const c = getConfig();
  const body = {
    message: `log: ${new Date().toISOString()}`,
    content: encode(JSON.stringify(log, null, 2) + '\n')
  };
  if (sha) body.sha = sha;
  if (c.branch) body.branch = c.branch;

  const url = `https://api.github.com/repos/${encodeURIComponent(c.owner)}/${encodeURIComponent(c.repo)}/contents/${c.path.split('/').map(encodeURIComponent).join('/')}`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: Object.assign({ 'Content-Type': 'application/json' }, headers()),
    body: JSON.stringify(body)
  });
  if (res.status === 409 || res.status === 422) return { conflict: true };
  if (!res.ok) throw new Error(errorText(res.status));
  const data = await res.json();
  remoteSha = data.content && data.content.sha;
  return { conflict: false };
}

// --- orchestration -----------------------------------------------------------

/** Fetch remote, merge into local, and push if local has anything remote lacks. */
export async function pull({ quiet = false } = {}) {
  if (!isConfigured()) { setStatus('off', 'Local only'); return; }
  if (!navigator.onLine) { setStatus('offline', 'Offline'); return; }
  if (inFlight) return;
  inFlight = true;
  if (!quiet) setStatus('pending', 'Syncing…');
  try {
    const { log, sha } = await fetchRemote();
    if (log) {
      const merged = mergeLogs(store.toJSON(), log);
      const localChanged = JSON.stringify(merged) !== JSON.stringify(store.toJSON());
      const remoteStale = JSON.stringify(merged) !== JSON.stringify(log);
      if (localChanged) store.replace(merged, 'remote');
      if (remoteStale || dirty()) { inFlight = false; await push(); return; }
      setDirty(false);
      setStatus('synced', 'Synced');
    } else {
      inFlight = false;
      await push(sha);
      return;
    }
  } catch (err) {
    setStatus('error', err.message || 'Sync failed');
  } finally {
    inFlight = false;
  }
}

export async function push(sha = remoteSha, attempt = 0) {
  if (!isConfigured()) { setStatus('off', 'Local only'); return; }
  if (!navigator.onLine) { setDirty(true); setStatus('offline', 'Offline — will sync later'); return; }
  if (inFlight) { setDirty(true); return; }
  inFlight = true;
  setStatus('pending', 'Saving…');
  try {
    if (sha === null && attempt === 0) {
      const remote = await fetchRemote();
      sha = remote.sha;
      if (remote.log) store.replace(mergeLogs(store.toJSON(), remote.log), 'remote');
    }
    const { conflict } = await putRemote(store.toJSON(), sha);
    if (conflict) {
      if (attempt >= 2) { setDirty(true); setStatus('error', 'Conflict — could not merge after 3 tries'); return; }
      const remote = await fetchRemote();
      store.replace(mergeLogs(store.toJSON(), remote.log || {}), 'remote');
      inFlight = false;
      return push(remote.sha, attempt + 1);
    }
    setDirty(false);
    setStatus('synced', 'Synced');
  } catch (err) {
    setDirty(true);
    setStatus('error', err.message || 'Sync failed');
  } finally {
    inFlight = false;
  }
}

/** Called on every local write. Coalesces rapid edits into one commit. */
export function schedulePush() {
  if (!isConfigured()) return;
  setDirty(true);
  if (navigator.onLine) setStatus('pending', 'Pending…');
  else setStatus('offline', 'Offline — queued');
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => push(), PUSH_DEBOUNCE_MS);
}

export function init() {
  if (!isConfigured()) { setStatus('off', 'Local only'); return; }
  if (dirty()) setStatus('pending', 'Pending…');
  pull({ quiet: true });

  window.addEventListener('online', () => { if (isConfigured()) pull(); });
  window.addEventListener('offline', () => { if (isConfigured()) setStatus('offline', 'Offline'); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && isConfigured()) pull({ quiet: true });
  });
}

export function flushNow() {
  clearTimeout(pushTimer);
  return push();
}
