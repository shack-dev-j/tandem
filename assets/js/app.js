// Boot, routing and the shell around every screen.

import { h, mount, toast, closeSheet } from './ui.js';
import * as store from './store.js';
import { state } from './store.js';
import { applyTheme } from './theme.js';
import * as D from './domain.js';
import * as A from './actions.js';
import { rerender, syncPill, avatar } from './views/parts.js';
import { home } from './views/home.js';
import { goals } from './views/goals.js';
import { tasks, quickAdd } from './views/tasks.js';
import { timetable } from './views/timetable.js';
import { partnerView } from './views/partner.js';
import { progress } from './views/progress.js';
import { settings } from './views/settings.js';
import { auth } from './views/auth.js';

const ROUTES = {
  '/': { view: home, name: 'Today', key: 'h' },
  '/goals': { view: goals, name: 'Goals', key: 'g' },
  '/tasks': { view: tasks, name: 'Tasks', key: 't' },
  '/timetable': { view: timetable, name: 'Timetable', key: 'w' },
  '/partner': { view: partnerView, name: 'Partner', key: 'f' },
  '/progress': { view: progress, name: 'Progress', key: 'p' },
  '/settings': { view: settings, name: 'Settings', key: 's' },
};

const app = document.getElementById('app');

function path() {
  const raw = (location.hash || '#/').replace(/^#/, '');
  return ROUTES[raw] ? raw : raw === '/auth' ? '/auth' : '/';
}

function badges() {
  const me = state.me;
  if (!me) return {};
  const { date } = D.checklistDay(me.id);
  const today = D.pendingOn(me.id, date).length;
  const back = D.carried(me.id, date).reduce((n, g) => n + g.subjects.length, 0);
  return {
    '/': today + back,
    '/tasks': D.own('tasks', me.id).filter((t) => !t.done).length,
    '/goals': D.goalsOf(me.id).filter((g) => !D.goalProgress(g).complete).length,
    '/partner': A.unreadNotes().length,
  };
}

function sidebar(current) {
  const me = state.me;
  const b = badges();
  const xp = D.totalXp(me.id);
  const lvl = D.levelInfo(xp);
  const p = D.prefs();

  const links = Object.entries(ROUTES)
    .filter(([r]) => r !== '/partner' || p.showPartner || store.partner())
    .map(([route, r]) => h('a.navlink' + (current === route ? '.on' : ''), {
      href: '#' + route,
    }, [
      h('span.navdot'),
      h('span.navname', { text: r.name }),
      b[route] ? h('span.navbadge', { text: String(b[route]) }) : null,
    ]));

  return h('nav.side', {}, [
    h('a.brand', { href: '#/' }, [h('i'), h('span', { text: 'Tandem' })]),
    h('div.navgroup', {}, [h('div.eyebrow', { text: 'NAVIGATION' }), ...links]),
    h('div.spacer'),
    h('a.levelmini', { href: '#/progress' }, [
      h('div.lmtop', {}, [
        h('span.eyebrow', { text: 'LEVEL ' + lvl.level }),
        h('span.lmtitle', { text: lvl.title }),
      ]),
      h('div.lmxp', {}, [h('b', { text: xp.toLocaleString() }), h('span', { text: 'XP' })]),
      h('div.lmbar', {}, h('i', { style: { width: lvl.pct + '%' } })),
      h('div.lmfoot', {}, [
        h('span', { text: `+${D.xpOn(me.id, D.iso())} today` }),
        h('span', { text: `${D.streak(me.id)} day streak` }),
      ]),
    ]),
    h('a.userline', { href: '#/settings' }, [
      avatar(me, 28),
      h('span.uname', { text: me.display_name || 'You' }),
      syncPill(),
    ]),
  ]);
}

function topbar(current) {
  const b = badges();
  return h('nav.top', {}, [
    h('a.brand', { href: '#/' }, [h('i'), h('span', { text: 'Tandem' })]),
    h('div.toplinks', {}, Object.entries(ROUTES).map(([route, r]) =>
      h('a.toplink' + (current === route ? '.on' : ''), { href: '#' + route }, [
        h('span', { text: r.name }),
        b[route] ? h('span.navbadge', { text: String(b[route]) }) : null,
      ]))),
    h('div.spacer'),
    syncPill(),
    h('a', { href: '#/settings' }, avatar(state.me, 28)),
  ]);
}

let raf = null;
export function render() {
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(paint);
}

function paint() {
  const route = path();

  if (!state.ready) {
    mount(app, h('div.boot', {}, h('div.spinner')));
    return;
  }

  // No session and a backend configured: the only screen is the door.
  const needsAuth = route === '/auth' || state.noSeat;
  if (needsAuth || !state.me) {
    document.body.dataset.shell = 'bare';
    mount(app, auth());
    return;
  }

  document.body.dataset.shell = D.prefs().nav;
  const scroll = document.querySelector('main.main')?.scrollTop || 0;
  const view = (ROUTES[route] || ROUTES['/']).view;

  let body;
  try {
    body = view();
  } catch (e) {
    console.error('tandem: view failed', e);
    body = h('div.crash', {}, [
      h('h2', { text: 'That screen could not be drawn' }),
      h('p.meta', { text: e.message }),
      h('button.ghost', { text: 'Reload', onclick: () => location.reload() }),
    ]);
  }

  const main = h('main.main', {}, h('div.page', {}, body));
  mount(app, [D.prefs().nav === 'top' ? topbar(route) : sidebar(route), main]);
  main.scrollTop = scroll;
}

rerender.fn = render;

// -------------------------------------------------------------- keyboard

document.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const t = e.target;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT'
            || t.isContentEditable)) return;
  if (document.querySelector('.overlay')) return;

  if (e.key === 'n') { e.preventDefault(); quickAdd(); return; }
  for (const [route, r] of Object.entries(ROUTES)) {
    if (e.key === r.key) { e.preventDefault(); location.hash = '#' + route; return; }
  }
});

window.addEventListener('hashchange', () => {
  closeSheet(true);          // a sheet must not outlive the screen that opened it
  document.querySelector('main.main')?.scrollTo(0, 0);
  render();
});

// ------------------------------------------------------------------- boot

store.subscribe(render);

(async function start() {
  render();
  try {
    await store.boot();
  } catch (e) {
    console.error('tandem: boot failed', e);
    toast('Could not load your data — ' + e.message, 'warn', 6000);
    state.ready = true;
  }
  applyTheme(state.me);

  if (state.me) {
    // Achievements are evaluated from the data, so a sync from the other
    // device can complete one while this one was closed.
    A.syncAchievements(state.me.id);
  }
  render();
  store.startSync();

  // Redraw at midnight so "today" is actually today.
  const midnight = new Date();
  midnight.setHours(24, 0, 30, 0);
  setTimeout(() => { render(); setInterval(render, 86_400_000); }, midnight - Date.now());
}());

window.addEventListener('error', (e) => console.error('tandem:', e.error || e.message));
