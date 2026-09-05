# The database

`migrations/20260906000000_initial_schema.sql` is the whole backend: tables,
the two-seat invite trigger, and the row-level policies that decide who may
read and write what.

It gets applied one of two ways.

**Through the GitHub integration.** In the Supabase dashboard, under
Integrations → GitHub, connect this repository with the working directory set
to `.` and the production branch set to `main`. Every push to `main` that adds
a migration is applied to the database.

**By hand.** Open the SQL editor in the dashboard, paste the migration file in,
and run it. Nothing else is needed — this is a perfectly good way to run it
once and never think about it again.

Either way it is safe to run more than once: every statement is written
`if not exists` or `create or replace`.

## Adding to it later

Never edit a migration that has already been applied — the runner records
which files it has seen and will skip an edited one, so your database and your
repository would quietly disagree. Add a new file instead, named with a
timestamp that sorts after the last one:

```
supabase/migrations/20261015093000_add_something.sql
```
