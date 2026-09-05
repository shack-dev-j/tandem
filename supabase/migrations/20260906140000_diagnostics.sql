-- Making a failed connection say what is actually wrong.
--
-- The first version had one bad failure mode: a seat is claimed by a trigger
-- when the account is created, so signing up before the seat existed left you
-- with a working login and no membership. Every policy then returned nothing,
-- which from the app looks identical to a wrong URL, a wrong key, an unapplied
-- migration, or an unconfirmed email. Four very different problems, one blank
-- screen.

-- What is true about the caller. SECURITY DEFINER so it can see auth.users and
-- seats, which an unseated caller is not otherwise allowed to read — it only
-- ever reports on whoever is asking, plus two counts that give away nothing.
create or replace function connection_check()
  returns jsonb language plpgsql security definer
  set search_path = public, auth as $$
declare
  uid uuid := auth.uid();
  em  text;
begin
  if uid is not null then
    select email into em from auth.users where id = uid;
  end if;
  return jsonb_build_object(
    'schema_version', 3,
    'signed_in',      uid is not null,
    'email',          em,
    'has_seat',       em is not null and exists (
                        select 1 from public.seats where lower(email) = lower(em)),
    'is_member',      uid is not null and exists (
                        select 1 from public.members where id = uid),
    'seats',          (select count(*) from public.seats),
    'members',        (select count(*) from public.members)
  );
end $$;

-- Take a seat that was added after you signed up, instead of making you delete
-- the account and start again.
create or replace function claim_seat()
  returns jsonb language plpgsql security definer
  set search_path = public, auth as $$
declare
  uid uuid := auth.uid();
  em  text;
  s   public.seats%rowtype;
begin
  if uid is null then
    return jsonb_build_object('ok', false, 'reason', 'not signed in');
  end if;
  if exists (select 1 from public.members where id = uid) then
    return jsonb_build_object('ok', true, 'reason', 'already a member');
  end if;

  select email into em from auth.users where id = uid;
  select * into s from public.seats where lower(email) = lower(em);
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'no seat for ' || coalesce(em, '?'));
  end if;

  insert into public.members (id, email, display_name, role)
  values (uid, em,
          coalesce(nullif(s.display_name, ''), split_part(em, '@', 1)),
          s.role)
  on conflict (id) do nothing;
  return jsonb_build_object('ok', true, 'reason', 'seat claimed');
end $$;

grant execute on function connection_check() to anon, authenticated;
grant execute on function claim_seat() to authenticated;
