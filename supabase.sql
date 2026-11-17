create extension if not exists "uuid-ossp";

create table if not exists public.restaurants (
  id uuid primary key default uuid_generate_v4(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'My Restaurant',

  stripe_account_id text,
  stripe_onboarding_complete boolean not null default false,

  subscription_status text not null default 'inactive',
  stripe_customer_id text,
  stripe_subscription_id text,
  subscription_current_period_end timestamptz,

  legal_accepted_at timestamptz,
  legal_version text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists restaurants_owner_idx on public.restaurants(owner_user_id);

create table if not exists public.reservations (
  id uuid primary key default uuid_generate_v4(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,

  customer_name text not null default '',
  datetime_iso text not null,
  party_size int not null default 2,
  deposit_cents int not null default 0,
  policy_text text not null default '',
  -- PENDING -> PAID -> ATTENDED | NO_SHOW ; PENDING/PAID -> CANCELED ; PENDING -> EXPIRED
  -- (see migrations/004_reservation_lifecycle.sql and lib/reservation-status.ts)
  status text not null default 'PENDING'
    constraint reservations_status_check
    check (status in ('PENDING', 'PAID', 'CANCELED', 'EXPIRED', 'NO_SHOW', 'ATTENDED')),

  stripe_payment_intent_id text,
  stripe_checkout_session_id text,
  paid_at timestamptz,
  refunded_at timestamptz,
  stripe_refund_id text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists reservations_restaurant_idx on public.reservations(restaurant_id);
create index if not exists reservations_payment_intent_idx on public.reservations(stripe_payment_intent_id);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end; $$;

drop trigger if exists restaurants_set_updated_at on public.restaurants;
create trigger restaurants_set_updated_at before update on public.restaurants
for each row execute function public.set_updated_at();

drop trigger if exists reservations_set_updated_at on public.reservations;
create trigger reservations_set_updated_at before update on public.reservations
for each row execute function public.set_updated_at();

alter table public.restaurants enable row level security;
alter table public.reservations enable row level security;

drop policy if exists "restaurants_select_own" on public.restaurants;
create policy "restaurants_select_own" on public.restaurants
for select using (auth.uid() = owner_user_id);

drop policy if exists "reservations_select_own" on public.reservations;
create policy "reservations_select_own" on public.reservations
for select using (
  exists (select 1 from public.restaurants r where r.id = reservations.restaurant_id and r.owner_user_id = auth.uid())
);

-- SECURITY MODEL: the browser (anon / authenticated) may only READ its own rows
-- (policies above). There are deliberately NO insert/update/delete policies and
-- no write privileges: every write goes through a server route that checks
-- auth, ownership, subscription and input, then writes with the service role.
-- See migrations/003_lock_down_client_writes.sql and DEVLOG.md.
revoke insert, update, delete on public.restaurants  from anon, authenticated;
revoke insert, update, delete on public.reservations from anon, authenticated;

-- security definer = runs with the owner's rights, so it validates the caller
-- itself and pins search_path.
create or replace function public.ensure_restaurant_for_user(p_owner_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or p_owner_user_id is distinct from auth.uid() then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  if not exists (select 1 from public.restaurants where owner_user_id = p_owner_user_id) then
    insert into public.restaurants(owner_user_id, name) values (p_owner_user_id, 'My Restaurant');
  end if;
end; $$;

revoke all on function public.ensure_restaurant_for_user(uuid) from public, anon;
grant execute on function public.ensure_restaurant_for_user(uuid) to authenticated;

-- Tracks active Stripe checkout sessions per reservation.
-- Used for session reuse and rate limiting on the guest checkout endpoint.
-- Only accessed server-side via the service-role client (bypasses RLS).
create table if not exists public.reservation_checkout_sessions (
  id uuid primary key default uuid_generate_v4(),
  reservation_id uuid not null unique references public.reservations(id) on delete cascade,

  stripe_checkout_session_id text,
  stripe_checkout_session_url text,

  attempts_count int not null default 0,
  last_attempt_at timestamptz,
  expires_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists rcs_reservation_idx on public.reservation_checkout_sessions(reservation_id);

drop trigger if exists rcs_set_updated_at on public.reservation_checkout_sessions;
create trigger rcs_set_updated_at before update on public.reservation_checkout_sessions
for each row execute function public.set_updated_at();

-- RLS enabled; no policies for regular users since this table is service-role only.
alter table public.reservation_checkout_sessions enable row level security;
revoke all on public.reservation_checkout_sessions from anon, authenticated;

-- Realtime: stream reservation changes to the vendor dashboard (RLS still applies).
-- Same as migrations/002_realtime_reservations.sql.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'reservations'
  ) then
    alter publication supabase_realtime add table public.reservations;
  end if;
end $$;
