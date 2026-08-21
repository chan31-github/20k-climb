// Plan loading plus everything derived from plan + log.

import { store } from './store.js';
import { todayISO, sessionDate, DAYS } from './dates.js';

export const TYPE_ICON = {
  grind: '🪜', shuffle: '🐌', drop: '⛰️', long: '🥾',
  ankle: '🦶', evening: '🦶', strength: '💪', row: '🚣',
  yoga: '🧘', race: '🏁', rest: '☕'
};

export const TYPE_LABEL = {
  grind: 'Grind', shuffle: 'Shuffle', drop: 'Drop', long: 'Long One',
  ankle: 'Ankle Church', evening: 'Ankle + Strength', strength: 'Strength',
  row: 'Row', yoga: 'Yoga', race: 'Race', rest: 'Rest'
};

export let plan = null;

export async function loadPlan() {
  const res = await fetch('data/plan.json', { cache: 'no-cache' });
  if (!res.ok) throw new Error('Could not load plan.json (' + res.status + ')');
  plan = await res.json();
  index();
  return plan;
}

const byId = { weeks: new Map(), sessions: new Map(), phases: new Map() };

function index() {
  byId.weeks.clear(); byId.sessions.clear(); byId.phases.clear();
  for (const p of plan.phases) byId.phases.set(p.id, p);
  for (const w of plan.weeks) {
    byId.weeks.set(w.number, w);
    for (const s of w.sessions) byId.sessions.set(s.id, { session: s, week: w });
  }
}

export const getWeek = n => byId.weeks.get(n) || null;
export const getPhase = id => byId.phases.get(id) || null;

export const firstWeek = () => plan.weeks[0].number;
export const lastWeek = () => plan.weeks[plan.weeks.length - 1].number;

/** The week containing today, clamped to the plan's range. */
export function currentWeekNumber(today = todayISO()) {
  const weeks = plan.weeks;
  if (today < weeks[0].startDate) return weeks[0].number;
  for (const w of weeks) if (today >= w.startDate && today <= w.endDate) return w.number;
  return weeks[weeks.length - 1].number;
}

/** Sessions of a week grouped by day, in Mon–Sun order, skipping empty days. */
export function daysOf(week) {
  const groups = new Map();
  for (const s of week.sessions) {
    if (!groups.has(s.day)) groups.set(s.day, []);
    groups.get(s.day).push(s);
  }
  return DAYS.filter(d => groups.has(d)).map(day => ({
    day,
    date: sessionDate(week, { day }),
    sessions: groups.get(day)
  }));
}

const num = v => (v == null || v === '' || isNaN(v) ? 0 : Number(v));

/** Rest days and anything flagged optional stay out of the week's count. */
const counts = s => s.type !== 'rest' && !s.optional;

export function weekStats(week, log = store.state) {
  let done = 0, total = 0, gain = 0, minutes = 0, distance = 0;
  for (const s of week.sessions) {
    if (counts(s)) total++;
    const e = log.entries[s.id];
    if (!e) continue;
    if (e.completed && counts(s)) done++;
    gain += num(e.gainM);
    minutes += num(e.durationMin);
    distance += num(e.distanceKm);
  }
  return { done, total, gain, minutes, distance, ratio: total ? done / total : 0 };
}

export function totalVertical(log = store.state) {
  let total = 0;
  for (const id of Object.keys(log.entries)) total += num(log.entries[id].gainM);
  return total;
}

export function verticalByWeek(log = store.state) {
  return plan.weeks.map(w => ({ number: w.number, gain: weekStats(w, log).gain }));
}

export function totals(log = store.state) {
  let minutes = 0, distance = 0, sessions = 0;
  for (const id of Object.keys(log.entries)) {
    const e = log.entries[id];
    if (e.completed) sessions++;
    minutes += num(e.durationMin);
    distance += num(e.distanceKm);
  }
  return { minutes, distance, sessions, gain: totalVertical(log) };
}

/**
 * Auto achievements. Runs after every log change; only ever adds, so a
 * milestone once earned stays earned even if numbers are later edited down.
 */
export function evaluateAchievements(log = store.state) {
  if (!plan) return;
  const today = todayISO();
  const vert = totalVertical(log);

  const longestLong = Object.keys(log.entries).reduce((best, id) => {
    const e = log.entries[id], s = byId.sessions.get(id);
    if (!e || !e.completed || !s) return best;
    const mins = num(e.durationMin) || num(s.session.targetMinutes);
    return Math.max(best, mins);
  }, 0);

  const perfect = plan.weeks.map(w => weekStats(w, log)).map(s => s.total > 0 && s.done === s.total);
  let streak = 0, bestStreak = 0;
  for (const ok of perfect) { streak = ok ? streak + 1 : 0; bestStreak = Math.max(bestStreak, streak); }

  for (const a of plan.achievements) {
    if (!a.auto || !a.trigger || log.achievements[a.id]) continue;
    const t = a.trigger;
    let hit = false;
    if (t.type === 'vertical') hit = vert >= t.value;
    else if (t.type === 'longRunMinutes' || t.type === 'sessionMinutes') hit = longestLong >= t.value;
    else if (t.type === 'session') hit = !!(log.entries[t.value] && log.entries[t.value].completed);
    else if (t.type === 'perfectWeekStreak') hit = bestStreak >= t.value;
    if (hit) store.setAchievement(a.id, today);
  }
}
