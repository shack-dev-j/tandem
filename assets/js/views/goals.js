// Goals — the part that is not homework.
//
// A goal is a target plus a log of what you actually did against it. Keeping
// the log rather than a running number is what makes the chart, the streak
// and "am I behind?" all answerable from the same rows.

import { h, formSheet, empty, toast } from '../ui.js';
import { state, partner, memberById } from '../store.js';
import * as D from '../domain.js';
import * as A from '../actions.js';
import { goalCard, sectionHead, registerEditors, refresh, celebrate, trim } from './parts.js';

const KINDS = [
  { value: 'count', label: 'Count' },
  { value: 'minutes', label: 'Minutes' },
  { value: 'percent', label: 'Percent' },
  { value: 'habit', label: 'Habit' },
];

const CADENCES = [
  { value: 'once', label: 'One target' },
  { value: 'daily', label: 'Every day' },
  { value: 'weekly', label: 'Every week' },
  { value: 'monthly', label: 'Every month' },
];

let filter = 'active';

export function goals() {
  const me = state.me;
  const other = partner();

  const mine = D.goalsOf(me.id, { archived: filter === 'archived' });
  const shown = filter === 'done'
    ? mine.filter((g) => g.cadence === 'once' && D.goalProgress(g).complete)
    : filter === 'active'
      // A repeating goal is never "finished" — ticking today's habit must not
      // make it disappear from the list you check every day.
      ? mine.filter((g) => g.cadence !== 'once' || !D.goalProgress(g).complete)
      : mine;

  const tabs = [['active', 'Active'], ['done', 'Completed'], ['archived', 'Archived']];

  return [
    h('header.hero', {}, [
      h('div.eyebrow', { text: 'GOALS' }),
      h('h1', { text: 'What you are aiming at' }),
      h('p.lede', { text: 'Anything you want to move. Log progress as it happens; the streak and the pace look after themselves.' }),
    ]),

    h('div.toolbar', {}, [
      h('div.tabs', {}, tabs.map(([id, label]) => h('button.tab' + (filter === id ? '.on' : ''), {
        text: label, onclick: () => { filter = id; refresh(); },
      }))),
      h('div.spacer'),
      other ? h('button.ghost', {
        text: `Set one for ${other.display_name.split(' ')[0]}`,
        onclick: () => editGoal(null, other.id),
      }) : null,
      h('button.primary', { text: '+ New goal', onclick: () => editGoal(null, me.id) }),
    ]),

    shown.length
      ? h('div.goalgrid', {}, shown.map((g) => h('div', {}, [
          goalCard(g),
          history(g),
        ])))
      : empty(
          filter === 'archived' ? 'Nothing archived' : filter === 'done' ? 'Nothing finished yet' : 'No goals yet',
          'Try: "Read 200 pages this month", "Past paper every Saturday", "Sleep by 11 — every day".',
          h('button.primary', { text: 'Set your first goal', onclick: () => editGoal(null, me.id) })),
  ];
}

/** Last 14 periods, as a row of bars. Small, but it is the honest picture. */
function history(g) {
  const p = D.prefs();
  const step = { daily: 1, weekly: 7, monthly: 30 }[g.cadence] || 0;
  if (!step) {
    const logs = D.own('goal_log', g.owner_id).filter((l) => l.goal_id === g.id);
    if (!logs.length) return null;
    return h('div.loglist', {}, logs.slice(-4).reverse().map((l) => h('div.logline', {}, [
      h('span.meta', { text: D.fmtDay(D.parseDay(l.date)) }),
      h('span', { text: '+' + trim(l.amount) + (g.unit ? ' ' + g.unit : '') }),
      l.note ? h('span.meta.lognote', { text: l.note }) : null,
    ])));
  }

  const bars = [];
  for (let i = 13; i >= 0; i -= 1) {
    const at = D.addDays(new Date(), -i * step);
    const pr = D.goalProgress(g, at, p.weekStart);
    bars.push(h('span.spark' + (pr.complete ? '.on' : pr.done > 0 ? '.part' : ''), {
      title: `${pr.period.from}: ${trim(pr.done)}/${trim(pr.target)}`,
      style: { height: Math.max(4, Math.min(100, pr.pct)) + '%' },
    }));
  }
  return h('div.sparkrow', {}, bars);
}

// ----------------------------------------------------------------- editors

async function editGoal(existing, ownerId) {
  const owner = memberById(ownerId || existing?.owner_id) || state.me;
  const forOther = owner.id !== state.me?.id;

  const values = existing ? { ...existing } : {
    title: '', detail: '', kind: 'count', target: 10, unit: '',
    cadence: 'once', start_date: D.iso(), due_date: '', color: D.prefs().accent,
    pinned: false,
  };

  const out = await formSheet({
    title: existing ? 'Edit goal' : forOther ? `New goal for ${owner.display_name}` : 'New goal',
    submit: existing ? 'Save' : 'Create',
    fields: [
      { name: 'title', label: 'Goal', required: true, placeholder: 'Finish 8 past papers', wide: true },
      { name: 'detail', label: 'Detail', type: 'textarea', rows: 2, placeholder: 'Optional — why, or how', wide: true },
      { group: 'Measure' },
      { name: 'kind', label: 'Measured in', type: 'chips', options: KINDS },
      { name: 'target', label: 'Target', type: 'number', min: 0.5, step: 0.5 },
      { name: 'unit', label: 'Unit', placeholder: 'papers, pages, minutes' },
      { name: 'cadence', label: 'Repeats', type: 'chips', options: CADENCES,
        hint: 'A repeating goal resets each period and builds a streak.' },
      { group: 'When' },
      { name: 'start_date', label: 'Starts', type: 'date' },
      { name: 'due_date', label: 'Deadline', type: 'date', hint: 'Only used for one-off goals.' },
      { group: 'Look' },
      { name: 'color', label: 'Colour', type: 'color' },
      { name: 'pinned', label: 'Pin to the top', type: 'toggle' },
    ],
    values,
  });
  if (!out) return;

  if (existing) A.updateGoal(existing.id, {
    title: out.title, detail: out.detail, kind: out.kind, target: Number(out.target) || 1,
    unit: out.unit, cadence: out.cadence, start_date: out.start_date || D.iso(),
    due_date: out.due_date || null, color: out.color, pinned: Boolean(out.pinned),
  });
  else A.addGoal(owner.id, out);

  toast(existing ? 'Goal updated' : 'Goal set', 'ok');
  refresh();
}

async function logProgress(g) {
  const out = await formSheet({
    title: 'Log progress',
    submit: 'Add',
    fields: [
      { note: g.title },
      { name: 'amount', label: `How much${g.unit ? ' (' + g.unit + ')' : ''}`, type: 'number', min: 0.5, step: 0.5 },
      { name: 'date', label: 'When', type: 'date' },
      { name: 'note', label: 'Note', placeholder: 'Optional', wide: true },
    ],
    values: { amount: g.kind === 'habit' ? 1 : 1, date: D.iso(), note: '' },
  });
  if (!out) return;
  const res = A.logGoal(g, Number(out.amount) || 1, out.note, out.date || D.iso());
  celebrate(res, 'the person whose goal it is');
  if (res.complete) toast(`"${g.title}" — done`, 'gold', 4000);
  refresh();
}

registerEditors({
  goal: (g) => editGoal(g, g?.owner_id),
  log: (g) => logProgress(g),
  newGoal: (ownerId) => editGoal(null, ownerId),
});

export { editGoal, logProgress };
