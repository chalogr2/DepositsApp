-- Migration 003: the browser may only READ; every write goes through our server
-- Run once in the Supabase SQL Editor. Safe to run more than once.
--
-- WHY
-- The browser holds the public anon key + the user's session token, so anything
-- the `authenticated` role is allowed to do, a restaurant owner can also do
-- directly from DevTools, skipping our API routes and their checks.
-- Verified on 2026-11-17 against the dev database with a throwaway user:
--   * INSERT into reservations was allowed (any status, any deposit, no paywall)
--   * UPDATE reservations SET status='PAID' was allowed
--   * ensure_restaurant_for_user() accepted ANOTHER user's id
-- New rule: `anon` / `authenticated` get SELECT only (needed for the dashboard
-- and Realtime). Writes are done server-side with the service-role key, after
-- the route has checked auth, ownership, subscription and input.

-- 1) Columns used by payment confirmation (exist in some DBs already)
alter table public.reservations
  add column if not exists stripe_checkout_session_id text,
  add column if not exists paid_at timestamptz;

-- 2) Remove write privileges from client roles.
--    (Revoking a table privilege also revokes column-level grants, e.g. a
--    previous `grant update (name)`.)
revoke insert, update, delete on public.restaurants  from anon, authenticated;
revoke insert, update, delete on public.reservations from anon, authenticated;
revoke all on public.reservation_checkout_sessions   from anon, authenticated;

-- 3) Remove the write policies (with no privilege they are dead code; dropping
--    them makes the intent obvious to the next reader). SELECT policies stay.
drop policy if exists "restaurants_insert_own"  on public.restaurants;
drop policy if exists "restaurants_update_own"  on public.restaurants;
drop policy if exists "reservations_insert_own" on public.reservations;
drop policy if exists "reservations_update_own" on public.reservations;

-- 4) The RPC may only create a row for the CALLER.
--    `security definer` runs with the function owner's rights (bypasses RLS),
--    so it must validate its input itself. `set search_path` stops a caller
--    from shadowing `restaurants` with an object in another schema.
create or replace function public.ensure_restaurant_for_user(p_owner_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or p_owner_user_id is distinct from auth.uid() then
    raise exception 'not allowed' using errcode = '42501'; -- insufficient_privilege
  end if;

  if not exists (select 1 from public.restaurants where owner_user_id = p_owner_user_id) then
    insert into public.restaurants(owner_user_id, name) values (p_owner_user_id, 'My Restaurant');
  end if;
end; $$;

revoke all on function public.ensure_restaurant_for_user(uuid) from public, anon;
grant execute on function public.ensure_restaurant_for_user(uuid) to authenticated;
