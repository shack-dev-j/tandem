// Settings. Two people, two very different ideas of what a good app looks
// like, so nearly everything on the surface is adjustable and stored per
// account rather than per device.

import { h, toast, confirmSheet, formSheet } from '../ui.js';
import { state, savePrefs, signOut, patch, pull } from '../store.js';
import { setBackend, backend } from '../config.js';
import * as supa from '../lib/supa.js';
import { BUILD } from '../version.js';
import { THEMES, FONTS, DENSITIES, RADII, WIDGETS, applyTheme, widgetSequence } from '../theme.js';
import * as D from '../domain.js';
import { sectionHead, refresh, avatar } from './parts.js';
import { runDiagnostics } from './diagnose.js';

const ACCENTS = ['#E2C044', '#E0724F', '#D8577A', '#B07CD8', '#6F8FE0',
                 '#4FB3A6', '#6FB25E', '#C9A227', '#8E9099', '#E85D75'];

function set(changes) {
  const next = { ...D.prefs(), ...changes };
  savePrefs(next);
  applyTheme(state.me);
  refresh();
}

export function settings() {
  const me = state.me;
  const p = D.prefs();

  return [
    h('header.hero', {}, [
      h('div.eyebrow', { text: 'SETTINGS' }),
      h('h1', { text: 'Make it yours' }),
      h('p.lede', { text: 'Everything here is saved to your account, not this device. The other person keeps their own.' }),
    ]),

    h('div.grid', {}, [
      card('You', [
        h('div.you', {}, [
          avatar(me, 46),
          h('div.grow', {}, [
            h('input.bigname', {
              value: me.display_name || '',
              placeholder: 'Your name',
              onchange: (e) => {
                patch('members', me.id, { display_name: e.target.value.trim() || 'You' });
                state.me = { ...state.me, display_name: e.target.value.trim() || 'You' };
                toast('Name saved', 'ok');
                refresh();
              },
            }),
            h('div.meta', { text: me.email || 'Local account' }),
          ]),
        ]),
        row('Role', h('div.segmented', {}, ['student', 'partner'].map((r) =>
          h('button' + (me.role === r ? '.on' : ''), {
            text: r === 'student' ? 'Student' : 'Partner',
            onclick: () => {
              patch('members', me.id, { role: r });
              state.me = { ...state.me, role: r };
              refresh();
            },
          }))), 'A partner sees everything but cannot tick off your homework.'),
      ]),

      card('Palette', [
        h('div.swatches', {}, THEMES.map((t) => h('button.swatch' + (p.theme === t.id ? '.on' : ''), {
          title: t.name,
          style: { background: t.v.bg, borderColor: p.theme === t.id ? 'var(--ac)' : 'transparent' },
          onclick: () => set({ theme: t.id, mode: t.dark ? 'dark' : 'light' }),
        }, [
          h('span.sw1', { style: { background: t.v.panel } }),
          h('span.sw2', { style: { background: t.v.text } }),
          h('span.swname', { text: t.name }),
        ]))),
        row('Accent', h('div.accents', {}, [
          ...ACCENTS.map((c) => h('button.acdot' + (p.accent.toLowerCase() === c.toLowerCase() ? '.on' : ''), {
            style: { background: c }, title: c, onclick: () => set({ accent: c }),
          })),
          h('label.acdot.custom', { title: 'Any colour' }, [
            h('input', { type: 'color', value: p.accent, oninput: (e) => set({ accent: e.target.value }) }),
          ]),
        ])),
      ]),

      card('Type and spacing', [
        row('Typeface', segmented(FONTS, p.font, (id) => set({ font: id }))),
        row('Density', segmented(DENSITIES, p.density, (id) => set({ density: id }))),
        row('Corners', segmented(RADII, p.radius, (id) => set({ radius: id }))),
        row('Navigation', h('div.segmented', {}, [['side', 'Sidebar'], ['top', 'Top bar']].map(([id, label]) =>
          h('button' + (p.nav === id ? '.on' : ''), { text: label, onclick: () => set({ nav: id }) })))),
      ]),

      card('Home screen', [
        h('p.meta', { text: 'Drag a row, or use the arrows. Switch off anything you do not want.' }),
        widgetList(p),
      ]),

      card('How it works', [
        row('Week starts on', h('select', {
          onchange: (e) => set({ weekStart: Number(e.target.value) }),
        }, D.DAY_NAMES.map((d, i) => h('option', { value: i, text: d, selected: p.weekStart === i })))),
        row('Carry homework forward for',
          number(p.carryDays, 1, 60, (v) => set({ carryDays: v })),
          'School days. Unticked subjects roll onto the next checklist until you deal with them.'),
        row('Daily task goal', number(p.dailyGoal, 1, 20, (v) => set({ dailyGoal: v })),
          'Finish this many tasks in a day for a bonus.'),
        toggle('Show your partner on the home screen', p.showPartner, (v) => set({ showPartner: v })),
      ]),

      card('What things are worth', [
        h('p.meta', { text: 'XP per action, before the streak multiplier.' }),
        ...Object.entries({
          check: 'Subject ticked off', dayClear: 'Whole day cleared', task: 'Task finished',
          daily: 'Daily task goal', goalStep: 'Goal progress logged', goalDone: 'Goal completed',
        }).map(([k, label]) => row(label,
          number(p.xp[k], 0, 500, (v) => set({ xp: { ...p.xp, [k]: v } })))),
        h('button.ghost.small', {
          text: 'Reset to defaults',
          onclick: () => set({ xp: { ...D.DEFAULT_PREFS.xp } }),
        }),
      ]),

      card('Connection', connection()),

      card('Account', [
        state.mode === 'cloud' ? row('Signed in as', h('span.meta', { text: supa.currentUser()?.email || '' })) : null,
        state.mode === 'cloud' ? h('div.btnrow', {}, [
          h('button.ghost', { text: 'Change password', onclick: changePassword }),
          h('button.ghost', { text: 'Sign out', onclick: signOut }),
        ]) : h('a.button.primary', { href: '#/auth', text: 'Sign in to sync' }),
        h('hr'),
        h('p.meta', { text: 'Clearing wipes this browser\'s copy. With a backend connected, it syncs back down; without one, it is gone.' }),
        h('p.meta', { text: 'Build ' + BUILD }),
        h('button.danger.small', {
          text: 'Clear local data',
          onclick: async () => {
            if (!await confirmSheet('Clear local data?',
              'Everything cached in this browser is removed. Anything not yet synced is lost.', 'Clear')) return;
            for (const k of Object.keys(localStorage)) if (k.startsWith('tandem.')) localStorage.removeItem(k);
            location.reload();
          },
        }),
      ]),
    ]),
  ];
}

// -------------------------------------------------------------- ingredients

function card(title, body) {
  return h('section.w', {}, [sectionHead(title), h('div.setbody', {}, body)]);
}

function row(label, control, hint) {
  return h('div.setrow', {}, [
    h('div.setlabel', {}, [h('span', { text: label }), hint ? h('span.fhint', { text: hint }) : null]),
    h('div.setctl', {}, control),
  ]);
}

function segmented(list, current, onPick) {
  return h('div.segmented', {}, list.map((x) => h('button' + (current === x.id ? '.on' : ''), {
    text: x.name, onclick: () => onPick(x.id),
  })));
}

function number(value, min, max, onSet) {
  return h('input.num', {
    type: 'number', value, min, max,
    onchange: (e) => {
      const v = Math.max(min, Math.min(max, Number(e.target.value) || min));
      e.target.value = v;
      onSet(v);
    },
  });
}

function toggle(label, on, onSet) {
  return h('div.setrow', {}, [
    h('div.setlabel', {}, h('span', { text: label })),
    h('button.switch' + (on ? '.on' : ''), { onclick: () => onSet(!on) }, h('i')),
  ]);
}

/** Drag to reorder, with arrows as well — dragging on a phone is miserable,
 *  and a control you can only reach by dragging is one that does not work. */
function widgetList(p) {
  const order = widgetSequence(state.me);
  const hidden = new Set(p.hidden || []);
  const list = h('div.widgets');

  const commit = (next) => set({ widgets: next, hidden: [...hidden] });
  const move = (i, to) => {
    if (to < 0 || to >= order.length) return;
    const n = [...order];
    [n[i], n[to]] = [n[to], n[i]];
    commit(n);
  };

  order.forEach((key, i) => {
    const off = hidden.has(key);
    list.append(h('div.widget' + (off ? '.off' : ''), { draggable: 'true', dataset: { key } }, [
      h('span.grip', { 'aria-hidden': 'true' }),
      h('span.wnum', { text: off ? '—' : String(i + 1 - [...order.slice(0, i)].filter((k) => hidden.has(k)).length) }),
      h('span.wname', { text: WIDGETS[key] }),
      h('span.wmove', {}, [
        h('button.step', { title: 'Move up', text: '↑', disabled: i === 0, onclick: () => move(i, i - 1) }),
        h('button.step', { title: 'Move down', text: '↓', disabled: i === order.length - 1, onclick: () => move(i, i + 1) }),
      ]),
      h('button.switch.small' + (off ? '' : '.on'), {
        title: off ? 'Show this card' : 'Hide this card',
        'aria-pressed': String(!off),
        onclick: () => {
          if (off) hidden.delete(key); else hidden.add(key);
          commit(order);
        },
      }, h('i')),
    ]));
  });

  let dragged = null;
  list.addEventListener('dragstart', (e) => {
    dragged = e.target.closest('.widget');
    if (dragged) dragged.classList.add('dragging');
  });
  list.addEventListener('dragend', () => {
    if (!dragged) return;
    dragged.classList.remove('dragging');
    commit([...list.querySelectorAll('.widget')].map((el) => el.dataset.key));
    dragged = null;
  });
  list.addEventListener('dragover', (e) => {
    e.preventDefault();
    if (!dragged) return;
    const over = e.target.closest('.widget');
    if (!over || over === dragged) return;
    const after = e.clientY > over.getBoundingClientRect().top + over.offsetHeight / 2;
    list.insertBefore(dragged, after ? over.nextSibling : over);
  });

  return list;
}

// ------------------------------------------------------------------ backend

function connection() {
  const cfg = backend();

  if (state.mode === 'cloud') {
    return [
      h('p.okline', { text: 'Connected. Everything syncs between the two of you.' }),
      row('Backend', h('code.small', { text: cfg.url })),
      row('Members', h('div.stack.tight', {}, state.db.members.map((m) => h('div.memberline', {}, [
        avatar(m, 24),
        h('span', { text: m.display_name || m.email }),
        h('span.meta', { text: m.role }),
        m.id === state.me.id ? h('span.pill', { text: 'you' }) : null,
      ])))),
      h('div.btnrow', {}, [
        h('button.ghost.small', { text: 'Sync now', onclick: () => { pull(); toast('Syncing…', 'ok'); } }),
        h('button.ghost.small', { text: 'Test connection', onclick: runDiagnostics }),
      ]),
      state.sync.rejected.length ? h('div.rejected', {}, [
        h('p.warnline', { text: `${state.sync.rejected.length} change${state.sync.rejected.length === 1 ? '' : 's'} the server refused:` }),
        ...state.sync.rejected.slice(0, 5).map((r) => h('p.meta', { text: `${r.table} · ${r.reason}` })),
      ]) : null,
    ];
  }

  return [
    h('p.warnline', { text: 'Running on this device only. Nothing is shared and nothing leaves this browser.' }),
    h('p.meta', { text: 'Point it at a Supabase project and the two of you share one set of data. The setup is in SETUP.md — it takes about five minutes and costs nothing.' }),
    h('div.btnrow', {}, [
      h('button.primary', { text: 'Connect a backend', onclick: connectSheet }),
      h('button.ghost', { text: 'Test connection', onclick: runDiagnostics }),
    ]),
  ];
}

async function connectSheet() {
  const cfg = backend();
  const out = await formSheet({
    title: 'Connect a backend',
    submit: 'Connect',
    wide: true,
    fields: [
      { note: 'From your Supabase project: Settings → API. Both values are safe to paste here — the anon key only grants what the database policies allow.' },
      { name: 'url', label: 'Project URL', placeholder: 'https://xxxx.supabase.co', required: true, wide: true },
      { name: 'key', label: 'Anon public key', placeholder: 'eyJhbGciOi…', required: true, wide: true },
    ],
    values: { url: cfg.url, key: cfg.key },
  });
  if (!out) return;
  setBackend(out.url.trim(), out.key.trim());
  toast('Saved — sign in next', 'ok');
  location.hash = '#/auth';
  location.reload();
}

async function changePassword() {
  const out = await formSheet({
    title: 'Change password',
    submit: 'Update',
    fields: [
      { name: 'a', label: 'New password', type: 'password', required: true, autocomplete: 'new-password' },
      { name: 'b', label: 'Again', type: 'password', required: true, autocomplete: 'new-password' },
    ],
    values: { a: '', b: '' },
  });
  if (!out) return;
  if (out.a !== out.b) { toast('Those do not match', 'warn'); return; }
  if (out.a.length < 8) { toast('Use at least 8 characters', 'warn'); return; }
  try {
    await supa.updatePassword(out.a);
    toast('Password changed', 'ok');
  } catch (e) {
    toast(e.message, 'warn');
  }
}
