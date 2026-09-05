// The rules of the app: what counts as done, what carries over, what a goal
// is worth, and how much XP any of it earns.
//
// Everything here is a pure function of the data plus your preferences, so
// two people can look at the same rows and each see them their own way.

import { state } from './store.js';

// -------------------------------------------------------------------- days

export const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday',
                          'Friday', 'Saturday', 'Sunday'];

/** 'YYYY-MM-DD' in local time. Never use toISOString here: it is UTC, and at
 *  11pm in Tashkent that is yesterday. */
export function iso(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** The local calendar day a stored timestamp falls on.
 *  Timestamps are kept as UTC instants, which is right for the database and
 *  wrong for "did I do it today": at 1am in Tashkent the UTC date is still
 *  yesterday, so slicing the string would credit the wrong day. */
export function localDay(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? String(ts).slice(0, 10) : iso(d);
}

export function parseDay(s) {
  const [y, m, d] = String(s).split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(d, n) {
  const c = new Date(d);
  c.setDate(c.getDate() + n);
  return c;
}

/** 0 = Monday, to match the timetable grid. */
export const dow = (d) => (d.getDay() + 6) % 7;

export function startOfWeek(d, weekStart = 0) {
  const diff = (dow(d) - weekStart + 7) % 7;
  return addDays(d, -diff);
}

export function fmtDay(d) {
  return d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
}

/** The same date without the weekday, for when the weekday is already said. */
export function fmtDate(d) {
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'long' });
}

export function ago(days) {
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 14) return 'a week ago';
  return `${Math.floor(days / 7)} weeks ago`;
}

export function hhmm(minutes) {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

// ---------------------------------------------------------------- defaults

export const DEFAULT_PREFS = {
  theme: 'ink',
  accent: '#E2C044',
  mode: 'dark',
  font: 'editorial',
  density: 'comfortable',
  radius: 'soft',
  nav: 'side',
  weekStart: 0,
  carryDays: 14,
  dailyGoal: 3,
  showPartner: true,
  confetti: true,
  widgets: ['checklist', 'goals', 'tasks', 'partner', 'streak', 'timetable'],
  hidden: [],
  xp: { task: 25, check: 10, dayClear: 50, goalStep: 15, goalDone: 120, daily: 40 },
};

export function prefs(member = state.me) {
  const p = member?.prefs || {};
  return { ...DEFAULT_PREFS, ...p, xp: { ...DEFAULT_PREFS.xp, ...(p.xp || {}) } };
}

/** Someone's own settings. Your partner's homework carries for the number of
 *  days *they* chose, not the number you did. */
export function prefsOf(ownerId) {
  return prefs((state.db.members || []).find((m) => m.id === ownerId) || state.me);
}

// ------------------------------------------------------------------ lookup

const rows = (t) => state.db[t] || [];
export const own = (t, ownerId) => rows(t).filter((r) => r.owner_id === ownerId);

export function subjectsOf(ownerId) {
  return own('subjects', ownerId).filter((s) => !s.archived)
    .sort((a, b) => a.position - b.position || a.code.localeCompare(b.code));
}

export function subjectMap(ownerId) {
  return new Map(own('subjects', ownerId).map((s) => [s.id, s]));
}

export function lessonsOn(ownerId, d) {
  const wd = dow(d);
  return own('lessons', ownerId).filter((l) => l.dow === wd)
    .sort((a, b) => a.start_min - b.start_min);
}

/** The days of the week that actually have lessons — your school week. */
export function schoolDays(ownerId) {
  const s = new Set(own('lessons', ownerId).map((l) => l.dow));
  return s.size ? s : new Set([0, 1, 2, 3, 4]);
}

/** Distinct subjects taught on a given day, in period order. */
export function subjectsOn(ownerId, d) {
  const byId = subjectMap(ownerId);
  const seen = new Set();
  const out = [];
  for (const l of lessonsOn(ownerId, d)) {
    const s = byId.get(l.subject_id);
    if (!s || s.archived || seen.has(s.id)) continue;
    seen.add(s.id);
    out.push({ ...s, lesson: l });
  }
  return out;
}

export function checkedOn(ownerId, d) {
  const day = iso(d);
  return new Set(own('hw_checks', ownerId).filter((c) => c.date === day).map((c) => c.subject_id));
}

export function pendingOn(ownerId, d) {
  const done = checkedOn(ownerId, d);
  return subjectsOn(ownerId, d).filter((s) => !done.has(s.id));
}

// --------------------------------------------------------------- carry-over

/** The first day this person actually used the tracker.
 *  Without a floor, an empty history would reach back over the whole
 *  timetable and present it as a backlog that never existed. */
export function trackingSince(ownerId) {
  const days = [
    ...own('hw_checks', ownerId).map((c) => c.date),
    ...own('tasks', ownerId).map((t) => localDay(t.created_at)),
    ...own('goal_log', ownerId).map((g) => g.date),
  ].filter(Boolean).sort();
  return days.length ? parseDay(days[0]) : new Date();
}

/** Homework does not stop existing because the day ended. Anything left
 *  unticked rolls onto the next checklist until it is dealt with. */
export function carried(ownerId, before = new Date()) {
  const floor = trackingSince(ownerId);
  const school = schoolDays(ownerId);
  const limit = prefsOf(ownerId).carryDays;
  const out = [];
  let d = addDays(before, -1);
  let walked = 0;
  while (d >= floor && walked < limit) {
    if (school.has(dow(d))) {
      walked += 1;
      const pending = pendingOn(ownerId, d);
      if (pending.length) {
        out.push({
          date: iso(d), day: DAY_NAMES[dow(d)], label: fmtDay(d),
          daysAgo: Math.round((before - d) / 86400000), subjects: pending,
        });
      }
    }
    d = addDays(d, -1);
  }
  return out;
}

/** Which day the checklist is for. Homework is set during the day and done
 *  later the same day, so it is today's lessons — unless today has none. */
export function checklistDay(ownerId) {
  const now = new Date();
  if (subjectsOn(ownerId, now).length) return { date: now, isToday: true };
  const school = schoolDays(ownerId);
  let d = addDays(now, 1);
  for (let i = 0; i < 14 && !school.has(dow(d)); i += 1) d = addDays(d, 1);
  return { date: d, isToday: false };
}

// ------------------------------------------------------------------- goals

export function goalsOf(ownerId, { archived = false } = {}) {
  return own('goals', ownerId).filter((g) => Boolean(g.archived) === archived)
    .sort((a, b) => Number(b.pinned) - Number(a.pinned)
      || (a.due_date || '9999').localeCompare(b.due_date || '9999'));
}

/** The window a goal is currently being measured over. */
export function goalPeriod(goal, at = new Date(), weekStart = 0) {
  if (goal.cadence === 'daily') return { from: iso(at), to: iso(at), label: 'today' };
  if (goal.cadence === 'weekly') {
    const s = startOfWeek(at, weekStart);
    return { from: iso(s), to: iso(addDays(s, 6)), label: 'this week' };
  }
  if (goal.cadence === 'monthly') {
    const s = new Date(at.getFullYear(), at.getMonth(), 1);
    return { from: iso(s), to: iso(new Date(at.getFullYear(), at.getMonth() + 1, 0)),
             label: 'this month' };
  }
  return { from: goal.start_date || '0000-01-01', to: goal.due_date || '9999-12-31',
           label: 'in total' };
}

const logsFor = (goalId) => rows('goal_log').filter((l) => l.goal_id === goalId);

export function goalProgress(goal, at = new Date(), weekStart = 0) {
  const period = goalPeriod(goal, at, weekStart);
  const logs = logsFor(goal.id);
  const inPeriod = logs.filter((l) => l.date >= period.from && l.date <= period.to);
  const done = inPeriod.reduce((n, l) => n + Number(l.amount || 0), 0);
  const target = Number(goal.target) || 1;
  const pct = Math.max(0, Math.min(100, Math.round((done / target) * 100)));
  return { period, done, target, pct, complete: done >= target, logs, entries: inPeriod };
}

/** Consecutive completed periods, ending with the current one (or the one
 *  before it, so today stays unbroken until the day is over). */
export function goalStreak(goal, at = new Date(), weekStart = 0) {
  if (goal.cadence === 'once') return 0;
  const step = { daily: 1, weekly: 7, monthly: 30 }[goal.cadence] || 1;
  let d = new Date(at);
  let n = 0;
  if (!goalProgress(goal, d, weekStart).complete) d = addDays(d, -step);
  for (let i = 0; i < 400; i += 1) {
    if (!goalProgress(goal, d, weekStart).complete) break;
    n += 1;
    d = addDays(d, -step);
    if (goal.cadence === 'monthly') d = new Date(d.getFullYear(), d.getMonth(), 15);
  }
  return n;
}

/** Are you where you should be by now? Only meaningful with a deadline. */
export function goalPace(goal, at = new Date()) {
  if (goal.cadence !== 'once' || !goal.due_date) return null;
  const start = parseDay(goal.start_date || iso(at));
  const end = parseDay(goal.due_date);
  const total = Math.max(1, (end - start) / 86400000);
  const gone = Math.max(0, Math.min(total, (at - start) / 86400000));
  const { done, target } = goalProgress(goal, at);
  const expected = (gone / total) * target;
  const daysLeft = Math.ceil((end - at) / 86400000);
  const perDay = daysLeft > 0 ? Math.max(0, (target - done) / daysLeft) : 0;
  return {
    expected, daysLeft, perDay,
    behind: done < expected - 0.001,
    state: done >= target ? 'done'
      : daysLeft < 0 ? 'missed'
      : done >= expected ? 'ahead' : 'behind',
  };
}

// ---------------------------------------------------------------------- xp

const LEVELS = ['Beginner', 'Getting going', 'Steady', 'Consistent', 'Sharp',
                'Reliable', 'Disciplined', 'Focused', 'Formidable', 'Relentless',
                'Unshakeable'];

/** Triangular curve: each level costs 100 more than the last. */
export function xpForLevel(n) { return (100 * n * (n - 1)) / 2; }

export function levelInfo(xp) {
  let level = 1;
  while (xpForLevel(level + 1) <= xp) level += 1;
  const floor = xpForLevel(level);
  const ceil = xpForLevel(level + 1);
  return {
    level, xp, floor, ceil, into: xp - floor, need: ceil - xp, span: ceil - floor,
    pct: Math.round(((xp - floor) / (ceil - floor)) * 100),
    title: LEVELS[Math.min(level - 1, LEVELS.length - 1)],
  };
}

export function totalXp(ownerId) {
  return own('xp_events', ownerId).reduce((n, e) => n + (e.amount || 0), 0);
}

export function xpOn(ownerId, day) {
  return own('xp_events', ownerId).filter((e) => e.day === day)
    .reduce((n, e) => n + (e.amount || 0), 0);
}

/** Consecutive days ending today on which something was finished.
 *  Counted by when you did the work, not the day the work belonged to, so
 *  clearing a backlog credits the day you actually cleared it. */
export function activeDays(ownerId) {
  const days = new Set();
  for (const c of own('hw_checks', ownerId)) if (c.done_at) days.add(localDay(c.done_at));
  for (const t of own('tasks', ownerId)) if (t.done && t.done_at) days.add(localDay(t.done_at));
  for (const l of own('goal_log', ownerId)) days.add(l.date);
  return days;
}

export function streak(ownerId) {
  const days = activeDays(ownerId);
  let d = new Date();
  if (!days.has(iso(d))) d = addDays(d, -1);   // today stays unbroken until it ends
  let n = 0;
  while (days.has(iso(d))) { n += 1; d = addDays(d, -1); }
  return n;
}

export function multiplier(ownerId) {
  return Math.min(1.5, 1 + streak(ownerId) * 0.02);
}

// ---------------------------------------------------------- achievements

export const ACHIEVEMENTS = [
  { key: 'first-tick', name: 'Off the mark', hint: 'Tick your first subject', xp: 10,
    test: (o) => own('hw_checks', o).length >= 1 },
  { key: 'first-task', name: 'Written down', hint: 'Finish your first task', xp: 10,
    test: (o) => own('tasks', o).some((t) => t.done) },
  { key: 'clear-day', name: 'Clean sheet', hint: 'Clear a whole day', xp: 40,
    test: (o) => [...activeDays(o)].some((d) => {
      const day = parseDay(d);
      const subs = subjectsOn(o, day);
      return subs.length > 0 && pendingOn(o, day).length === 0;
    }) },
  { key: 'streak-3', name: 'Three in a row', hint: 'A 3-day streak', xp: 30,
    test: (o) => streak(o) >= 3 },
  { key: 'streak-7', name: 'A full week', hint: 'A 7-day streak', xp: 80,
    test: (o) => streak(o) >= 7 },
  { key: 'streak-30', name: 'A month of it', hint: 'A 30-day streak', xp: 300,
    test: (o) => streak(o) >= 30 },
  { key: 'ten-tasks', name: 'Ten down', hint: 'Finish 10 tasks', xp: 40,
    test: (o) => own('tasks', o).filter((t) => t.done).length >= 10 },
  { key: 'fifty-tasks', name: 'Fifty down', hint: 'Finish 50 tasks', xp: 150,
    test: (o) => own('tasks', o).filter((t) => t.done).length >= 50 },
  { key: 'first-goal', name: 'Something to aim at', hint: 'Set a goal', xp: 15,
    test: (o) => own('goals', o).length >= 1 },
  { key: 'goal-done', name: 'Called it', hint: 'Complete a goal', xp: 100,
    test: (o) => own('goals', o).some((g) => goalProgress(g).complete) },
  { key: 'goal-streak', name: 'Habit formed', hint: 'A 14-period goal streak', xp: 200,
    test: (o) => own('goals', o).some((g) => goalStreak(g) >= 14) },
  { key: 'no-backlog', name: 'Nothing owed', hint: 'Clear every carried-over subject', xp: 120,
    test: (o) => own('hw_checks', o).length >= 5 && carried(o).length === 0 },
  { key: 'level-5', name: 'Level five', hint: 'Reach level 5', xp: 100,
    test: (o) => levelInfo(totalXp(o)).level >= 5 },
  { key: 'level-10', name: 'Level ten', hint: 'Reach level 10', xp: 400,
    test: (o) => levelInfo(totalXp(o)).level >= 10 },
];

/** Nothing unlocks on an account that has done nothing, so a fresh sign-up
 *  really does read zero. */
export function hasActivity(ownerId) {
  return own('hw_checks', ownerId).length > 0
    || own('tasks', ownerId).some((t) => t.done)
    || own('goal_log', ownerId).length > 0;
}
