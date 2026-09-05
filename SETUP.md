# Connecting the two of you

Tandem works on one device with no setup at all. To share it between two
people, it needs somewhere to keep the data. That is Supabase — a hosted
Postgres database with accounts built in. The free tier is far more than this
needs, and there is no card to add.

Roughly five minutes.

## 1. Make a project

Go to [supabase.com](https://supabase.com), sign up, and create a project.
Choose a region near you (Frankfurt is the closest to Uzbekistan). Save the
database password it gives you somewhere safe — you will not need it for this,
but it is not recoverable.

Wait for the project to finish provisioning.

## 2. Create the tables

In the left sidebar: **SQL Editor** → **New query**. Paste in each file from
`supabase/migrations/`, oldest first, and press **Run** after each:

1. `20260906000000_initial_schema.sql` — tables, seats, policies
2. `20260906120000_partner_verification.sql` — evidence, and the rule that
   you cannot confirm your own work

*Or*, if you have connected this repository under **Integrations → GitHub**
with the working directory `.` and the production branch `main`, the migration
is applied for you on every push and you can skip this step.

It should say "Success. No rows returned". That has created every table, every
policy, and the trigger that hands out seats.

## 3. Give yourselves the two seats

New query again. Change the emails and names, then run:

```sql
insert into seats (email, role, display_name) values
  ('you@example.com',     'student', 'Your name'),
  ('them@example.com',    'partner', 'Their name');
```

If you are two students tracking each other, give both of you `student` — you
each do your own homework and confirm the other's. Use `partner` only for
someone who never has homework of their own, like a parent or a tutor.

Neither role lets you confirm your own work. That is not a setting.

The email has to match exactly what each of you signs up with.

## 4. Close the door behind you

**Authentication** → **Sign In / Providers** → **Email**, and turn off
**Allow new users to sign up** once you have both created your accounts
(step 6). Until then it needs to be on.

Anyone who does sign up without a seat sees an empty app regardless — this
just stops the accounts existing at all.

While you are there, turning off **Confirm email** makes the first sign-in
simpler. If you leave it on, you will each get a confirmation link to click
before you can sign in.

## 5. Point the app at it

**Project Settings** → **API**. You need two things:

- **Project URL** — `https://something.supabase.co`
- **anon public** key — a long string starting `eyJ`

Open Tandem, and it will ask for both. Or put them in
`assets/js/config.js` and commit, so neither of you has to type them:

```js
export const SUPABASE_URL = 'https://something.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOi...';
```

Both values are designed to be public and are safe in a public repository.
They are not passwords: the anon key is a claim about *which project* you are
talking to, and the row-level policies decide what that gets you. Without a
seat, it gets nothing.

The one key you must never put here is the **service_role** key, which
bypasses every policy. Leave it in the dashboard.

## 6. Both of you sign in

Open the site, choose **I need to create my account**, and use the email you
gave a seat to. Do the same on the other person's device with the other email.

That is it. Everything either of you does now appears on the other's screen
within about twenty seconds.

## If something is wrong

**"No seat for this account"** — the email you signed up with is not in
`seats`. Check for a typo, add it, then sign out and back in.

**Everything is empty after signing in** — same cause. The trigger only runs
when the account is *created*, so adding a seat afterwards means you need to
delete the user under **Authentication → Users** and sign up again.

**The pill says Offline** — the URL is wrong, or the project is paused.
Supabase pauses free projects after a week with no requests; the dashboard has
a button to bring it back.

**Changes the server refused** appear in Settings → Connection with the reason.
That list should stay empty.

## What it costs

Nothing. Two people generate a few thousand rows a year, against a free tier
measured in hundreds of megabytes. The only thing to watch is the pause after
a week of inactivity, and using the app resets that.
