# Deposit Links

A SaaS for restaurants in Spain to stop no-shows: the restaurant creates a
reservation, sends the guest a **payment link for a deposit**, and sees it turn
**PAGADO** on its dashboard in real time. After the meal the deposit is applied to
the bill. If the guest doesn't show up, the restaurant keeps it, and if the
restaurant cancels, it's refunded with one click.

Restaurants pay the platform a **monthly subscription**. Guest deposits go
**straight to the restaurant's own Stripe account**, so the restaurant is the
merchant of record and the platform never holds guest money.

**Stack:** Next.js 14 (App Router) · TypeScript · Supabase (Auth, Postgres, RLS,
Realtime) · Stripe (Billing, Checkout, Connect Express, webhooks) · zod

---

## Features

| For the restaurant | For the guest |
|---|---|
| Passwordless login (magic link) | Opens a link, no account needed |
| Monthly subscription via Stripe Checkout; Billing Portal to manage it (invoices include billing address + NIF/CIF) | Sees restaurant, date (Madrid time), party size, deposit and policy |
| Connect their own Stripe account (Express onboarding) | Pays by card on Stripe Checkout |
| Create a deposit link, then copy it or send it by WhatsApp | Sees the status afterwards (paid, cancelled/refunded, expired) |
| Live reservations table (Supabase Realtime) | |
| Per reservation: **Asistió**, **No presentado**, **Cancelar y reembolsar** | |
| Unpaid links expire automatically at the reservation time | |

An `/admin` overview of all restaurants is restricted to the emails in `ADMIN_EMAILS`.

## Architecture

```
Browser (restaurant) ──read only──▶ Supabase (RLS: own rows only, + Realtime)
        │
        └── every write ──▶ Next.js API routes ──service role──▶ Supabase
                                   │
                                   └──▶ Stripe (platform account: subscriptions)
                                   └──▶ Stripe (restaurant's connected account: deposits, refunds)

Stripe ──webhooks──▶ /api/stripe/webhook          (platform: subscription changes)
                 └─▶ /api/stripe/connect-webhook  (connected accounts: deposit paid, refunds)
```

Main design rules (the reasoning behind each is in [`DEVLOG.md`](DEVLOG.md)):

- **The browser can only read.** The database grants the browser roles no
  insert/update/delete. Every change goes through a server route that checks
  login, ownership, subscription and input (zod), then writes with the service role.
- **Stripe is the source of truth for money.** Subscription state is re-fetched
  from Stripe, never trusted from a webhook payload. A reservation becomes PAID
  only after the Stripe session has been checked to match the reservation, the
  restaurant's account, the amount and the currency (`lib/reservation-payments.ts`).
- **Two independent confirmation paths.** The guest's return to `/success`
  and the Connect webhook both confirm a payment. Both are idempotent, so
  closing the tab never loses a payment.
- **One rule, one place.** The UI and the API share helpers, so they can't
  disagree: `lib/subscription.ts` (is the subscription active?),
  `lib/reservation-status.ts` (which statuses and actions exist),
  `lib/config.ts` (deposit limits) and `lib/datetime.ts` (store UTC, show Europe/Madrid).

### Reservation lifecycle

```
PENDING ──pay──▶ PAID ──▶ ATTENDED   (deposit applied to the bill)
   │               │ ╲
   │               │  ▶ NO_SHOW      (restaurant keeps the deposit)
   │               ▼
   ├──cancel──▶ CANCELED             (if paid: full refund via Stripe)
   └──time passes unpaid──▶ EXPIRED
```

## Project structure

```
app/
  vendor/                 restaurant dashboard, onboarding, profile, new reservation
  r/[id]/                 guest deposit page
  success/                guest return page (verifies the payment)
  admin/                  platform overview
  api/vendor/...          restaurant actions (subscribe, connect, create, status)
  api/guest/...           guest checkout + verify
  api/stripe/webhook      platform webhook (subscriptions)
  api/stripe/connect-webhook  connected-account webhook (deposits, refunds)
lib/                      shared rules + Stripe/Supabase clients
migrations/               incremental SQL, run in order on an existing database
supabase.sql              full schema for a NEW database (= all migrations applied)
DEVLOG.md                 every change: problem, investigation, fix, verification
```

## Running locally

**Requirements:** Node 18+, a Supabase project, a Stripe account in **test mode**, and the [Stripe CLI](https://stripe.com/docs/stripe-cli).

1. **Install and configure**
   ```bash
   npm install
   cp .env.example .env     # then fill in the values (see comments in the file)
   ```
2. **Supabase**
   - New project: run `supabase.sql` in the SQL Editor.
   - Existing project: run the files in `migrations/` you haven't run yet, in order.
   - Authentication → Providers: enable **Email**. URL Configuration: add
     `http://localhost:3000/auth/callback` as a redirect URL.
3. **Stripe (test mode)**
   - Create a recurring monthly Price and put its id in `STRIPE_SUB_PRICE_ID`.
   - Enable **Connect** (Express accounts).
4. **Forward webhooks** (in a second terminal, and keep it running):
   ```bash
   stripe login
   stripe listen --forward-to localhost:3000/api/stripe/webhook \
                 --forward-connect-to localhost:3000/api/stripe/connect-webhook
   ```
   Copy the `whsec_...` it prints into `STRIPE_WEBHOOK_SECRET`. Locally one
   secret signs both endpoints, so leave `STRIPE_CONNECT_WEBHOOK_SECRET` empty.
5. **Start the app**
   ```bash
   npm run dev              # http://localhost:3000
   ```

**Test cards:** `4242 4242 4242 4242`, any future date, any CVC.

## Status

This is an MVP and portfolio project. What's left before production (live
keys, custom SMTP or OAuth login, production webhook endpoints, IVA on
subscription invoices, tests, monitoring) is tracked in the **Backlog** section
of [`DEVLOG.md`](DEVLOG.md).
