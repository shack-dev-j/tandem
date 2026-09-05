// Preferences, turned into CSS.
//
// The two of you want the app to look like different apps, so almost nothing
// about the surface is hard-coded: palette, type, spacing, corners and layout
// all come from here, and each account carries its own set.

import { prefs } from './domain.js';

export const THEMES = [
  { id: 'ink',    name: 'Ink',    dark: true,
    v: { bg: '#0A0B0D', panel: '#12141A', panel2: '#161920', field: '#181B21',
         text: '#EDEBE7', soft: '#C6C4C0', muted: '#8E9099', dim: '#6E7178', faint: '#5C5F68' } },
  { id: 'carbon', name: 'Carbon', dark: true,
    v: { bg: '#101114', panel: '#17191D', panel2: '#1C1E23', field: '#1E2126',
         text: '#E8E8EA', soft: '#C2C3C7', muted: '#8B8D93', dim: '#6C6E75', faint: '#585A61' } },
  { id: 'slate',  name: 'Slate',  dark: true,
    v: { bg: '#0C1017', panel: '#131924', panel2: '#182030', field: '#1A2231',
         text: '#E4EAF2', soft: '#B9C4D2', muted: '#7E8DA1', dim: '#63718A', faint: '#4E5B72' } },
  { id: 'forest', name: 'Forest', dark: true,
    v: { bg: '#0A1210', panel: '#111B18', panel2: '#15211D', field: '#172420',
         text: '#E3EDE8', soft: '#BACCC3', muted: '#7F958C', dim: '#647A71', faint: '#4F645C' } },
  { id: 'plum',   name: 'Plum',   dark: true,
    v: { bg: '#110D16', panel: '#1A1421', panel2: '#1F1828', field: '#221A2C',
         text: '#EBE5F0', soft: '#C7BDD1', muted: '#95899F', dim: '#766B80', faint: '#5F5568' } },
  { id: 'sepia',  name: 'Sepia',  dark: true,
    v: { bg: '#14100C', panel: '#1D1813', panel2: '#231D17', field: '#261F19',
         text: '#F0E9DF', soft: '#D0C5B5', muted: '#9C9080', dim: '#7C7263', faint: '#645B4E' } },
  { id: 'paper',  name: 'Paper',  dark: false,
    v: { bg: '#FAF8F4', panel: '#FFFFFF', panel2: '#F4F1EA', field: '#F1EDE5',
         text: '#1A1814', soft: '#3E3A33', muted: '#6E6857', dim: '#8B8577', faint: '#A8A296' } },
  { id: 'frost',  name: 'Frost',  dark: false,
    v: { bg: '#F4F7FB', panel: '#FFFFFF', panel2: '#EDF2F8', field: '#E9EFF6',
         text: '#141A22', soft: '#37414F', muted: '#5F6C7D', dim: '#7D8899', faint: '#9AA4B2' } },
];

export const FONTS = [
  { id: 'editorial', name: 'Editorial',
    head: "'Instrument Serif', Georgia, serif", body: "'IBM Plex Sans', system-ui, sans-serif" },
  { id: 'neutral', name: 'Neutral',
    head: "'IBM Plex Sans', system-ui, sans-serif", body: "'IBM Plex Sans', system-ui, sans-serif" },
  { id: 'mono', name: 'Mono',
    head: "'IBM Plex Mono', ui-monospace, monospace", body: "'IBM Plex Mono', ui-monospace, monospace" },
  { id: 'system', name: 'System',
    head: 'system-ui, -apple-system, "Segoe UI", sans-serif',
    body: 'system-ui, -apple-system, "Segoe UI", sans-serif' },
];

export const DENSITIES = [
  { id: 'compact',     name: 'Compact',     pad: 12, gap: 10, fs: 13, row: 44 },
  { id: 'comfortable', name: 'Comfortable', pad: 18, gap: 16, fs: 14, row: 56 },
  { id: 'spacious',    name: 'Spacious',    pad: 26, gap: 22, fs: 15, row: 68 },
];

export const RADII = [
  { id: 'sharp', name: 'Sharp', r: 3 },
  { id: 'soft',  name: 'Soft',  r: 10 },
  { id: 'round', name: 'Round', r: 18 },
];

export const WIDGETS = {
  review: 'Waiting on you',
  checklist: "Today's homework",
  goals: 'Goals',
  tasks: 'Tasks due',
  partner: 'Your partner',
  streak: 'Streak and XP',
  timetable: "Today's lessons",
};

const pick = (list, id, fallback = 0) => list.find((x) => x.id === id) || list[fallback];

/** Mix a colour with the page background, so one accent works on any palette. */
function tint(hex, alpha) {
  const n = parseInt(hex.replace('#', ''), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Readable text on top of the accent — black on yellow, white on navy.
 *  Picks whichever of the two has the better WCAG contrast rather than
 *  guessing from brightness, because mid-tone accents (a periwinkle, a teal)
 *  sit right on the line and a guess gets them wrong. */
export function onAccent(hex) {
  const n = parseInt(String(hex).replace('#', '') || '0', 16);
  const chan = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const L = 0.2126 * chan[0] + 0.7152 * chan[1] + 0.0722 * chan[2];
  const onWhite = 1.05 / (L + 0.05);      // contrast of #FFF against it
  const onBlack = (L + 0.05) / 0.06;      // contrast of #141210 against it
  return onBlack >= onWhite ? '#141210' : '#FFFFFF';
}

export function applyTheme(member) {
  const p = prefs(member);
  const t = pick(THEMES, p.theme);
  const f = pick(FONTS, p.font);
  const d = pick(DENSITIES, p.density, 1);
  const r = pick(RADII, p.radius, 1);
  const root = document.documentElement;
  const s = root.style;

  for (const [k, v] of Object.entries(t.v)) s.setProperty('--' + k, v);

  const onDark = t.dark;
  s.setProperty('--line',  onDark ? 'rgba(255,255,255,.08)' : 'rgba(0,0,0,.09)');
  s.setProperty('--line2', onDark ? 'rgba(255,255,255,.15)' : 'rgba(0,0,0,.16)');
  s.setProperty('--hair',  onDark ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.05)');
  s.setProperty('--hair2', onDark ? 'rgba(255,255,255,.09)' : 'rgba(0,0,0,.08)');
  s.setProperty('--shadow', onDark ? '0 18px 50px rgba(0,0,0,.55)' : '0 14px 40px rgba(20,25,40,.13)');

  s.setProperty('--ac', p.accent);
  s.setProperty('--ac-soft', tint(p.accent, 0.15));
  s.setProperty('--ac-line', tint(p.accent, 0.4));
  s.setProperty('--ac-glow', tint(p.accent, 0.22));
  s.setProperty('--on-ac', onAccent(p.accent));

  s.setProperty('--red',   onDark ? '#E06A4F' : '#C0472C');
  s.setProperty('--green', onDark ? '#7EB79A' : '#3E7D5D');
  s.setProperty('--blue',  onDark ? '#8FB8F0' : '#3C6FB8');
  s.setProperty('--warm',  onDark ? '#C97F6A' : '#A85B45');

  s.setProperty('--serif', f.head);
  s.setProperty('--sans', f.body);
  s.setProperty('--mono', "'IBM Plex Mono', ui-monospace, monospace");

  s.setProperty('--pad', d.pad + 'px');
  s.setProperty('--gap', d.gap + 'px');
  s.setProperty('--fs', d.fs + 'px');
  s.setProperty('--row', d.row + 'px');
  s.setProperty('--r', r.r + 'px');
  s.setProperty('--r-sm', Math.max(2, Math.round(r.r * 0.6)) + 'px');
  s.setProperty('--r-lg', Math.round(r.r * 1.6) + 'px');

  root.dataset.mode = t.dark ? 'dark' : 'light';
  root.dataset.nav = p.nav;
  root.style.colorScheme = t.dark ? 'dark' : 'light';

  let meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) { meta = document.createElement('meta'); meta.name = 'theme-color'; document.head.append(meta); }
  meta.content = t.v.bg;
}

/** Every widget in the order chosen, switched off ones included.
 *  Hiding one must not move it: you turn a card off, change your mind, turn it
 *  back on, and it should still be where you left it. */
export function widgetSequence(member) {
  const known = Object.keys(WIDGETS);
  const ordered = (prefs(member).widgets || []).filter((w) => known.includes(w));
  // A card added in a later version slots in where it was designed to go,
  // not at the bottom. Appending would bury it under a saved order made
  // before it existed, and the reader would never find out it was there.
  known.forEach((w, i) => { if (!ordered.includes(w)) ordered.splice(i, 0, w); });
  return ordered;
}

/** Just the ones to draw. */
export function widgetOrder(member) {
  const hidden = new Set(prefs(member).hidden || []);
  return widgetSequence(member).filter((w) => !hidden.has(w));
}
