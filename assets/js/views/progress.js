// Level, XP, achievements — the record of what you have actually done.

import { h, bar, ring, empty } from '../ui.js';
import { state } from '../store.js';
import * as D from '../domain.js';
import * as A from '../actions.js';
import { sectionHead } from './parts.js';

const SOURCES = {
  check: 'Subjects ticked off',
  'day-clear': 'Whole days cleared',
  task: 'Tasks finished',
  'daily-goal': 'Daily goal hit',
  'goal-step': 'Goal progress',
  'goal-done': 'Goals completed',
  achievement: 'Achievements',
};

export function progress() {
  const me = state.me;
  const xp = D.totalXp(me.id);
  const lvl = D.levelInfo(xp);
  const st = D.streak(me.id);
  const events = D.own('xp_events', me.id);
  const achv = A.unlocked(me.id);
  const gotCount = achv.filter((a) => a.got).length;

  const bySource = new Map();
  for (const e of events) bySource.set(e.source, (bySource.get(e.source) || 0) + e.amount);
  const breakdown = [...bySource.entries()].sort((a, b) => b[1] - a[1]);

  return [
    h('header.hero', {}, [
      h('div.eyebrow', { text: 'PROGRESS' }),
      h('h1', { text: `Level ${lvl.level} — ${lvl.title}` }),
      h('p.lede', { text: `${xp.toLocaleString()} XP · ${lvl.need} to the next level · ${gotCount} of ${achv.length} achievements` }),
    ]),

    h('div.grid', {}, [
      h('section.w.wide', {}, [
        h('div.levelcard.big', {}, [
          ring(lvl.pct, 84, 6),
          h('div.lvlbody', {}, [
            h('div.lvltop', {}, [
              h('span.eyebrow', { text: 'LEVEL ' + lvl.level }),
              h('span.lvltitle', { text: lvl.title }),
            ]),
            h('div.lvlxp', {}, [h('b', { text: xp.toLocaleString() }), h('span', { text: 'XP' })]),
            bar(lvl.pct, 'xpbar'),
            h('div.lvlfoot', {}, [
              h('span', { text: `${lvl.into} / ${lvl.span} into this level` }),
              h('span', { text: st ? `${st}-day streak · every point ×${D.multiplier(me.id).toFixed(2)}` : 'Start a streak for a multiplier' }),
            ]),
          ]),
        ]),
      ]),

      h('section.w', {}, [
        sectionHead('XP over 14 days'),
        xpChart(me.id),
      ]),

      h('section.w', {}, [
        sectionHead('Where it came from'),
        breakdown.length
          ? h('div.stack.tight', {}, breakdown.map(([src, amount]) => {
              const top = breakdown[0][1] || 1;
              return h('div.brk', {}, [
                h('div.brktop', {}, [
                  h('span', { text: SOURCES[src] || src }),
                  h('b', { text: amount.toLocaleString() }),
                ]),
                bar((amount / top) * 100, 'thin'),
              ]);
            }))
          : empty('No XP yet', 'Tick something off and it starts here.'),
      ]),

      h('section.w', {}, [
        sectionHead('Reliability by subject'),
        reliability(me.id),
      ]),

      h('section.w.wide', {}, [
        sectionHead('Achievements', h('span.meta', { text: `${gotCount} / ${achv.length}` })),
        h('div.achvgrid', {}, achv.map((a) => h('div.achv' + (a.got ? '.got' : ''), {}, [
          h('span.achvname', { text: a.name }),
          h('span.achvhint', { text: a.hint }),
          h('span.achvxp', { text: '+' + a.xp }),
        ]))),
      ]),
    ]),
  ];
}

function xpChart(ownerId) {
  const days = [];
  for (let i = 13; i >= 0; i -= 1) {
    const d = D.addDays(new Date(), -i);
    days.push({ d, xp: D.xpOn(ownerId, D.iso(d)) });
  }
  const top = Math.max(1, ...days.map((x) => x.xp));
  return h('div.chart', {}, days.map(({ d, xp }) => h('div.chartcol', {
    title: `${D.fmtDay(d)} — ${xp} XP`,
  }, [
    h('div.chartbar', {}, h('i', { style: { height: Math.max(2, (xp / top) * 100) + '%' } })),
    h('span.chartlabel', { text: D.DAY_NAMES[D.dow(d)][0] }),
  ])));
}

/** How often each subject actually gets ticked on the days it is taught. */
function reliability(ownerId) {
  const since = D.trackingSince(ownerId);
  const today = new Date();
  const tally = new Map();

  for (let d = new Date(since); d <= today; d = D.addDays(d, 1)) {
    const checked = D.checkedOn(ownerId, d);
    for (const s of D.subjectsOn(ownerId, d)) {
      const t = tally.get(s.id) || { s, taught: 0, done: 0 };
      t.taught += 1;
      if (checked.has(s.id)) t.done += 1;
      tally.set(s.id, t);
    }
  }

  const list = [...tally.values()].filter((t) => t.taught > 0)
    .sort((a, b) => (a.done / a.taught) - (b.done / b.taught));

  if (!list.length) return empty('Not enough yet', 'This fills in once you have a few days of ticks.');

  return h('div.stack.tight', {}, list.map((t) => {
    const pct = Math.round((t.done / t.taught) * 100);
    return h('div.brk', {}, [
      h('div.brktop', {}, [
        h('span', {}, [
          h('span.cdot', { style: { background: t.s.color || 'var(--ac)' } }),
          h('span', { text: ' ' + t.s.code }),
        ]),
        h('b', { text: `${pct}%` }),
      ]),
      bar(pct, 'thin' + (pct < 50 ? ' bad' : '')),
      h('span.meta', { text: `${t.done} of ${t.taught} days` }),
    ]);
  }));
}
