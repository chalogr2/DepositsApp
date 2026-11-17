# Dev Log: Deposit Links

This file records **what changed, why, and how we checked it**, so any developer
(including someone new to the project) can follow the reasoning behind the code.

**How to add an entry:** newest entries go at the top. Each entry says:

- what problem was observed,
- how it was investigated,
- the root cause,
- what was changed (and what alternatives were rejected),
- how it was verified,
- anything left open.

**Quick glossary** (terms used below)

| Term | Meaning in this project |
|---|---|
| **Restaurant / vendor** | A customer of *ours*. Logs in at `/vendor`, pays us a monthly subscription. |
| **Guest** | A restaurant's diner who pays a deposit via a link `/r/<id>`. |
| **Platform subscription** | The monthly fee the restaurant pays *us* (Stripe Billing, on our own Stripe account). |
| **Stripe Connect (Express) account** | The restaurant's *own* Stripe account. Guest deposits are paid into it. |
| **Stripe customer (`cus_...`)** | A restaurant's record in our Stripe account (holds card, invoices). Separate from its subscription (`sub_...`). |
| **Checkout** | Stripe-hosted payment page. Used to **start** a subscription. |
| **Billing Portal** | Stripe-hosted page to **manage** an existing subscription (cancel, change card, invoices). |
| **Webhook** | Stripe calling our `/api/stripe/webhook` to tell us something changed. |
| **Source of truth** | The system whose data wins when two copies disagree. For billing, that is **Stripe**; our `restaurants` table is only a copy. |

---

## 2026-11-17: Feature: reservations table updates live when a guest pays

**Branch:** `staging` (uncommitted at time of writing)

### 1. The request

When a guest paid a deposit, the restaurant had to reload `/vendor` to see the
row change to PAGADO. Goal: the dashboard (only that page, only while it's
open) updates by itself.

### 2. Options considered

| Option | How it works | Verdict |
|---|---|---|
| **Polling** | Browser asks the server "anything new?" every N seconds | Simple, but wasteful (a query every few seconds per open tab, forever) and still delayed by N seconds. |
| **Server-Sent Events / own WebSocket server** | Our server pushes updates | Needs a long-lived server connection. Vercel serverless functions aren't designed for that. |
| **Supabase Realtime** ✅ | Supabase streams Postgres row changes to the browser over a WebSocket it already hosts | Already part of our stack (no new service, no new dependency), instant, and it **respects RLS**. Chosen. |

### 3. How it works

```
guest pays ─► /api/guest/verify ─► UPDATE reservations SET status='PAID'
                                         │
                         Postgres change stream (publication "supabase_realtime")
                                         │
                         Supabase Realtime checks RLS for each subscriber
                                         │
              open /vendor tab of THAT restaurant's owner ─► re-fetch list ─► row turns PAGADO (green flash)
```

### 4. What was changed

#### 4.1 Database: `migrations/002_realtime_reservations.sql` (also appended to `supabase.sql`)

Adds `public.reservations` to the `supabase_realtime` publication. Postgres
only streams changes for tables in that publication, so **without this step no
events are sent**. The SQL checks `pg_publication_tables` first, so running it
twice is safe. **Must be run manually in the Supabase SQL Editor.**

#### 4.2 Dashboard: `app/vendor/vendor-dashboard-client.tsx`

- The reservations list moved from a plain prop into React **state** (`rs`),
  so it can change after the first render.
- `reloadReservations()` runs the same query as the server page (latest 25 rows
  for this restaurant) from the browser. The query runs as the logged-in owner,
  so RLS applies.
- A `useEffect` subscribes to `postgres_changes` on `reservations` with the filter
  `restaurant_id=eq.<this restaurant>`. On any INSERT/UPDATE/DELETE it calls
  `reloadReservations()`.
  - **Why re-fetch instead of using the event's row data?** Re-fetching keeps
    the ordering and the 25-row limit correct, with no merge logic to get
    wrong. It costs one small query per change, which is negligible.
- **Auth for the socket.** Before subscribing we call
  `supabase.realtime.setAuth(session.access_token)`. If the socket connected
  with only the anon key, RLS would treat it as "nobody" and silently deliver
  nothing. supabase-js keeps the token updated on refresh after that.
- **Missed events.** When the socket (re)connects (`SUBSCRIBED` status, which
  fires on the first connect and after Wi-Fi drops or laptop sleep), we re-fetch once.
  We also re-fetch when the tab becomes visible again, because browsers throttle
  background tabs.
- **Cleanup.** When the page closes or the component unmounts, the channel is
  removed (`supabase.removeChannel`). The `cancelled` flag stops a slow
  `getSession()` from subscribing *after* cleanup already ran.
- **Visual feedback.**
  - Rows that go from non-PAID to PAID get the CSS class `justPaid` for 4 s (a
    green flash that fades out).
  - A small "● En vivo / Conectando…" label next to "Reservas recientes" shows
    the connection state. This is useful for debugging too.
- `supabaseBrowser()` is wrapped in `useMemo`, so the effect has a stable
  dependency and doesn't resubscribe on every render.

#### 4.3 CSS: `app/globals.css`

- `@keyframes paidFlash` has only a `from` keyframe (green), so it fades to
  whatever background the row or card normally has.
- Users with "reduce motion" set in their OS get a static green outline instead.

### 5. Security notes

- No new endpoint, no service-role key in the browser.
- Realtime applies the existing `reservations_select_own` policy, so an owner
  can't receive another restaurant's events even by editing the filter in DevTools.

### 6. Verification

| Check | Result |
|---|---|
| `npx tsc --noEmit` | ✅ passes |
| `npm run lint` | ✅ no new warnings |

**Manual test:**

1. Run `migrations/002_realtime_reservations.sql` in the Supabase SQL Editor.
2. Open `/vendor` and wait for "● En vivo".
3. In a private window, pay a reservation (`4242…`) and let `/success` load.
4. The dashboard row should flash green and show PAGADO **without reloading**.

**Known limitation:** the row only turns PAID when the guest's browser reaches
`/success` (see backlog: Connect webhook). Once that webhook exists, live updates
will work even if the guest closes the tab early, with no change needed here.

---

## Backlog: what's left for the MVP (as of 2026-11-17)

Priority: 🔴 must fix before real users · 🟠 needed for a usable MVP · 🟡 polish / later.

| # | Pri | Item | Where |
|---|---|---|---|
| 1 | 🔴 | RLS lets owners write any column of their own `restaurants` row (fake `active` subscription, swap Stripe ids). | `supabase.sql` |
| 2 | 🔴 | `/api/guest/verify` doesn't check the session belongs to the reservation (one €1 payment can mark another reservation PAID). | `app/api/guest/verify/route.ts` |
| 3 | 🔴 | No Connect webhook for guest payments: if the guest closes the tab before `/success`, the reservation stays PENDING forever. | new webhook endpoint |
| 4 | 🔴 | Reservation create allows a €0 deposit or more than €500, but checkout rejects both, so the restaurant gets a link the guest can't pay. | `reservations/create/route.ts` |
| 5 | 🔴 | Timezone: the form's default time is computed in UTC (1 h off in Spain), and the guest page prints the raw ISO string (`2026-11-18T19:30:00.000Z`). | `new-reservation-client.tsx`, `app/r/[id]/page.tsx` |
| 6 | 🔴 | Production setup: custom SMTP for Supabase Auth (the default allows only a few emails/hour, so real signups would fail), live Stripe keys, live webhook endpoint, Connect platform profile, Supabase prod redirect URLs, Vercel env vars. | config |
| 7 | 🔴 | Spanish invoicing: subscription invoices need IVA and the customer's NIF/CIF (Stripe Tax or tax rates, `tax_id_collection` in Checkout). | `subscribe/route.ts`, Stripe settings |
| 8 | 🟠 | No way to cancel a reservation / refund / mark no-show. `CANCELED` and `EXPIRED` statuses exist but nothing sets them; links stay payable after the reservation date. | dashboard + new API |
| 9 | 🟠 | No email notifications (Resend is configured in `.env` but unused): "deposit received" to the restaurant, confirmation to the guest. | new |
| 10 | 🟠 | Create-reservation UX: prefilled "Juan Pérez", `alert()` popup for the link. It should show the link with copy/WhatsApp buttons. | `new-reservation-client.tsx` |
| 11 | 🟡 | Dashboard shows only the latest 25 reservations (no pagination/search/filter). | dashboard |
| 12 | 🟡 | `trialing` treated as active in admin but not elsewhere; admin title says "activos" but lists all restaurants. | admin |
| 13 | 🟡 | README outdated (mentions "demo password gate"; no `ADMIN_EMAILS`, migrations, realtime). | `README.md` |
| 14 | 🟡 | No automated tests, no error monitoring. | — |
| 15 | 🟡 | Middleware runs `supabase.auth.getUser()` on every `/api/*` call, including the Stripe webhook and guest routes (extra latency). | `middleware.ts` |

---

## 2026-11-17: Fix: dashboard showed the old subscription state right after paying (needed a manual reload)

**Branch:** `staging` (uncommitted at time of writing)

### 1. What was observed

After re-subscribing (the flow from the entry below): paying in Stripe
Checkout → redirected back to `/vendor` → the dashboard **still showed no active
subscription**. A manual reload a few seconds later showed it correctly.

### 2. Investigation

The fact that a reload "fixed" it suggested the data was correct *eventually*
and the page just rendered *too early*. To confirm, I compared timestamps
(read-only):

| Time (UTC) | Source | Event |
|---|---|---|
| 17:09:58 | Stripe events API | subscription becomes `active`; `checkout.session.completed` |
| ~17:09:58 | (browser) | Stripe redirects the browser to `/vendor?sub=success` |
| ~17:09:59 | `/vendor` | page reads the DB, which is still `inactive`, so it renders "not subscribed" |
| **17:10:11** | Supabase `restaurants.updated_at` | webhook finally writes `active`, **13 s after payment** |

### 3. Root cause

**A race condition between two independent paths:**

```
Stripe ──(1) browser redirect──────────► /vendor  (reads DB: still old!)
   └────(2) webhook ─► stripe listen ─► /api/stripe/webhook ─► DB updated   (seconds later)
```

The dashboard got its subscription state **only** from the DB, and the DB was
**only** updated by the webhook. Stripe does not wait for the webhook before
redirecting the browser; the two happen in parallel. Webhooks are asynchronous
by design: they can take seconds, and minutes if they have to retry. Locally it's
worse: events go through `stripe listen`, and `next dev` compiles the webhook
route on its first request.

**Second, hidden problem found in the same event log.** Stripe sent
`customer.subscription.created` with `status = incomplete` (before the card
was charged) and then `customer.subscription.updated` with `status = active`.
**Stripe does not guarantee webhook delivery order.** The old handler wrote
whatever status was *inside the event*. If the older `incomplete` event had
arrived last, the DB would have ended up `inactive` permanently, even though
the restaurant had paid.

### 4. The fix

The principle: **don't depend on the webhook for what the user sees right
after paying, and never trust the status inside an event; ask Stripe for the
current state.**

#### 4.1 New `lib/billing-sync.ts` with `syncRestaurantSubscription()`

One server-only function that:

1. **re-fetches** the subscription from Stripe (`subscriptions.retrieve`). That gives the *current* state, not a snapshot from an event that may be old;
2. maps the status (`active`, `trialing`, `past_due`, `canceled`, otherwise `inactive`);
3. writes status, subscription id, period end (and customer id if known) to the restaurant row.

It is **idempotent**: if the return page and the webhook both run it, the
second run just writes the same values. Both callers below use it, so the
logic exists in one place.

#### 4.2 Checkout now tells us which session was paid (`subscribe/route.ts`)

```ts
success_url: `${returnUrl}?sub=success&session_id={CHECKOUT_SESSION_ID}`,
```

`{CHECKOUT_SESSION_ID}` is a literal placeholder that **Stripe** replaces with
the real id when redirecting (documented Stripe feature).

#### 4.3 Dashboard syncs before rendering (`app/vendor/page.tsx`)

When the URL has `sub=success&session_id=...`, the server component:

1. retrieves that Checkout session from Stripe;
2. **checks it's legitimate**: `mode === "subscription"`, `status === "complete"`, and
   `client_reference_id === <this user's restaurant id>`. The `session_id` comes
   from the URL, so anyone could paste any value, and without this check someone
   could try to attach another restaurant's payment to their own row;
3. calls `syncRestaurantSubscription()`;
4. `redirect("/vendor")` to drop the query string, so reloading the page doesn't
   repeat the Stripe calls. This happens **outside** the `try/catch` because
   Next.js `redirect()` works by throwing a special error.

If anything fails (Stripe down, bad id), the error is swallowed and the
webhook still updates the row later. The worst case is the old behaviour,
never something worse.

#### 4.4 Webhook re-fetches instead of trusting payloads (`app/api/stripe/webhook/route.ts`)

`applySubscription()` and `applyCheckoutSession()` now only work out *which
restaurant* the event is about, then call `syncRestaurantSubscription()` with
the ids. This fixes the out-of-order problem: whichever event arrives last still
writes Stripe's **current** status. It also removed ~40 lines of duplicated mapping code.

**Alternatives considered and rejected**

- *Poll from the browser until the status changes.* That works, but adds client code,
  a spinner state and repeated requests, and it still depends on the webhook arriving.
- *Show a "processing, reload in a few seconds" message.* That just describes the bug
  to the user instead of fixing it.
- *Write the status from the redirect without asking Stripe.* That's insecure: anyone
  could visit `/vendor?sub=success` without paying.
- *Use the event's `created` timestamp to ignore older events.* That's more state to store,
  and re-fetching is simpler and is Stripe's own recommended pattern.

### 5. Verification

| Check | Result |
|---|---|
| `npx tsc --noEmit` | ✅ passes |
| `npm run lint` | ✅ no new warnings |
| Read-only check of the real 17:09 Checkout session against the new ownership rules (`mode`, `status`, `client_reference_id`, `subscription`) | ✅ would sync. (That old session's `success_url` has no `session_id`, because it predates the fix; new sessions will have it.) |

**Manual test:** cancel the subscription in the Billing Portal (cancel
**immediately**), click the subscribe button, pay with `4242 4242 4242 4242`.
You should land on `/vendor` (clean URL) showing **"Suscripción: activa"**
(green) **without reloading**. To prove it no longer depends on the webhook,
stop `stripe listen` and repeat: the dashboard should still be correct right away.

---

## 2026-11-17: Fix: restaurants with an ended subscription could not re-subscribe; misleading red "active" badge

**Branch:** `staging` (uncommitted at time of writing)

### 1. What was observed

While testing locally, I logged in as an existing test restaurant (one with
February 2026 test reservations):

- The dashboard badge said **"Suscripción: active"**, but it was **red**.
- "Crear nueva reserva" (create reservation) was disabled.
- Clicking **"Suscribirse / Gestionar facturación"** opened the Stripe Billing
  Portal instead of a page to pay, so there was **no way to subscribe again**.
- The Stripe Connect side was fine: "Gestionar cuenta de Stripe" opened the
  restaurant's Express dashboard with its February test payments.

### 2. Investigation (step by step)

1. **Read the database row** (Supabase `restaurants`, using the service-role key, read-only):

   | Field | Value |
   |---|---|
   | `subscription_status` | `active` |
   | `subscription_current_period_end` | `2026-03-12` (another restaurant: `2026-03-27`) |
   | `stripe_customer_id` | `cus_...` (set) |
   | `stripe_subscription_id` | `sub_...` (set) |
   | `stripe_onboarding_complete` | `true` |

2. **Asked Stripe about the same IDs** (Stripe API, read-only):
   - `GET /v1/subscriptions/sub_...`: **"No such subscription"** for both.
   - Listing all subscriptions on the platform account (`status=all`): **empty**.
   - `GET /v1/customers/cus_...`: the customers **still exist**.
   - The Connect accounts exist and have `charges_enabled = true`.

   So our DB said "active subscription", while Stripe said "this customer has no
   subscription at all". The DB copy was **stale**. Stripe's subscriptions were
   removed (most likely test data being cleared), and no webhook ever told our
   app, because the local webhook listener (`stripe listen`) was not running.
   The listener's login key had also expired.

3. **Read the code paths involved.**

   *Why red but "active"?* (`app/vendor/vendor-dashboard-client.tsx`)
   - The badge **colour** came from `subActive`, which requires
     `status === "active"` **and** `period_end > now`. March 2026 < today, so it was `false`, which made the badge red.
   - The badge **text** printed the raw DB value `restaurant.subscription_status`, which made it read "active".
   - Two different rules for the same badge = contradictory UI.

   *Why couldn't they re-subscribe?* (`app/api/vendor/billing/subscribe/route.ts`)
   ```ts
   if (restaurant.stripe_customer_id) {
     // always -> Billing Portal
   }
   // only reached when there is NO customer id -> Checkout
   ```
   The code assumed **"has a Stripe customer" = "has a subscription"**. That is
   wrong: a customer outlives its subscription (after a cancellation, an expiry
   or a deletion). Once a restaurant had *ever* subscribed, it could never reach
   Checkout again. This affects real customers too, not just test data: anyone
   who cancels and later wants to come back would be stuck.

### 3. Root causes

| # | Root cause | Where |
|---|---|---|
| A | Subscribe route decided Portal vs Checkout from our DB (`stripe_customer_id` present), not from Stripe's actual subscription state. | `app/api/vendor/billing/subscribe/route.ts` |
| B | Badge text and badge colour used different logic. | `app/vendor/vendor-dashboard-client.tsx` |
| C *(found while here)* | Billing return URLs used `NEXT_PUBLIC_APP_URL \|\| "http://localhost:3000"`. Our `.env` only sets `APP_BASE_URL`, so in production users would be sent back to `localhost` after paying. The rest of the app already uses the `appBaseUrl()` helper, which handles this. | `subscribe/route.ts`, `portal/route.ts` |

### 4. What was changed

#### 4.1 New file `lib/subscription.ts`: one shared rule for "is the subscription usable?"

- `isSubscriptionActive(restaurant)`: `status === "active"` and the period end
  is in the future (or unknown). This is **exactly** the old rule, just moved
  into one place.
- `subscriptionLabel(restaurant)`: the Spanish badge text. If the DB says
  `active` but the period is over, it returns **"caducada"** (expired). Other
  statuses are translated (`activa`, `cancelada`, `inactiva`, `pago pendiente`, ...).

**Why a shared file?** The same rule was copy-pasted in the dashboard *and* in
`app/api/vendor/reservations/create/route.ts` (the server-side paywall). Copies
drift apart over time; when they do, the UI shows one thing and the server
enforces another. Now both import the same function. The file has no
Supabase/Stripe imports, so it is safe to use in browser (client) components.

#### 4.2 Dashboard badge (`app/vendor/vendor-dashboard-client.tsx`)

- `subActive` now comes from `isSubscriptionActive()`.
- Badge text now comes from `subscriptionLabel()`, so a red badge never says "active".

#### 4.3 Reservation API (`app/api/vendor/reservations/create/route.ts`)

- Uses `isSubscriptionActive()` instead of its own copy of the rule. **No behaviour change**, only de-duplication.

#### 4.4 Subscribe route (`app/api/vendor/billing/subscribe/route.ts`): the main fix

New flow when the restaurant clicks "Suscribirse / Gestionar facturación":

```
legal terms accepted?  (unchanged)
        │
has stripe_customer_id in DB?
   ├─ no  ───────────────────────────────────────────► new Checkout (customer_email)
   └─ yes → ask STRIPE: does this customer have a live subscription?
              ├─ yes (active / trialing / past_due / unpaid / paused) ─► Billing Portal
              └─ no  → self-heal DB row (status=inactive, clear sub id & period end;
                       also clear customer id if the customer was deleted)
                       ─► new Checkout, reusing the existing customer
```

Details and reasoning:

- **Ask Stripe, not our DB.** Stripe is the source of truth for billing. The new
  helper `findLiveSubscription()` retrieves the customer, then lists its
  subscriptions with `status: "all"` and looks for a "live" one.
- **Which statuses count as "live"?** `active`, `trialing`, `past_due`,
  `unpaid`, `paused`. In all of these the restaurant *still has* a subscription
  and should manage it in the Portal. For example, `past_due` means "your card
  failed, update it"; sending them to a new Checkout would create a **second**
  subscription and double-charge them. `canceled`, `incomplete`,
  `incomplete_expired` or "none" mean they need a new Checkout.
- **Self-healing the DB row.** If Stripe says there is no live subscription, we
  immediately correct our copy (`subscription_status = "inactive"`, etc.). That
  way the dashboard is truthful even if the restaurant abandons Checkout. The
  write uses the service-role client but is scoped with
  `.eq("id", ...).eq("owner_user_id", user.id)`, the same pattern the rest of the
  codebase uses.
- **Reuse the existing customer** (`customer: cus_...`) in Checkout instead of
  `customer_email`, so all invoices stay under one Stripe customer. Stripe
  rejects requests that pass both, hence the either/or spread.
- **`subscription_data.metadata.restaurant_id`.** Previously only the *Checkout
  session* carried `restaurant_id`. Subscription webhooks
  (`customer.subscription.*`) carry the *subscription's* metadata, so the webhook
  had to fall back to a DB lookup by `stripe_subscription_id`. That lookup fails
  if `customer.subscription.created` arrives before `checkout.session.completed`
  has saved the id. With the metadata on the subscription, the webhook maps it
  directly.
- **Errors return JSON.** Stripe calls are wrapped in `try/catch` and return
  `{ error: "Error de Stripe: ..." }`. Before, an exception produced an HTML 500
  page, the dashboard's `res.json()` failed, and the user saw only a generic message.
- **Uses the shared helpers** `stripePlatform()` and `appBaseUrl()` (fixes root cause C).

**Alternatives considered and rejected**

- *Only fix the badge.* That hides the symptom, but restaurants still cannot pay.
- *Trust `subscription_status` in our DB to choose Portal vs Checkout.* Same
  class of bug: our DB copy can be stale, which is exactly what happened.
- *Sync the subscription from Stripe on every dashboard load.* That adds a Stripe
  API call per page view. The self-heal on click fixes the stuck case with no
  extra cost; it can be revisited later if needed.
- *Let the Billing Portal handle re-subscribing.* The Portal cannot start a new
  subscription for a customer that has none (that's what Checkout is for).

#### 4.5 Portal route (`app/api/vendor/billing/portal/route.ts`)

- Uses `stripePlatform()` and `appBaseUrl()` (root cause C). No other change.

#### 4.6 Webhook (`app/api/stripe/webhook/route.ts`): small hardening

- `current_period_end` is read from `subscription.current_period_end` **or**
  `subscription.items.data[0].current_period_end`. Since 2025, Stripe API
  versions moved this field onto subscription items, and webhook payloads use
  the account's/endpoint's API version (not the version pinned in our code). Without
  this, a newer payload would save `null` as the period end.

### 5. Verification

| Check | Result |
|---|---|
| `npx tsc --noEmit` (TypeScript type check) | ✅ passes |
| `npm run lint` | ✅ no new warnings (one existing `<img>` warning in `app/page.tsx`, unrelated) |
| Dry run of the new "live subscription?" logic against the two stuck test customers (read-only script, same code as `findLiveSubscription`) | ✅ both: customer exists, no live subscription, result **New Checkout reusing the existing customer** |

`next build` was not run because it overwrites `.next/` while the dev server is
running. Run it before merging to `main`.

**Manual test to do in the browser** (needs `npm run dev` + `stripe listen ...` running):

1. Log in as the stuck restaurant. Badge should read **"Suscripción: caducada"** (red).
2. Tick the terms box and click "Suscribirse / Gestionar facturación". You should land on **Stripe Checkout** (not the Portal).
   - Back on the dashboard (or in Supabase), the row is now `inactive` (self-heal).
3. Pay with `4242 4242 4242 4242`. The `stripe listen` terminal shows `checkout.session.completed` and `customer.subscription.created` returning **200**.
4. Dashboard shows **"Suscripción: activa"** (green), and "Crear nueva reserva" is enabled.
5. Click the billing button again. It should now open the **Billing Portal** (there is a live subscription).
6. In the Portal, cancel the subscription **immediately**, then return. The webhook sets status `canceled`; the badge reads "cancelada", and the button leads to Checkout again.

### 6. Still open (known issues, not fixed in this entry)

From the 2026-11-17 audit (see entry below). Listed in priority order:

1. 🔴 **RLS lets restaurant owners write any column of their own row**
   (`restaurants_update_own` in `supabase.sql`). From the browser, an owner
   could set `subscription_status = 'active'` and skip paying, or change
   `stripe_customer_id` / `stripe_account_id`.
2. 🔴 **`/api/guest/verify` doesn't check that the Stripe session belongs to the
   reservation** (`session.metadata.reservation_id === rid`). One cheap payment
   could mark a different reservation at the same restaurant as PAID.
3. 🟠 **No Connect webhook for guest payments.** If the guest closes the tab
   before `/success` loads, the reservation stays PENDING.
4. 🟡 `trialing` counts as active in the admin page but not in the
   dashboard / reservation API. That's harmless today (no trial configured).

---

## 2026-11-17: Repo health check, local ↔ GitHub sync, audit

### Local git repair

- **Symptom:** `git fetch` failed with `bad object refs/remotes/origin/HEAD`.
- **Cause:** the file `.git/refs/remotes/origin/HEAD` contained 30 null bytes
  (file corruption, likely from a crash or a sync tool). This file is just a
  local pointer meaning "the remote's default branch".
- **Fix:** rewrote it as `ref: refs/remotes/origin/main`. That's the same as
  `git remote set-head origin main`, which couldn't run while the ref was broken.
  No commits or branches were affected. `git fsck` reports no errors afterwards
  (the "dangling" objects it lists are normal leftovers from amends/resets).

### Sync result

- Local `staging` = GitHub `staging` = `5ffc2e3`; local `main` = GitHub `main` = `c7c0bae`. The working tree was clean.
- `main` has one commit not on `staging` (`c7c0bae`, a one-character text change
  in `app/admin/page.tsx`). Expect a trivial conflict in that file when merging
  `staging` into `main`.
- `staging` is 20 commits ahead of `main` (legal pages, legal acceptance, RLS work, webhook fixes, admin rewrite).

### Local dev setup notes

- The Stripe CLI's own login key (stored in `~/.config/stripe/config.toml`)
  **expires every 90 days**. It's separate from `STRIPE_PLATFORM_SECRET_KEY` in
  `.env`. Fix: run `stripe login` again, or use `stripe listen --api-key <sk_test...>`.
- Supabase Auth must have `http://localhost:3000/auth/callback` in its Redirect URLs for magic links to work locally.
