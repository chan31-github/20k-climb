// This Week — the default view. One tap to complete, everything else optional.

import { esc, on, qs, qsa } from '../dom.js';
import { md } from '../md.js';
import { store } from '../store.js';
import {
  plan, getWeek, getPhase, getRace, daysOf, weekStats,
  currentWeekNumber, firstWeek, lastWeek, TYPE_ICON, TYPE_LABEL
} from '../model.js';
import { todayISO, formatShort, formatRange, daysBetween, DAYS, DAY_LONG, hhmm } from '../dates.js';

const open = new Set();          // session ids with the log form expanded
let weekNumber = null;
let root = null;

export function setWeek(n) {
  weekNumber = Math.min(lastWeek(), Math.max(firstWeek(), n));
}

function sessionRow(session, dateISO, today) {
  const e = store.entry(session.id) || {};
  const done = !!e.completed;
  const isOpen = open.has(session.id);
  const bits = [];
  if (session.targetMinutes) bits.push(hhmm(session.targetMinutes));
  bits.push(TYPE_LABEL[session.type] || session.type);
  if (session.critical) bits.push('Key session');

  const logged = [];
  if (e.durationMin) logged.push(`${e.durationMin} min`);
  if (e.distanceKm) logged.push(`${e.distanceKm} km`);
  if (e.gainM) logged.push(`${Number(e.gainM).toLocaleString()} m`);
  if (e.rpe) logged.push(`RPE ${e.rpe}`);

  return `
<div class="session${done ? ' done' : ''}${isOpen ? ' open' : ''}" data-session="${esc(session.id)}" data-date="${dateISO}">
  <div class="session-main">
    <button class="tick" type="button" data-act="tick" aria-pressed="${done}"
            aria-label="Mark ${esc(session.title)} ${done ? 'not done' : 'done'}"><span class="box">✓</span></button>
    <button class="session-body" type="button" data-act="expand" aria-expanded="${isOpen}">
      <span class="type-ico" aria-hidden="true">${TYPE_ICON[session.type] || '•'}</span>
      <span class="session-text">
        <span class="session-title">${esc(session.title)}</span>
        <span class="session-meta">
          <span>${bits.join(' · ')}</span>
          ${logged.length ? `<span class="logged">${logged.join(' · ')}</span>` : ''}
        </span>
      </span>
      <span class="chev" aria-hidden="true">›</span>
    </button>
  </div>
  ${isOpen ? detailAndForm(session, e) : ''}
</div>`;
}

function detailAndForm(session, e) {
  const rpe = Number(e.rpe) || 0;
  return `
  ${session.detail ? `<div class="session-detail">${esc(session.detail)}</div>` : ''}
  <div class="logform">
    <div class="field">
      <label for="d-${session.id}">Duration (min)</label>
      <input id="d-${session.id}" data-f="durationMin" type="number" inputmode="numeric" min="0" step="1"
             placeholder="${session.targetMinutes || ''}" value="${esc(e.durationMin ?? '')}">
    </div>
    <div class="field">
      <label for="k-${session.id}">Distance (km)</label>
      <input id="k-${session.id}" data-f="distanceKm" type="number" inputmode="decimal" min="0" step="0.1" value="${esc(e.distanceKm ?? '')}">
    </div>
    <div class="field">
      <label for="g-${session.id}">Climb (m)</label>
      <input id="g-${session.id}" data-f="gainM" type="number" inputmode="numeric" min="0" step="10" value="${esc(e.gainM ?? '')}">
    </div>
    <div class="field">
      <label for="hr-${session.id}">Avg HR</label>
      <input id="hr-${session.id}" data-f="avgHr" type="number" inputmode="numeric" min="0" step="1" value="${esc(e.avgHr ?? '')}">
    </div>
    <div class="field full">
      <label>Effort (RPE)</label>
      <div class="rpe" role="group" aria-label="Rate of perceived exertion">
        ${Array.from({ length: 10 }, (_, i) => i + 1).map(n =>
          `<button type="button" data-act="rpe" data-v="${n}" aria-pressed="${rpe === n}">${n}</button>`).join('')}
      </div>
    </div>
    <div class="field full">
      <label for="n-${session.id}">Notes</label>
      <textarea id="n-${session.id}" data-f="notes" placeholder="What hurt, what the stomach did, what you'd change">${esc(e.notes ?? '')}</textarea>
    </div>
  </div>`;
}

function raceStrip(week) {
  const race = plan.races.find(r => r.date >= week.startDate && r.date <= week.endDate);
  if (!race) return '';
  return `
<a class="race-strip" href="#/races/${race.id}">
  <span class="medal" aria-hidden="true">${race.medal}</span>
  <span class="grow">
    <span class="r-name">${esc(race.name)}</span>
    <span class="r-sub">${esc(race.distanceKm)}km · ${Number(race.gainM).toLocaleString()}m · ${esc(race.startTime)} start</span>
  </span>
  <span class="chev" aria-hidden="true">›</span>
</a>`;
}

/** Today always gets a heading, even on a day with nothing scheduled. */
function withToday(week, today) {
  const days = daysOf(week);
  if (today < week.startDate || today > week.endDate) return days;
  if (days.some(d => d.date === today)) return days;
  const day = DAYS[daysBetween(week.startDate, today)];
  const at = days.findIndex(d => d.date > today);
  const entry = { day, date: today, sessions: [] };
  if (at === -1) days.push(entry); else days.splice(at, 0, entry);
  return days;
}

export function render(container) {
  root = container;
  if (weekNumber == null) setWeek(currentWeekNumber());
  const today = todayISO();
  const week = getWeek(weekNumber);
  const phase = getPhase(week.phaseId);
  const stats = weekStats(week);

  const badges = [];
  if (week.isRecovery) badges.push('<span class="badge recovery">Recovery week</span>');
  if (week.isPeak) badges.push('<span class="badge peak">Peak week</span>');
  if (plan.races.some(r => r.date >= week.startDate && r.date <= week.endDate)) badges.push('<span class="badge race">Race week</span>');
  if (stats.total && stats.done === stats.total) badges.push('<span class="badge done">All done</span>');

  root.innerHTML = `
<div class="week-head">
  <button class="nav-btn" type="button" data-act="prev" ${weekNumber === firstWeek() ? 'disabled' : ''} aria-label="Previous week">‹</button>
  <div class="grow">
    <h2 class="week-num">Week ${week.number}<span class="muted" style="font-weight:500;font-size:15px"> of ${lastWeek()}</span></h2>
    <div class="week-dates">${esc(phase ? phase.name : '')} · ${formatRange(week.startDate, week.endDate)}</div>
  </div>
  <button class="nav-btn" type="button" data-act="next" ${weekNumber === lastWeek() ? 'disabled' : ''} aria-label="Next week">›</button>
</div>

${badges.length ? `<div class="badges" style="margin-bottom:12px">${badges.join('')}</div>` : ''}

<div class="card card-pad">
  ${phase ? `<div class="phase-line">${esc(phase.blurb)}</div>` : ''}
  <div class="progress-row">
    <span class="progress-count" id="wk-count">${stats.done} of ${stats.total} sessions done</span>
    <span class="progress-vert" id="wk-vert">${stats.gain.toLocaleString()} m banked</span>
  </div>
  <div class="bar"><span id="wk-bar" style="width:${Math.round(stats.ratio * 100)}%"></span></div>
</div>

${week.note ? `<div class="week-note prose">${md(week.note)}</div>` : ''}
${raceStrip(week)}

${withToday(week, today).map(d => `
<div class="day${d.date === today ? ' today' : ''}" data-day="${d.date}">
  <div class="day-head">
    <span>${DAY_LONG[d.day]}</span>
    <span class="day-date">${formatShort(d.date)}</span>
    ${d.date === today ? '<span class="day-pill">Today</span>' : ''}
  </div>
  <div class="sessions">${d.sessions.length
      ? d.sessions.map(s => sessionRow(s, d.date, today)).join('')
      : '<p class="small muted" style="margin:0 0 4px 2px">Nothing scheduled. That is allowed.</p>'}</div>
</div>`).join('')}

<p class="small muted center" style="margin-top:20px">
  Tap the box to tick a session. Tap the row for detail and to log metrics.
</p>`;

  if (!root.dataset.wired) {
    wire(root);
    root.dataset.wired = '1';
  }

  const todayEl = qs('.day.today', root);
  if (todayEl && weekNumber === currentWeekNumber()) {
    requestAnimationFrame(() => todayEl.scrollIntoView({ block: 'center', behavior: 'auto' }));
  }
}

function wire(container) {
  on(container, 'click', '[data-act="prev"]', () => { setWeek(weekNumber - 1); render(container); });
  on(container, 'click', '[data-act="next"]', () => { setWeek(weekNumber + 1); render(container); });

  on(container, 'click', '[data-act="tick"]', (ev, btn) => {
    const row = btn.closest('.session');
    const done = store.toggleComplete(row.dataset.session, row.dataset.date);
    btn.setAttribute('aria-pressed', String(done));
    row.classList.toggle('done', done);
  });

  on(container, 'click', '[data-act="expand"]', (ev, btn) => {
    const row = btn.closest('.session');
    const id = row.dataset.session;
    if (open.has(id)) open.delete(id); else open.add(id);
    const session = plan.weeks.flatMap(w => w.sessions).find(s => s.id === id);
    row.classList.toggle('open', open.has(id));
    btn.setAttribute('aria-expanded', String(open.has(id)));
    const existing = row.querySelector('.logform');
    const existingDetail = row.querySelector('.session-detail');
    if (existing) existing.remove();
    if (existingDetail) existingDetail.remove();
    if (open.has(id)) row.insertAdjacentHTML('beforeend', detailAndForm(session, store.entry(id) || {}));
  });

  // Debounced per field, not globally — a shared timer would drop every edit
  // but the last one when you fill in duration, then climb, then notes.
  const timers = new Map();
  const save = (id, field, value) => {
    const key = `${id}:${field}`;
    clearTimeout(timers.get(key));
    timers.set(key, setTimeout(() => {
      timers.delete(key);
      store.setEntry(id, { [field]: field === 'notes' ? value : (value === '' ? undefined : Number(value)) });
    }, 350));
  };

  container.addEventListener('input', ev => {
    const f = ev.target.closest('[data-f]');
    if (!f) return;
    const row = f.closest('.session');
    if (!row) return;
    save(row.dataset.session, f.dataset.f, f.value);
  });

  on(container, 'click', '[data-act="rpe"]', (ev, btn) => {
    const row = btn.closest('.session');
    const current = Number((store.entry(row.dataset.session) || {}).rpe) || 0;
    const value = Number(btn.dataset.v);
    const next = current === value ? undefined : value;
    store.setEntry(row.dataset.session, { rpe: next });
    qsa('[data-act="rpe"]', row).forEach(b =>
      b.setAttribute('aria-pressed', String(next != null && Number(b.dataset.v) === next)));
  });
}

/** Log changed elsewhere (sync, import): refresh derived numbers in place. */
export function onLog(reason) {
  if (!root || !root.isConnected) return;
  if (reason === 'replace') { render(root); return; }

  const week = getWeek(weekNumber);
  if (!week) return;
  const stats = weekStats(week);
  const count = qs('#wk-count', root), vert = qs('#wk-vert', root), bar = qs('#wk-bar', root);
  if (count) count.textContent = `${stats.done} of ${stats.total} sessions done`;
  if (vert) vert.textContent = `${stats.gain.toLocaleString()} m banked`;
  if (bar) bar.style.width = `${Math.round(stats.ratio * 100)}%`;

  qsa('.session', root).forEach(row => {
    const e = store.entry(row.dataset.session) || {};
    row.classList.toggle('done', !!e.completed);
    const logged = [];
    if (e.durationMin) logged.push(`${e.durationMin} min`);
    if (e.distanceKm) logged.push(`${e.distanceKm} km`);
    if (e.gainM) logged.push(`${Number(e.gainM).toLocaleString()} m`);
    if (e.rpe) logged.push(`RPE ${e.rpe}`);
    const meta = row.querySelector('.session-meta');
    if (!meta) return;
    let el = meta.querySelector('.logged');
    if (logged.length) {
      if (!el) { el = document.createElement('span'); el.className = 'logged'; meta.appendChild(el); }
      el.textContent = logged.join(' · ');
    } else if (el) el.remove();
  });
}

export function title() {
  return 'This Week';
}
