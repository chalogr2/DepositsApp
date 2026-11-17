-- 004: reservation lifecycle (cancel + refund, no-show, attended, auto-expire)
-- Safe to run more than once.
--
-- Status flow (enforced in lib/reservation-status.ts + the status API route):
--
--   PENDING ──pay──▶ PAID ──▶ ATTENDED   (deposit applied to the bill)
--      │               │ ╲
--      │               │  ▶ NO_SHOW      (restaurant keeps the deposit)
--      │               ▼
--      ├──cancel──▶ CANCELED             (if it was paid: full refund via Stripe)
--      └──time passes unpaid──▶ EXPIRED
--
-- 1) Columns to remember a refund (who refunded is always the restaurant).
alter table public.reservations add column if not exists refunded_at timestamptz;
alter table public.reservations add column if not exists stripe_refund_id text;

-- 2) Only known statuses can be stored. Before this the column accepted any
--    text, and the code had to defend against "paid", "CANCELLED", etc.
--    (Live data check on 2026-11-17: every existing row was 'PAID'.)
alter table public.reservations drop constraint if exists reservations_status_check;
alter table public.reservations add constraint reservations_status_check
  check (status in ('PENDING', 'PAID', 'CANCELED', 'EXPIRED', 'NO_SHOW', 'ATTENDED'));

-- 3) Refund webhooks look reservations up by payment intent.
create index if not exists reservations_payment_intent_idx
  on public.reservations(stripe_payment_intent_id);
