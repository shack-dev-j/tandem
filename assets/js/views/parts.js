// Pieces that show up on more than one screen.

import { h, bar, toast, xpToast, confirmSheet, formSheet } from '../ui.js';
import { state, memberById, partner, canVerify, needsPartner } from '../store.js';
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

/** One subject on the homework checklist.
 *
 *  Whose row it is decides what you can do with it. Your own you can only send
 *  over; your partner's you can confirm. `late` marks work carried over from an
 *  earlier day.
 */
export function subjectRow(ownerId, s, date, { late = false, readonly = false } = {}) {
  const day = typeof date === 'string' ? date : D.iso(day0(date));
  const done = D.checkedOn(ownerId, D.parseDay(day)).has(s.id);
  const mine = needsPartner(ownerId);
  const sent = D.evidenceFor(ownerId, { subjectId: s.id, date: day });
  const tasks = D.own('tasks', ownerId)
    .filter((t) => t.subject_id === s.id && !t.done)
    .slice(0, 3);

  const canTick = !readonly && canVerify(ownerId);

  const tick = h('button.tick' + (done ? '.on' : '') + (sent && !done ? '.sent' : ''), {
    'aria-label': !canTick ? 'Only your partner can confirm this'
      : done ? 'Reopen ' + s.code : 'Confirm ' + s.code + ' is done',
    disabled: !canTick,
    onclick: () => {
      const res = A.toggleCheck(ownerId, s.id, day, !done);
      if (res.blocked) { toast('Your partner confirms this one, not you', 'warn'); return; }
      celebrate(res, 'your partner');
      if (sent && !done) A.reviewEvidence(sent, false);   // the request is settled
      refresh();
    },
  }, done ? h('span', { text: '✓' }) : null);

  return h('div.subrow' + (done ? '.done' : '') + (late ? '.late' : '') + (sent && !done ? '.pending' : ''), {}, [
    tick,
    h('span.dot', { style: { background: s.color || 'var(--ac)' } }),
    h('div.subtext', {}, [
      h('div.subname', { text: s.name || s.code }),
      tasks.length ? h('div.subtasks', {},
        tasks.map((t) => h('span.subtask', { text: t.title }))) : null,
    ]),
    h('span.subwhen', { text: s.lesson ? D.hhmm(s.lesson.start_min) : '' }),
    mine && !done && !readonly
      ? h('button.send' + (sent ? '.on' : ''), {
          title: sent ? 'Change what you sent' : 'Send this over to be checked',
          text: sent ? 'Sent' : 'Send',
          onclick: () => askToCheck({ subjectId: s.id, date: day, label: s.name || s.code }),
        })
      : null,
    h('span.substate' + (late && !done ? '.warn' : sent && !done ? '.wait' : ''), {
      text: done ? 'Done'
        : sent ? 'Waiting'
        : late ? 'Still open'
        : mine ? 'To do'
        : 'Confirm',
    }),
  ]);
}

const day0 = (d) => (d instanceof Date ? d : new Date(d));

/** The sheet for handing something over. Evidence is optional: showing your
 *  partner the actual page is evidence, it just does not fit in a database. */
export async function askToCheck({ subjectId = null, taskId = null, goalId = null,
                                   date = D.iso(), label = '' }) {
  const other = partner();
  const existing = D.evidenceFor(state.me.id, { subjectId, taskId, goalId, date });

  const out = await formSheet({
    title: existing ? 'Update what you sent' : 'Ask ' + (other ? firstNameOf(other) : 'your partner') + ' to check',
    submit: existing ? 'Update' : 'Send',
    fields: [
      { note: label + (date ? ' · ' + D.fmtDay(D.parseDay(date)) : '') },
      { name: 'note', label: 'Anything to say', type: 'textarea', rows: 2,
        placeholder: 'Optional — "left q7, will ask in class"' },
      { name: 'image', label: 'Photo', type: 'photo', shrink: A.shrinkImage,
        hint: 'Optional. A picture of the finished page is usually enough.' },
    ],
    values: { note: existing?.note || '', image: existing?.image || '' },
    extra: existing ? h('button.linkdanger', {
      type: 'button', text: 'Take it back',
      onclick: () => {
        A.withdrawEvidence(existing.id);
        toast('Withdrawn', 'ok');
        refresh();
        document.querySelector('.overlay .x')?.click();
      },
    }) : null,
  });
  if (!out) return;

  A.submitEvidence({ subjectId, taskId, goalId, date, note: out.note || '', image: out.image || '' });
  toast(other ? `Sent to ${firstNameOf(other)}` : 'Saved — nobody to send it to yet', 'ok');
  refresh();
}

export const firstNameOf = (m) => (m?.display_name || m?.email || '').split(/[\s@]/)[0] || 'them';

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

const taskSent = (t) => D.evidenceFor(t.owner_id, { taskId: t.id, date: null });

export function taskRow(t, { showOwner = false } = {}) {
  const subject = state.db.subjects.find((s) => s.id === t.subject_id);
  const today = D.iso();
  const overdue = !t.done && t.due_date && t.due_date < today;
  const dueToday = !t.done && t.due_date === today;
  const author = t.created_by && t.created_by !== t.owner_id ? memberById(t.created_by) : null;

  return h('div.task' + (t.done ? '.done' : '') + (overdue ? '.over' : ''), {}, [
    h('button.tick' + (t.done ? '.on' : '') + (taskSent(t) ? '.sent' : ''), {
      'aria-label': !canVerify(t.owner_id) ? 'Only your partner can confirm this'
        : t.done ? 'Reopen this task' : 'Confirm this is done',
      disabled: !canVerify(t.owner_id),
      onclick: () => {
        const res = A.toggleTask(t.id, !t.done);
        if (res.blocked) { toast('Your partner confirms this one, not you', 'warn'); return; }
        celebrate(res, 'your partner');
        const sent = taskSent(t);
        if (sent && !t.done) A.reviewEvidence(sent, false);
        refresh();
      },
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
      !t.done && needsPartner(t.owner_id)
        ? h('button.send' + (taskSent(t) ? '.on' : ''), {
            title: 'Send this over to be checked',
            text: taskSent(t) ? 'Sent' : 'Send',
            onclick: () => askToCheck({ taskId: t.id, label: t.title }),
          })
        : null,
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

// -------------------------------------------------------------- reviewing

/** What your partner has sent over. This is the other half of the app: they
 *  do the work, you are the one who says it counts. */
export function reviewList({ compact = false } = {}) {
  const items = D.toReview();
  if (!items.length) {
    return h('p.okline', { text: 'Nothing waiting on you.' });
  }

  const subjects = new Map(state.db.subjects.map((s) => [s.id, s]));

  return h('div.stack', {}, items.slice(0, compact ? 3 : 20).map((ev) => {
    const who = memberById(ev.owner_id);
    const what = ev.subject_id ? (subjects.get(ev.subject_id)?.name || 'A subject')
      : ev.task_id ? (state.db.tasks.find((t) => t.id === ev.task_id)?.title || 'A task')
      : ev.goal_id ? (state.db.goals.find((g) => g.id === ev.goal_id)?.title || 'A goal')
      : 'Something';

    return h('div.review', {}, [
      h('div.reviewtop', {}, [
        h('div', {}, [
          h('div.reviewwhat', { text: what }),
          h('div.meta', {
            text: `${firstNameOf(who)} · ${D.fmtDay(D.parseDay(ev.date))}`,
          }),
        ]),
        h('span.pill.wait', { text: 'To check' }),
      ]),
      ev.note ? h('p.reviewnote', { text: ev.note }) : null,
      ev.image ? h('button.shotlink', {
        title: 'Look at the photo',
        onclick: () => showPhoto(ev, what),
      }, h('img', { src: ev.image, alt: 'Evidence from ' + firstNameOf(who), loading: 'lazy' })) : null,
      h('div.reviewacts', {}, [
        h('button.small.primary', {
          text: 'Confirm',
          onclick: () => {
            const res = A.reviewEvidence(ev, true);
            if (res.blocked) { toast('That one is yours to send, not to confirm', 'warn'); return; }
            celebrate(res, 'your partner');
            toast(`Confirmed for ${firstNameOf(who)}`, 'ok');
            refresh();
          },
        }),
        h('button.small.ghost', {
          text: 'Not yet',
          onclick: async () => {
            if (!await confirmSheet('Send it back?',
              `${firstNameOf(who)} will see that this is not done. Nothing is ticked.`, 'Send back')) return;
            A.reviewEvidence(ev, false);
            toast('Sent back', 'ok');
            refresh();
          },
        }),
      ]),
    ]);
  }));
}

function showPhoto(ev, what) {
  const overlay = h('div.lightbox', {
    onclick: () => overlay.remove(),
  }, [
    h('img', { src: ev.image, alt: 'Evidence for ' + what }),
    h('span.meta', { text: 'Tap anywhere to close' }),
  ]);
  document.body.append(overlay);
}

/** How many things are sitting with you. */
export const reviewCount = () => D.toReview().length;
