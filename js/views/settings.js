// Settings — theme, export/import, and the optional GitHub sync.

import { esc, on, qs, toast } from '../dom.js';
import { store } from '../store.js';
import { plan, totals } from '../model.js';
import { todayISO } from '../dates.js';
import * as sync from '../sync.js';
import { applyTheme } from '../theme.js';

let root = null;

export function render(container) {
  root = container;
  const theme = store.setting('theme') || 'auto';
  const cfg = sync.getConfig();
  const hasToken = !!sync.getToken();
  const t = totals();
  const st = sync.getStatus();

  root.innerHTML = `
<h2 style="font-size:20px;margin-bottom:12px">Settings</h2>

${store.error ? `<div class="alert"><b>Storage problem.</b> ${esc(store.error)}</div>` : ''}

<div class="card">
  <div class="setting-row">
    <h3>Appearance</h3>
    <p>Dark by default in the dark. Override it here if you want.</p>
    <div class="seg" role="group" aria-label="Theme">
      ${['auto', 'light', 'dark'].map(v =>
        `<button type="button" data-theme-btn="${v}" aria-pressed="${theme === v}">${v[0].toUpperCase() + v.slice(1)}</button>`).join('')}
    </div>
  </div>
</div>

<div class="card">
  <div class="setting-row">
    <h3>Your log</h3>
    <p>${t.sessions} sessions ticked · ${t.gain.toLocaleString()} m climbed${store.state.lastExportedAt ? ` · last export ${esc(store.state.lastExportedAt.slice(0, 10))}` : ''}</p>
    <div class="btn-row">
      <button class="btn" type="button" data-act="export">Export JSON</button>
      <button class="btn" type="button" data-act="import">Import JSON</button>
    </div>
    <input type="file" accept="application/json,.json" id="import-file" hidden>
  </div>
</div>

<div class="card">
  <div class="setting-row">
    <h3>Sync between devices <span class="badge" style="vertical-align:middle">${esc(st.message)}</span></h3>
    <p>
      Optional. Point this at a <b>private</b> repo holding a single <code>log.json</code>, and paste a
      fine-grained token scoped to that repo alone with <b>Contents: Read and write</b>. Nothing else works
      differently without it — the app is fully usable local-only.
    </p>
    <div class="field" style="margin-bottom:10px">
      <label for="s-owner">GitHub owner</label>
      <input id="s-owner" value="${esc(cfg.owner)}" placeholder="chan31-github" autocapitalize="off" autocorrect="off" spellcheck="false">
    </div>
    <div class="field" style="margin-bottom:10px">
      <label for="s-repo">Private log repo</label>
      <input id="s-repo" value="${esc(cfg.repo)}" placeholder="20k-climb-log" autocapitalize="off" autocorrect="off" spellcheck="false">
    </div>
    <div class="field" style="margin-bottom:10px">
      <label for="s-path">File path</label>
      <input id="s-path" value="${esc(cfg.path)}" placeholder="log.json" autocapitalize="off" autocorrect="off" spellcheck="false">
    </div>
    <div class="field" style="margin-bottom:12px">
      <label for="s-token">Token ${hasToken ? '(stored on this device)' : ''}</label>
      <input id="s-token" type="password" value="" placeholder="${hasToken ? '•••••••• leave blank to keep' : 'github_pat_…'}"
             autocapitalize="off" autocorrect="off" spellcheck="false">
    </div>
    <div class="btn-row">
      <button class="btn primary" type="button" data-act="save-sync">Save &amp; sync now</button>
      <button class="btn" type="button" data-act="sync-now" ${sync.isConfigured() ? '' : 'disabled'}>Sync now</button>
    </div>
    ${hasToken ? `<div class="btn-row" style="margin-top:8px">
      <button class="btn danger block" type="button" data-act="forget-token">Remove token from this device</button>
    </div>` : ''}
  </div>
</div>

<div class="card">
  <div class="setting-row">
    <h3>Reset</h3>
    <p>Clears every tick, metric and achievement on this device. Export first.</p>
    <button class="btn danger block" type="button" data-act="reset">Clear my log</button>
  </div>
  <div class="setting-row">
    <h3>Offline cache</h3>
    <p>The app works with no signal. Force a refresh if you have edited <code>plan.json</code> and want it now.</p>
    <button class="btn block" type="button" data-act="refresh-cache">Update from GitHub</button>
  </div>
</div>

<p class="small muted center">
  ${esc(plan.meta.title)} · ${esc(plan.meta.startDate)} → ${esc(plan.meta.endDate)}<br>
  Plan content lives in <code>data/plan.json</code>.
</p>`;

  if (!root.dataset.wiredSettings) { wire(); root.dataset.wiredSettings = '1'; }
}

function wire() {
  on(root, 'click', '[data-theme-btn]', (ev, btn) => {
    const v = btn.dataset.themeBtn;
    store.setSetting('theme', v);
    applyTheme(v);
    render(root);
  });

  on(root, 'click', '[data-act="export"]', () => {
    const data = store.toJSON();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `trail-log-${todayISO()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    store.markExported();
    toast('Exported');
  });

  on(root, 'click', '[data-act="import"]', () => qs('#import-file', root).click());

  root.addEventListener('change', async ev => {
    const input = ev.target.closest('#import-file');
    if (!input || !input.files || !input.files[0]) return;
    try {
      const text = await input.files[0].text();
      const data = JSON.parse(text);
      if (!data || typeof data !== 'object' || !data.entries) throw new Error('That file has no entries.');
      if (!confirm('Replace the log on this device with the imported file?')) return;
      store.replace(data, 'import');
      toast('Imported');
      render(root);
    } catch (err) {
      alert('Could not import: ' + (err.message || err));
    } finally {
      input.value = '';
    }
  });

  on(root, 'click', '[data-act="save-sync"]', async () => {
    sync.setConfig({
      owner: qs('#s-owner', root).value.trim(),
      repo: qs('#s-repo', root).value.trim(),
      path: qs('#s-path', root).value.trim() || 'log.json',
      branch: ''
    });
    const token = qs('#s-token', root).value.trim();
    if (token) sync.setToken(token);
    render(root);
    if (sync.isConfigured()) { await sync.pull(); render(root); }
    else toast('Fill in owner, repo and token');
  });

  on(root, 'click', '[data-act="sync-now"]', async () => { await sync.pull(); render(root); });

  on(root, 'click', '[data-act="forget-token"]', () => {
    if (!confirm('Remove the sync token from this device? Your log stays here.')) return;
    sync.setToken('');
    toast('Token removed');
    render(root);
  });

  on(root, 'click', '[data-act="reset"]', () => {
    if (!confirm('Clear every logged session on this device?')) return;
    store.replace({}, 'import');
    toast('Log cleared');
    render(root);
  });

  on(root, 'click', '[data-act="refresh-cache"]', async () => {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(r => r.unregister()));
    }
    if (window.caches) {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
    }
    location.reload();
  });
}

export function onLog(reason) { if (root && root.isConnected && reason === 'replace') render(root); }
export function title() { return 'Settings'; }
