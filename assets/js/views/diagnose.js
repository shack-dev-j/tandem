// Telling you which of four very different problems you have.
//
// A wrong URL, a rejected key, unapplied migrations and a missing seat all
// produce the same symptom — an app that signs you in and then shows nothing.
// This asks the database directly and names the cause. It lives in its own
// module because it has to be reachable from the locked-out screen, which by
// definition cannot reach Settings.

import { h, panelSheet, closeSheet } from '../ui.js';
import { backend } from '../config.js';
import * as supa from '../lib/supa.js';

const line = (ok, text) => h('div.diag' + (ok ? '.ok' : '.bad'), {}, [
  h('span.diagmark', { text: ok ? '✓' : '✕' }),
  h('span', { text }),
]);

export async function runDiagnostics() {
  const cfg = backend();
  const out = [];

  if (!cfg.ok) {
    out.push(line(false, 'No backend is configured, so this is running on one device only.'));
    return show(out);
  }
  const local = /^https?:\/\/(127\.0\.0\.1|localhost|0\.0\.0\.0)(:|$)/.test(cfg.url);
  out.push(line(!local, (local ? 'Pointing at a backend on this machine — not a real Supabase project: '
                               : 'Backend: ') + cfg.url));
  if (local) {
    out.push(line(false, 'Everything below describes that local server, not your project. '
      + 'Set the real one in Settings → Connection.'));
  }
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(cfg.url) && !local) {
    out.push(line(true, 'That does not look like the usual https://<ref>.supabase.co — '
      + 'fine if you meant it.'));
  }

  let info = null;
  try {
    info = await supa.rpc('connection_check');
  } catch (e) {
    if (/failed to fetch|networkerror/i.test(e.message)) {
      out.push(line(false, 'Cannot reach that URL at all. Check it for typos, and check the '
        + 'project is not paused — Supabase pauses free projects after a week idle.'));
    } else if (e.status === 404) {
      out.push(line(false, 'The project is there, but the migrations have not been run. '
        + 'Open the SQL editor and run each file in supabase/migrations, oldest first.'));
    } else if (e.status === 401 || e.status === 403) {
      out.push(line(false, 'The anon key was rejected. Copy it again from '
        + 'Project Settings → API — it is the one labelled "anon public".'));
    } else {
      out.push(line(false, 'The server said: ' + e.message));
    }
    return show(out);
  }

  out.push(line(true, `Database reached — ${info.seats} seat(s), ${info.members} member(s).`));

  if (!info.signed_in) {
    // Whether any seats exist at all decides what to do next, and it is
    // knowable without being signed in — so say it rather than making
    // someone create an account to find out it was never going to work.
    if (info.seats === 0) {
      out.push(line(false, 'There are no seats yet, so nobody can get in — including you. '
        + 'Add yours in the SQL editor first:\n'
        + 'insert into seats (email, role, display_name)\n'
        + "values ('you@example.com', 'student', 'Your name')\n"
        + 'on conflict (email) do update set role = excluded.role;'));
    } else {
      out.push(line(false, `Not signed in yet. There ${info.seats === 1 ? 'is 1 seat' : `are ${info.seats} seats`} `
        + 'waiting — go to the sign-in screen, choose "I need to create my account", '
        + 'and use the exact email you gave a seat to.'));
    }
    return show(out);
  }
  out.push(line(true, 'Signed in as ' + info.email));

  out.push(line(info.has_seat, info.has_seat
    ? 'That email has a seat.'
    : `No seat for ${info.email}. Run this in the SQL editor, then press Check again:\n`
      + 'insert into seats (email, role, display_name)\n'
      + `values ('${info.email}', 'student', 'Your name')\n`
      + 'on conflict (email) do update set role = excluded.role;'));

  if (info.has_seat) {
    out.push(line(info.is_member, info.is_member
      ? 'Membership is active. Everything should be syncing.'
      : 'Seated but not a member yet — the seat was added after you signed up. '
        + 'Press Check again, or reload, and it will be claimed.'));
  }

  return show(out);
}

function show(lines) {
  return panelSheet('Connection', h('div.diags', {}, lines), [
    h('button.ghost', { text: 'Close', onclick: () => closeSheet() }),
  ]);
}
