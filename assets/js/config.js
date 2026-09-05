// Where the backend lives.
//
// Both values are meant to be public: the anon key only grants what the
// database's row-level security lets it grant, which for a stranger is
// nothing. See supabase/schema.sql.
//
// Fill these in and the app syncs between the two of you. Leave them and it
// runs on this device only, which is a fine way to try it out.

export const SUPABASE_URL = '';
export const SUPABASE_ANON_KEY = '';

// Set from the in-app setup screen, so you can connect a backend without
// editing this file. What is stored here wins over the constants above.
const LS = 'tandem.backend';

export function backend() {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(LS) || 'null'); } catch { /* corrupt, ignore */ }
  const url = (saved?.url || SUPABASE_URL || '').replace(/\/+$/, '');
  const key = saved?.key || SUPABASE_ANON_KEY || '';
  return { url, key, ok: Boolean(url && key) };
}

export function setBackend(url, key) {
  if (!url || !key) { localStorage.removeItem(LS); return; }
  localStorage.setItem(LS, JSON.stringify({ url: url.replace(/\/+$/, ''), key }));
}
