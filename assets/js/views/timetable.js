// The week grid. Click any cell to change it.

import { h, formSheet, confirmSheet, toast } from '../ui.js';
import { state, remove, patch as patchRow } from '../store.js';
import { PERIODS } from '../seed.js';
import * as D from '../domain.js';
import * as A from '../actions.js';
import { refresh } from './parts.js';

export function timetable() {
  const me = state.me;
  const subs = D.subjectsOf(me.id);
  const byId = D.subjectMap(me.id);
  const lessons = D.own('lessons', me.id);
  const periods = periodList(lessons);
  const days = [...D.schoolDays(me.id)].sort((a, b) => a - b);
  const todayDow = D.dow(new Date());
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();

  const at = (dow, period) => lessons.find((l) => l.dow === dow && l.period === period);

  const head = h('div.trow.thead', {}, [
    h('div.tcell.tcorner', {}, ''),
    ...days.map((d) => h('div.tcell.tday' + (d === todayDow ? '.now' : ''), {},
      h('span', { text: D.DAY_NAMES[d].slice(0, 3) }))),
  ]);

  const body = periods.map((p) => h('div.trow', {}, [
    h('div.tcell.tperiod', {}, [
      h('b', { text: 'P' + p.period }),
      h('span', { text: D.hhmm(p.start) }),
    ]),
    ...days.map((d) => {
      const l = at(d, p.period);
      const s = l ? byId.get(l.subject_id) : null;
      const live = d === todayDow && l && nowMin >= l.start_min && nowMin < l.end_min;
      return h('button.tcell.tslot' + (l ? '.filled' : '.free') + (live ? '.live' : ''), {
        style: s?.color ? { '--sc': s.color } : {},
        onclick: () => editCell(me.id, d, p, l, subs),
      }, l ? [
        h('span.tcode', { text: s?.code || l.title || '—' }),
        l.room ? h('span.troom', { text: l.room }) : null,
      ] : h('span.tplus', { text: '+' }));
    }),
  ]));

  return [
    h('header.hero', {}, [
      h('div.eyebrow', { text: 'TIMETABLE' }),
      h('h1', { text: 'Your week' }),
      h('p.lede', { text: `${lessons.length} lessons across ${days.length} days. Click a cell to change it.` }),
    ]),
    h('div.tablewrap', {}, h('div.ttable', {}, [head, ...body])),
    h('div.toolbar', {}, [
      h('div.spacer'),
      h('button.ghost', { text: 'Manage subjects', onclick: () => manageSubjects(me.id) }),
    ]),
  ];
}

/** Rows to draw: the standard bells, plus any period a lesson invented. */
function periodList(lessons) {
  const map = new Map(PERIODS.map((p) => [p.period, { ...p }]));
  for (const l of lessons) {
    if (!map.has(l.period)) map.set(l.period, { period: l.period, start: l.start_min, end: l.end_min });
  }
  return [...map.values()].sort((a, b) => a.period - b.period);
}

async function editCell(ownerId, dow, p, lesson, subs) {
  const out = await formSheet({
    title: `${D.DAY_NAMES[dow]} · period ${p.period}`,
    submit: 'Save',
    fields: [
      { name: 'subject_id', label: 'Subject', type: 'chips',
        options: [{ value: '', label: 'Free' },
                  ...subs.map((s) => ({ value: s.id, label: s.code, color: s.color }))] },
      { name: 'room', label: 'Room' },
      { name: 'teacher', label: 'Teacher' },
      { group: 'Times' },
      { name: 'start', label: 'Starts', type: 'time' },
      { name: 'end', label: 'Ends', type: 'time' },
    ],
    values: {
      subject_id: lesson?.subject_id || '',
      room: lesson?.room || '', teacher: lesson?.teacher || '',
      start: D.hhmm(lesson?.start_min ?? p.start),
      end: D.hhmm(lesson?.end_min ?? p.end),
    },
    extra: lesson ? h('button.linkdanger', {
      type: 'button', text: 'Clear this period',
      onclick: async () => {
        remove('lessons', lesson.id);
        toast('Period cleared', 'ok');
        refresh();
        document.querySelector('.overlay .x')?.click();
      },
    }) : null,
  });
  if (!out) return;

  if (!out.subject_id) {
    if (lesson) { remove('lessons', lesson.id); toast('Period cleared', 'ok'); refresh(); }
    return;
  }
  const s = subs.find((x) => x.id === out.subject_id);
  A.setLesson(ownerId, dow, p.period, {
    subject_id: out.subject_id,
    title: s?.name || s?.code || '',
    room: out.room, teacher: out.teacher,
    start_min: toMin(out.start, p.start),
    end_min: toMin(out.end, p.end),
  });
  toast('Timetable updated', 'ok');
  refresh();
}

function toMin(hhmm, fallback) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || '').trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : fallback;
}

export async function manageSubjects(ownerId) {
  const subs = D.subjectsOf(ownerId);
  const list = h('div.stack');

  const paint = () => {
    list.replaceChildren();
    for (const s of D.subjectsOf(ownerId)) {
      list.append(h('div.subedit', {}, [
        h('input', {
          type: 'color', value: s.color || '#E2C044',
          oninput: (e) => patchRow('subjects', s.id, { color: e.target.value }),
        }),
        h('input.grow', {
          value: s.code,
          onchange: (e) => patchRow('subjects', s.id, { code: e.target.value.trim() || s.code }),
        }),
        h('input.grow', {
          value: s.name, placeholder: 'Full name',
          onchange: (e) => patchRow('subjects', s.id, { name: e.target.value }),
        }),
        h('button.icon', {
          title: 'Remove', text: '🗑',
          onclick: async () => {
            const lessonCount = D.own('lessons', ownerId).filter((l) => l.subject_id === s.id).length;
            const ok = await confirmSheet('Remove subject?',
              `${s.code} will go, along with ${lessonCount} timetable slot${lessonCount === 1 ? '' : 's'} and its homework ticks.`);
            if (!ok) return;
            for (const l of D.own('lessons', ownerId).filter((x) => x.subject_id === s.id)) remove('lessons', l.id);
            for (const c of D.own('hw_checks', ownerId).filter((x) => x.subject_id === s.id)) remove('hw_checks', c.id);
            remove('subjects', s.id);
            paint();
            refresh();
          },
        }),
      ]));
    }
  };
  paint();

  await formSheet({
    title: 'Subjects',
    submit: 'Done',
    wide: true,
    fields: [{ name: 'newcode', label: 'Add a subject', placeholder: 'Code, e.g. Chem' }],
    values: { newcode: '' },
    extra: list,
  }).then((out) => {
    if (out?.newcode?.trim()) {
      A.addSubject(ownerId, out.newcode.trim(), '', D.prefs().accent);
      toast('Subject added', 'ok');
    }
    refresh();
  });
}
