// Pieces that show up on more than one screen.

import { h, bar, toast, xpToast, confirmSheet } from '../ui.js';
import { state, memberById } from '../store.js';
import * as D from '../domain.js';
import * as A from '../actions.js';

export const rerender = { fn: () => {} };
export const refresh = () => rerender.fn();

export function celebrate(res, what) {
  if (res?.blocked) { toast('Only ' + what + ' can tick that off', 'warn'); return; }
  xpToast(res?.xp || 0);
  for (const a of res?.won || []) toast(`Achievement — ${a.name}`, 'gold', 4200);
}

// --------------------------------------------------------------- checklist

/** One subject on the homework checklist. `late` marks work carried over
 *  from an earlier day, which is the whole point of the carry-over. */
export function subjectRow(ownerId, s, date, { late = false, readonly = false } = {}) {
  const day = typeof date === 'string' ? date : D.iso(date);
  const done = D.checkedOn(ownerId, D.parseDay(day)).has(s.id);
  const tasks = D.own('tasks', ownerId)
    .filter((t) => t.subject_id === s.id && !t.done)
    .slice(0, 3);

  const tick = h('button.tick' + (done ? '.on' : ''), {
    'aria-label': (done ? 'Untick ' : 'Tick off ') + s.code,
    disabled: readonly,
    onclick: () => {
      const res = A.toggleCheck(ownerId, s.id, day, !done);
      celebrate(res, 'the person it belongs to');
      refresh();
    },
  }, done ? h('span', { text: '✓' }) : null);

  return h('div.subrow' + (done ? '.done' : '') + (late ? '.late' : ''), {}, [
    tick,
    h('span.dot', { style: { background: s.color || 'var(--ac)' } }),
    h('div.subtext', {}, [
      h('div.subname', { text: s.name || s.code }),
      tasks.length ? h('div.subtasks', {},
        tasks.map((t) => h('span.subtask', { text: t.title }))) : null,
    ]),
    h('span.subwhen', { text: s.lesson ? D.hhmm(s.lesson.start_min) : '' }),
    h('span.substate' + (late ? '.warn' : ''), {
      text: done ? 'Done' : late ? 'Still open' : 'To do',
    }),
  ]);
}

export function carryGroup(ownerId, group, opts = {}) {
  return h('div.carry', {}, [
    h('div.carryhead', {}, [
      h('span.eyebrow', { text: 'STILL FROM ' + group.day.toUpperCase() }),
      h('span.meta', { text: D.ago(group.daysAgo) }),
    ]),
    h('div.rows', {}, group.subjects.map((s) => subjectRow(ownerId, s, group.date, { ...opts, late: true }))),
  ]);
}

// -------------------------------------------------------------------- task

export function taskRow(t, { showOwner = false } = {}) {
  const subject = state.db.subjects.find((s) => s.id === t.subject_id);
  const today = D.iso();
  const overdue = !t.done && t.due_date && t.due_date < today;
  const dueToday = !t.done && t.due_date === today;
  const author = t.created_by && t.created_by !== t.owner_id ? memberById(t.created_by) : null;

  return h('div.task' + (t.done ? '.done' : '') + (overdue ? '.over' : ''), {}, [
    h('button.tick' + (t.done ? '.on' : ''), {
      'aria-label': t.done ? 'Reopen task' : 'Mark done',
      onclick: () => { celebrate(A.toggleTask(t.id, !t.done)); refresh(); },
    }, t.done ? h('span', { text: '✓' }) : null),
    h('div.taskmain', {}, [
      h('div.tasktitle', { text: t.title }),
      h('div.taskmeta', {}, [
        subject ? h('span.pill', {
          text: subject.code,
          style: { color: subject.color || 'var(--muted)', borderColor: 'var(--line)' },
        }) : null,
        t.priority === 2 ? h('span.pill.hot', { text: 'High' }) : null,
        t.due_date ? h('span.meta' + (overdue ? '.red' : dueToday ? '.ac' : ''), {
          text: overdue ? 'Overdue' : dueToday ? 'Due today' : 'Due ' + D.fmtDay(D.parseDay(t.due_date)),
        }) : null,
        author ? h('span.meta', { text: 'set by ' + author.display_name }) : null,
        showOwner ? h('span.meta', { text: memberById(t.owner_id)?.display_name || '' }) : null,
      ]),
      t.notes ? h('div.tasknotes', { text: t.notes }) : null,
    ]),
    h('div.taskacts', {}, [
      h('button.icon', { title: 'Edit', text: '✎', onclick: () => editTask(t) }),
      h('button.icon', {
        title: 'Delete', text: '🗑',
        onclick: async () => {
          if (await confirmSheet('Delete task?', `"${t.title}" will be removed.`)) {
            A.deleteTask(t.id); refresh();
          }
        },
      }),
    ]),
  ]);
}

// Editors live here so any screen showing a task can offer them.
let editors = { task: () => {}, goal: () => {} };
export function registerEditors(e) { editors = { ...editors, ...e }; }
export const editTask = (t) => editors.task(t);
export const editGoal = (g) => editors.goal(g);

// -------------------------------------------------------------------- goal

export function goalCard(g, { readonly = false, compact = false } = {}) {
  const p = D.prefsOf(g.owner_id);
  const prog = D.goalProgress(g, new Date(), p.weekStart);
  const pace = D.goalPace(g);
  const streak = D.goalStreak(g, new Date(), p.weekStart);
  const color = g.color || 'var(--ac)';
  const mine = g.owner_id === state.me?.id;
  const author = g.created_by && g.created_by !== g.owner_id ? memberById(g.created_by) : null;

  const step = () => {
    const amount = g.kind === 'habit' ? 1 : Number(g.target) / 5 || 1;
    const res = A.logGoal(g, g.kind === 'habit' ? 1 : Math.max(1, Math.round(amount)));
    celebrate(res, 'the person whose goal it is');
    if (res.complete) toast(`"${g.title}" — done`, 'gold', 4000);
    refresh();
  };

  return h('div.goal' + (prog.complete ? '.complete' : '') + (compact ? '.compact' : ''), {
    style: { '--gc': color },
  }, [
    h('div.goaltop', {}, [
      h('div', {}, [
        h('div.goaltitle', { text: g.title }),
        h('div.goalmeta', {}, [
          h('span.meta', { text: `${trim(prog.done)} / ${trim(prog.target)}${g.unit ? ' ' + g.unit : ''} ${prog.period.label}` }),
          g.cadence !== 'once' && streak > 0
            ? h('span.pill.streak', { text: `${streak}× in a row` }) : null,
          pace ? h('span.pill.' + pace.state, {
            text: pace.state === 'done' ? 'Complete'
              : pace.state === 'missed' ? 'Past due'
              : pace.state === 'ahead' ? 'On track'
              : `${trim(pace.perDay)}/day to catch up`,
          }) : null,
          author ? h('span.meta', { text: 'set by ' + author.display_name }) : null,
        ]),
      ]),
      h('div.goalpct', { text: prog.pct + '%' }),
    ]),
    bar(prog.pct, 'goalbar'),
    g.detail && !compact ? h('p.goaldetail', { text: g.detail }) : null,
    readonly ? null : h('div.goalacts', {}, [
      mine ? h('button.small.primary', { text: g.kind === 'habit' ? 'Did it' : '+ Progress', onclick: step }) : null,
      mine ? h('button.small.ghost', { text: 'Log…', onclick: () => editors.log(g) }) : null,
      h('button.small.ghost', { text: 'Edit', onclick: () => editGoal(g) }),
    ]),
  ]);
}

const trim = (n) => (Math.round(Number(n) * 10) / 10).toString();
export { trim };

// ------------------------------------------------------------------ chrome

export function sectionHead(title, right) {
  return h('div.sechead', {}, [h('h3', { text: title }), right || null]);
}

export function syncPill() {
  const { mode, sync, outbox } = state;
  if (mode === 'local') {
    return h('span.sync.local', { title: 'Saved on this device only', text: 'Local' });
  }
  const pending = outbox.length;
  if (pending) return h('span.sync.wait', { text: `${pending} to sync` });
  if (sync.status === 'offline') return h('span.sync.off', { title: sync.error || '', text: 'Offline' });
  if (sync.status === 'syncing') return h('span.sync.go', { text: 'Syncing' });
  return h('span.sync.ok', { title: sync.at ? 'Synced ' + new Date(sync.at).toLocaleTimeString() : '', text: 'Synced' });
}

export function avatar(m, size = 30) {
  const initial = (m?.display_name || m?.email || '?').trim().charAt(0).toUpperCase();
  return h('span.avatar', {
    style: { width: size + 'px', height: size + 'px', fontSize: Math.round(size * 0.42) + 'px' },
    text: initial,
  });
}
