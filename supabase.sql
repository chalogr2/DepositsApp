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
  status text not null default 'PENDING',

  stripe_payment_intent_id text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists reservations_restaurant_idx on public.reservations(restaurant_id);

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

drop policy if exists "restaurants_insert_own" on public.restaurants;
create policy "restaurants_insert_own" on public.restaurants
for insert with check (auth.uid() = owner_user_id);

drop policy if exists "restaurants_update_own" on public.restaurants;
create policy "restaurants_update_own" on public.restaurants
for update using (auth.uid() = owner_user_id)
with check (auth.uid() = owner_user_id);

drop policy if exists "reservations_select_own" on public.reservations;
create policy "reservations_select_own" on public.reservations
for select using (
  exists (select 1 from public.restaurants r where r.id = reservations.restaurant_id and r.owner_user_id = auth.uid())
);

drop policy if exists "reservations_insert_own" on public.reservations;
create policy "reservations_insert_own" on public.reservations
for insert with check (
  exists (select 1 from public.restaurants r where r.id = reservations.restaurant_id and r.owner_user_id = auth.uid())
);

drop policy if exists "reservations_update_own" on public.reservations;
create policy "reservations_update_own" on public.reservations
for update using (
  exists (select 1 from public.restaurants r where r.id = reservations.restaurant_id and r.owner_user_id = auth.uid())
)
with check (
  exists (select 1 from public.restaurants r where r.id = reservations.restaurant_id and r.owner_user_id = auth.uid())
);

create or replace function public.ensure_restaurant_for_user(p_owner_user_id uuid)
returns void language plpgsql security definer as $$
begin
  if not exists (select 1 from public.restaurants where owner_user_id = p_owner_user_id) then
    insert into public.restaurants(owner_user_id, name) values (p_owner_user_id, 'My Restaurant');
  end if;
end; $$;

grant execute on function public.ensure_restaurant_for_user(uuid) to authenticated;
