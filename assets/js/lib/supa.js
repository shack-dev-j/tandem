// A small Supabase client: just the auth and REST calls this app makes.
//
// Hand-written rather than pulled from a CDN so the app has no third-party
// script to trust, no version to drift, and works with the network blocked.

import { backend } from '../config.js';

const SESSION = 'tandem.session';

let session = null;
try { session = JSON.parse(localStorage.getItem(SESSION) || 'null'); } catch { session = null; }

export function currentSession() { return session; }
export function currentUser() { return session?.user || null; }

function save(s) {
  session = s;
  if (s) localStorage.setItem(SESSION, JSON.stringify(s));
  else localStorage.removeItem(SESSION);
}

export function signOut() { save(null); }

class HttpError extends Error {
  constructor(status, body) {
    super(body?.message || body?.error_description || body?.error || `Request failed (${status})`);
    this.status = status;
    this.body = body;
  }
}
export { HttpError };

async function call(path, { method = 'GET', body, headers = {}, auth = true } = {}) {
  const { url, key, ok } = backend();
  if (!ok) throw new Error('No backend configured');

  const h = { apikey: key, 'Content-Type': 'application/json', ...headers };
  if (auth && session?.access_token) h.Authorization = `Bearer ${session.access_token}`;

  const res = await fetch(url + path, {
    method, headers: h, body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await res.text();
  let data = null;
  if (text) { try { data = JSON.parse(text); } catch { data = text; } }
  if (!res.ok) throw new HttpError(res.status, data);
  return data;
}

// ------------------------------------------------------------------- auth

function land(raw) {
  if (!raw?.access_token) throw new Error('The sign-in reply had no token in it');
  save({
    access_token: raw.access_token,
    refresh_token: raw.refresh_token,
    expires_at: Date.now() + (raw.expires_in || 3600) * 1000,
    user: raw.user || session?.user || null,
  });
  return session;
}

export function signIn(email, password) {
  return call('/auth/v1/token?grant_type=password',
    { method: 'POST', auth: false, body: { email, password } }).then(land);
}

export function signUp(email, password) {
  return call('/auth/v1/signup', { method: 'POST', auth: false, body: { email, password } })
    .then((raw) => (raw?.access_token ? land(raw) : { confirmEmail: true, user: raw }));
}

export function resetPassword(email) {
  return call('/auth/v1/recover', { method: 'POST', auth: false, body: { email } });
}

export function updatePassword(password) {
  return call('/auth/v1/user', { method: 'PUT', body: { password } });
}

let refreshing = null;

/** Keep the access token alive. Returns false when the session is truly gone. */
export async function ensureFresh() {
  if (!session) return false;
  if (Date.now() < session.expires_at - 60_000) return true;
  if (!session.refresh_token) { save(null); return false; }
  refreshing = refreshing || call('/auth/v1/token?grant_type=refresh_token',
    { method: 'POST', auth: false, body: { refresh_token: session.refresh_token } })
    .then(land)
    .then(() => true)
    .catch((e) => {
      // A refresh token is rejected only when it is genuinely dead. Anything
      // else — offline, server down — must not throw away a usable session.
      if (e instanceof HttpError && e.status >= 400 && e.status < 500) { save(null); return false; }
      return true;
    })
    .finally(() => { refreshing = null; });
  return refreshing;
}

// ------------------------------------------------------------------- rest

async function rest(path, opts) {
  await ensureFresh();
  return call('/rest/v1/' + path, opts);
}

export const db = {
  select(table, query = '') {
    const q = query ? '&' + query : '';
    return rest(`${table}?select=*${q}`);
  },

  /** Insert or overwrite by primary key — what an offline queue needs. */
  upsert(table, rows) {
    const list = Array.isArray(rows) ? rows : [rows];
    if (!list.length) return Promise.resolve([]);
    return rest(table, {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
      body: list,
    });
  },

  update(table, id, patch) {
    return rest(`${table}?id=eq.${id}`, {
      method: 'PATCH', headers: { Prefer: 'return=representation' }, body: patch,
    });
  },

  remove(table, id) {
    return rest(`${table}?id=eq.${id}`, { method: 'DELETE' });
  },
};

/** Call a database function. */
export async function rpc(name, args = {}) {
  await ensureFresh();
  return call('/rest/v1/rpc/' + name, { method: 'POST', body: args });
}

export function online() { return navigator.onLine !== false; }
