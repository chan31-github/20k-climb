// Races — countdowns, pacing tables, and actual splits on the day.

import { esc, on } from '../dom.js';
import { md } from '../md.js';
import { store } from '../store.js';
import { plan } from '../model.js';
import { todayISO, formatFull, daysUntil, minutesBetweenTimes, signedMinutes } from '../dates.js';

const expanded = new Set();
let root = null;
let initialised = false;

function countdown(race, today) {
  const d = daysUntil(race.date);
  if (d > 1) return `<div class="countdown"><div class="cd-n">${d}</div><div class="cd-l">days</div></div>`;
  if (d === 1) return `<div class="countdown"><div class="cd-n">1</div><div class="cd-l">day</div></div>`;
  if (d === 0) return `<div class="countdown"><div class="cd-n">Today</div><div class="cd-l">${esc(race.startTime)}</div></div>`;
  const done = store.entry(race.sessionId);
  return `<div class="countdown"><div class="cd-n" style="font-size:20px">${done && done.completed ? 'Done' : '—'}</div><div class="cd-l">${-d} d ago</div></div>`;
}

function checkpointTable(race, editable) {
  const splits = store.raceSplits(race.id);
  const hasOfficial = race.checkpoints.some(c => c.officialCutoff);
  return `
<table class="cp-table">
  <thead>
    <tr>
      <th>Checkpoint</th>
      <th class="num">Km</th>
      ${hasOfficial ? '<th class="num">Cutoff</th>' : ''}
      <th class="num">Target</th>
      <th class="num">Actual</th>
    </tr>
  </thead>
  <tbody>
    ${race.checkpoints.map((c, i) => {
      const actual = splits[i] || '';
      const delta = actual ? minutesBetweenTimes(c.targetTime, actual) : null;
      const last = i === race.checkpoints.length - 1;
      return `<tr class="${last ? 'finish' : ''}">
        <td>${esc(c.name)}${c.cumGainM != null ? `<br><span class="small muted">${Number(c.cumGainM).toLocaleString()} m up</span>` : ''}</td>
        <td class="num">${c.cumKm}</td>
        ${hasOfficial ? `<td class="num muted">${esc(c.officialCutoff || '—')}</td>` : ''}
        <td class="num">${esc(c.targetTime)}${c.elapsed && c.elapsed !== '—' ? `<br><span class="small muted">${esc(c.elapsed)}</span>` : ''}</td>
        <td class="num">
          ${editable
            ? `<input type="time" step="60" data-split="${i}" value="${esc(actual)}" aria-label="Actual time at ${esc(c.name)}">`
            : (actual ? esc(actual) : '<span class="muted">—</span>')}
          ${delta != null ? `<br><span class="delta ${delta <= 0 ? 'up' : 'down'}">${signedMinutes(delta)}</span>` : ''}
        </td>
      </tr>`;
    }).join('')}
  </tbody>
</table>`;
}

function card(race, today) {
  const isOpen = expanded.has(race.id);
  const editable = today >= race.date;
  return `
<div class="card race-card" data-race="${esc(race.id)}">
  <button class="rc-head" type="button" data-act="toggle" aria-expanded="${isOpen}" style="width:100%;background:none;border:none;text-align:left">
    <span class="rc-medal" aria-hidden="true">${race.medal}</span>
    <span style="flex:1;min-width:0">
      <span class="rc-name">${esc(race.name)}</span>
      <span class="rc-when">${formatFull(race.date)} · ${esc(race.startTime)} · ${esc(race.role)}</span>
    </span>
    ${countdown(race, today)}
  </button>

  <div class="rc-stats">
    <div class="rc-stat"><b>${race.distanceKm}</b><span>km</span></div>
    <div class="rc-stat"><b>${Number(race.gainM).toLocaleString()}</b><span>m up</span></div>
    <div class="rc-stat"><b>${race.cutoffHours}h</b><span>Cutoff</span></div>
    <div class="rc-stat"><b>${esc(race.targetFinish)}</b><span>Target in</span></div>
  </div>

  ${isOpen ? `
  <div style="border-top:1px solid var(--line);padding:12px 14px">
    ${checkpointTable(race, editable)}
    ${!editable ? '<p class="small muted" style="margin:10px 0 0">Actual splits open up on race day.</p>' : ''}
  </div>
  <div style="border-top:1px solid var(--line);padding:12px 14px" class="prose">${md(race.notesMd)}</div>` : ''}
</div>`;
}

export function render(container, params) {
  root = container;
  const today = todayISO();
  if (!initialised) {
    const next = plan.races.find(r => r.date >= today) || plan.races[plan.races.length - 1];
    expanded.add(next.id);
    initialised = true;
  }
  if (params && params.id && plan.races.some(r => r.id === params.id)) expanded.add(params.id);

  root.innerHTML = `
<h2 style="font-size:20px;margin-bottom:4px">Three bosses</h2>
<p class="small muted" style="margin-top:0">Everything in this plan serves 14 November.</p>
${plan.races.map(r => card(r, today)).join('')}
<p class="small muted center">Countdowns are in Hong Kong time.</p>`;

  if (params && params.id) {
    const el = root.querySelector(`[data-race="${params.id}"]`);
    if (el) requestAnimationFrame(() => el.scrollIntoView({ block: 'start', behavior: 'auto' }));
  }

  if (!root.dataset.wiredRaces) {
    on(root, 'click', '[data-act="toggle"]', (ev, btn) => {
      const id = btn.closest('[data-race]').dataset.race;
      if (expanded.has(id)) expanded.delete(id); else expanded.add(id);
      render(root);
    });
    root.addEventListener('change', ev => {
      const input = ev.target.closest('[data-split]');
      if (!input) return;
      const id = input.closest('[data-race]').dataset.race;
      store.setRaceSplit(id, input.dataset.split, input.value);
      render(root);
    });
    root.dataset.wiredRaces = '1';
  }
}

export function onLog(reason) {
  if (root && root.isConnected && reason === 'replace') render(root);
}

export function title() { return 'Races'; }
