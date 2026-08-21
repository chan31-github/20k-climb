// Reference — the protocols, as an accordion.

import { esc, on } from '../dom.js';
import { md } from '../md.js';
import { plan } from '../model.js';

const ICON = {
  calendar: '🗓️', ankle: '🦶', gut: '🍫', poles: '🥢', food: '🍚',
  bus: '🚌', strength: '💪', row: '🚣', yoga: '🧘', warning: '⚠️'
};

const ANKLE_FIGURES = [
  { file: 'assets/ankle-1.svg', caption: 'Single-leg balance — 3 × 30s each leg' },
  { file: 'assets/ankle-2.svg', caption: 'Eccentric heel drops — 3 × 15 each leg' },
  { file: 'assets/ankle-3.svg', caption: 'Banded ankle eversion — 3 × 15 each side' },
  { file: 'assets/ankle-4.svg', caption: 'Hop and stick (from Week 6) — 3 × 8 each leg' }
];

const open = new Set();
let root = null;

function ankleFigures() {
  return `
<div class="ankle-figs">
  ${ANKLE_FIGURES.map(f => `
  <figure class="ankle-fig">
    <img src="${f.file}" alt="${esc(f.caption)}" loading="lazy"
         onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'small muted',style:'padding:20px 6px',textContent:'Diagram slot'}))">
    <figcaption>${esc(f.caption)}</figcaption>
  </figure>`).join('')}
</div>`;
}

export function render(container) {
  root = container;
  root.innerHTML = `
<div class="card card-pad">
  <div class="eyebrow" style="margin-bottom:6px">The Deal</div>
  <div class="prose">${md(plan.meta.theDealMd)}</div>
</div>

${plan.protocols.map(p => `
<div class="card acc${open.has(p.id) ? ' open' : ''}" data-protocol="${esc(p.id)}">
  <button class="acc-head" type="button" data-act="toggle" aria-expanded="${open.has(p.id)}">
    <span class="type-ico" aria-hidden="true">${ICON[p.icon] || '•'}</span>
    <span>${esc(p.title)}</span>
    <span class="chev" aria-hidden="true">›</span>
  </button>
  ${open.has(p.id) ? body(p) : ''}
</div>`).join('')}

<p class="small muted center">Plan content lives in <code>data/plan.json</code> — edit it on GitHub and it is live in about a minute.</p>`;

  if (!root.dataset.wiredRef) {
    on(root, 'click', '[data-act="toggle"]', (ev, btn) => {
      const card = btn.closest('[data-protocol]');
      const id = card.dataset.protocol;
      if (open.has(id)) open.delete(id); else open.add(id);
      const existing = card.querySelector('.acc-body');
      card.classList.toggle('open', open.has(id));
      btn.setAttribute('aria-expanded', String(open.has(id)));
      if (existing) existing.remove();
      else card.insertAdjacentHTML('beforeend', body(plan.protocols.find(p => p.id === id)));
    });
    root.dataset.wiredRef = '1';
  }
}

function body(p) {
  return `<div class="acc-body prose">${md(p.bodyMd)}${p.id === 'ankle' ? ankleFigures() : ''}</div>`;
}

export function onLog() {}
export function title() { return 'Reference'; }
