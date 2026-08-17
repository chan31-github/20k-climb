// Date helpers. Everything is Hong Kong local time; date-only values are
// handled as plain [y,m,d] triples through UTC so no timezone can shift them.

export const TZ = 'Asia/Hong_Kong';
export const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const DAY_LONG = {
  Mon: 'Monday', Tue: 'Tuesday', Wed: 'Wednesday', Thu: 'Thursday',
  Fri: 'Friday', Sat: 'Saturday', Sun: 'Sunday'
};

const hkParts = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit'
});

/** Today in Hong Kong, as YYYY-MM-DD. */
export function todayISO(now = new Date()) {
  return hkParts.format(now); // en-CA gives YYYY-MM-DD
}

/** Current wall-clock time in Hong Kong as HH:MM. */
export function nowHHMM(now = new Date()) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false
  }).format(now);
}

export function toUTC(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

export function fromUTC(ms) {
  const d = new Date(ms);
  const p = n => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
}

export function addDays(iso, n) {
  return fromUTC(toUTC(iso) + n * 86400000);
}

export function daysBetween(fromISO, toISO) {
  return Math.round((toUTC(toISO) - toUTC(fromISO)) / 86400000);
}

export function dayIndex(day) {
  const i = DAYS.indexOf(day);
  return i === -1 ? 0 : i;
}

/** Resolve a session's real date from its week start + day name. */
export function sessionDate(week, session) {
  return addDays(week.startDate, dayIndex(session.day));
}

const fmtCache = {};
function fmt(opts) {
  const key = JSON.stringify(opts);
  return fmtCache[key] || (fmtCache[key] = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', ...opts }));
}

/** e.g. "17 Aug" */
export function formatShort(iso) {
  return fmt({ day: 'numeric', month: 'short' }).format(new Date(toUTC(iso)));
}

/** e.g. "Sat 24 Oct 2026" */
export function formatFull(iso) {
  return fmt({ weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(toUTC(iso)));
}

/** e.g. "17 – 23 Aug" */
export function formatRange(a, b) {
  const da = new Date(toUTC(a)), db = new Date(toUTC(b));
  const sameMonth = da.getUTCMonth() === db.getUTCMonth();
  const left = sameMonth
    ? fmt({ day: 'numeric' }).format(da)
    : fmt({ day: 'numeric', month: 'short' }).format(da);
  return `${left} – ${fmt({ day: 'numeric', month: 'short' }).format(db)}`;
}

/** Whole days from today (HK) until a date. Negative once past. */
export function daysUntil(iso, now = new Date()) {
  return daysBetween(todayISO(now), iso);
}

/** "6h40" from minutes. */
export function hhmm(minutes) {
  if (minutes == null || isNaN(minutes)) return '';
  const h = Math.floor(minutes / 60), m = Math.round(minutes % 60);
  return h ? `${h}h${String(m).padStart(2, '0')}` : `${m} min`;
}

/** Minutes between two HH:MM strings, b - a. */
export function minutesBetweenTimes(a, b) {
  const pa = /^(\d{1,2}):(\d{2})$/.exec(a || ''), pb = /^(\d{1,2}):(\d{2})$/.exec(b || '');
  if (!pa || !pb) return null;
  return (+pb[1] * 60 + +pb[2]) - (+pa[1] * 60 + +pa[2]);
}

/** "+12" / "−05" style delta in minutes, signed. */
export function signedMinutes(n) {
  const s = n < 0 ? '−' : '+';
  const a = Math.abs(n);
  return a >= 60 ? `${s}${Math.floor(a / 60)}h${String(a % 60).padStart(2, '0')}` : `${s}${a}m`;
}
