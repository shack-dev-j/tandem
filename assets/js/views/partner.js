// The other half of the app: seeing how the other person is actually doing,
// and being able to say something about it.

import { h, bar, ring, empty, formSheet, toast } from '../ui.js';
import { state, partner } from '../store.js';
import * as D from '../domain.js';
import * as A from '../actions.js';
import { subjectRow, carryGroup, goalCard, taskRow, sectionHead, avatar, refresh } from './parts.js';
import { editGoal } from './goals.js';
import { editTask } from './tasks.js';

export function partnerView() {
  const me = state.me;
  const them = partner();

  if (!them) {
    return [
      h('header.hero', {}, [
        h('div.eyebrow', { text: 'PARTNER' }),
        h('h1', { text: 'No one is connected yet' }),
      ]),
      empty(
        state.mode === 'local' ? 'This device only' : 'Their seat is waiting',
        state.mode === 'local'
          ? 'Tandem is running without a backend, so there is nobody to sync with. Connect one in Settings and the second seat becomes available.'
          : 'Their email has a seat. As soon as they sign in, everything they do appears here.',
        h('a.button.primary', { href: '#/settings', text: 'Open Settings' })),
    ];
  }

  const { date } = D.checklistDay(them.id);
  const subs = D.subjectsOn(them.id, date);
  const done = D.checkedOn(them.id, date);
  const back = D.carried(them.id, date);
  const behind = back.reduce((n, g) => n + g.subjects.length, 0);
  const pct = subs.length ? Math.round((done.size / subs.length) * 100) : 0;
  const xp = D.totalXp(them.id);
  const lvl = D.levelInfo(xp);
  const openTasks = D.own('tasks', them.id).filter((t) => !t.done);
  const overdue = openTasks.filter((t) => t.due_date && t.due_date < D.iso());
  const goals = D.goalsOf(them.id);
  const offTrack = goals.filter((g) => D.goalPace(g)?.behind);

  return [
    h('header.hero.phero', {}, [
      avatar(them, 54),
      h('div', {}, [
        h('div.eyebrow', { text: (them.role === 'partner' ? 'PARTNER' : 'STUDENT').toUpperCase() }),
        h('h1', { text: them.display_name || them.email }),
        h('p.lede', { text: `Level ${lvl.level} · ${lvl.title} · ${xp.toLocaleString()} XP · ${D.streak(them.id)}-day streak` }),
      ]),
    ]),

    h('div.statrow', {}, [
      stat('Today', pct + '%', `${done.size} of ${subs.length} subjects`, pct === 100 ? 'good' : pct === 0 ? 'bad' : ''),
      stat('Carried over', String(behind), behind ? 'still owed' : 'nothing owed', behind ? 'bad' : 'good'),
      stat('Open tasks', String(openTasks.length), overdue.length ? `${overdue.length} overdue` : 'none overdue',
        overdue.length ? 'bad' : ''),
      stat('Goals', `${goals.length - offTrack.length}/${goals.length}`, offTrack.length ? 'some behind' : 'on track',
        offTrack.length ? 'warn' : 'good'),
    ]),

    h('div.grid', {}, [
      h('section.w.wide', {}, [
        sectionHead(`${firstName(them)}'s homework — ${D.fmtDay(date)}`),
        subs.length
          ? h('div.rows', {}, subs.map((s) => subjectRow(them.id, s, date, { readonly: true })))
          : empty('No lessons', 'Nothing on their timetable for this day.'),
        ...back.map((g) => carryGroup(them.id, g, { readonly: true })),
        behind
          ? h('p.warnline', { text: `${behind} subject${behind === 1 ? '' : 's'} have been carried over. Only ${firstName(them)} can tick these off.` })
          : null,
      ]),

      h('section.w', {}, [
        sectionHead('Last 14 days'),
        activityChart(them.id),
      ]),

      h('section.w', {}, [
        sectionHead('Their goals', h('button.small.ghost', {
          text: '+ Set one', onclick: () => editGoal(null, them.id),
        })),
        goals.length
          ? h('div.stack', {}, goals.slice(0, 4).map((g) => goalCard(g, { compact: true })))
          : empty('No goals set', `Set one for ${firstName(them)} and it appears on their home screen.`),
      ]),

      h('section.w', {}, [
        sectionHead('Their open tasks', h('button.small.ghost', {
          text: '+ Add one', onclick: () => editTask(null, them.id),
        })),
        openTasks.length
          ? h('div.stack', {}, openTasks.slice(0, 5).map((t) => taskRow(t)))
          : empty('Nothing open', 'Everything written down is finished.'),
      ]),

      h('section.w.wide', {}, notes(me, them)),
    ]),
  ];
}

const firstName = (m) => (m.display_name || m.email || '').split(/[\s@]/)[0];

function stat(label, value, note, tone = '') {
  return h('div.stat' + (tone ? '.' + tone : ''), {}, [
    h('span.slabel', { text: label }),
    h('b.svalue', { text: value }),
    h('span.snote', { text: note }),
  ]);
}

/** One column per day: how much of that day's homework got ticked. */
function activityChart(ownerId) {
  const school = D.schoolDays(ownerId);
  const cols = [];
  for (let i = 13; i >= 0; i -= 1) {
    const d = D.addDays(new Date(), -i);
    const subs = D.subjectsOn(ownerId, d);
    const done = D.checkedOn(ownerId, d);
    const pct = subs.length ? (done.size / subs.length) * 100 : 0;
    const off = !school.has(D.dow(d));
    cols.push(h('div.chartcol' + (off ? '.off' : ''), {
      title: `${D.fmtDay(d)} — ${subs.length ? `${done.size}/${subs.length}` : 'no lessons'}`,
    }, [
      h('div.chartbar', {}, h('i', { style: { height: Math.max(2, pct) + '%' } })),
      h('span.chartlabel', { text: D.DAY_NAMES[D.dow(d)][0] }),
    ]));
  }
  return h('div.chart', {}, cols);
}

// ------------------------------------------------------------------- notes

function notes(me, them) {
  const thread = state.db.notes
    .filter((n) => (n.author_id === me.id && n.target_id === them.id)
                || (n.author_id === them.id && n.target_id === me.id))
    .sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''));

  const input = h('input.noteinput', {
    placeholder: `Say something to ${firstName(them)}…`,
    onkeydown: (e) => { if (e.key === 'Enter') send(); },
  });

  const send = (kind = 'note') => {
    const body = input.value.trim();
    if (!body) return;
    A.addNote(them.id, body, kind);
    input.value = '';
    toast('Sent', 'ok');
    refresh();
  };

  return [
    sectionHead('Between you two'),
    thread.length
      ? h('div.thread', {}, thread.slice(-25).map((n) => h('div.note' + (n.author_id === me.id ? '.mine' : '') + '.' + n.kind, {}, [
          h('div.notebody', { text: n.body }),
          h('div.notemeta', {
            text: `${n.author_id === me.id ? 'You' : firstName(them)} · ${new Date(n.created_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`,
          }),
        ])))
      : empty('Nothing said yet', 'Notes here are only visible to the two of you.'),
    h('div.noterow', {}, [
      input,
      h('button.ghost.small', { text: 'Nudge', title: 'Send as a nudge', onclick: () => send('nudge') }),
      h('button.primary.small', { text: 'Send', onclick: () => send('note') }),
    ]),
  ];
}
