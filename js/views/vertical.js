// Vertical Bank — the number that goes up.

import { esc, on, toast } from '../dom.js';
import { store } from '../store.js';
import { plan, verticalByWeek, totalVertical, totals, currentWeekNumber } from '../model.js';
import { todayISO, formatShort, hhmm } from '../dates.js';

let root = null;

function chart(byWeek) {
  const W = 320, H = 108, padL = 22, padR = 4, padB = 14, padT = 6;
  const max = Math.max(600, ...byWeek.map(w => w.gain));
  const step = (W - padL - padR) / byWeek.length;
  const bw = Math.max(6, step * 0.62);
  const y = v => padT + (H - padT - padB) * (1 - v / max);
  const current = currentWeekNumber();

  const gridValues = [0, max / 2, max];
  const grid = gridValues.map(v => `
    <line class="b-grid" x1="${padL}" x2="${W - padR}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}"></line>
    <text class="b-gridlab" x="${padL - 3}" y="${(y(v) + 2).toFixed(1)}" text-anchor="end">${Math.round(v)}</text>`).join('');

  const bars = byWeek.map((w, i) => {
    const x = padL + i * step + (step - bw) / 2;
    const h = Math.max(w.gain > 0 ? 1.5 : 1, (H - padT - padB) * (w.gain / max));
    return `
    <rect class="b-bar${w.gain ? '' : ' zero'}" x="${x.toFixed(1)}" y="${(H - padB - h).toFixed(1)}"
          width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="1.5"
          opacity="${w.number === current ? 1 : 0.85}"><title>Week ${w.number}: ${w.gain.toLocaleString()} m</title></rect>
    ${i % 2 === 0 || w.number === current ? `<text class="b-lab" x="${(x + bw / 2).toFixed(1)}" y="${H - 4}" text-anchor="middle">${w.number}</text>` : ''}`;
  }).join('');

  return `<div class="chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Metres climbed per week">${grid}${bars}</svg></div>`;
}

function milestones(total, target) {
  const list = plan.meta.milestones;
  const pct = Math.min(100, (total / target) * 100);
  return `
<div class="milestones">
  <div class="mbar"><span style="width:${pct.toFixed(1)}%"></span></div>
  <div class="mticks">
    ${list.map(m => {
      const left = Math.min(97, (m.m / target) * 100);
      return `<div class="mtick${total >= m.m ? ' passed' : ''}" style="left:${left.toFixed(1)}%"><i></i>${(m.m / 1000)}k</div>`;
    }).join('')}
  </div>
</div>`;
}

export function render(container) {
  root = container;
  const target = plan.meta.verticalTargetM;
  const total = totalVertical();
  const t = totals();
  const byWeek = verticalByWeek();
  const next = plan.meta.milestones.find(m => m.m > total);
  const passed = [...plan.meta.milestones].reverse().find(m => total >= m.m);

  root.innerHTML = `
<div class="card">
  <div class="bank-total">
    <div class="bank-figure">${total.toLocaleString()}<span class="bank-unit"> m</span></div>
    <div class="bank-sub">
      of ${target.toLocaleString()} m · ${((total / target) * 100).toFixed(1)}%
      ${next ? `<br>${(next.m - total).toLocaleString()} m to <b>${esc(next.label)}</b>` : '<br><b>Everest. Twice. Done.</b>'}
    </div>
    ${passed ? `<div class="badges" style="justify-content:center;margin-top:10px"><span class="badge peak">${esc(passed.label)}</span></div>` : ''}
  </div>
  ${milestones(total, target)}
</div>

<div class="card">
  <div class="card-pad" style="padding-bottom:0">
    <div class="eyebrow">Metres per week</div>
  </div>
  ${chart(byWeek)}
</div>

<div class="card">
  <div class="rc-stats">
    <div class="rc-stat"><b>${t.sessions}</b><span>Sessions</span></div>
    <div class="rc-stat"><b>${hhmm(t.minutes) || '0 min'}</b><span>Time</span></div>
    <div class="rc-stat"><b>${t.distance.toFixed(1)}</b><span>km</span></div>
  </div>
</div>

<div class="card">
  <div class="card-pad" style="padding-bottom:6px"><div class="eyebrow">Achievements</div></div>
  <ul class="ach-list">
    ${plan.achievements.map(a => {
      const when = store.achievement(a.id);
      const manual = !a.auto;
      return `<li>
        <button class="ach${when ? ' earned' : ''}" type="button" data-ach="${esc(a.id)}" ${manual ? '' : 'data-auto="1"'}>
          <span class="box">✓</span>
          <span>
            <span class="a-label">${esc(a.label)}</span>
            <span class="a-hint">${esc(a.hint)}${a.dueDate ? ` · by ${formatShort(a.dueDate)}` : ''}</span>
          </span>
          ${when ? `<span class="a-when">${formatShort(when)}</span>` : (manual ? '' : '<span class="a-lock">auto</span>')}
        </button>
      </li>`;
    }).join('')}
  </ul>
</div>

<p class="small muted center">Metres come from the <b>Climb (m)</b> field on each session.</p>`;

  if (!root.dataset.wiredVert) {
    on(root, 'click', '[data-ach]', (ev, btn) => {
      const id = btn.dataset.ach;
      if (btn.dataset.auto && !store.achievement(id)) {
        toast('This one unlocks itself when you log it.');
        return;
      }
      store.setAchievement(id, store.achievement(id) ? null : todayISO());
      render(root);
    });
    root.dataset.wiredVert = '1';
  }
}

export function onLog() {
  if (root && root.isConnected) render(root);
}

export function title() { return 'Vertical Bank'; }
