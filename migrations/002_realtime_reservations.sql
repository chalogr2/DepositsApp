-- Migration 002: enable Supabase Realtime for reservations
-- Run this once in the Supabase SQL Editor. Safe to run more than once.
--
-- Why: the vendor dashboard subscribes to changes on public.reservations so
-- the table updates by itself when a guest pays. Postgres only streams changes
-- for tables included in the `supabase_realtime` publication.
-- Security: Realtime still applies RLS, so an owner only receives events for
-- rows allowed by "reservations_select_own" (their own restaurant).

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'reservations'
  ) then
    alter publication supabase_realtime add table public.reservations;
  end if;
end $$;
