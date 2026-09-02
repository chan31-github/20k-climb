// The activity log: localStorage-backed, versioned, and mergeable per entry.

export const LOG_KEY = 'lantau-log-v1';
export const SCHEMA_VERSION = 3;

function blank() {
  return {
    schemaVersion: SCHEMA_VERSION,
    lastExportedAt: null,
    entries: {},              // sessionId -> { completed, completedDate, durationMin, distanceKm, gainM, rpe, notes, updatedAt }
    adjustments: {},          // sessionId -> { day, updatedAt } — day null means "back where the plan put it"
    extras: {},               // extraId   -> { id, weekNumber, day, type, title, targetMinutes, deleted, updatedAt }
    achievements: {},         // achievementId -> "YYYY-MM-DD"
    achievementsMeta: {},     // achievementId -> updatedAt (kept apart so `achievements` stays human-readable)
    races: {},                // raceId -> { splits: { index: "HH:MM" }, updatedAt }
    settings: { theme: 'auto' }
  };
}

/**
 * Session ids that moved in the 23 Aug revision, when the long run shifted from
 * Saturday to Sunday and the Drop from Friday to Thursday. Without this a log
 * written before the change would keep its ticks in the file but show none of
 * them in the app.
 */
const RENAMED_V2 = {
  'w1-wed-ankle': 'w1-mon-ankle', 'w1-fri-ankle': 'w1-thu-ankle',
  'w1-sat-long': 'w1-sun-long', 'w1-sun-rest': 'w1-sat-yoga',
  'w2-sat-hike': 'w2-sun-hike',
  'w3-fri-drop': 'w3-thu-drop', 'w3-sat-long': 'w3-sun-long', 'w3-sun-yoga': 'w3-sat-yoga',
  'w4-fri-drop': 'w4-thu-drop', 'w4-sat-long': 'w4-sun-long', 'w4-sun-yoga': 'w4-sat-yoga',
  'w5-thu-grind': 'w5-wed-grind', 'w5-sat-long': 'w5-sun-long', 'w5-sun-yoga': 'w5-sat-yoga',
  'w6-fri-drop': 'w6-thu-drop', 'w6-sat-long': 'w6-sun-long', 'w6-sun-yoga': 'w6-sat-yoga',
  'w7-fri-drop': 'w7-thu-drop', 'w7-sat-long': 'w7-sun-long', 'w7-sun-yoga': 'w7-sat-yoga',
  'w8-thu-grind': 'w8-wed-grind', 'w8-sat-long': 'w8-sun-long', 'w8-sun-yoga': 'w8-sat-yoga',
  'w9-sat-long': 'w9-sun-long', 'w9-sun-yoga': 'w9-sat-yoga',
  'w11-sat-long': 'w11-sun-long', 'w11-sun-yoga': 'w11-sat-yoga',
  'w12-fri-drop': 'w12-thu-drop', 'w12-sat-long': 'w12-sun-long', 'w12-sun-yoga': 'w12-sat-yoga',
  'w14-sat-long': 'w14-sun-long', 'w14-sun-yoga': 'w14-sat-yoga',
  'w15-sat-long': 'w15-sun-long', 'w15-sun-yoga': 'w15-sat-yoga'
};

function renameEntries(entries, map) {
  const out = {};
  for (const [id, entry] of Object.entries(entries || {})) {
    const to = map[id] || id;
    // An entry already under the new id wins; it is the more deliberate write.
    if (!out[to]) out[to] = entry;
  }
  return out;
}

function migrate(raw) {
  const from = (raw && Number(raw.schemaVersion)) || 1;
  const s = Object.assign(blank(), raw || {});
  if (from < 2) s.entries = renameEntries(s.entries, RENAMED_V2);
  s.schemaVersion = SCHEMA_VERSION;
  s.entries = s.entries || {};
  s.adjustments = s.adjustments || {};
  s.extras = s.extras || {};
  s.achievements = s.achievements || {};
  s.achievementsMeta = s.achievementsMeta || {};
  s.races = s.races || {};
  s.settings = Object.assign({ theme: 'auto' }, s.settings || {});
  return s;
}

let state;
let storageError = null;
const listeners = new Set();

let migratedOnLoad = false;

try {
  const raw = localStorage.getItem(LOG_KEY);
  const parsed = raw ? JSON.parse(raw) : null;
  state = migrate(parsed);
  migratedOnLoad = !!parsed && Number(parsed.schemaVersion) !== SCHEMA_VERSION;
} catch (err) {
  state = blank();
  storageError = 'Could not read saved data from this browser. ' + (err && err.message || '');
}

function persist() {
  try {
    localStorage.setItem(LOG_KEY, JSON.stringify(state));
    if (storageError) { storageError = null; }
  } catch (err) {
    storageError = 'Could not save to this browser — private browsing or storage is full. Export your log before closing.';
  }
}

// Write the upgraded shape back straight away, so the stored copy is canonical
// and an export taken before the next edit carries the new ids.
if (migratedOnLoad) persist();

function emit(reason) {
  for (const fn of listeners) {
    try { fn(state, reason); } catch (err) { console.error(err); }
  }
}

function commit(reason = 'change') {
  persist();
  emit(reason);
}

const now = () => new Date().toISOString();

export const store = {
  get state() { return state; },
  get error() { return storageError; },

  subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },

  entry(id) { return state.entries[id] || null; },

  /** Merge a patch into one session entry. Always stamps updatedAt. */
  setEntry(id, patch) {
    const prev = state.entries[id] || {};
    const next = Object.assign({}, prev, patch, { updatedAt: now() });
    for (const k of Object.keys(next)) {
      if (next[k] === '' || next[k] === undefined) delete next[k];
    }
    state.entries[id] = next;
    commit('entry');
    return next;
  },

  /** One-tap completion. Nothing else is required. */
  toggleComplete(id, dateISO) {
    const prev = state.entries[id] || {};
    if (prev.completed) {
      this.setEntry(id, { completed: false, completedDate: undefined });
    } else {
      this.setEntry(id, { completed: true, completedDate: dateISO });
    }
    return !!state.entries[id].completed;
  },

  // --- Moving a session, and adding one of your own ------------------------
  //
  // Both live in the log rather than in plan.json: the plan is what the coach
  // wrote and stays read-only, these are your adjustments to it, and keeping
  // them here means they sync between devices like everything else.

  moveSession(id, day) {
    state.adjustments[id] = { day, updatedAt: now() };
    commit('adjust');
  },

  /** Tombstoned rather than deleted, so the reset survives a sync. */
  resetSessionDay(id) {
    state.adjustments[id] = { day: null, updatedAt: now() };
    commit('adjust');
  },

  extrasFor(weekNumber) {
    return Object.values(state.extras)
      .filter(x => x && !x.deleted && x.weekNumber === weekNumber);
  },

  extra(id) {
    const x = state.extras[id];
    return x && !x.deleted ? x : null;
  },

  addExtra({ weekNumber, day, type, title, targetMinutes }) {
    const id = `x${weekNumber}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
    state.extras[id] = {
      id, weekNumber, day, type, title,
      targetMinutes: targetMinutes || undefined,
      updatedAt: now()
    };
    commit('extra');
    return id;
  },

  updateExtra(id, patch) {
    const x = state.extras[id];
    if (!x || x.deleted) return;
    state.extras[id] = Object.assign({}, x, patch, { updatedAt: now() });
    commit('extra');
  },

  /** Removes the session and whatever was logged against it — they go together. */
  removeExtra(id) {
    const x = state.extras[id];
    if (!x) return;
    state.extras[id] = { id, weekNumber: x.weekNumber, deleted: true, updatedAt: now() };
    delete state.entries[id];
    commit('extra');
  },

  achievement(id) { return state.achievements[id] || null; },

  setAchievement(id, dateISO) {
    if (dateISO) state.achievements[id] = dateISO;
    else delete state.achievements[id];
    state.achievementsMeta[id] = now();
    commit('achievement');
  },

  raceSplits(raceId) { return (state.races[raceId] && state.races[raceId].splits) || {}; },

  setRaceSplit(raceId, index, value) {
    const r = state.races[raceId] || { splits: {} };
    r.splits = r.splits || {};
    if (value) r.splits[index] = value; else delete r.splits[index];
    r.updatedAt = now();
    state.races[raceId] = r;
    commit('race');
  },

  setting(key) { return state.settings[key]; },

  setSetting(key, value) {
    state.settings[key] = value;
    state.settingsUpdatedAt = now();
    commit('settings');
  },

  markExported() {
    state.lastExportedAt = now();
    commit('export');
  },

  /** Wholesale replace — used by import and by sync reconciliation. */
  replace(next, reason = 'replace') {
    state = migrate(next);
    commit(reason);
  },

  toJSON() { return JSON.parse(JSON.stringify(state)); }
};

/**
 * Per-entry reconciliation. Two devices editing different sessions merge
 * cleanly; the same session edited on both takes the more recent write.
 */
export function mergeLogs(a, b) {
  const A = migrate(a), B = migrate(b);
  const out = migrate({});

  const newer = (x, y) => {
    if (!x) return y;
    if (!y) return x;
    return (y.updatedAt || '') > (x.updatedAt || '') ? y : x;
  };

  for (const id of new Set([...Object.keys(A.entries), ...Object.keys(B.entries)])) {
    out.entries[id] = newer(A.entries[id], B.entries[id]);
  }

  // Moves and added sessions reconcile per key like entries do, and their
  // tombstones carry a timestamp so a delete beats an older edit.
  for (const id of new Set([...Object.keys(A.adjustments), ...Object.keys(B.adjustments)])) {
    out.adjustments[id] = newer(A.adjustments[id], B.adjustments[id]);
  }
  for (const id of new Set([...Object.keys(A.extras), ...Object.keys(B.extras)])) {
    out.extras[id] = newer(A.extras[id], B.extras[id]);
  }

  for (const id of new Set([...Object.keys(A.achievements), ...Object.keys(B.achievements),
                            ...Object.keys(A.achievementsMeta), ...Object.keys(B.achievementsMeta)])) {
    const ta = A.achievementsMeta[id] || '', tb = B.achievementsMeta[id] || '';
    const win = tb > ta ? B : A;
    if (win.achievements[id]) out.achievements[id] = win.achievements[id];
    const meta = ta > tb ? ta : tb;
    if (meta) out.achievementsMeta[id] = meta;
  }

  for (const id of new Set([...Object.keys(A.races), ...Object.keys(B.races)])) {
    out.races[id] = newer(A.races[id], B.races[id]);
  }

  out.settings = ((B.settingsUpdatedAt || '') > (A.settingsUpdatedAt || '')) ? B.settings : A.settings;
  out.settingsUpdatedAt = (B.settingsUpdatedAt || '') > (A.settingsUpdatedAt || '') ? B.settingsUpdatedAt : A.settingsUpdatedAt;
  out.lastExportedAt = (B.lastExportedAt || '') > (A.lastExportedAt || '') ? B.lastExportedAt : A.lastExportedAt;

  return out;
}
