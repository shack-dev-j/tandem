// Tasks — homework written down, by subject.

import { h, formSheet, empty, toast } from '../ui.js';
import { state, partner, memberById } from '../store.js';
import * as D from '../domain.js';
import * as A from '../actions.js';
import { taskRow, registerEditors, refresh } from './parts.js';

let subjectFilter = null;
let showDone = false;
let owner = null;   // whose list you are looking at

export function tasks() {
  const me = state.me;
  const other = partner();
  const who = owner && memberById(owner) ? memberById(owner) : me;

  const all = D.own('tasks', who.id);
  const subs = D.subjectsOf(who.id);
  const open = all.filter((t) => !t.done);

  let list = showDone ? all.filter((t) => t.done) : open;
  if (subjectFilter) list = list.filter((t) => t.subject_id === subjectFilter);

  list = list.sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    const ad = a.due_date || '9999', bd = b.due_date || '9999';
    if (ad !== bd) return ad.localeCompare(bd);
    return (b.priority || 0) - (a.priority || 0);
  });

  const counts = new Map();
  for (const t of all) {
    const c = counts.get(t.subject_id) || { done: 0, total: 0 };
    c.total += 1;
    if (t.done) c.done += 1;
    counts.set(t.subject_id, c);
  }

  return [
    h('header.hero', {}, [
      h('div.eyebrow', { text: 'TASKS' }),
      h('h1', { text: who.id === me.id ? 'Everything written down' : `${who.display_name}'s tasks` }),
      h('p.lede', { text: `${open.length} open · ${all.length - open.length} finished` }),
    ]),

    h('div.toolbar', {}, [
      other ? h('div.tabs', {}, [me, other].map((m) => h('button.tab' + (who.id === m.id ? '.on' : ''), {
        text: m.id === me.id ? 'Mine' : m.display_name.split(' ')[0],
        onclick: () => { owner = m.id; subjectFilter = null; refresh(); },
      }))) : null,
      h('div.spacer'),
      h('button.tab' + (showDone ? '.on' : ''), {
        text: showDone ? 'Showing finished' : 'Show finished',
        onclick: () => { showDone = !showDone; refresh(); },
      }),
      h('button.primary', { text: '+ New task', onclick: () => editTask(null, who.id) }),
    ]),

    h('div.chiprow', {}, [
      h('button.chip' + (!subjectFilter ? '.on' : ''), {
        text: 'All', onclick: () => { subjectFilter = null; refresh(); },
      }),
      ...subs.map((s) => {
        const c = counts.get(s.id) || { done: 0, total: 0 };
        const on = subjectFilter === s.id;
        return h('button.chip' + (on ? '.on' : ''), {
          style: on ? { borderColor: s.color, color: s.color } : {},
          onclick: () => { subjectFilter = on ? null : s.id; refresh(); },
        }, [
          h('span.cdot', { style: { background: s.color || 'var(--ac)' } }),
          h('span', { text: s.code }),
          c.total ? h('span.ccount', { text: `${c.done}/${c.total}` }) : null,
        ]);
      }),
    ]),

    list.length
      ? h('div.stack', {}, list.map((t) => taskRow(t, { showOwner: who.id !== me.id })))
      : empty(showDone ? 'Nothing finished yet' : 'Nothing open',
          'Write homework down the moment it is set — that is the whole trick.',
          h('button.primary', { text: 'Add a task', onclick: () => editTask(null, who.id) })),
  ];
}

export async function editTask(existing, ownerId) {
  const who = memberById(ownerId || existing?.owner_id) || state.me;
  const subs = D.subjectsOf(who.id);
  const forOther = who.id !== state.me?.id;

  const out = await formSheet({
    title: existing ? 'Edit task' : forOther ? `New task for ${who.display_name}` : 'New task',
    submit: existing ? 'Save' : 'Add',
    fields: [
      { name: 'title', label: 'Task', required: true, wide: true,
        placeholder: 'Oxford Pure Maths — exercises 1.1 and 1.2' },
      { name: 'subject_id', label: 'Subject', type: 'chips',
        options: [{ value: '', label: 'None' },
                  ...subs.map((s) => ({ value: s.id, label: s.code, color: s.color }))] },
      // Two short fields next to each other; the wide chip row goes after them
      // so the grid does not leave a hole beside a half-width control.
      { name: 'due_date', label: 'Due', type: 'date' },
      { name: 'est_minutes', label: 'Rough minutes', type: 'number', min: 5, step: 5 },
      { name: 'priority', label: 'Priority', type: 'chips',
        options: [{ value: 0, label: 'Low' }, { value: 1, label: 'Normal' }, { value: 2, label: 'High' }] },
      { name: 'notes', label: 'Notes', type: 'textarea', rows: 2, wide: true },
    ],
    values: existing
      ? { ...existing, subject_id: existing.subject_id || '', due_date: existing.due_date || '' }
      : { title: '', subject_id: subs[0]?.id || '', due_date: '', priority: 1,
          est_minutes: 30, notes: '' },
  });
  if (!out) return;

  const patch = {
    title: out.title, subject_id: out.subject_id || null, due_date: out.due_date || null,
    priority: Number(out.priority), est_minutes: Number(out.est_minutes) || 30, notes: out.notes,
  };
  if (existing) A.updateTask(existing.id, patch);
  else A.addTask(who.id, patch);

  toast(existing ? 'Task updated' : 'Task added', 'ok');
  refresh();
}

registerEditors({ task: (t) => editTask(t, t?.owner_id) });

export function quickAdd() {
  editTask(null, state.me?.id);
}
