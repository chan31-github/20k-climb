// Full Plan — all 16 weeks under their phase headings, races inline.

import { esc, on, qs } from '../dom.js';
import { store } from '../store.js';
import {
  plan, getWeek, daysOf, weekStats, currentWeekNumber, TYPE_ICON
} from '../model.js';
import { formatRange, formatFull, todayISO } from '../dates.js';

const expanded = new Set();
let root = null;
let initialised = false;

function weekCard(week, current) {
  const stats = weekStats(week);
  const isOpen = expanded.has(week.number);
  const past = week.endDate < todayISO();
  const tags = [];
  if (week.isRecovery) tags.push('<span class="badge recovery">Recovery</span>');
  if (week.isPeak) tags.push('<span class="badge peak">Peak</span>');

  return `
<div class="card wk-card${week.number === current ? ' current' : ''}" data-week="${week.number}">
  <button class="wk-summary" type="button" data-act="toggle" aria-expanded="${isOpen}">
    <span class="wk-n">W${week.number}</span>
    <span class="wk-info">
      <span class="wk-title">${formatRange(week.startDate, week.endDate)}${week.number === current ? ' · <b>This week</b>' : ''}</span>
      <span class="wk-sub">${stats.total} sessions${tags.length ? ' · ' + tags.join(' ') : ''}</span>
    </span>
    <span class="wk-ratio">${past || stats.done ? `${stats.done}/${stats.total}` : ''}</span>
    <span class="chev" aria-hidden="true">›</span>
  </button>
  ${isOpen ? weekBody(week) : ''}
</div>`;
}

function weekBody(week) {
  return `
<div class="wk-body">
  <ul>
    ${daysOf(week).flatMap(d => d.sessions.map(s => {
      const e = store.entry(s.id) || {};
      return `<li class="${e.completed ? 'is-done' : ''}">
        <span class="li-day">${d.day}</span>
        <span aria-hidden="true">${TYPE_ICON[s.type] || '•'}</span>
        <span class="li-title">${esc(s.title)}</span>
      </li>`;
    })).join('')}
  </ul>
  <p class="small muted" style="margin:10px 0 0">
    <a href="#/week/${week.number}">Open week ${week.number} →</a>
  </p>
</div>`;
}

function raceStrip(race) {
  return `
<a class="race-strip" href="#/races/${race.id}">
  <span class="medal" aria-hidden="true">${race.medal}</span>
  <span class="grow">
    <span class="r-name">${esc(race.name)}</span>
    <span class="r-sub">${formatFull(race.date)} · ${esc(race.distanceKm)}km · ${Number(race.gainM).toLocaleString()}m · ${esc(race.role)}</span>
  </span>
  <span class="chev" aria-hidden="true">›</span>
</a>`;
}

export function render(container) {
  root = container;
  const current = currentWeekNumber();
  if (!initialised) { expanded.add(current); initialised = true; }

  root.innerHTML = plan.phases.map(phase => `
<section>
  <div class="phase-head">
    <h2 class="phase-name">${esc(phase.name)}</h2>
    <div class="eyebrow">Weeks ${phase.weeks[0]}–${phase.weeks[phase.weeks.length - 1]} · ${esc(phase.dates)}</div>
    <div class="phase-blurb">${esc(phase.blurb)}</div>
  </div>
  ${phase.weeks.map(n => {
    const week = getWeek(n);
    if (!week) return '';
    const race = plan.races.find(r => r.date >= week.startDate && r.date <= week.endDate);
    return weekCard(week, current) + (race ? raceStrip(race) : '');
  }).join('')}
</section>`).join('');

  if (!root.dataset.wiredPlan) {
    on(root, 'click', '[data-act="toggle"]', (ev, btn) => {
      const card = btn.closest('.wk-card');
      const n = Number(card.dataset.week);
      if (expanded.has(n)) expanded.delete(n); else expanded.add(n);
      const body = card.querySelector('.wk-body');
      btn.setAttribute('aria-expanded', String(expanded.has(n)));
      if (body) body.remove();
      else card.insertAdjacentHTML('beforeend', weekBody(getWeek(n)));
    });
    root.dataset.wiredPlan = '1';
  }

  const cur = qs(`.wk-card[data-week="${current}"]`, root);
  if (cur) requestAnimationFrame(() => cur.scrollIntoView({ block: 'center', behavior: 'auto' }));
}

export function onLog(reason) {
  if (root && root.isConnected && reason === 'replace') render(root);
}

export function title() { return 'Full Plan'; }
