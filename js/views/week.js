// This Week — the default view. One tap to complete, everything else optional.

import { esc, on, qs, qsa } from '../dom.js';
import { md } from '../md.js';
import { store } from '../store.js';
import {
  plan, getWeek, getPhase, daysOf, weekStats,
  currentWeekNumber, firstWeek, lastWeek, TYPE_ICON, TYPE_LABEL
} from '../model.js';
import { FIELDS, fieldsFor, coerce, summaryOf } from '../fields.js';
import { todayISO, formatShort, formatRange, daysBetween, DAYS, DAY_LONG, hhmm } from '../dates.js';

const open = new Set();          // session ids with the log form expanded
let weekNumber = null;
let root = null;

export function setWeek(n) {
  weekNumber = Math.min(lastWeek(), Math.max(firstWeek(), n));
}

function sessionRow(session, dateISO) {
  const e = store.entry(session.id) || {};
  const done = !!e.completed;
  const isOpen = open.has(session.id);

  const bits = [];
  if (session.targetMinutes) bits.push(hhmm(session.targetMinutes));
  bits.push(TYPE_LABEL[session.type] || session.type);
  if (session.critical) bits.push('Key session');
  if (session.optional) bits.push('Optional');

  const logged = summaryOf(session, e);

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
          ${logged.length ? `<span class="logged">${esc(logged.join(' · '))}</span>` : ''}
        </span>
      </span>
      <span class="chev" aria-hidden="true">›</span>
    </button>
  </div>
  ${isOpen ? detailAndForm(session, e) : ''}
</div>`;
}

function fieldControl(session, entry, key) {
  const spec = FIELDS[key];
  const id = `${key}-${session.id}`;
  const value = entry[key];

  switch (spec.kind) {
    case 'number':
      return `
    <div class="field">
      <label for="${id}">${esc(spec.label)}</label>
      <input id="${id}" data-f="${key}" type="number" inputmode="${spec.mode}" min="0" step="${spec.step}"
             ${key === 'durationMin' && session.targetMinutes ? `placeholder="${session.targetMinutes}"` : ''}
             value="${esc(value ?? '')}">
    </div>`;

    case 'rpe':
      return `
    <div class="field full">
      <label>${esc(spec.label)}</label>
      <div class="rpe" role="group" aria-label="${esc(spec.label)}">
        ${Array.from({ length: 10 }, (_, i) => i + 1).map(n =>
          `<button type="button" data-act="choice" data-field="rpe" data-v="${n}" aria-pressed="${Number(value) === n}">${n}</button>`).join('')}
      </div>
    </div>`;

    case 'choice':
      return `
    <div class="field full">
      <label>${esc(spec.label)}</label>
      <div class="chip-row" role="group" aria-label="${esc(spec.label)}">
        ${spec.options.map(([v, text]) =>
          `<button type="button" class="chip" data-act="choice" data-field="${key}" data-v="${esc(v)}" aria-pressed="${value === v}">${esc(text)}</button>`).join('')}
      </div>
    </div>`;

    case 'toggle':
      return `
    <div class="field full">
      <div class="chip-row">
        <button type="button" class="chip" data-act="choice" data-field="${key}" data-v="yes"
                aria-pressed="${value === 'yes'}">${esc(spec.label)}</button>
      </div>
    </div>`;

    case 'notes':
      return `
    <div class="field full">
      <label for="${id}">${esc(spec.label)}</label>
      <textarea id="${id}" data-f="${key}" placeholder="${esc(spec.placeholder || '')}">${esc(value ?? '')}</textarea>
    </div>`;
  }
  return '';
}

function detailAndForm(session, entry) {
  return `
  ${session.detail ? `<div class="session-detail">${esc(session.detail)}</div>` : ''}
  <div class="logform">
    ${fieldsFor(session).map(key => fieldControl(session, entry, key)).join('')}
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
      ? d.sessions.map(s => sessionRow(s, d.date)).join('')
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

const sessionById = id => plan.weeks.flatMap(w => w.sessions).find(s => s.id === id);

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
    row.classList.toggle('open', open.has(id));
    btn.setAttribute('aria-expanded', String(open.has(id)));
    const form = row.querySelector('.logform');
    const detail = row.querySelector('.session-detail');
    if (form) form.remove();
    if (detail) detail.remove();
    if (open.has(id)) row.insertAdjacentHTML('beforeend', detailAndForm(sessionById(id), store.entry(id) || {}));
  });

  // Debounced per field, not globally — a shared timer would drop every edit
  // but the last one when you fill in duration, then climb, then notes.
  const timers = new Map();
  const save = (id, field, value) => {
    const key = `${id}:${field}`;
    clearTimeout(timers.get(key));
    timers.set(key, setTimeout(() => {
      timers.delete(key);
      store.setEntry(id, { [field]: coerce(field, value) });
    }, 350));
  };

  container.addEventListener('input', ev => {
    const f = ev.target.closest('[data-f]');
    const row = f && f.closest('.session');
    if (row) save(row.dataset.session, f.dataset.f, f.value);
  });

  // One handler for RPE, choice chips and toggles: tapping the active value
  // clears it, so nothing is a one-way door.
  on(container, 'click', '[data-act="choice"]', (ev, btn) => {
    const row = btn.closest('.session');
    const field = btn.dataset.field;
    const raw = btn.dataset.v;
    const value = field === 'rpe' ? Number(raw) : raw;
    const current = (store.entry(row.dataset.session) || {})[field];
    const next = current === value || (field === 'rpe' && Number(current) === value) ? undefined : value;
    store.setEntry(row.dataset.session, { [field]: next });
    qsa(`[data-act="choice"][data-field="${field}"]`, row).forEach(b => {
      const bv = field === 'rpe' ? Number(b.dataset.v) : b.dataset.v;
      b.setAttribute('aria-pressed', String(next !== undefined && bv === next));
    });
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
    const session = sessionById(row.dataset.session);
    if (!session) return;
    const e = store.entry(row.dataset.session) || {};
    row.classList.toggle('done', !!e.completed);
    const meta = row.querySelector('.session-meta');
    if (!meta) return;
    const logged = summaryOf(session, e);
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
