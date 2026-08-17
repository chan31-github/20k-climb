// The activity log: localStorage-backed, versioned, and mergeable per entry.

export const LOG_KEY = 'lantau-log-v1';
export const SCHEMA_VERSION = 1;

function blank() {
  return {
    schemaVersion: SCHEMA_VERSION,
    lastExportedAt: null,
    entries: {},              // sessionId -> { completed, completedDate, durationMin, distanceKm, gainM, rpe, notes, updatedAt }
    achievements: {},         // achievementId -> "YYYY-MM-DD"
    achievementsMeta: {},     // achievementId -> updatedAt (kept apart so `achievements` stays human-readable)
    races: {},                // raceId -> { splits: { index: "HH:MM" }, updatedAt }
    settings: { theme: 'auto' }
  };
}

function migrate(raw) {
  const s = Object.assign(blank(), raw || {});
  s.schemaVersion = SCHEMA_VERSION;
  s.entries = s.entries || {};
  s.achievements = s.achievements || {};
  s.achievementsMeta = s.achievementsMeta || {};
  s.races = s.races || {};
  s.settings = Object.assign({ theme: 'auto' }, s.settings || {});
  return s;
}

let state;
let storageError = null;
const listeners = new Set();

try {
  const raw = localStorage.getItem(LOG_KEY);
  state = migrate(raw ? JSON.parse(raw) : null);
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
