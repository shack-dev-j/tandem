// Signing in. Two seats, and the database decides who has one.

import { h, toast } from '../ui.js';
import { state, signIn, signUp, signOut } from '../store.js';
import { backend, setBackend } from '../config.js';
import { runDiagnostics } from './diagnose.js';
import * as supa from '../lib/supa.js';
import { refresh } from './parts.js';

let mode = 'in';       // 'in' | 'up'
let busy = false;

export function auth() {
  const cfg = backend();
  if (!cfg.ok) return setupScreen();
  if (state.noSeat) return noSeatScreen();

  const email = h('input', {
    type: 'email', placeholder: 'you@example.com', autocomplete: 'username',
    required: true,
  });
  const pass = h('input', {
    type: 'password', placeholder: 'Your password',
    autocomplete: mode === 'in' ? 'current-password' : 'new-password', required: true,
  });

  const go = async (e) => {
    e?.preventDefault();
    if (busy) return;
    const em = email.value.trim();
    const pw = pass.value;
    if (!em || !pw) { toast('Email and password, please', 'warn'); return; }
    if (mode === 'up' && pw.length < 8) { toast('Use at least 8 characters', 'warn'); return; }

    busy = true;
    refresh();
    try {
      if (mode === 'in') {
        await signIn(em, pw);
        toast('Welcome back', 'ok');
      } else {
        const r = await signUp(em, pw);
        if (r?.confirmEmail) {
          toast('Check your email to confirm, then sign in', 'ok', 6000);
          mode = 'in';
        } else {
          toast('Account created', 'ok');
        }
      }
      location.hash = '#/';
    } catch (err) {
      toast(friendly(err), 'warn', 12000);
    } finally {
      busy = false;
      refresh();
    }
  };

  return h('div.authwrap', {}, h('div.authcard', {}, [
    h('div.brandbig', {}, [h('i'), h('span', { text: 'Tandem' })]),
    h('h1', { text: mode === 'in' ? 'Sign in' : 'Claim your seat' }),
    h('p.lede', {
      text: mode === 'in'
        ? 'Two people, one set of data.'
        : 'Your email needs a seat in the database. If it does not have one, the account will sign in but see nothing.',
    }),

    h('form.authform', { onsubmit: go }, [
      h('label.field', {}, [h('span.flabel', { text: 'Email' }), email]),
      h('label.field', {}, [h('span.flabel', { text: 'Password' }), pass]),
      h('button.primary.full', {
        type: 'submit', disabled: busy,
        text: busy ? 'Working…' : mode === 'in' ? 'Sign in' : 'Create account',
      }),
    ]),

    h('div.authalt', {}, [
      h('button.link', {
        text: mode === 'in' ? 'I need to create my account' : 'I already have an account',
        onclick: () => { mode = mode === 'in' ? 'up' : 'in'; refresh(); },
      }),
      mode === 'in' ? h('button.link', {
        text: 'Forgot password',
        onclick: async () => {
          const em = email.value.trim();
          if (!em) { toast('Type your email first', 'warn'); return; }
          try { await supa.resetPassword(em); toast('Reset link sent', 'ok'); }
          catch (err) { toast(friendly(err), 'warn'); }
        },
      }) : null,
    ]),

    h('hr'),
    h('div.authfoot', {}, [
      h('button.link', { text: 'Use a different backend', onclick: () => { setBackend(null); location.reload(); } }),
      h('a.link', { href: '#/', text: 'Skip — use this device only' }),
    ]),
  ]));
}

function friendly(err) {
  const m = String(err?.message || err);
  const status = err?.status;

  // 429 on sign-up is almost never about sign-ups. It is the built-in email
  // service, which a free project may use about twice an hour, and every
  // attempt with confirmation on spends one. Saying "too many requests" sends
  // people off to wait, when the fix is a setting.
  if (status === 429 || /rate limit|too many requests/i.test(m)) {
    return 'Supabase is rate-limiting its confirmation emails — free projects get '
         + 'about two an hour. Turn off Authentication → Sign In / Providers → '
         + 'Email → Confirm email, and sign up again: it will not send one at all.';
  }
  if (/invalid login credentials/i.test(m)) return 'That email and password do not match';
  if (/already registered|already been registered/i.test(m)) return 'That account exists — sign in instead';
  if (/failed to fetch|networkerror/i.test(m)) return 'Cannot reach the backend. Check the URL, or your connection.';
  if (/email.*invalid|invalid.*email/i.test(m)) return 'That email address does not look right';
  if (/password.*at least|weak password/i.test(m)) return 'That password is too short — use at least 8 characters';
  if (/signups not allowed|signup is disabled/i.test(m)) {
    return 'Sign-ups are switched off for this project. Turn them back on under '
         + 'Authentication → Sign In / Providers → Email.';
  }
  return m;
}

function setupScreen() {
  const url = h('input', { placeholder: 'https://xxxx.supabase.co', autocomplete: 'off' });
  const key = h('input', { placeholder: 'eyJhbGciOi…', autocomplete: 'off' });

  return h('div.authwrap', {}, h('div.authcard.wide', {}, [
    h('div.brandbig', {}, [h('i'), h('span', { text: 'Tandem' })]),
    h('h1', { text: 'Connect the two of you' }),
    h('p.lede', { text: 'Tandem keeps its data in a Supabase project you own. It is free, it takes about five minutes, and the steps are in SETUP.md in the repository.' }),

    h('ol.steps', {}, [
      h('li', { text: 'Create a project at supabase.com.' }),
      h('li', { text: 'Open the SQL editor, paste in supabase/schema.sql, and run it.' }),
      h('li', { text: 'Add your two emails to the seats table.' }),
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

function noSeatScreen() {
  return h('div.authwrap', {}, h('div.authcard', {}, [
    h('div.brandbig', {}, [h('i'), h('span', { text: 'Tandem' })]),
    h('h1', { text: 'No seat for this account' }),
    h('p.lede', { text: `You are signed in as ${supa.currentUser()?.email || 'this account'}, but the database is not showing you as a member. Usually that means this email has no seat — press Test connection below and it will say for certain.` }),
    h('p.meta', { text: 'If it is the seat, add it in the Supabase SQL editor:' }),
    h('pre.code', { text: "insert into seats (email, role, display_name)\nvalues ('you@example.com', 'student', 'Your name')\non conflict (email) do update set role = excluded.role;" }),
    h('p.meta', { text: 'Then press this — no need to sign out or start again.' }),
    h('button.primary.full', {
      text: 'Check again',
      onclick: async () => {
        try {
          const r = await supa.rpc('claim_seat');
          if (r?.ok) { location.reload(); return; }
          toast(r?.reason || 'Still no seat for this email', 'warn', 5000);
        } catch (e) {
          toast(e.message, 'warn', 5000);
        }
      },
    }),
    h('button.ghost.full', { text: 'Test connection', onclick: runDiagnostics }),
    h('button.link', { text: 'Sign out', onclick: signOut }),
  ]));
}
