// Today. The screen the app exists for.
//
// What appears here, and in what order, is a preference — see Settings.

import { h, bar, ring, empty, toast } from '../ui.js';
import { state, partner } from '../store.js';
import { widgetOrder, WIDGETS } from '../theme.js';
import * as D from '../domain.js';
import * as A from '../actions.js';
import { subjectRow, carryGroup, taskRow, goalCard, sectionHead, avatar,
         celebrate, refresh, reviewList, reviewCount, firstNameOf } from './parts.js';

const WIDE = new Set(['checklist']);

export function home() {
  const me = state.me;
  const p = D.prefs();
  const { date, isToday } = D.checklistDay(me.id);
  const day = D.iso(date);

  const subjects = D.subjectsOn(me.id, date);
  const done = D.checkedOn(me.id, date);
  const back = D.carried(me.id, date);
  const behind = back.reduce((n, g) => n + g.subjects.length, 0);
  const remaining = subjects.filter((s) => !done.has(s.id)).length;
  const pct = subjects.length ? Math.round(((subjects.length - remaining) / subjects.length) * 100) : 0;

  const build = {
    review: () => (reviewCount() ? reviewWidget() : null),
    checklist: () => checklist({ me, date, day, isToday, subjects, done, back, remaining, pct }),
    goals: () => goalsWidget(me),
    tasks: () => tasksWidget(me),
    partner: () => (p.showPartner ? partnerWidget() : null),
    streak: () => streakWidget(me),
    timetable: () => timetableWidget(me, date),
  };

  const cards = [];
  for (const key of widgetOrder(me)) {
    const node = build[key]?.();
    if (node) cards.push(h('section.w' + (WIDE.has(key) ? '.wide' : ''), {}, node));
  }

  return [
    h('header.hero', {}, [
      h('div.eyebrow', { text: isToday ? 'TODAY' : 'NEXT SCHOOL DAY' }),
      h('h1', { text: isToday
        ? `Today — ${D.DAY_NAMES[D.dow(date)]}`
        : `${D.DAY_NAMES[D.dow(date)]} ${D.fmtDate(date)}` }),
      h('p.lede', {
        text: subjects.length
          ? summary(subjects.length, subjects.length - remaining, behind)
          : 'No lessons on this day. Enjoy it.',
      }),
    ]),
    h('div.grid', {}, cards),
  ];
}

function sendEverything(me, day, back) {
  const days = [day, ...back.map((g) => g.date)];
  let n = 0;
  for (const d of days) {
    for (const s of D.pendingOn(me.id, D.parseDay(d))) {
      if (D.evidenceFor(me.id, { subjectId: s.id, date: d })) continue;
      A.submitEvidence({ subjectId: s.id, date: d });
      n += 1;
    }
  }
  toast(n ? `${n} sent to ${firstNameOf(partner())}` : 'Everything is already sent', 'ok');
  refresh();
}

function summary(total, doneCount, behind) {
  const bits = [`${total} subject${total === 1 ? '' : 's'}`,
                `${doneCount} done`,
                `${total - doneCount} left`];
  if (behind) bits.push(`${behind} carried over`);
  return bits.join(' · ');
}

// ---------------------------------------------------------------- checklist

function checklist({ me, date, day, subjects, done, back, remaining, pct }) {
  if (!subjects.length && !back.length) {
    return empty('Nothing set', 'There are no lessons on this day, so there is no homework to carry.');
  }

  const outstanding = remaining + back.reduce((n, g) => n + g.subjects.length, 0);
  const alone = !partner();

  return [
    // Ticking your own work is the fallback, not the design. Say so, or the
    // first thing anyone notices is that the one rule the app is built on
    // does not appear to apply.
    alone ? h('div.solonote', {}, [
      h('span', { text: 'Nobody is confirming your work yet, so you are ticking your own.' }),
      h('a', { href: '#/settings', text: 'Connect the other person →' }),
    ]) : null,

    h('div.progresscard', {}, [
      ring(pct, 54, 5),
      h('div.pgtext', {}, [
        h('div.pgtitle', { text: 'Homework for ' + D.DAY_NAMES[D.dow(date)] }),
        h('div.pgsub', {
          text: partner()
            ? `${subjects.length - remaining} of ${subjects.length} confirmed by ${firstNameOf(partner())}`
            : `${subjects.length - remaining} of ${subjects.length} ticked off`,
        }),
      ]),
      h('div.pgacts', {}, [
        outstanding
          ? (partner()
              ? h('button.ghost', {
                  text: `Send all ${outstanding} to ${firstNameOf(partner())}`,
                  onclick: () => sendEverything(me, day, back),
                })
              : h('button.primary', {
                  text: `Check all (${outstanding})`,
                  onclick: () => { celebrate(A.checkAll(me.id, day, true), 'you'); refresh(); },
                }))
          : h('span.alldone', { text: 'All clear' }),
      ]),
    ]),

    h('div.rows', {}, subjects.map((s) => subjectRow(me.id, s, day))),

    ...back.map((g) => carryGroup(me.id, g)),
  ];
}

// ------------------------------------------------------------------ widgets

function reviewWidget() {
  const n = reviewCount();
  return [
    sectionHead('Waiting on you', h('span.pill.wait', { text: String(n) })),
    h('p.meta', { text: 'Your partner has finished these and needs you to confirm.' }),
    reviewList({ compact: true }),
  ];
}

function goalsWidget(me) {
  const goals = D.goalsOf(me.id).slice(0, 3);
  return [
    sectionHead('Goals', h('a.more', { href: '#/goals', text: 'All →' })),
    goals.length
      ? h('div.stack', {}, goals.map((g) => goalCard(g, { compact: true })))
      : empty('No goals yet', 'A goal is anything you want to move — pages read, past papers done, hours slept.',
          h('a.button.primary', { href: '#/goals', text: 'Set one' })),
  ];
}

function tasksWidget(me) {
  const today = D.iso();
  const open = D.own('tasks', me.id).filter((t) => !t.done);
  const soon = open.filter((t) => t.due_date && t.due_date <= today)
    .sort((a, b) => (a.due_date || '').localeCompare(b.due_date || ''));
  const rest = open.filter((t) => !soon.includes(t)).slice(0, 3);

  return [
    sectionHead('Needs you now', h('a.more', { href: '#/tasks', text: 'All →' })),
    soon.length || rest.length
      ? h('div.stack', {}, [...soon, ...rest].slice(0, 5).map((t) => taskRow(t)))
      : empty('Nothing outstanding', 'Write homework down the moment it is set and it will show up here.'),
  ];
}

function partnerWidget() {
  const other = partner();
  if (!other) {
    return [
      sectionHead('Your partner'),
      empty('No one connected yet',
        state.mode === 'local'
          ? 'Connect a backend in Settings and invite the other person.'
          : 'They have a seat but have not signed in yet.'),
    ];
  }

  const back = D.carried(other.id).reduce((n, g) => n + g.subjects.length, 0);
  const { date } = D.checklistDay(other.id);
  const subs = D.subjectsOn(other.id, date);
  const doneSet = D.checkedOn(other.id, date);
  const pct = subs.length ? Math.round((doneSet.size / subs.length) * 100) : 0;
  const lvl = D.levelInfo(D.totalXp(other.id));

  return [
    sectionHead('Your partner', h('a.more', { href: '#/partner', text: 'Open →' })),
    h('div.pcard', {}, [
      avatar(other, 40),
      h('div', {}, [
        h('div.pname', { text: other.display_name || other.email }),
        h('div.meta', { text: `Level ${lvl.level} · ${D.streak(other.id)}-day streak` }),
      ]),
      h('div.pstat', {}, [h('b', { text: pct + '%' }), h('span', { text: 'today' })]),
    ]),
    bar(pct),
    back
      ? h('p.warnline', { text: `${back} subject${back === 1 ? '' : 's'} carried over` })
      : h('p.okline', { text: 'Nothing carried over' }),
  ];
}

function streakWidget(me) {
  const xp = D.totalXp(me.id);
  const lvl = D.levelInfo(xp);
  const st = D.streak(me.id);
  const days = D.activeDays(me.id);
  const p = D.prefs();

  const dots = [];
  for (let i = 6; i >= 0; i -= 1) {
    const d = D.addDays(new Date(), -i);
    dots.push(h('span.wd' + (days.has(D.iso(d)) ? '.on' : ''), {
      title: D.fmtDay(d),
    }, h('i', { text: D.DAY_NAMES[D.dow(d)][0] })));
  }

  return [
    sectionHead('Progress', h('a.more', { href: '#/progress', text: 'Detail →' })),
    h('div.levelcard', {}, [
      h('div.lvltop', {}, [
        h('span.eyebrow', { text: 'LEVEL ' + lvl.level }),
        h('span.lvltitle', { text: lvl.title }),
      ]),
      h('div.lvlxp', {}, [h('b', { text: xp.toLocaleString() }), h('span', { text: 'XP' })]),
      bar(lvl.pct, 'xpbar'),
      h('div.lvlfoot', {}, [
        h('span', { text: `${lvl.need} XP to level ${lvl.level + 1}` }),
        h('span', { text: st ? `${st}-day streak · ×${D.multiplier(me.id).toFixed(2)}` : 'No streak yet' }),
      ]),
    ]),
    h('div.weekdots', {}, dots),
    h('p.meta.center', { text: `Daily goal: ${p.dailyGoal} tasks` }),
  ];
}

function timetableWidget(me, date) {
  const lessons = D.lessonsOn(me.id, date);
  const byId = D.subjectMap(me.id);
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
  const isToday = D.iso(date) === D.iso();

  return [
    sectionHead(isToday ? "Today's lessons" : D.DAY_NAMES[D.dow(date)] + "'s lessons",
      h('a.more', { href: '#/timetable', text: 'Week →' })),
    lessons.length
      ? h('div.lessons', {}, lessons.map((l) => {
          const s = byId.get(l.subject_id);
          const live = isToday && nowMin >= l.start_min && nowMin < l.end_min;
          const past = isToday && nowMin >= l.end_min;
          return h('div.lesson' + (live ? '.live' : '') + (past ? '.past' : ''), {}, [
            h('span.ltime', { text: D.hhmm(l.start_min) }),
            h('span.ldot', { style: { background: s?.color || 'var(--ac)' } }),
            h('span.lname', { text: s?.name || l.title || '—' }),
            h('span.lroom', { text: l.room || '' }),
            live ? h('span.pill.live', { text: 'now' }) : null,
          ]);
        }))
      : empty('No lessons', 'Nothing on the timetable for this day.'),
  ];
}
