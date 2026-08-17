// Router, wiring, and startup.

import { qs, qsa, toast } from './dom.js';
import { store } from './store.js';
import { applyTheme } from './theme.js';
import { loadPlan, evaluateAchievements } from './model.js';
import * as sync from './sync.js';

import * as week from './views/week.js';
import * as fullplan from './views/fullplan.js';
import * as vertical from './views/vertical.js';
import * as races from './views/races.js';
import * as reference from './views/reference.js';
import * as settings from './views/settings.js';

const VIEWS = { week, plan: fullplan, vertical, races, reference, settings };
const REMOTE_REASONS = new Set(['remote', 'import']);

let current = 'week';
const view = qs('#view');

function parseHash() {
  const raw = (location.hash || '#/week').replace(/^#\/?/, '');
  const [name, param] = raw.split('/');
  return { name: VIEWS[name] ? name : 'week', param };
}

function route() {
  const { name, param } = parseHash();
  current = name;

  if (name === 'week' && param) {
    const n = Number(param);
    if (!isNaN(n)) week.setWeek(n);
  }

  qsa('#tabbar a').forEach(a => {
    if (a.dataset.tab === name) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });

  // Each view gets a fresh container of its own. Views attach delegated
  // listeners to it, so throwing the element away throws the listeners away
  // with it — reusing one shared node stacks a second set on every visit.
  const mod = VIEWS[name];
  const host = document.createElement('div');
  view.replaceChildren(host);
  mod.render(host, { id: param });

  const title = qs('#appbar-title');
  title.textContent = name === 'week' ? 'The Lantau Project' : mod.title();
  window.scrollTo({ top: name === 'week' ? window.scrollY : 0 });
}

let evaluating = false;

function onLogChange(state, reason) {
  if (!evaluating) {
    evaluating = true;
    try { evaluateAchievements(state); } finally { evaluating = false; }
  }
  if (reason !== 'remote') sync.schedulePush();

  const mod = VIEWS[current];
  if (mod && mod.onLog) mod.onLog(REMOTE_REASONS.has(reason) ? 'replace' : reason);
}

function paintSyncChip(status) {
  const chip = qs('#sync-chip');
  if (!chip) return;
  chip.querySelector('.sync-dot').dataset.status = status.state;
  chip.querySelector('.sync-label').textContent =
    status.state === 'off' ? 'Local' :
    status.state === 'synced' ? 'Synced' :
    status.state === 'pending' ? 'Saving' :
    status.state === 'offline' ? 'Offline' : 'Sync error';
  chip.title = status.message;
}

async function start() {
  applyTheme(store.setting('theme'));
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => applyTheme(store.setting('theme')));

  try {
    await loadPlan();
  } catch (err) {
    view.innerHTML = `<div class="alert"><b>Could not load the plan.</b> ${err.message}</div>`;
    return;
  }

  evaluateAchievements();
  store.subscribe(onLogChange);
  sync.onStatus(paintSyncChip);

  qs('#sync-chip').addEventListener('click', () => { location.hash = '#/settings'; });

  window.addEventListener('hashchange', route);
  if (!location.hash) location.replace('#/week');
  route();

  if (store.error) toast('Saving to this browser failed — export your log');

  sync.init();

  // Registered directly rather than on window 'load' — plan.json is awaited
  // above, so that event has usually fired by the time we get here.
  if ('serviceWorker' in navigator) {
    // updateViaCache: 'none' — sw.js itself must never come from the HTTP
    // cache, or a new version can go unnoticed for as long as it stays fresh.
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' })
      .catch(err => console.warn('SW registration failed', err));
  }

  // Flush any pending sync before the app goes away.
  window.addEventListener('pagehide', () => { if (sync.isConfigured()) sync.flushNow(); });
}

start();
