-- Migration 001: Add missing columns to restaurants and create reservation_checkout_sessions
-- Run this against your existing Supabase database in the SQL editor.
-- supabase.sql already reflects these changes for fresh installs.

-- 1. Add legal acceptance tracking columns to restaurants
alter table public.restaurants
  add column if not exists legal_accepted_at timestamptz,
  add column if not exists legal_version text;

-- 2. Create reservation_checkout_sessions table
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
