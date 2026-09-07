// Telling you which of several very different problems you have.
//
// A wrong URL, a rejected key, an unrun setup.sql, an empty roster and
// anonymous sign-ins being switched off all produce the same symptom — an app
// that opens and shows nothing useful. This asks the database directly and
// names the cause. It lives in its own module because it has to be reachable
// from the sign-in screen, which by definition cannot reach Settings.

import { h, panelSheet, closeSheet } from '../ui.js';
import { backend } from '../config.js';
import * as supa from '../lib/supa.js';

const line = (ok, text) => h('div.diag' + (ok ? '.ok' : '.bad'), {}, [
  h('span.diagmark', { text: ok ? '✓' : '✕' }),
  h('span', { text }),
]);

const ADD_PEOPLE = "select set_person('Shohjahon');\nselect set_person('Yorqinoy');";

export async function runDiagnostics() {
  const cfg = backend();
  const out = [];

  if (!cfg.ok) {
    out.push(line(false, 'No backend is configured, so this is running on one device only. '
      + 'That is also why you can tick your own work — there is nobody to ask.'));
    return show(out);
  }

  const local = /^https?:\/\/(127\.0\.0\.1|localhost|0\.0\.0\.0)(:|$)/.test(cfg.url);
  out.push(line(!local, (local
    ? 'Pointing at a server on this machine, not a real Supabase project: '
    : 'Backend: ') + cfg.url));
  if (local) {
    out.push(line(false, 'Everything below describes that local server. Press "Use a different '
      + 'backend" on the sign-in screen to clear it.'));
  }

  let info = null;
  try {
    info = await supa.rpc('connection_check');
  } catch (e) {
    if (/failed to fetch|networkerror/i.test(e.message)) {
      out.push(line(false, 'Cannot reach that URL at all. Check it for typos, and check the '
        + 'project is not paused — Supabase pauses free projects after a week idle.'));
    } else if (e.status === 404) {
      out.push(line(false, 'The project is there, but setup.sql has not been run. Open the SQL '
        + 'editor, paste in supabase/setup.sql, and press Run.'));
    } else if (e.status === 401 || e.status === 403) {
      out.push(line(false, 'The anon key was rejected. Copy it again from '
        + 'Project Settings → API — it is the one labelled "anon public".'));
    } else {
      out.push(line(false, 'The server said: ' + e.message));
    }
    return show(out);
  }

  // An older setup.sql answers in the shape it knew about. Say so, rather than
  // reporting "undefined" for every field the current one would have filled in.
  if (typeof info.people !== 'number') {
    out.push(line(false, 'The database is running an older version of the schema — it still '
      + 'expects email accounts. Run the current supabase/setup.sql; it is safe over what is '
      + 'already there.'));
    return show(out);
  }

  out.push(line(true, `Database reached — ${info.people} `
    + `${info.people === 1 ? 'person' : 'people'} set up.`));

  if (info.people === 0) {
    out.push(line(false, 'Nobody has been added yet, so there is no name to tap. Run this in '
      + 'the SQL editor:\n' + ADD_PEOPLE));
    return show(out);
  }

  out.push(line(true, 'Names: ' + (info.names || []).join(', ')));

  if (!info.has_session) {
    out.push(line(false, 'This browser has no session, which is almost always anonymous '
      + 'sign-ins being switched off. Turn it on under Authentication → Sign In / Providers → '
      + 'Anonymous sign-ins, then reload.'));
    return show(out);
  }
  out.push(line(true, 'This device has a session.'));

  if (!info.picked) {
    out.push(line(false, 'No name has been tapped on this device yet. Go back and choose one — '
      + 'that is the whole sign-in.'));
    return show(out);
  }

  out.push(line(true, `You are ${info.name}, on `
    + `${info.devices} device${Number(info.devices) === 1 ? '' : 's'}. Everything should be syncing.`));

  return show(out);
}

function show(lines) {
  return panelSheet('Connection', h('div.diags', {}, lines), [
    h('button.ghost', { text: 'Close', onclick: () => closeSheet() }),
  ]);
}
