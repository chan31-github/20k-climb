// Which metrics each kind of session actually asks for.
//
// A 10-minute barefoot balance session has no distance, no climb and no
// meaningful heart rate — showing those boxes is friction with nothing behind
// it. Each session type gets the fields that mean something for it, and any
// session in plan.json can override the list with its own "fields" array.

export const FIELDS = {
  durationMin: {
    kind: 'number', label: 'Duration (min)', step: 1, mode: 'numeric',
    summary: v => `${v} min`
  },
  distanceKm: {
    kind: 'number', label: 'Distance (km)', step: 0.1, mode: 'decimal',
    summary: v => `${v} km`
  },
  gainM: {
    kind: 'number', label: 'Climb (m)', step: 10, mode: 'numeric',
    summary: v => `${Number(v).toLocaleString()} m`
  },
  avgHr: {
    kind: 'number', label: 'Avg HR', step: 1, mode: 'numeric',
    summary: v => `${v} bpm`
  },
  reps: {
    kind: 'number', label: 'Reps done', step: 1, mode: 'numeric',
    summary: v => `${v} reps`
  },
  exercises: {
    kind: 'number', label: 'Exercises done (of 6)', step: 1, mode: 'numeric',
    summary: v => `${v}/6 exercises`
  },
  rpe: {
    kind: 'rpe', label: 'Effort (RPE)',
    summary: v => `RPE ${v}`
  },
  balance: {
    kind: 'choice', label: 'Balance progression',
    options: [['open', 'Eyes open'], ['closed', 'Eyes closed'], ['cushion', 'Cushion, eyes closed']],
    summary: v => ({ open: 'Eyes open', closed: 'Eyes closed', cushion: 'Cushion' })[v] || v
  },
  hopStick: {
    kind: 'toggle', label: 'Hop and stick done',
    summary: () => 'Hop and stick'
  },
  notes: {
    kind: 'notes', label: 'Notes',
    placeholder: "What hurt, what the stomach did, what you'd change"
  }
};

const BY_TYPE = {
  long:     ['durationMin', 'distanceKm', 'gainM', 'avgHr', 'rpe', 'notes'],
  race:     ['durationMin', 'distanceKm', 'gainM', 'avgHr', 'rpe', 'notes'],
  shuffle:  ['durationMin', 'distanceKm', 'gainM', 'avgHr', 'rpe', 'notes'],
  grind:    ['durationMin', 'gainM', 'reps', 'avgHr', 'rpe', 'notes'],
  drop:     ['durationMin', 'gainM', 'reps', 'avgHr', 'rpe', 'notes'],
  row:      ['durationMin', 'distanceKm', 'avgHr', 'rpe', 'notes'],
  ankle:    ['durationMin', 'balance', 'hopStick', 'notes'],
  strength: ['durationMin', 'exercises', 'notes'],
  rest:     ['notes']
};

const FALLBACK = ['durationMin', 'distanceKm', 'gainM', 'rpe', 'notes'];

/** The field keys for one session — its own override, else its type's set. */
export function fieldsFor(session) {
  const list = Array.isArray(session.fields) && session.fields.length
    ? session.fields
    : (BY_TYPE[session.type] || FALLBACK);
  return list.filter(key => FIELDS[key]);
}

/** Turn a raw input value into what belongs in the log. */
export function coerce(key, value) {
  const spec = FIELDS[key];
  if (!spec) return value;
  if (spec.kind === 'number') return value === '' ? undefined : Number(value);
  return value === '' ? undefined : value;
}

/** The green one-line recap on a collapsed row. */
export function summaryOf(session, entry) {
  if (!entry) return [];
  return fieldsFor(session)
    .filter(key => key !== 'notes')
    .filter(key => entry[key] !== undefined && entry[key] !== '' && entry[key] !== false)
    .map(key => FIELDS[key].summary(entry[key]))
    .filter(Boolean);
}
