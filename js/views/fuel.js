// Fuel plan — what you're carrying on a long run, checked against what the
// run needs. Lives inside the expanded long run and race rows.

import { esc, on, qs, qsa, toast } from '../dom.js';
import { store } from '../store.js';
import { hhmm } from '../dates.js';

// Values from the coach's documents and product labels. null means "depends on
// the brand" — the item shows a prompt until you enter your label's number.
// Weights are estimates except where a label gives them.
export const LIBRARY = [
  { id: 'pocari-salted', name: 'Salted Pocari, 500 ml', carbsG: 31, sodiumMg: 530, fluidMl: 500, weightG: 500 },
  { id: 'pocari',        name: 'Pocari, plain, 500 ml', carbsG: 31, sodiumMg: 245, fluidMl: 500, weightG: 500 },
  { id: 'water-500',     name: 'Plain water, 500 ml',   carbsG: 0,  sodiumMg: 0,   fluidMl: 500, weightG: 500 },
  { id: 'malto-500',     name: 'Maltodextrin drink, 500 ml', carbsG: 50, sodiumMg: 0, fluidMl: 500, weightG: 500 },
  { id: 'gu-strawberry-banana', name: 'GU gel — Strawberry Banana', carbsG: 23, sodiumMg: 55, fluidMl: 0, weightG: 32 },
  { id: 'amino-jelly',   name: 'Amino Vital jelly',     carbsG: 50, sodiumMg: 340, fluidMl: 0, weightG: 250 },
  { id: 'onigiri',       name: 'Onigiri / salted rice ball', carbsG: 40, sodiumMg: null, fluidMl: 0, weightG: 110 },
  { id: 'potato',        name: 'Boiled baby potato, salted', carbsG: 7, sodiumMg: null, fluidMl: 0, weightG: 40 },
  { id: 'bread-honey',   name: 'White bread & honey, half', carbsG: 25, sodiumMg: null, fluidMl: 0, weightG: 50 },
  { id: 'date',          name: 'Medjool date',          carbsG: 18, sodiumMg: 0,   fluidMl: 0, weightG: 24 },
  { id: 'banana',        name: 'Banana',                carbsG: 25, sodiumMg: 0,   fluidMl: 0, weightG: 120 },
  { id: 'fig-roll',      name: 'Fig roll',              carbsG: 11, sodiumMg: null, fluidMl: 0, weightG: 16 },
  { id: 'cola-330',      name: 'Coca-Cola, 330 ml',     carbsG: 35, sodiumMg: null, fluidMl: 330, weightG: 330 },
  { id: 'salt-capsule',  name: 'Salt capsule',          carbsG: 0,  sodiumMg: null, fluidMl: 0, weightG: 1 }
];

// Used when a session carries no fuel targets of its own in plan.json.
const DEFAULT_TARGETS = { carbs: [65, 65], fluid: [750, 800], sodium: [700, 1000], reserve: 20 };

export const FUEL_TYPES = new Set(['long', 'race']);

const editing = new Set();       // session ids with the targets editor open
let itemForm = null;             // { sessionId, itemId|null } — the item editor that's open

/** Library and your own items, with your values laid over the library's. */
export function allItems() {
  const mine = store.state.fuelItems || {};
  const lib = LIBRARY.map(it => Object.assign({}, it, mine[it.id] || {}, { builtIn: true }));
  const custom = Object.values(mine).filter(it => it && !it.deleted && !LIBRARY.some(l => l.id === it.id));
  return lib.concat(custom);
}

const itemById = id => allItems().find(it => it.id === id) || null;

/** Targets for a session: your overrides, else the plan's, else defaults. */
export function targetsFor(session) {
  const plan = store.fuelPlan(session.id) || {};
  const base = Object.assign({}, DEFAULT_TARGETS, session.fuel || {});
  const t = Object.assign({}, base, plan.targets || {});
  return { ...t, durationMin: plan.durationMin || session.targetMinutes || 120 };
}

/** The sums. Unknown values count as zero and are reported, not hidden. */
export function compute(session) {
  const plan = store.fuelPlan(session.id) || { items: {} };
  const t = targetsFor(session);
  const hours = t.durationMin / 60;
  const tot = { carbsG: 0, sodiumMg: 0, fluidMl: 0, weightG: 0 };
  const missing = { sodiumMg: [], weightG: [], carbsG: [], fluidMl: [] };

  for (const [id, qty] of Object.entries(plan.items || {})) {
    if (!qty) continue;
    const it = itemById(id);
    if (!it) continue;
    for (const k of Object.keys(tot)) {
      if (it[k] == null) missing[k].push(it.name);
      else tot[k] += it[k] * qty;
    }
  }

  const reserve = 1 + (Number(t.reserve) || 0) / 100;
  const need = {
    carbsG:   [t.carbs[0] * hours * reserve, t.carbs[1] * hours * reserve],
    fluidMl:  [t.fluid[0] * hours,           t.fluid[1] * hours],
    sodiumMg: [t.sodium[0] * hours,          t.sodium[1] * hours]
  };
  // The coach's rule: first feed at 30 minutes, then every 20.
  const feeds = t.durationMin >= 30 ? Math.floor((t.durationMin - 30) / 20) + 1 : 0;
  return { t, hours, tot, need, missing, feeds };
}

function verdict(have, [lo, hi]) {
  if (have >= lo) return have > hi * 1.25 && hi > 0 ? 'more' : 'ok';
  if (have >= lo * 0.9) return 'close';
  return 'short';
}

const ICON = { ok: '✅', close: '⚠️', short: '❌', more: 'ℹ️' };
const n0 = v => Math.round(v).toLocaleString();
const range = ([a, b]) => (a === b ? n0(a) : `${n0(a)}–${n0(b)}`);

function resultRows(c) {
  const L = v => (v / 1000).toFixed(2).replace(/\.?0+$/, '');
  const rows = [
    ['Carbs',  c.tot.carbsG,   c.need.carbsG,   n0, 'g',  'g/hr',  c.t.reserve ? ` incl. +${c.t.reserve}%` : ''],
    ['Fluid',  c.tot.fluidMl,  c.need.fluidMl,  L,  'L',  'ml/hr', ''],
    ['Sodium', c.tot.sodiumMg, c.need.sodiumMg, n0, 'mg', 'mg/hr', '']
  ];
  return rows.map(([label, have, need, num, u, unit, extra]) => {
    const fmt = v => `${num(v)} ${u}`;
    const v = verdict(have, need);
    const rate = c.hours ? have / c.hours : 0;
    const needText = num(need[0]) === num(need[1]) ? fmt(need[0]) : `${num(need[0])}–${num(need[1])} ${u}`;
    const note = v === 'more' ? (label === 'Fluid' ? ' · more than the gut absorbs' : ' · well over') : '';
    return `<div class="fuel-row ${v}">
      <span class="fr-label">${label}</span>
      <span class="fr-have">${fmt(have)}</span>
      <span class="fr-rate">${n0(rate)} ${unit}</span>
      <span class="fr-ico" aria-label="${v}">${ICON[v]}</span>
      <span class="fr-need">need ${needText}${extra}${note}</span>
    </div>`;
  }).join('');
}

function resultsHtml(session) {
  const c = compute(session);
  const missingSodium = [...new Set(c.missing.sodiumMg)];
  const missingWeight = [...new Set(c.missing.weightG)];
  const perFeed = c.feeds ? c.tot.carbsG / c.feeds : 0;
  return `
    ${resultRows(c)}
    <div class="fuel-foot">
      ${c.feeds} feeds on the 20-min timer${perFeed ? ` · ~${n0(perFeed)} g carbs per feed` : ''}
      · pack ≈ ${(c.tot.weightG / 1000).toFixed(1)} kg${missingWeight.length ? ' + items without a weight' : ''}
    </div>
    ${missingSodium.length ? `<div class="fuel-warn">No sodium value for ${esc(missingSodium.join(', '))} — tap ✎ to add it from the label.</div>` : ''}`;
}

function targetsHtml(session) {
  const t = targetsFor(session);
  if (!editing.has(session.id)) {
    return `<div class="fuel-targets">
      <span>${hhmm(t.durationMin)} · ${range(t.carbs)} g/hr carbs${t.reserve ? ` (+${t.reserve}%)` : ''}
        · ${range(t.fluid)} ml/hr · ${range(t.sodium)} mg/hr sodium</span>
      <button type="button" class="link-btn" data-act="fuel-edit-targets">Edit</button>
    </div>`;
  }
  const pair = (key, label, unit) => `
    <div class="field">
      <label>${label} (${unit})</label>
      <div class="pair">
        <input type="number" inputmode="numeric" min="0" data-fuel-t="${key}.0" value="${t[key][0]}">
        <span>–</span>
        <input type="number" inputmode="numeric" min="0" data-fuel-t="${key}.1" value="${t[key][1]}">
      </div>
    </div>`;
  return `<div class="fuel-edit">
    <div class="field"><label>Duration (min)</label>
      <input type="number" inputmode="numeric" min="0" step="5" data-fuel-t="durationMin" value="${t.durationMin}"></div>
    <div class="field"><label>Carb reserve (%)</label>
      <input type="number" inputmode="numeric" min="0" step="5" data-fuel-t="reserve" value="${t.reserve}"></div>
    ${pair('carbs', 'Carbs', 'g/hr')}
    ${pair('fluid', 'Fluid', 'ml/hr')}
    ${pair('sodium', 'Sodium', 'mg/hr')}
    <div class="btn-row full">
      <button type="button" class="btn small" data-act="fuel-done-targets">Done</button>
      <button type="button" class="btn small" data-act="fuel-reset-targets">Back to plan targets</button>
    </div>
  </div>`;
}

function perUnit(it) {
  const bits = [];
  if (it.carbsG) bits.push(`${it.carbsG} g carbs`);
  if (it.fluidMl) bits.push(`${it.fluidMl} ml`);
  bits.push(it.sodiumMg == null ? 'sodium ?' : it.sodiumMg ? `${it.sodiumMg} mg Na` : '');
  return bits.filter(Boolean).join(' · ');
}

function itemFormHtml(sessionId, it) {
  const v = k => (it && it[k] != null ? it[k] : '');
  return `<div class="fuel-item-form" data-item="${esc(it ? it.id : '')}">
    <div class="field full"><label>Name</label><input data-fi="name" value="${esc(v('name'))}" placeholder="e.g. Maurten Gel 100"></div>
    <div class="field"><label>Carbs (g)</label><input data-fi="carbsG" type="number" inputmode="decimal" min="0" value="${v('carbsG')}"></div>
    <div class="field"><label>Sodium (mg)</label><input data-fi="sodiumMg" type="number" inputmode="numeric" min="0" value="${v('sodiumMg')}"></div>
    <div class="field"><label>Fluid (ml)</label><input data-fi="fluidMl" type="number" inputmode="numeric" min="0" value="${v('fluidMl')}"></div>
    <div class="field"><label>Weight (g)</label><input data-fi="weightG" type="number" inputmode="numeric" min="0" value="${v('weightG')}"></div>
    <div class="btn-row full">
      <button type="button" class="btn small primary" data-act="fuel-item-save">Save item</button>
      <button type="button" class="btn small" data-act="fuel-item-cancel">Cancel</button>
    </div>
  </div>`;
}

function packHtml(session) {
  const plan = store.fuelPlan(session.id) || { items: {} };
  const items = Object.entries(plan.items || {}).filter(([, q]) => q > 0);
  const packedIds = new Set(items.map(([id]) => id));
  const available = allItems().filter(it => !packedIds.has(it.id));
  const formHere = itemForm && itemForm.sessionId === session.id;

  return `
  <ul class="pack">
    ${items.map(([id, qty]) => {
      const it = itemById(id);
      if (!it) return '';
      return `<li data-item="${esc(id)}">
        <span class="pk-text"><span class="pk-name">${esc(it.name)}</span><span class="pk-unit">${esc(perUnit(it))}</span></span>
        <button type="button" class="pk-btn" data-act="fuel-item-edit" aria-label="Edit ${esc(it.name)}">✎</button>
        <button type="button" class="pk-btn" data-act="fuel-dec" aria-label="One fewer">−</button>
        <span class="pk-qty">${qty}</span>
        <button type="button" class="pk-btn" data-act="fuel-inc" aria-label="One more">+</button>
      </li>
      ${formHere && itemForm.itemId === id ? `<li class="pk-form">${itemFormHtml(session.id, it)}</li>` : ''}`;
    }).join('')}
  </ul>
  ${!items.length ? '<p class="small muted" style="margin:0 0 8px">Nothing packed yet. Add what you\'re carrying.</p>' : ''}
  <div class="fuel-add">
    <select data-act="fuel-add" aria-label="Add an item">
      <option value="">+ Add an item…</option>
      ${available.map(it => `<option value="${esc(it.id)}">${esc(it.name)}</option>`).join('')}
      <option value="__custom">＋ Something else (enter from its label)</option>
    </select>
    ${otherPlanId(session.id) && !items.length
      ? '<button type="button" class="btn small" data-act="fuel-copy">Copy last plan</button>' : ''}
  </div>
  ${formHere && itemForm.itemId === null ? itemFormHtml(session.id, null) : ''}`;
}

/** The most recently edited fuel plan on another session, if any has items. */
function otherPlanId(sessionId) {
  const plans = Object.entries(store.state.fuel || {})
    .filter(([id, p]) => id !== sessionId && p && Object.values(p.items || {}).some(q => q > 0))
    .sort((a, b) => (b[1].updatedAt || '').localeCompare(a[1].updatedAt || ''));
  return plans.length ? plans[0][0] : null;
}

export function fuelSection(session) {
  if (!FUEL_TYPES.has(session.type)) return '';
  return `<div class="fuel" data-fuel="${esc(session.id)}">
    <div class="adjust-label">Fuel plan</div>
    ${targetsHtml(session)}
    <div class="fuel-results">${resultsHtml(session)}</div>
    ${packHtml(session)}
  </div>`;
}

// --- wiring -----------------------------------------------------------------

export function wireFuel(container, sessionFor) {
  const box = el => el.closest('.fuel');
  const sessionOf = el => sessionFor(box(el).dataset.fuel);
  const redraw = el => {
    const b = box(el);
    const s = sessionFor(b.dataset.fuel);
    b.outerHTML = fuelSection(s);
  };
  const refreshResults = el => {
    const b = box(el);
    qs('.fuel-results', b).innerHTML = resultsHtml(sessionFor(b.dataset.fuel));
  };
  const items = id => Object.assign({}, (store.fuelPlan(id) || {}).items || {});

  const bump = (el, delta) => {
    const s = sessionOf(el);
    const itemId = el.closest('li').dataset.item;
    const next = items(s.id);
    next[itemId] = Math.max(0, (next[itemId] || 0) + delta);
    if (!next[itemId]) delete next[itemId];
    store.setFuelPlan(s.id, { items: next });
    redraw(el);
  };
  on(container, 'click', '[data-act="fuel-inc"]', (ev, b) => bump(b, +1));
  on(container, 'click', '[data-act="fuel-dec"]', (ev, b) => bump(b, -1));

  container.addEventListener('change', ev => {
    const sel = ev.target.closest('[data-act="fuel-add"]');
    if (!sel || !sel.value) return;
    const s = sessionOf(sel);
    if (sel.value === '__custom') {
      itemForm = { sessionId: s.id, itemId: null };
    } else {
      const next = items(s.id);
      next[sel.value] = (next[sel.value] || 0) + 1;
      store.setFuelPlan(s.id, { items: next });
    }
    redraw(sel);
  });

  on(container, 'click', '[data-act="fuel-copy"]', (ev, b) => {
    const s = sessionOf(b);
    const from = otherPlanId(s.id);
    if (!from) return;
    store.setFuelPlan(s.id, { items: Object.assign({}, store.fuelPlan(from).items) });
    redraw(b);
    toast('Copied — adjust the counts for this run');
  });

  // Targets
  on(container, 'click', '[data-act="fuel-edit-targets"]', (ev, b) => { editing.add(sessionOf(b).id); redraw(b); });
  on(container, 'click', '[data-act="fuel-done-targets"]', (ev, b) => { editing.delete(sessionOf(b).id); redraw(b); });
  on(container, 'click', '[data-act="fuel-reset-targets"]', (ev, b) => {
    const s = sessionOf(b);
    store.setFuelPlan(s.id, { targets: undefined, durationMin: undefined });
    editing.delete(s.id);
    redraw(b);
  });

  container.addEventListener('input', ev => {
    const inp = ev.target.closest('[data-fuel-t]');
    if (!inp) return;
    const s = sessionOf(inp);
    const plan = store.fuelPlan(s.id) || {};
    const val = inp.value === '' ? null : Number(inp.value);
    const [key, idx] = inp.dataset.fuelT.split('.');
    if (key === 'durationMin') {
      store.setFuelPlan(s.id, { durationMin: val || undefined });
    } else {
      const t = Object.assign({}, plan.targets || {});
      if (idx == null) t[key] = val ?? 0;
      else {
        const cur = (t[key] || targetsFor(s)[key]).slice();
        cur[Number(idx)] = val ?? 0;
        t[key] = cur;
      }
      store.setFuelPlan(s.id, { targets: t });
    }
    refreshResults(inp);
  });

  // Item editor — your values for a library item, or an item of your own
  on(container, 'click', '[data-act="fuel-item-edit"]', (ev, b) => {
    const s = sessionOf(b);
    const id = b.closest('li').dataset.item;
    itemForm = itemForm && itemForm.sessionId === s.id && itemForm.itemId === id ? null : { sessionId: s.id, itemId: id };
    redraw(b);
  });
  on(container, 'click', '[data-act="fuel-item-cancel"]', (ev, b) => { itemForm = null; redraw(b); });
  on(container, 'click', '[data-act="fuel-item-save"]', (ev, b) => {
    const form = b.closest('.fuel-item-form');
    const s = sessionOf(b);
    const val = k => qs(`[data-fi="${k}"]`, form).value.trim();
    const num = k => (val(k) === '' ? null : Number(val(k)));
    const name = val('name');
    if (!name) { toast('Give it a name'); return; }
    const id = form.dataset.item || `c-${Date.now().toString(36)}`;
    store.setFuelItem(id, { name, carbsG: num('carbsG') ?? 0, sodiumMg: num('sodiumMg'), fluidMl: num('fluidMl') ?? 0, weightG: num('weightG') });
    if (!form.dataset.item) {
      const next = items(s.id);
      next[id] = (next[id] || 0) + 1;
      store.setFuelPlan(s.id, { items: next });
    }
    itemForm = null;
    redraw(b);
    toast('Saved — used everywhere you pack it');
  });
}
