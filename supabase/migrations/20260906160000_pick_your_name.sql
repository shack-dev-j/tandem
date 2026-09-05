-- Signing in by choosing your name.
--
-- Email and passwords were the wrong shape for two people who sit next to each
-- other. They cost a confirmation email, a rate limit, and a password each,
-- and bought a guarantee that was never the point: the two of you know who is
-- who. So the roster is public, you tap your name, and the device remembers.
--
-- Underneath, each device still signs in — anonymously — so it still has a
-- real identity and every policy below still has something to check. What
-- changes is that identity is no longer the same thing as a person: a person
-- can have a phone and a laptop, and both are bound to the same member.

-- --------------------------------------------------------------- identities

-- Every syncable table carries an `id`, because the client merges rows by it;
-- keying this one on auth_id alone would collapse every device into one.
create table if not exists identities (
  id         uuid primary key default gen_random_uuid(),
  auth_id    uuid unique not null,
  member_id  uuid not null references members(id) on delete cascade,
  label      text not null default '',
  created_at timestamptz not null default now(),
  last_seen  timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_identities_member on identities(member_id);

drop trigger if exists touch_identities on identities;
create trigger touch_identities before update on identities
  for each row execute function touch_updated_at();

-- members used to BE auth users. They are people now, so the foreign key to
-- auth.users has to go, along with the trigger that created them on signup.
do $$
declare c text;
begin
  select conname into c
    from pg_constraint
   where conrelid = 'public.members'::regclass
     and contype = 'f'
     and confrelid = 'auth.users'::regclass;
  if c is not null then
    execute format('alter table public.members drop constraint %I', c);
  end if;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
drop function if exists handle_new_user();

alter table members alter column email drop not null;
alter table members alter column email set default '';

-- --------------------------------------------------------------- who am i

-- The member this browser is acting as. Everything about permission is
-- expressed in terms of this rather than auth.uid(), because one person may
-- be holding two devices.
create or replace function me() returns uuid
  language sql stable security definer set search_path = public as $$
  select member_id from identities where auth_id = auth.uid();
$$;

create or replace function is_member() returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (select 1 from identities where auth_id = auth.uid());
$$;

-- The names to choose between. Readable without signing in — that is the
-- point — but it gives away only what a person chose to be called.
create or replace function roster()
  returns table (id uuid, display_name text, role text, devices bigint, last_seen timestamptz)
  language sql stable security definer set search_path = public as $$
  select m.id, m.display_name, m.role,
         count(i.auth_id),
         max(i.last_seen)
    from members m
    left join identities i on i.member_id = m.id
   group by m.id, m.display_name, m.role
   order by m.created_at;
$$;

-- Claim a name for this device. Claiming one that is already in use is
-- allowed — a second device is normal — and recorded, so it shows up on both
-- screens rather than happening quietly.
create or replace function pick_identity(p_member uuid, p_label text default '')
  returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  existing bigint;
  nm text;
begin
  if uid is null then
    return jsonb_build_object('ok', false, 'reason', 'this browser has no session');
  end if;
  select display_name into nm from members where id = p_member;
  if nm is null then
    return jsonb_build_object('ok', false, 'reason', 'no such person');
  end if;

  select count(*) into existing from identities
   where member_id = p_member and auth_id <> uid;

  insert into identities (auth_id, member_id, label)
  values (uid, p_member, coalesce(nullif(p_label, ''), 'a device'))
  on conflict (auth_id) do update
    set member_id = excluded.member_id, label = excluded.label, last_seen = now();

  return jsonb_build_object('ok', true, 'member', p_member,
                            'name', nm, 'other_devices', existing);
end $$;

create or replace function touch_identity() returns void
  language sql security definer set search_path = public as $$
  update identities set last_seen = now() where auth_id = auth.uid();
$$;

-- Sign this device out of the person it is acting as.
create or replace function release_identity() returns jsonb
  language sql security definer set search_path = public as $$
  with gone as (delete from identities where auth_id = auth.uid() returning 1)
  select jsonb_build_object('ok', exists (select 1 from gone));
$$;

-- ------------------------------------------------------- policies, restated
-- Same rules as before, in terms of me() rather than auth.uid().

alter table identities enable row level security;
drop policy if exists identities_read on identities;
drop policy if exists identities_own  on identities;
create policy identities_read on identities for select using (is_member());
create policy identities_own  on identities for all
  using (auth_id = auth.uid()) with check (auth_id = auth.uid());

drop policy if exists members_self on members;
create policy members_self on members for update
  using (id = me()) with check (id = me());

do $$
declare t text;
begin
  foreach t in array array['hw_checks', 'goal_log'] loop
    execute format('drop policy if exists %1$s_verify on %1$I', t);
    execute format('create policy %1$s_verify on %1$I for all
                    using (is_member() and owner_id <> me())
                    with check (is_member() and owner_id <> me())', t);
  end loop;
end $$;

drop policy if exists xp_events_verify on xp_events;
create policy xp_events_verify on xp_events for all
  using (is_member())
  with check (is_member() and (owner_id <> me() or source = 'achievement'));

drop policy if exists evidence_submit on evidence;
drop policy if exists evidence_review on evidence;
create policy evidence_submit on evidence for all
  using (owner_id = me()) with check (owner_id = me());
create policy evidence_review on evidence for update
  using (is_member() and owner_id <> me())
  with check (is_member() and owner_id <> me());

drop policy if exists notes_write on notes;
drop policy if exists notes_mark  on notes;
create policy notes_write on notes for all
  using (author_id = me()) with check (author_id = me());
create policy notes_mark on notes for update
  using (target_id = me()) with check (target_id = me());

create or replace function no_self_completion() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if new.done and not coalesce(old.done, false) and new.owner_id = me() then
    raise exception 'A task is marked done by your partner, not by you'
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

create or replace function no_self_completion_insert() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if new.done and new.owner_id = me() then
    raise exception 'A task is marked done by your partner, not by you'
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

-- ------------------------------------------------------------ the roster

-- Anyone who had a seat becomes a person, so an existing setup keeps working.
insert into members (id, email, display_name, role)
select gen_random_uuid(), s.email,
       coalesce(nullif(s.display_name, ''), split_part(s.email, '@', 1)), s.role
  from seats s
 where not exists (select 1 from members m where lower(m.email) = lower(s.email));

-- Add or rename the two of you. Safe to run again.
create or replace function set_person(p_name text, p_role text default 'student')
  returns uuid language plpgsql security definer set search_path = public as $$
declare existing uuid;
begin
  select id into existing from members where lower(display_name) = lower(p_name);
  if existing is not null then
    update members set role = p_role where id = existing;
    return existing;
  end if;
  insert into members (id, email, display_name, role)
  values (gen_random_uuid(), '', p_name, p_role)
  returning id into existing;
  return existing;
end $$;

grant execute on function roster()            to anon, authenticated;
grant execute on function pick_identity(uuid, text) to anon, authenticated;
grant execute on function release_identity()  to anon, authenticated;
grant execute on function touch_identity()    to anon, authenticated;
grant execute on function connection_check()  to anon, authenticated;

-- connection_check, restated for a roster rather than seats and emails.
create or replace function connection_check()
  returns jsonb language plpgsql security definer
  set search_path = public as $$
declare mid uuid := me();
begin
  return jsonb_build_object(
    'schema_version', 4,
    'has_session',    auth.uid() is not null,
    'people',         (select count(*) from members),
    'names',          (select coalesce(jsonb_agg(display_name order by created_at), '[]'::jsonb)
                         from members),
    'picked',         mid is not null,
    'name',           (select display_name from members where id = mid),
    'devices',        (select count(*) from identities where member_id = mid)
  );
end $$;
