# Connecting the two of you

Tandem works on one device with no setup at all. To share it between two
people it needs somewhere to keep the data: a Supabase project, which is a
hosted Postgres database. The free tier is far more than this needs and there
is no card to add.

About five minutes, and there are no passwords anywhere in it.

## 1. Make a project

At [supabase.com](https://supabase.com), sign up and create a project. Pick a
region near you — Frankfurt is closest to Uzbekistan. Save the database
password it gives you somewhere safe; you will not need it here, but it cannot
be recovered.

Wait for it to finish setting up.

## 2. Create the tables

**SQL Editor** → **New query**. Paste in the whole of
[`supabase/setup.sql`](supabase/setup.sql) and press **Run**.

You want *"Success. No rows returned."* That is every table, every policy, and
the functions the app calls. It is safe to run again, and safe after a
half-finished attempt: every statement is `if not exists`, `create or replace`,
or `drop ... if exists`.

## 3. Say who the two of you are

New query. Put in your real names — these are what you will tap to sign in:

```sql
select set_person('Shohjahon');
select set_person('Yorqinoy');
```

Run it again any time to add someone or fix a spelling. There are no email
addresses and no passwords; a name is the whole account.

Use `set_person('Name', 'partner')` for someone who never has homework of
their own — a parent or a tutor. They can confirm work but have none to be
confirmed. Two students should both be left as the default, `student`.

## 4. Turn on anonymous sign-ins

**Authentication** → **Sign In / Providers** → **Anonymous sign-ins** → on.

This is what lets a device have an identity without anyone typing anything.
Each browser gets its own, and the database uses it to work out which of you
is asking — which is what makes "you cannot confirm your own homework" a rule
the server enforces rather than a suggestion the app makes.

While you are there you can leave **Email** off entirely. Tandem does not use it.

## 5. Point the app at it

**Project Settings** → **API**. Copy two things:

- **Project URL** — `https://something.supabase.co`
- **anon public** key — a long string starting `eyJ`

Open Tandem and it will ask for both. Or put them in `assets/js/config.js` and
commit, so neither of you ever types them:

```js
export const SUPABASE_URL = 'https://something.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOi...';
```

Both are designed to be public and are safe in a public repository. They are
not passwords: the anon key says *which project* you are talking to, and the
row-level policies decide what that gets you.

The key that must never leave the dashboard is **service_role**, which bypasses
every policy.

## 6. Both of you tap your name

Open the site. It asks **Who are you?** and lists the names from step 3. Tap
yours; that device remembers it. Send the other person the same link and they
tap theirs.

That is the whole sign-in. From then on, whatever either of you does appears
on the other's screen within about twenty seconds.

## What this trades away

Anyone with the link can tap either name. There is no password stopping them,
so the link is the only thing keeping other people out — do not post it
publicly.

Between the two of you it is deliberate rather than careless: you already know
who is who, and the app makes every device visible. The picker says how many
devices hold each name, taking a name that is already in use asks first, and
Settings lists them. Nothing happens quietly.

If you would rather have real passwords, the git history has the email
version — it worked, it just cost a confirmation email, a rate limit, and two
passwords to forget.

## If something is wrong

**Press "Test connection".** It is on the sign-in screen and in Settings →
Connection. It asks the database directly and says which of these it is:

- the URL is wrong, or the project is paused
- the anon key was rejected
- `setup.sql` has not been run
- nobody has been added yet — and it prints the SQL for step 3

**"Nobody is set up yet"** — you have skipped step 3.

**The picker never appears, or hangs** — anonymous sign-ins are off. That is
step 4.

**The pill says Offline** — the URL is wrong, or the project is paused.
Supabase pauses free projects after a week with no requests; the dashboard has
a button to wake it.

**Changes the server refused** show up in Settings → Connection with a reason.
That list should stay empty.

## What it costs

Nothing. Two people generate a few thousand rows a year against a free tier
measured in hundreds of megabytes. The only thing to watch is the pause after
a week idle, and opening the app resets that.
