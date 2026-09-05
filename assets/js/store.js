// The data layer: one in-memory copy of everything, cached to disk, synced
// to Supabase when there is a backend and a network.
//
// Every write lands locally first and is queued for the server. That is what
// makes the app usable on a phone with one bar of signal at 11pm, which is
// when homework actually gets ticked off.

import * as supa from './lib/supa.js';
import { backend } from './config.js';
import { seedRows } from './seed.js';

export const TABLES = ['members', 'subjects', 'lessons', 'hw_checks', 'tasks',
                       'goals', 'goal_log', 'notes', 'xp_events', 'evidence'];

const LOCAL_ID = '00000000-0000-4000-8000-000000000001';

export const state = {
  mode: 'local',          // 'local' | 'cloud'
  ready: false,
  me: null,
  noSeat: false,
  db: emptyDb(),
  outbox: [],
  sync: { status: 'idle', at: null, error: null, rejected: [] },
};

function emptyDb() {
  return Object.fromEntries(TABLES.map((t) => [t, []]));
}

/** A UUID derived from its inputs, so two devices that record the same fact
 *  offline produce the same row instead of colliding on a unique constraint
 *  the moment they both reconnect. Not cryptographic — just stable. */
export function stableId(...parts) {
  const str = parts.join('\u0000');
  const h = [0x811c9dc5, 0x01000193, 0xdeadbeef, 0x9e3779b9];
  for (let i = 0; i < str.length; i += 1) {
    const c = str.charCodeAt(i);
    for (let k = 0; k < 4; k += 1) {
      h[k] = Math.imul(h[k] ^ c ^ (i + k * 31), 0x01000193) >>> 0;
    }
  }
  const hex = h.map((n) => n.toString(16).padStart(8, '0')).join('');
  // Stamp it as a v4-shaped UUID so Postgres accepts it as a uuid.
  return [hex.slice(0, 8), hex.slice(8, 12), '4' + hex.slice(13, 16),
          ((parseInt(hex[16], 16) & 3) | 8).toString(16) + hex.slice(17, 20),
          hex.slice(20, 32)].join('-');
}

export function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, (c) =>
    (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16));
}

// --------------------------------------------------------------- listeners

const listeners = new Set();
export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function notify() { for (const fn of listeners) fn(); }

// ------------------------------------------------------------------- cache

let scope = 'local';
const cacheKey = () => `tandem.db.${scope}`;
const outKey = () => `tandem.outbox.${scope}`;

let saveTimer = null;
function saveSoon() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 200);
}
function saveNow() {
  try {
    localStorage.setItem(cacheKey(), JSON.stringify(state.db));
    localStorage.setItem(outKey(), JSON.stringify(state.outbox));
  } catch (e) {
    // Quota, or a private window that refuses storage. The app still works
    // this session; it just will not remember on reload.
    console.warn('tandem: could not cache locally', e);
  }
}
function loadCache() {
  try {
    const raw = JSON.parse(localStorage.getItem(cacheKey()) || 'null');
    if (raw) state.db = { ...emptyDb(), ...raw };
    state.outbox = JSON.parse(localStorage.getItem(outKey()) || '[]');
    // The outbox survives a reload, so the id -> table map has to as well or
    // merge() would drop unsent rows the moment the first sync came back.
    for (const op of state.outbox) if (op.row) tableOfId.set(op.row.id, op.table);
  } catch { state.db = emptyDb(); state.outbox = []; }
}

// -------------------------------------------------------------------- boot

export async function boot() {
  const cfg = backend();
  const user = supa.currentUser();

  if (cfg.ok && user) {
    state.mode = 'cloud';
    scope = user.id;
    loadCache();
    state.me = state.db.members.find((m) => m.id === user.id) || null;
    state.ready = true;
    notify();
    let fetched = await pull();         // cache first, network second
    state.me = state.db.members.find((m) => m.id === user.id) || null;

    // A seat is handed out by a trigger when the account is created, so
    // adding one afterwards leaves a real login with no membership. Rather
    // than tell someone to delete their account and start again, take it now.
    if (!state.me && fetched) {
      try {
        const r = await supa.rpc('claim_seat');
        if (r?.ok) {
          fetched = await pull();
          state.me = state.db.members.find((m) => m.id === user.id) || null;
        }
      } catch { /* older schema, no such function — fall through to noSeat */ }
    }

    // Only a successful read proves there is no seat. Signing in on a train
    // must not look like being thrown out.
    state.noSeat = !state.me && fetched;
    if (state.me) await seedIfEmpty(state.me.id);
  } else {
    state.mode = 'local';
    scope = 'local';
    loadCache();
    state.me = state.db.members.find((m) => m.id === LOCAL_ID) || {
      id: LOCAL_ID, email: '', display_name: 'You', role: 'student', prefs: {},
    };
    if (!state.db.members.length) state.db.members = [state.me];
    state.ready = true;
    await seedIfEmpty(LOCAL_ID);
  }
  notify();
  saveNow();
}

async function seedIfEmpty(ownerId) {
  const mine = state.db.subjects.filter((s) => s.owner_id === ownerId);
  if (mine.length) return;
  if (localStorage.getItem(`tandem.seeded.${ownerId}`)) return;   // emptied on purpose
  localStorage.setItem(`tandem.seeded.${ownerId}`, '1');
  const { subjects, lessons } = seedRows(ownerId, uuid);
  for (const s of subjects) insert('subjects', s);
  for (const l of lessons) insert('lessons', l);
}

// -------------------------------------------------------------------- sync

function pendingIds() {
  const writes = new Set();
  const deletes = new Set();
  for (const op of state.outbox) {
    if (op.op === 'delete') deletes.add(op.id); else writes.add(op.row.id);
  }
  return { writes, deletes };
}

/** Server rows win, except where this device has an unsent change. */
function merge(table, serverRows) {
  const { writes, deletes } = pendingIds();
  const local = new Map(state.db[table].map((r) => [r.id, r]));
  const out = [];
  for (const row of serverRows) {
    if (deletes.has(row.id)) continue;
    out.push(writes.has(row.id) ? local.get(row.id) : row);
  }
  const seen = new Set(out.map((r) => r.id));
  for (const id of writes) {
    const row = local.get(id);
    if (row && !seen.has(id) && rowTable(id) === table) out.push(row);
  }
  state.db[table] = out;
}

// Which table an unsent row belongs to — the outbox knows.
const tableOfId = new Map();
function rowTable(id) { return tableOfId.get(id); }

/** Returns true only if the server was actually read. */
export async function pull() {
  if (state.mode !== 'cloud' || !supa.online()) return false;
  state.sync.status = 'syncing';
  notify();
  try {
    if (!(await supa.ensureFresh())) { signOut(); return false; }
    const results = await Promise.all(TABLES.map((t) => supa.db.select(t)));
    TABLES.forEach((t, i) => merge(t, results[i] || []));
    state.sync = { ...state.sync, status: 'ok', at: Date.now(), error: null };
    saveSoon();
    notify();
    return true;
  } catch (e) {
    state.sync = { ...state.sync, status: 'offline', error: e.message };
  }
  notify();
  return false;
}

let flushing = false;
export async function flush() {
  if (state.mode !== 'cloud' || flushing || !state.outbox.length) return;
  if (!supa.online()) return;
  flushing = true;
  try {
    while (state.outbox.length) {
      const op = state.outbox[0];
      try {
        if (op.op === 'delete') await supa.db.remove(op.table, op.id);
        else await supa.db.upsert(op.table, stripLocal(op.row));
        state.outbox.shift();
      } catch (e) {
        const permanent = e.status >= 400 && e.status < 500 && e.status !== 429;
        if (!permanent) throw e;              // offline or server trouble: retry later
        // Refused for good — a policy said no, or a column does not exist.
        // Drop it so one bad row cannot wedge the queue, but keep it visible.
        state.outbox.shift();
        state.sync.rejected.unshift({
          at: Date.now(), table: op.table, op: op.op, reason: e.message,
        });
        state.sync.rejected = state.sync.rejected.slice(0, 20);
      }
    }
    state.sync = { ...state.sync, status: 'ok', at: Date.now(), error: null };
  } catch (e) {
    state.sync = { ...state.sync, status: 'offline', error: e.message };
  } finally {
    flushing = false;
    saveSoon();
    notify();
  }
}

// Fields the browser keeps for itself and the server has no column for.
function stripLocal(row) {
  const { _pending, ...rest } = row;
  return rest;
}

function queue(op) {
  if (state.mode !== 'cloud') return;
  if (op.row) tableOfId.set(op.row.id, op.table);
  state.outbox.push(op);
  flush();
}

// ------------------------------------------------------------------ writes

export function insert(table, row) {
  const full = { ...row, id: row.id || uuid() };
  state.db[table] = [...state.db[table], full];
  queue({ op: 'upsert', table, row: full });
  saveSoon();
  notify();
  return full;
}

export function patch(table, id, changes) {
  let updated = null;
  state.db[table] = state.db[table].map((r) => {
    if (r.id !== id) return r;
    updated = { ...r, ...changes };
    return updated;
  });
  if (updated) queue({ op: 'upsert', table, row: updated });
  saveSoon();
  notify();
  return updated;
}

export function remove(table, id) {
  state.db[table] = state.db[table].filter((r) => r.id !== id);
  // Anything queued for a row we are deleting is now pointless.
  state.outbox = state.outbox.filter((o) => (o.row ? o.row.id !== id : o.id !== id));
  queue({ op: 'delete', table, id });
  saveSoon();
  notify();
}

// ------------------------------------------------------------------ people

export function me() { return state.me; }

export function partner() {
  if (!state.me) return null;
  return state.db.members.find((m) => m.id !== state.me.id) || null;
}

export function memberById(id) {
  return state.db.members.find((m) => m.id === id) || null;
}

/** Whether you may mark this person's work done.
 *
 *  You never confirm your own — that is the point of the app. The exception is
 *  when there is nobody else yet: on a single device, or before the second
 *  person has signed in, there is no one to ask, and an app you cannot tick
 *  anything in is not a useful app.
 */
export function canVerify(ownerId) {
  if (!partner()) return true;
  return ownerId !== state.me?.id;
}

/** True when your own work is waiting on someone else. */
export function needsPartner(ownerId) {
  return Boolean(partner()) && ownerId === state.me?.id;
}

export function savePrefs(prefs) {
  if (!state.me) return;
  state.me = { ...state.me, prefs };
  patch('members', state.me.id, { prefs });
}

// ------------------------------------------------------------------ session

export async function signIn(email, password) {
  await supa.signIn(email, password);
  await boot();
}

export async function signUp(email, password) {
  const r = await supa.signUp(email, password);
  if (!r?.confirmEmail) await boot();
  return r;
}

export function signOut() {
  supa.signOut();
  state.me = null;
  state.db = emptyDb();
  state.outbox = [];
  state.mode = 'local';
  state.noSeat = false;
  notify();
  location.reload();
}

// ------------------------------------------------------------------- clock

export function startSync() {
  if (state.mode !== 'cloud') return;
  const tick = () => { flush(); pull(); };
  setInterval(tick, 20_000);
  window.addEventListener('online', tick);
  window.addEventListener('focus', tick);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') tick();
  });
}
