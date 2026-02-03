# Deposit Links MVP v3 — Self-serve restaurants + subscription gating + Stripe Connect

You asked for:
- restaurants create reservations (not you)
- restaurants self-register/login
- restaurants must pay you monthly to unlock creating/sending payment links
- restaurants can still connect Stripe / do onboarding even if unpaid
- vendor is always the merchant of record for guest payments
- keep an admin overview page

This repo implements exactly that.

## Supabase setup (required)
1) Create Supabase project
2) Enable Email provider (Auth)
3) Run `supabase.sql` in Supabase SQL Editor
4) Put these into `.env`:
   - NEXT_PUBLIC_SUPABASE_URL
   - NEXT_PUBLIC_SUPABASE_ANON_KEY
   - SUPABASE_SERVICE_ROLE_KEY

## Stripe setup (required)
1) Create a recurring monthly Price in Stripe TEST mode
2) Put the price id in `.env`:
   - STRIPE_SUB_PRICE_ID=price_...
3) Webhook for subscription updates (recommended):
   - POST /api/stripe/webhook

Local dev:
```bash
stripe login
stripe listen --forward-to localhost:3000/api/stripe/webhook
```
Copy `whsec_...` into STRIPE_WEBHOOK_SECRET.

## Run locally
```bash
npm install
cp .env.example .env
npm run dev
```

## How it works
- `/vendor/login` -> magic link login
- `/vendor` -> dashboard:
  - Subscribe (Billing) -> unlocks link creation
  - Connect Stripe -> enables guest card payments
  - Create reservation link -> only enabled when BOTH are ready
- `/r/:id` -> guest deposit page
- `/success?rid=...&sid=...` -> verifies payment and marks reservation PAID
- `/admin` -> your overview (demo password gate)

## Notes
- Guest payment status is verified on success return (simpler than Connect webhooks for MVP).
- Admin page reads via Supabase service role, so keep it protected.
