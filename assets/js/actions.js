// Every mutation the UI can perform, and the XP that comes with it.
//
// Split out from the store so the store stays a dumb pipe and the rules for
// what earns what live in one readable place.

import { state, insert, patch, remove, uuid, stableId, canVerify } from './store.js';
import * as D from './domain.js';

const nowIso = () => new Date().toISOString();

// ---------------------------------------------------------------------- xp

/** Award XP against a key that can only ever pay once.
 *  Un-ticking and re-ticking must not print money, so the key is derived
 *  from what was done, not from when. */
export function award(ownerId, source, base, key) {
  // XP is written by whoever confirmed the work, on behalf of whoever did it.
  if (key && state.db.xp_events.some((e) => e.owner_id === ownerId && e.note === key)) return 0;
  const amount = Math.round(base * D.multiplier(ownerId));
  if (amount <= 0) return 0;
  insert('xp_events', {
    owner_id: ownerId, source, amount, note: key || '',
    day: D.iso(), created_at: nowIso(),
  });
  return amount;
}

export function syncAchievements(ownerId) {
  if (!D.hasActivity(ownerId)) return [];
  const won = [];
  for (const a of D.ACHIEVEMENTS) {
    const key = `achv:${a.key}`;
    if (state.db.xp_events.some((e) => e.owner_id === ownerId && e.note === key)) continue;
    let passed = false;
    try { passed = a.test(ownerId); } catch { passed = false; }
    if (!passed) continue;
    award(ownerId, 'achievement', a.xp, key);
    won.push(a);
  }
  return won;
}

export function unlocked(ownerId) {
  const keys = new Set(state.db.xp_events.filter((e) => e.owner_id === ownerId)
    .map((e) => e.note));
  return D.ACHIEVEMENTS.map((a) => ({ ...a, got: keys.has(`achv:${a.key}`) }));
}

// -------------------------------------------------------------- homework

/** Tick a subject off for the day its homework was set. */
export function toggleCheck(ownerId, subjectId, date, on) {
  if (!canVerify(ownerId)) return { xp: 0, blocked: true };
  const day = typeof date === 'string' ? date : D.iso(date);
  const existing = state.db.hw_checks.find(
    (c) => c.owner_id === ownerId && c.subject_id === subjectId && c.date === day);

  if (!on) {
    if (existing) remove('hw_checks', existing.id);
    return { xp: 0 };
  }
  if (existing) return { xp: 0 };

  insert('hw_checks', {
    // Same fact, same id, whichever device records it.
    id: stableId('check', ownerId, subjectId, day),
    owner_id: ownerId, subject_id: subjectId, date: day, done_at: nowIso(),
  });

  const p = D.prefs();
  let xp = award(ownerId, 'check', p.xp.check, `check:${subjectId}:${day}`);
  const d = D.parseDay(day);
  if (D.subjectsOn(ownerId, d).length && !D.pendingOn(ownerId, d).length) {
    xp += award(ownerId, 'day-clear', p.xp.dayClear, `dayclear:${day}`);
  }
  return { xp, won: syncAchievements(ownerId) };
}

/** Clear a day, and optionally everything still owed from before it. */
export function checkAll(ownerId, date, includeCarried = true) {
  if (!canVerify(ownerId)) return { xp: 0, blocked: true };
  let xp = 0;
  const days = [{ date: typeof date === 'string' ? date : D.iso(date) }];
  if (includeCarried) {
    for (const g of D.carried(ownerId, typeof date === 'string' ? D.parseDay(date) : date)) {
      days.push({ date: g.date });
    }
  }
  for (const { date: day } of days) {
    for (const s of D.pendingOn(ownerId, D.parseDay(day))) {
      xp += toggleCheck(ownerId, s.id, day, true).xp;
    }
  }
  return { xp, won: syncAchievements(ownerId) };
}

// ------------------------------------------------------------------ tasks

export function addTask(ownerId, fields) {
  const row = insert('tasks', {
    id: uuid(), owner_id: ownerId, subject_id: fields.subject_id || null,
    title: fields.title.trim(), notes: fields.notes || '',
    due_date: fields.due_date || null, priority: fields.priority ?? 1,
    est_minutes: fields.est_minutes ?? 30, done: false, done_at: null,
    created_by: state.me?.id || null, position: Date.now() % 100000,
    created_at: nowIso(),
  });
  return row;
}

export function toggleTask(id, done) {
  const t = state.db.tasks.find((x) => x.id === id);
  if (!t) return { xp: 0 };
  // Finishing is someone else's call; reopening is anyone's, so a mistake is
  // always undoable by whoever spots it.
  if (done && !canVerify(t.owner_id)) return { xp: 0, blocked: true };
  patch('tasks', id, { done, done_at: done ? nowIso() : null });
  if (!done) return { xp: 0 };

  const p = D.prefs();
  let xp = award(t.owner_id, 'task', p.xp.task, `task:${id}`);
  const today = D.iso();
  const doneToday = state.db.tasks.filter(
    (x) => x.owner_id === t.owner_id && x.done && D.localDay(x.done_at) === today).length;
  if (doneToday >= p.dailyGoal) {
    xp += award(t.owner_id, 'daily-goal', p.xp.daily, `daily:${today}`);
  }
  return { xp, won: syncAchievements(t.owner_id) };
}

export const updateTask = (id, changes) => patch('tasks', id, changes);
export const deleteTask = (id) => remove('tasks', id);

// ------------------------------------------------------------------ goals

export function addGoal(ownerId, fields) {
  return insert('goals', {
    id: uuid(), owner_id: ownerId,
    title: fields.title.trim(), detail: fields.detail || '',
    kind: fields.kind || 'count', target: Number(fields.target) || 1,
    unit: fields.unit || '', cadence: fields.cadence || 'once',
    start_date: fields.start_date || D.iso(), due_date: fields.due_date || null,
    color: fields.color || '', pinned: Boolean(fields.pinned), archived: false,
    created_by: state.me?.id || null, created_at: nowIso(),
  });
}

export const updateGoal = (id, changes) => patch('goals', id, changes);

export function deleteGoal(id) {
  for (const l of state.db.goal_log.filter((l) => l.goal_id === id)) remove('goal_log', l.id);
  remove('goals', id);
}

/** Record progress. A goal is a log of what you did, not a number you set,
 *  so the chart and the streak are both real. */
export function logGoal(goal, amount, note = '', date = D.iso()) {
  if (!canVerify(goal.owner_id)) return { xp: 0, blocked: true };
  const before = D.goalProgress(goal).complete;
  insert('goal_log', {
    id: uuid(), goal_id: goal.id, owner_id: goal.owner_id,
    amount: Number(amount), note, date, created_at: nowIso(),
  });
  const p = D.prefs();
  // Once a day per goal. Keyed on the log count instead, deleting an entry and
  // re-adding it would print XP forever.
  let xp = award(goal.owner_id, 'goal-step', p.xp.goalStep, `goalstep:${goal.id}:${date}`);
  const after = D.goalProgress(goal);
  if (!before && after.complete) {
    const period = after.period.from;
    xp += award(goal.owner_id, 'goal-done', p.xp.goalDone, `goaldone:${goal.id}:${period}`);
  }
  return { xp, complete: after.complete && !before, won: syncAchievements(goal.owner_id) };
}

export function undoLastLog(goalId) {
  const logs = state.db.goal_log.filter((l) => l.goal_id === goalId)
    .sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''));
  const last = logs[logs.length - 1];
  if (last) remove('goal_log', last.id);
  return last;
}

// ------------------------------------------------------------------- notes

export function addNote(targetId, body, kind = 'note', ref = {}) {
  if (!state.me) return null;
  return insert('notes', {
    id: uuid(), author_id: state.me.id, target_id: targetId,
    body: body.trim(), kind, ref_table: ref.table || '', ref_id: ref.id || null,
    read_at: null, created_at: nowIso(),
  });
}

export function markNotesRead(fromId) {
  const mine = state.db.notes.filter(
    (n) => n.target_id === state.me?.id && !n.read_at && (!fromId || n.author_id === fromId));
  for (const n of mine) patch('notes', n.id, { read_at: nowIso() });
  return mine.length;
}

export const unreadNotes = () =>
  state.db.notes.filter((n) => n.target_id === state.me?.id && !n.read_at);

// -------------------------------------------------------------- timetable

export function addSubject(ownerId, code, name = '', color = '') {
  const n = D.subjectsOf(ownerId).length;
  return insert('subjects', {
    id: uuid(), owner_id: ownerId, code: code.trim(),
    name: name || code.trim(), color, position: n, archived: false,
  });
}

export function setLesson(ownerId, dow, period, fields) {
  const existing = state.db.lessons.find(
    (l) => l.owner_id === ownerId && l.dow === dow && l.period === period);
  if (!fields) {
    if (existing) remove('lessons', existing.id);
    return null;
  }
  if (existing) return patch('lessons', existing.id, fields);
  return insert('lessons', { id: uuid(), owner_id: ownerId, dow, period, ...fields });
}

// ------------------------------------------------------------- evidence

/** Shrink a photo before it is stored.
 *  A phone camera JPEG is several megabytes; a legible picture of a page of
 *  working is a couple of hundred kilobytes, and that is what travels. */
export function shrinkImage(file, maxSide = 1400, targetBytes = 320_000) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith('image/')) { reject(new Error('That is not an image')); return; }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read that file'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Could not decode that image'));
      img.onload = () => {
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * scale);
        c.height = Math.round(img.height * scale);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        let q = 0.78;
        let out = c.toDataURL('image/jpeg', q);
        while (out.length > targetBytes && q > 0.35) {
          q -= 0.12;
          out = c.toDataURL('image/jpeg', q);
        }
        resolve(out);
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

/** Hand something over for your partner to check. */
export function submitEvidence({ subjectId = null, taskId = null, goalId = null,
                                 date = D.iso(), note = '', image = '' }) {
  if (!state.me) return null;
  const existing = D.evidenceFor(state.me.id, { subjectId, taskId, goalId, date });
  if (existing) {
    return patch('evidence', existing.id, { note, image: image || existing.image });
  }
  return insert('evidence', {
    id: uuid(), owner_id: state.me.id,
    subject_id: subjectId, task_id: taskId, goal_id: goalId,
    date, note, image, created_at: nowIso(), reviewed_at: null, reviewed_by: null,
  });
}

export function withdrawEvidence(id) { remove('evidence', id); }

/** Confirm or turn down what your partner sent over.
 *  Approving is what actually marks the work done — the evidence row is only
 *  the request. */
export function reviewEvidence(ev, approve) {
  if (ev.owner_id === state.me?.id) return { blocked: true };
  patch('evidence', ev.id, { reviewed_at: nowIso(), reviewed_by: state.me.id });
  if (!approve) return { xp: 0, declined: true };

  let res = { xp: 0 };
  if (ev.subject_id) res = toggleCheck(ev.owner_id, ev.subject_id, ev.date, true);
  else if (ev.task_id) res = toggleTask(ev.task_id, true);
  else if (ev.goal_id) {
    const g = state.db.goals.find((x) => x.id === ev.goal_id);
    if (g) res = logGoal(g, Number(ev.note) || 1, 'confirmed', ev.date);
  }
  return res;
}
