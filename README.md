# Tandem

**[shack-dev-j.github.io/tandem](https://shack-dev-j.github.io/tandem/)**

A homework and goal tracker built for exactly two people who keep each other
honest. You do not tick your own work off. You do it, you hand it over, and
the other one decides whether it counts.

Static site — no build step, no framework, no dependencies. It runs from a
folder of files, which is why it can live on GitHub Pages for nothing.

## What it does

**Today** — every subject you had lessons in today. Finish the homework, then
send it over: a note, a photo of the page, or nothing at all if you would
rather just show them. Your partner is the one who confirms it. Anything still
unconfirmed rolls onto the next day's list under *Still from Thursday*, in red,
and keeps rolling. Nothing quietly falls off.

**Waiting on you** — the other half. What your partner has sent across, with
their photo if they took one, and two buttons: *Confirm* or *Not yet*.
Confirming is what actually marks the work done and pays out the XP — to them,
never to you.

**Goals** — a target plus a log of what you actually did against it. One-off
("finish 8 past papers by December"), or repeating daily, weekly or monthly,
which builds a streak. Goals with a deadline tell you whether you are ahead or
how much a day it now takes to catch up.

**Tasks** — homework written down, filed by subject, with due dates and
priorities.

**Timetable** — the week grid. Click any cell to change it.

**Partner** — their day, their carried-over backlog, their goals, a 14-day
chart, everything they have sent you to check, and a private thread between the
two of you. This is where you tick their homework off.

**Progress** — level, XP, where the XP came from, which subjects you actually
keep on top of, and 14 achievements.

Keyboard: `h` today, `g` goals, `t` tasks, `w` timetable, `f` partner,
`p` progress, `s` settings, `n` new task.

## Two people, and only two

There are no passwords. The app opens on a list of names; you tap yours and
that device remembers it. Underneath, each device signs in anonymously, so it
still has a real identity for the database to check — you just never typed
anything to get one.

The cost is that anyone with the link can tap either name, so the link is what
keeps other people out. Between two people who sit next to each other that is
a fair trade, and the app makes it visible rather than quiet: the picker shows
how many devices hold each name, taking one already in use asks first, and
Settings lists them.

The two of you can see everything of each other's. What you cannot do is claim
the other's work: `hw_checks`, `goal_log` and `xp_events` are writable only by
the person they belong to, enforced in Postgres, not in JavaScript. Everything
else — subjects, timetable, tasks, goals — either of you can edit, which is
what makes the partner side useful.

See `supabase/migrations/`; the policies are the last third of the file.

## Setting it up

Without a backend Tandem runs happily on one device, storing everything in the
browser. To share it between two people you need a Supabase project, which is
free. `SETUP.md` has the steps — about five minutes.

Both the project URL and the anon key are meant to be public and are safe in
this repository. The anon key grants exactly what the row-level policies allow,
which for anyone without a seat is nothing.

## Running it locally

```bash
python3 -m http.server 8600     # then open http://localhost:8600
```

Any static file server does. Opening `index.html` directly will not work —
ES modules need a real origin.

## Offline

Every change is written to the browser first and queued for the server, so
ticking homework off on a bad connection works and syncs when it comes back.
The pill in the corner says what state you are in: **Synced**, **3 to sync**,
**Offline**, or **Local**.

Two details this needs to get right, and does:

- Rows that record the same fact get the same id on both devices, so if you
  both tick something while offline it merges rather than colliding.
- "Did I do it today" is answered in your local timezone. Timestamps are
  stored as UTC, which is correct for the database and wrong for that
  question — at 1am in Tashkent the UTC date is still yesterday.

## Layout

```
index.html
assets/css/app.css        one stylesheet, all eight themes
assets/js/
  config.js               where the backend lives
  lib/supa.js             auth and REST, hand-written
  store.js                cache, offline queue, sync
  domain.js               dates, carry-over, goals, XP — all pure functions
  actions.js              every mutation, and what it earns
  theme.js                preferences to CSS
  ui.js                   elements, sheets, forms, toasts
  seed.js                 the starter timetable
  views/                  one file per screen
  app.js                  routing and boot
supabase/migrations/      the entire backend
```

## Making it yours

Settings is deep on purpose, because the two of you will not want the same
app. Palette (eight, light and dark), accent, typeface, density, corner
radius, sidebar or top bar, which cards appear on the home screen and in what
order, when your week starts, how many days homework carries for, your daily
task goal, and what every action is worth in XP.

All of it is stored per account, not per device. Sign in on a phone and your
version follows you; the other person's does not change.
