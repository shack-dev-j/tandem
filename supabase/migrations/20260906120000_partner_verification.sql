-- Work is confirmed by the other person, never by yourself.
--
-- The first version let you tick your own homework and only let your partner
-- watch. That makes the record a diary. This makes it an account: you do the
-- work, you show it, and the other one marks it done. Evidence is optional —
-- showing someone in person is evidence.

-- ------------------------------------------------------------- evidence
-- A photo of the finished page, or just a note saying it is done. Optional:
-- your partner can tick something with no evidence row at all.

create table if not exists evidence (
  id          uuid primary key,
  owner_id    uuid not null references members(id) on delete cascade,  -- whose work
  subject_id  uuid references subjects(id) on delete cascade,
  task_id     uuid references tasks(id) on delete cascade,
  goal_id     uuid references goals(id) on delete cascade,
  date        date not null default current_date,
  note        text not null default '',
  image       text not null default '',        -- a downscaled data: URL, or ''
  created_at  timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references members(id) on delete set null,
  updated_at  timestamptz not null default now()
);

create index if not exists idx_evidence_owner on evidence(owner_id, created_at desc);
create index if not exists idx_evidence_open  on evidence(reviewed_at) where reviewed_at is null;

drop trigger if exists touch_evidence on evidence;
create trigger touch_evidence before update on evidence
  for each row execute function touch_updated_at();

alter table evidence enable row level security;

-- You submit your own evidence; your partner is the one who resolves it.
drop policy if exists evidence_read   on evidence;
drop policy if exists evidence_submit on evidence;
drop policy if exists evidence_review on evidence;
create policy evidence_read   on evidence for select using (is_member());
create policy evidence_submit on evidence for all
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy evidence_review on evidence for update
  using (is_member() and owner_id <> auth.uid())
  with check (is_member() and owner_id <> auth.uid());

-- ------------------------------------------------- the inversion itself
-- Was: only the owner may write these. Now: only anyone *but* the owner.
-- With two seats that means exactly one person — your partner.

do $$
declare t text;
begin
  foreach t in array array['hw_checks', 'goal_log'] loop
    execute format('drop policy if exists %1$s_own on %1$I', t);
    execute format('drop policy if exists %1$s_verify on %1$I', t);
    execute format('create policy %1$s_verify on %1$I for all
                    using (is_member() and owner_id <> auth.uid())
                    with check (is_member() and owner_id <> auth.uid())', t);
  end loop;
end $$;

-- XP follows the same rule, with one exception. Achievements are worked out
-- from ticks your partner already confirmed, so a client awarding its own
-- achievement is only restating a fact somebody else established. Without the
-- exception they could never be awarded at all, since nobody else's browser
-- is watching your totals.
drop policy if exists xp_events_own on xp_events;
drop policy if exists xp_events_verify on xp_events;
create policy xp_events_verify on xp_events for all
  using (is_member())
  with check (is_member() and (owner_id <> auth.uid() or source = 'achievement'));

-- tasks stay writable by both, because your partner has to be able to write
-- homework down for you. Only the one column needs guarding, and a column is
-- not something a policy can express — so a trigger does it.

create or replace function no_self_completion() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if new.done and not coalesce(old.done, false) and new.owner_id = auth.uid() then
    raise exception 'A task is marked done by your partner, not by you'
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

drop trigger if exists tasks_no_self_completion on tasks;
create trigger tasks_no_self_completion before update on tasks
  for each row execute function no_self_completion();

-- Inserting a task already finished would walk straight past the trigger above.
create or replace function no_self_completion_insert() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if new.done and new.owner_id = auth.uid() then
    raise exception 'A task is marked done by your partner, not by you'
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

drop trigger if exists tasks_no_self_completion_ins on tasks;
create trigger tasks_no_self_completion_ins before insert on tasks
  for each row execute function no_self_completion_insert();
