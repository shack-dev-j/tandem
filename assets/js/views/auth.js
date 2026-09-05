// The front door: a list of names.
//
// There is no password here. Two people who sit next to each other already
// know who is who, and the cost of proving it — an email each, a confirmation,
// a rate limit, a password to forget — bought nothing they needed. What the
// app does instead is keep the record honest and visible: every device that
// takes a name is listed, on both screens.

import { h, toast, formSheet } from '../ui.js';
import { state, loadRoster, pickPerson, roster } from '../store.js';
import { backend, setBackend } from '../config.js';
import { runDiagnostics } from './diagnose.js';
import { refresh } from './parts.js';

let picking = null;

export function auth() {
  const cfg = backend();
  if (!cfg.ok) return setupScreen();

  if (!roster.loaded) {
    loadRoster().then(refresh);
    return shell([h('div.spinner')]);
  }

  if (roster.error) {
    return shell([
      h('h1', { text: 'Cannot reach the database' }),
      h('p.lede', { text: roster.error.message }),
      h('button.primary.full', { text: 'Test connection', onclick: runDiagnostics }),
      h('button.link', { text: 'Use a different backend', onclick: () => { setBackend(null); location.reload(); } }),
    ]);
  }

  if (!roster.people.length) {
    return shell([
      h('h1', { text: 'Nobody is set up yet' }),
      h('p.lede', { text: 'The database is reachable but has no people in it. Add the two of you in the Supabase SQL editor:' }),
      h('pre.code', { text: "select set_person('Shohjahon');\nselect set_person('Yorqinoy');" }),
      h('button.primary.full', { text: 'Check again', onclick: () => { roster.loaded = false; refresh(); } }),
      h('button.link', { text: 'Test connection', onclick: runDiagnostics }),
    ]);
  }

  return shell([
    h('h1', { text: 'Who are you?' }),
    h('p.lede', { text: 'Tap your name. This device will remember it.' }),
    h('div.people', {}, roster.people.map((p) => h('button.person' + (picking === p.id ? '.busy' : ''), {
      disabled: Boolean(picking),
      onclick: () => choose(p),
    }, [
      h('span.personinitial', { text: (p.display_name || '?').charAt(0).toUpperCase() }),
      h('span.personname', { text: p.display_name }),
      h('span.persondevices', {
        text: Number(p.devices) === 0 ? 'not set up yet'
          : Number(p.devices) === 1 ? 'on 1 device' : `on ${p.devices} devices`,
      }),
    ]))),
    h('p.meta.center', { text: 'Anyone with this link can pick either name, so keep it between the two of you. Every device that takes a name is shown to you both.' }),
    h('hr'),
    h('div.authfoot', {}, [
      h('button.link', { text: 'Test connection', onclick: runDiagnostics }),
      h('button.link', { text: 'Use a different backend', onclick: () => { setBackend(null); location.reload(); } }),
    ]),
  ]);
}

async function choose(person) {
  const taken = Number(person.devices) > 0;
  if (taken) {
    const ok = await formSheet({
      title: 'Already in use',
      submit: 'Yes, this is also me',
      fields: [{
        note: `${person.display_name} is already signed in on ${person.devices} `
            + `device${Number(person.devices) === 1 ? '' : 's'}. Adding this one is normal if it is `
            + `your phone as well as your laptop — but if you are not ${person.display_name}, `
            + `stop here. It will show up on their screen either way.`,
      }],
    });
    if (!ok) return;
  }

  picking = person.id;
  refresh();
  try {
    await pickPerson(person.id);
    toast(`Welcome, ${person.display_name}`, 'ok');
    location.hash = '#/';
  } catch (e) {
    toast(e.message, 'warn', 6000);
  } finally {
    picking = null;
    refresh();
  }
}

function shell(body) {
  return h('div.authwrap', {}, h('div.authcard', {}, [
    h('div.brandbig', {}, [h('i'), h('span', { text: 'Tandem' })]),
    ...body,
  ]));
}

function setupScreen() {
  const url = h('input', { placeholder: 'https://xxxx.supabase.co', autocomplete: 'off' });
  const key = h('input', { placeholder: 'eyJhbGciOi…', autocomplete: 'off' });

  return h('div.authwrap', {}, h('div.authcard.wide', {}, [
    h('div.brandbig', {}, [h('i'), h('span', { text: 'Tandem' })]),
    h('h1', { text: 'Connect the two of you' }),
    h('p.lede', { text: 'Tandem keeps its data in a Supabase project you own. It is free, and the steps are in SETUP.md.' }),
    h('ol.steps', {}, [
      h('li', { text: 'Create a project at supabase.com.' }),
      h('li', { text: 'Open the SQL editor, paste in supabase/setup.sql, and run it.' }),
      h('li', { text: 'Turn on Authentication → Sign In / Providers → Anonymous sign-ins.' }),
      h('li', { text: 'Copy the project URL and anon key from Settings → API, below.' }),
    ]),
    h('form.authform', {
      onsubmit: (e) => {
        e.preventDefault();
        const u = url.value.trim(), k = key.value.trim();
        if (!u || !k) { toast('Both values are needed', 'warn'); return; }
        if (!/^https:\/\/.+/.test(u)) { toast('The URL should start with https://', 'warn'); return; }
        setBackend(u, k);
        location.reload();
      },
    }, [
      h('label.field', {}, [h('span.flabel', { text: 'Project URL' }), url]),
      h('label.field', {}, [h('span.flabel', { text: 'Anon public key' }), key]),
      h('span.fhint', { text: 'Both are meant to be public. The database policies are what keep your data yours.' }),
      h('button.primary.full', { type: 'submit', text: 'Connect' }),
    ]),
    h('hr'),
    h('a.link', { href: '#/', text: 'Not now — use this device only' }),
  ]));
}
