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

## 2026-11-17: Reservation lifecycle, create-link screen, quick wins (backlog 8, 10, 12, 13, 15)

**Branch:** `staging`. The critical fixes were pushed first as `9ff9d7e`.

**⚠️ Requires running `migrations/004_reservation_lifecycle.sql` in the Supabase SQL Editor**
before using **Cancelar y reembolsar**. The refund itself would still go
through, but saving it needs the new `refunded_at` column, so the app would
report "Reembolso hecho pero no se pudo guardar".

### Product decisions (agreed with the owner)

| Question | Decision |
|---|---|
| Restaurant cancels a **paid** reservation | **Full automatic refund** through Stripe, any time. The restaurant decides; the app doesn't enforce the 24h policy text (it's the restaurant's own policy, and it may want to make exceptions). |
| Restaurant cancels an **unpaid** reservation | The link stops working, and any payment page the guest has open is closed. |
| Guest doesn't show up | **No presentado**: the restaurant keeps the deposit. Only possible once the reservation time has passed. |
| Guest came | **Asistió**: a record only, no money moves (the deposit is applied to the bill at the table). Only possible once the reservation time has passed (see the correction below). |
| Unpaid link, reservation time passes | **EXPIRED** automatically. The guest can't start a payment any more. |
| Guest receipts / invoices | Not needed. A deposit isn't a sale; it's either deducted from the bill or refunded. |

---

### 8. Reservation lifecycle: cancel + refund, no-show, attended, auto-expire

**The problem.** The `status` column could already hold `CANCELED` and `EXPIRED`,
but nothing ever set them. The restaurant had no way to cancel, refund or
record a no-show from the app, and a link stayed payable forever, even weeks
after the reservation date.

**Step 1: draw the state machine first, code second.**

```
PENDING ──pay──▶ PAID ──▶ ATTENDED   (deposit applied to the bill)
   │               │ ╲
   │               │  ▶ NO_SHOW      (restaurant keeps the deposit)
   │               ▼
   ├──cancel──▶ CANCELED             (if paid: full refund via Stripe)
   └──time passes unpaid──▶ EXPIRED
```

Small extras, each with a reason:
- `NO_SHOW` ↔ `ATTENDED` can be switched, to undo a mis-click.
- `NO_SHOW` → cancel (refund) is allowed: the restaurant changes its mind ("the guest called, they had an emergency").
- `CANCELED` and `EXPIRED` are final.

**Step 2: the database (`migrations/004_reservation_lifecycle.sql`).**

```sql
alter table public.reservations add column if not exists refunded_at timestamptz;
alter table public.reservations add column if not exists stripe_refund_id text;

alter table public.reservations add constraint reservations_status_check
  check (status in ('PENDING', 'PAID', 'CANCELED', 'EXPIRED', 'NO_SHOW', 'ATTENDED'));
```

Why the `check` constraint: until now the column accepted **any** text. That's why
the code was full of defensive `toUpperCase()` calls and `"CANCELLED"` spellings.
I checked the live data before adding it (every row was `PAID`), so the
constraint can't fail on existing rows. `supabase.sql` got the same changes.

**Step 3: one shared rules file (`lib/reservation-status.ts`).**
It uses the same pattern as `lib/subscription.ts`: a pure module (no Stripe, no
database) imported by the dashboard (which buttons to show), the guest page (what
to say) **and** the API (what to allow), so they can't drift apart.

```ts
export function allowedActions(r, now = new Date()): ReservationAction[] {
  const passed = hasReservationTimePassed(r, now);
  switch (effectiveStatus(r, now)) {
    case "PENDING":  return ["cancel"];
    case "PAID":     return passed ? ["attended", "no_show", "cancel"] : ["cancel"];
    case "NO_SHOW":  return passed ? ["attended", "cancel"] : ["cancel"];
    case "ATTENDED": return passed ? ["no_show"] : [];
    default:         return []; // CANCELED and EXPIRED are final
  }
}
```

**Step 4: auto-expire without a cron job.**
Alternatives considered:

| Option | Verdict |
|---|---|
| Scheduled job (Vercel Cron / `pg_cron`) every few minutes | More setup and infra for an MVP; a row is still wrong for up to N minutes. |
| **Lazy expiry + "effective status"** | ✅ chosen. No infra. Correct at every moment. |

How it works:
1. `effectiveStatus()`: a PENDING row whose time has passed is *treated and shown*
   as EXPIRED, even before the database is updated.
2. Whenever the server touches reservations (dashboard load, guest page, guest
   checkout), `expireOverdueForRestaurant()` / `expireIfOverdue()` in
   `lib/reservation-lifecycle.ts` write `EXPIRED`, **conditional on `status = PENDING`**
   so they can never overwrite a payment that lands at the same moment.
3. The dashboard re-renders once a minute, so a row on a screen left open
   flips to EXPIRADA by itself.

The time comparison is done in JavaScript (`Date.parse`), not SQL:
`datetime_iso` is a *text* column, and comparing text is only correct if every
row has exactly the same format.

**Step 5: an expired link that gets paid anyway is still PAID.**
Edge case: the guest opened the Stripe page at 20:25 for a 20:30 reservation
and paid at 20:32. The money is real, so `markReservationPaidFromSession` now
accepts `EXPIRED → PAID` as well as `PENDING → PAID`:

```ts
.in("status", ["PENDING", "EXPIRED"])   // was .eq("status", "PENDING")
```

I found a related bug in that same function while doing this. The "already processed"
check was `status === "PAID"`. With the new statuses, a late webhook for a reservation
already marked **ATTENDED** would have been flagged as "needs manual review". It now
recognises the payment by **its own id**, whatever the status is:

```ts
if (paymentIntentId && reservation.stripe_payment_intent_id === paymentIntentId) {
  return { ok: true, alreadyPaid: true };
}
```

**Step 6: the action API (`POST /api/vendor/reservations/:id/status`).**
The route is thin: login, zod input (`cancel | no_show | attended`), then delegate to
`applyReservationAction()` in `lib/reservation-lifecycle.ts`, which:

1. Loads the reservation, then its restaurant **filtered by `owner_user_id`**.
   Another owner's id gives "not found", the same answer as a wrong id, so nobody
   can probe for ids.
2. Re-checks `allowedActions()` on the server. Hiding a button is not security.
3. Does the work. Three cases:

**a) Cancel a paid reservation = refund, then record it.**
```ts
refund = await stripe.refunds.create(
  { payment_intent: reservation.stripe_payment_intent_id, reason: "requested_by_customer" },
  { stripeAccount: restaurant.stripe_account_id,           // the deposit lives on THEIR account
    idempotencyKey: `refund_res_${reservation.id}` }       // double click = still one refund
);
await admin.from("reservations")
  .update({ status: "CANCELED", refunded_at: now, stripe_refund_id: refund.id })
  .eq("id", reservation.id);
```
Why **refund first, database second**: if the order were reversed and Stripe
failed, the app would say "refunded" while the guest never got the money. In this
order, the worst case is "refunded but not saved yet". The error message says so,
and clicking again is safe because the idempotency key makes Stripe return the
*same* refund instead of making a second one.

**b) Cancel an unpaid reservation = close the guest's payment page.**
If the guest has the Stripe Checkout page open, we `expire` that session so it
can't be paid any more. One race needs handling: the guest pays a second before the
restaurant clicks. In that case Stripe says the session is already `complete`, so
we **record the payment** (never lose money) and answer *"El cliente acaba de
pagar… pulsa Cancelar otra vez para reembolsar"*.

**c) Attended / no-show = a status change only.**
```ts
.update({ status: target }).eq("id", reservation.id).eq("status", current)
```
The `.eq("status", current)` is the same conditional-update idea as the payment
code. If the status changed between showing the button and clicking it, nothing is
written and the user is asked to reload.

**Step 7: refunds made outside the app.**
The dashboard tells restaurants to manage refunds in their Stripe Dashboard too.
Without handling that, a refund done there would leave the reservation showing
PAGADO. The Connect webhook now also handles `charge.refunded`:
- **full** refund of a PAID/NO_SHOW reservation → CANCELED + `refunded_at`;
- full refund of an ATTENDED reservation (a goodwill gesture) → keeps ATTENDED and gets a "· reembolsado" mark;
- **partial** refunds (the restaurant keeps part of the deposit) → ignored, deliberately.

It also fires for our own cancel button's refunds. That's harmless: by then the row
is already CANCELED, so the conditional updates match nothing.

**Step 8: UI.**
- **Dashboard:** a new "Acciones" column (and the same buttons on the mobile cards).
  **Cancelar y reembolsar** asks inline *"¿Reembolsar €10.00? Sí / No"*: a second
  click instead of a `confirm()` popup, because money moves.
- **Guest page:** instead of always showing the pay button, it now says what happened
  ("El restaurante ha cancelado esta reserva. El depósito se ha reembolsado…",
  "Este enlace ha caducado…", "Depósito pagado ✅").
- **Labels:** PENDIENTE changed from ❌ to ⏳. It isn't an error; it's waiting.

---

**Correction after the owner's testing: "Asistió" was possible before the reservation time.**
My first version allowed it at any time after payment, assuming guests sometimes
arrive early. The owner's rule: attendance can only be recorded **once the
reservation time has passed**, the same as no-show. The fix is in the one shared
rules file, so the dashboard button and the API both follow it:

```ts
// before
case "PAID":    return passed ? ["attended", "no_show", "cancel"] : ["attended", "cancel"];
case "NO_SHOW": return ["attended", "cancel"];
// after
case "PAID":    return passed ? ["attended", "no_show", "cancel"] : ["cancel"];
case "NO_SHOW": return passed ? ["attended", "cancel"] : ["cancel"];
```

The NO_SHOW line can only matter for odd data, since NO_SHOW itself needs the
time to have passed. It's checked anyway, so the rule doesn't depend on how a row
got its status.
Checked at the boundary: 1 second before the time → only `cancel`; at the
exact time → `attended`, `no_show`, `cancel`.
Because the server re-checks `allowedActions()`, a request sent straight to
the API (bypassing the hidden button) is refused with 409 as well.

---

### 10. Create-link screen

| Before | After | Why |
|---|---|---|
| Name prefilled with "Juan Pérez" | Empty, placeholder "Ej.: María García" | A forgotten default got sent as a real guest name. |
| Deposit field could not be empty: clearing it put a `0` straight back | Can be empty; empty counts as €0 and shows *"El depósito mínimo es €0.50"* on submit | Owner request: the field felt "locked". |
| Party size: same problem | Same fix | Consistency. |
| `10,50` (Spanish keyboard) unreliable in `type="number"` | `type="text"` + `inputMode="decimal"`, comma accepted | Spain uses a decimal comma. |
| `alert()` with the link, then redirect | Result screen: link, **Copiar enlace**, **Enviar por WhatsApp**, **Crear otro enlace** | Restaurants send these links by WhatsApp. |
| Double click created two links | Button disabled while saving ("Creando…") | Duplicate links. |

**Root cause of the "locked" field.** The value was stored as a *number*:

```tsx
// before
const [depositEUR, setDepositEUR] = useState(10);
onChange={e => setDepositEUR(parseFloat(e.target.value || "0"))}   // "" -> 0, re-rendered as "0"
```

React re-renders the input with the state value, so an empty field became `0`
immediately. **The fix:** keep what the user typed (a string) and convert only on submit:

```tsx
const [depositEUR, setDepositEUR] = useState("10");
function parseEurosToCents(input: string): number {
  const n = Number(input.trim().replace(",", "."));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;   // empty -> 0 -> min-deposit message
}
```

The WhatsApp button opens `https://wa.me/?text=…`. With no phone number,
WhatsApp lets the restaurant pick the chat. The text is prefilled:
*"Hola María, para confirmar tu reserva en {restaurante} el {fecha}, paga el
depósito de €10.00 aquí: {link}"*.

The client-side checks are for instant feedback only. The API still enforces the
same rules, so bypassing the form changes nothing.

---

### 12. One rule for "active subscription" (`trialing`)

`/api/admin/overview` counted `trialing` as active, but `lib/subscription.ts`
(used by the dashboard and the reservations API) didn't. A restaurant on a free
trial would have seen "en periodo de prueba" yet been unable to create links.
`isSubscriptionActive()` now accepts both. The admin route and
`vendor/reservations/new/page.tsx` (which had its own hand-written copy of the
rule) now call it instead of reimplementing it.

The admin page was titled "Restaurantes activos" and said it filtered by
`status = active`, but the API returns **all** restaurants. It's now
titled "Restaurantes", shows "N restaurantes · M con suscripción activa", and
uses the same coloured badge as the dashboard.

### 13. README

Rewritten. The old one was the original MVP brief ("You asked for…"), mentioned a
"demo password gate" that no longer exists, and described the pre-webhook payment
flow. The new one covers what the app does, the architecture and design rules,
the reservation state machine, the project layout and accurate local setup
(migrations, both webhook forwards).

### 15. Middleware ran on webhooks and guest routes

```ts
// before
matcher: ["/vendor/:path*", "/admin/:path*", "/api/:path*"],
// after
matcher: ["/vendor/:path*", "/admin/:path*", "/api/vendor/:path*", "/api/admin/:path*"],
```

The middleware calls `supabase.auth.getUser()`, a network call to Supabase
Auth, to refresh the login cookie. It ran on **every** `/api` request, including the
Stripe webhooks and guest routes, which never have a login cookie. That added
latency to every webhook (Stripe has a timeout) and every guest payment. It now
only runs where a restaurant session is used.

---

### Verification

| Check | Result |
|---|---|
| `npx tsc --noEmit` | ✅ |
| `npm run lint` | ✅ no new warnings |
| `allowedActions` / `effectiveStatus` / labels, all 9 status × past/future cases (run against the real compiled file) | ✅ as in the table in step 3 |
| README claims (Express accounts, `/auth/callback`) checked against the code | ✅ |
| Refund, cancel, no-show, expiry against Stripe test mode | ✅ owner tested; the refund shows in the connected account's Stripe Dashboard. Found "attended too early" (fixed above). |

**Manual tests:**
1. Run `migrations/004_reservation_lifecycle.sql`.
2. **Create screen:** clear the deposit field (it stays empty). Click Crear: "El depósito mínimo es €0.50". Type `10,50`: the link is created. Copy works, and WhatsApp opens with the prefilled text.
3. **Cancel unpaid:** open the guest link, click Pagar (the Stripe page opens), then cancel the reservation from the dashboard. Reload the Stripe page: it's expired. The guest page says it was cancelled.
4. **Cancel paid:** pay a deposit (`4242…`), then **Cancelar y reembolsar** → Sí. The row shows "✖ CANCELADA · reembolsado". The refund is visible in the connected account's Stripe test Dashboard.
5. **External refund:** pay another deposit and refund it from the Stripe Dashboard. The row changes by itself (Connect webhook + Realtime).
6. **Expiry:** create a link for a few minutes from now and don't pay it. After the time passes, the dashboard shows EXPIRADA within a minute and the guest page says the link expired.
7. **No-show / attended:** "No presentado" and "Asistió" only appear on a paid reservation once its time has passed.

---

## 2026-11-17: Critical fixes: data lockdown, payment verification, Connect webhook, deposit limits, timezone, invoice data

**Branch:** `staging`. Previous work pushed first as `4c8dc40`.
**Scope:** backlog items 1, 2, 3, 4, 5, 7. Item 6 (production setup) is
intentionally out of scope; it'll be revisited along with a possible move from
magic links to OAuth.

**⚠️ Requires running `migrations/003_lock_down_client_writes.sql` in the Supabase SQL Editor.**
The code changes work with or without it (all writes now use the server key),
but the security hole only closes once it's applied.

---

### Fix 1: The browser could write data it shouldn't

#### Step 1: Prove it, don't assume it

The original audit read `supabase.sql` and concluded "owners can update any
column of their restaurant". Before changing anything, I tested the **live**
dev database the way an attacker would: a throwaway user, the public anon key
and their own session (exactly what any browser has), then each write
attempted directly against Supabase, skipping our API. The user was deleted
afterwards.

| Attempt (as owner, from a browser) | Live DB result | What `supabase.sql` would allow |
|---|---|---|
| UPDATE `restaurants.name` | allowed | allowed |
| UPDATE `subscription_status`, `stripe_*`, `legal_*` | **blocked** | allowed |
| INSERT a restaurant row | **blocked** | allowed |
| **INSERT a reservation** (status PAID, deposit €0) | **allowed** ❌ | allowed |
| **UPDATE a reservation** (status → PAID) | **allowed** ❌ | allowed |
| RPC `ensure_restaurant_for_user(<someone else's id>)` | **allowed** ❌ (created a row for the victim) | allowed |

**Lessons:**
- *Correction to the audit:* the live DB was already partly hardened by hand
  (column-level grants), so "fake an active subscription" was **not** possible
  live. The hand-made changes were never written into the repo, though, so
  `supabase.sql` would have recreated the hole on a fresh install.
- The live schema had also drifted: `reservations` had `paid_at` and
  `stripe_checkout_session_id` columns that the repo doesn't define.
- **Inserting reservations directly skipped the paywall**: an unpaid restaurant
  with Stripe connected could create payable deposit links without subscribing.

#### Step 2: Choose a rule simple enough to keep

There were two ways to fix it:
1. Add fine-grained policies/grants per column and per table. That's easy to get
   subtly wrong, and every new column needs a new decision.
2. **"The browser can only READ. Every write goes through a server route."** ✅

Option 2 matches how the app already works: the dashboard only *reads* from the
browser, and writes go through `/api/...` routes that check auth, ownership,
subscription and input, and then write with the service-role key. The browser
write privileges were never needed, only dangerous.

#### Step 3: Migration `003_lock_down_client_writes.sql`

```sql
alter table public.reservations
  add column if not exists stripe_checkout_session_id text,
  add column if not exists paid_at timestamptz;        -- codify the drift

revoke insert, update, delete on public.restaurants  from anon, authenticated;
revoke insert, update, delete on public.reservations from anon, authenticated;
revoke all on public.reservation_checkout_sessions   from anon, authenticated;

drop policy if exists "restaurants_insert_own"  on public.restaurants;  -- dead once privileges are gone
drop policy if exists "restaurants_update_own"  on public.restaurants;
drop policy if exists "reservations_insert_own" on public.reservations;
drop policy if exists "reservations_update_own" on public.reservations;
```

- **RLS vs privileges (a common confusion):** Postgres checks two separate
  things. *Privileges* (`GRANT`/`REVOKE`) decide whether a role may run INSERT,
  UPDATE... on a table at all. *RLS policies* decide **which rows** it may
  touch. We remove the privileges, so the policies about writes become
  pointless, and we drop them so nobody wonders why they're there.
- `REVOKE UPDATE ON table` also removes column-level grants, such as the
  hand-made `grant update (name)` on live.
- SELECT is untouched, so the dashboard reads and Realtime keep working.

The RPC fix:

```sql
create or replace function public.ensure_restaurant_for_user(p_owner_user_id uuid)
returns void language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or p_owner_user_id is distinct from auth.uid() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  ...
```

- `security definer` means the function runs with its **owner's** rights and
  bypasses RLS. Such a function must validate its own input; this one blindly
  trusted `p_owner_user_id`.
- `set search_path = public` is standard hardening for `security definer`
  functions. It stops a caller from making `restaurants` resolve to an object
  in another schema.
- `is distinct from` is like `<>` but also treats `NULL` correctly.

`supabase.sql` (fresh installs) was updated to the same end state.

#### Step 4: Move the remaining browser-session writes to the server key

With the privileges gone, four places that wrote with the *user's* session
would fail. Each now uses `supabaseAdmin()`, only **after** its checks, and
scoped to the caller's own row:

| File | Write | Note |
|---|---|---|
| `app/api/vendor/restaurant/name/route.ts` | restaurant name | after length validation |
| `app/api/vendor/legal/accept/route.ts` | legal acceptance | route is currently unused (subscribe handles acceptance) |
| `app/vendor/page.tsx` | `stripe_onboarding_complete` sync | **this never worked live** (permission denied, silently ignored) |
| `app/api/vendor/reservations/create/route.ts` | insert reservation | the only way to create one now |

```ts
// app/vendor/page.tsx
await supabaseAdmin()
  .from("restaurants")
  .update({ stripe_onboarding_complete: ready })   // value comes from Stripe, not the user
  .eq("id", restaurant.id)
  .eq("owner_user_id", user.id);
```

**Why using the service role here isn't a hole:** the service-role key exists
only on the server. The browser can't use it, so it can only trigger these
writes through the route, and the route decides what's allowed.

---

### Fix 2: One payment could confirm a different reservation

#### The bug
`/api/guest/verify?rid=...&sid=...` checked that session `sid` was paid, then
marked reservation `rid` as PAID. It never checked that **the session was for
that reservation**. Attack: pay a €1 reservation, then call verify with
`rid=<a €100 reservation at the same restaurant>`.

#### The fix: one function that derives everything from Stripe
New `lib/reservation-payments.ts` → `markReservationPaidFromSession(session, connectedAccountId, expectedReservationId?)`.
This is now the **only** code that sets a reservation to PAID. It never trusts
the caller's idea of *which* reservation was paid:

```ts
if (session.mode !== "payment") return fail(409, "Not a deposit payment session");
if (session.payment_status !== "paid") return fail(409, "Payment not completed");

const reservationId = session.metadata?.reservation_id;           // we set this in /api/guest/checkout
if (expectedReservationId && expectedReservationId !== reservationId)
  return fail(409, "Session does not belong to this reservation"); // ← the actual bug fix

if (restaurant.stripe_account_id !== connectedAccountId)           // came from THIS restaurant's account
  return fail(409, "Session is not from this restaurant's Stripe account");

if (session.amount_total !== reservation.deposit_cents || session.currency !== "eur")
  return fail(409, "Paid amount does not match the deposit");

// Conditional update: only PENDING -> PAID (safe if two calls race)
await admin.from("reservations")
  .update({ status: "PAID", paid_at: ..., stripe_payment_intent_id: ..., stripe_checkout_session_id: session.id })
  .eq("id", reservation.id)
  .eq("status", "PENDING");
```

- **Defense in depth:** the session must match on metadata, Stripe account
  *and* amount. If one check had a bug, the others would still catch an attack.
- **Idempotent:** verify and the webhook (fix 3) will often both run for the
  same payment. The second one sees PAID and returns `alreadyPaid`.
- **Edge case handled:** if a reservation was CANCELED/EXPIRED but still got
  paid, it isn't silently flipped. The function returns a 409 that says
  "needs manual review", because that money needs a refund decision.

`app/api/guest/verify/route.ts` now just retrieves the session **on the
restaurant's connected account** and calls this function with `rid` as the
expected id.

#### Verified live (dev server, real test data)
| Request | Response |
|---|---|
| session paid for reservation A, `rid` = reservation B | `409 {"error":"Session does not belong to this reservation"}` ✅ |
| same session, `rid` = A (legit, already PAID) | `200 {"ok":true}` ✅ (idempotent) |
| made-up `sid` | `404 {"error":"Payment session not found"}` ✅ |

---

### Fix 3: Reservations stayed PENDING if the guest closed the tab

#### The bug
The only thing that marked a reservation PAID was the guest's browser loading
`/success`. Close the tab, lose the connection, or have a slow phone, and the
restaurant never saw the deposit, even though the money was in their Stripe account.

#### The fix: a webhook for connected-account events
New `app/api/stripe/connect-webhook/route.ts`.

- **Why a separate endpoint?** Stripe sends two different kinds of events:
  *platform* events (our own account: subscriptions → `/api/stripe/webhook`)
  and *Connect* events (things that happen on a restaurant's account, such as a
  guest paying a deposit). In production they're two endpoints with two
  signing secrets. Keeping them in separate files keeps each one simple.
- Flow:
  1. Verify the signature over the **raw** body (`req.text()`). If the body
     were parsed and re-serialized, the bytes would differ and the signature
     check would fail.
  2. Only handle `checkout.session.completed` and
     `checkout.session.async_payment_succeeded`, and only when
     `event.account` is set. That field tells us *which* restaurant account the
     event came from.
  3. Skip sessions that aren't `payment_status: "paid"` yet. Delayed methods
     like SEPA complete as "unpaid" and send `async_payment_succeeded` later.
  4. Call the same `markReservationPaidFromSession(session, event.account)`.
- **Choosing the HTTP response:** Stripe retries on non-2xx.
  - A *business* rejection (amount mismatch...) won't fix itself on retry, so
    the handler returns **200** and logs a warning.
  - An *infrastructure* error (DB down) might fix itself, so it returns
    **500** and Stripe retries later.
- `STRIPE_CONNECT_WEBHOOK_SECRET` falls back to `STRIPE_WEBHOOK_SECRET`,
  because the local Stripe CLI signs both streams with the same secret.

**New local command:**
```powershell
stripe listen --forward-to localhost:3000/api/stripe/webhook --forward-connect-to localhost:3000/api/stripe/connect-webhook
```

Together with the live dashboard (Realtime), the restaurant now sees PAID
within seconds of payment, whatever the guest does.

---

### Fix 4: Links with a deposit nobody could pay

#### The bug
Reservation create accepted `depositCents >= 0` with no maximum, while guest
checkout rejected `<= 0` and `> €500`. Two places had two different rules, and the
mismatch produced links that errored when the guest tried to pay.

#### The fix: one set of limits used everywhere
```ts
// lib/config.ts
export const MIN_DEPOSIT_CENTS = 50;      // €0.50: Stripe's minimum charge for EUR
export const MAX_DEPOSIT_CENTS = 50_000;  // €500: product cap (abuse/fraud)
```
- **API** (`reservations/create`): zod `.min(MIN).max(MAX)` with Spanish messages.
  The route now returns the first readable message instead of zod's raw JSON dump.
- **Checkout** (`guest/checkout`): uses the same constants instead of its own `50000`.
- **Form**: `min`/`max` on the input plus a hint ("Entre €0.50 y €500.00").
  That's only for convenience; the API is what enforces it.

While validating inputs in that schema, I also added: the date must parse and
must not be in the past (5-minute grace), party size ≤ 100, name ≤ 120
characters, policy text ≤ 2000 characters. All of these used to be unbounded.

---

### Fix 5: Wrong times (timezone)

#### The bugs
1. **Form default:** `new Date(...).toISOString().slice(0, 16)` gives **UTC**
   wall-clock time, but `<input type="datetime-local">` shows it as **local**
   time. In Spain the default appeared 1 hour early (2 in summer). It was also
   computed during server rendering (UTC server), which caused a React
   hydration mismatch.
2. **Guest page:** printed the stored string as-is: `2026-11-18T19:30:00.000Z`.
3. **Dashboard:** `toLocaleString()` uses whatever locale and timezone the
   viewer's machine has.

#### The fix: store UTC, display Madrid time
- Storage is unchanged: UTC ISO strings, which is correct.
- New `lib/datetime.ts`:
  - `formatReservationDate(iso, "long" | "short")` uses
    `Intl.DateTimeFormat("es-ES", { timeZone: APP_TIMEZONE, ... })`. Fixed locale
    + fixed timezone gives the same text on the server and in every browser.
    Example: `2026-11-18T19:30:00Z` → **"miércoles, 18 de noviembre de 2026, 20:30"**.
    Daylight saving is handled by Intl (July → 21:30).
  - `toDatetimeLocalValue(date)` builds `YYYY-MM-DDTHH:mm` from **local** getters.
- The form computes its default in `useEffect` (browser only) and guards
  against an empty value: `new Date("").toISOString()` throws.
- `APP_TIMEZONE = "Europe/Madrid"` in `lib/config.ts`. **Known limitation:** the
  Canary Islands are one hour behind (`Atlantic/Canary`). If needed, the next
  step is a per-restaurant `timezone` column.

---

### Fix 7: Invoice data for Spanish B2B invoicing

#### Decision (by the project owner)
Asked how IVA should apply to the €20/month price (`+ IVA` / `IVA incluido` /
skip). **Decision: skip the IVA line for now; only collect the restaurant's
fiscal data.** So no tax rate was created in Stripe.

#### The change (`subscribe/route.ts`, Checkout params)
```ts
billing_address_collection: "required",
tax_id_collection: { enabled: true },                     // NIF/CIF field in Checkout
...(customerId ? { customer_update: { name: "auto", address: "auto" } } : {}),
```
Stripe then prints the legal name, address and tax ID on every subscription invoice.

**Verified with Stripe (test mode):** I created a Checkout session with these exact
params for both branches and expired it immediately:

| Branch | Result |
|---|---|
| new customer | accepted ✅ |
| existing customer + `customer_update` | accepted ✅ |
| existing customer **without** `customer_update` | **rejected**: "Tax ID collection requires updating business name on the customer" |

The third row is why `customer_update` is needed. It also shows the value of
asking Stripe directly instead of trusting the docs from memory.

**Still to decide later:** IVA (21% via a Stripe tax rate or Stripe Tax).
Canary Islands (IGIC, no IVA) is the reason Stripe Tax would be the more robust option.

---

### Verification summary

| Check | Result |
|---|---|
| `npx tsc --noEmit` | ✅ |
| `npm run lint` | ✅ no new warnings |
| Live attack test on DB permissions (before migration 003) | reproduced the 3 holes above |
| Live verify-route tests (fix 2) | ✅ all three cases |
| Stripe accepts the new Checkout params (fix 7) | ✅ |
| Madrid formatting, winter and summer (fix 5) | ✅ 20:30 / 21:30 for 19:30Z |
| **After running migration 003:** re-run the attack test | ✅ every write blocked (details below) |

**Attack test after migration 003.** Same scripts, a throwaway user deleted afterwards:

| Attempt with the public key + own login | Result |
|---|---|
| A1: set own `subscription_status='active'` and fake Stripe ids | blocked (row unchanged) |
| A2: insert a reservation directly (PAID, €0) | `permission denied for table reservations` |
| A3: insert a second restaurant row | `permission denied for table restaurants` |
| A4: call `ensure_restaurant_for_user` with another user's id | `not allowed` (our new 42501 check) |
| UPDATE any restaurants column (name, status, stripe ids, legal) | `permission denied` |
| UPDATE / DELETE a reservation (e.g. status=PAID) | `permission denied` |
| SELECT `reservation_checkout_sessions` (owner and anon) | `permission denied` |
| **Still allowed:** read own restaurant and own reservations | ✅ ok (the dashboard and Realtime need these) |

After the migration the tester reported the app still works normally. That
matters: with direct writes now refused, anything that still saves data must
be going through the server routes.

**"I don't see the billing address / NIF fields" (false alarm, explained).**
Stripe's list of Checkout sessions showed that the only sessions created with the
new parameters were my two test sessions. The tester's account already had a
**live** subscription, so "Suscribirse/Gestionar" correctly opened the
**Billing Portal**, not Checkout. The new fields only exist in Checkout.
Two more things to know when testing:
- Stripe shows the NIF field behind a checkbox ("Estoy comprando como empresa").
  It is optional (`required: "never"`), so it only appears once ticked.
- The Portal is configured to cancel **at period end**, so cancelling there
  does not free the account for a new Checkout until the period ends. To test,
  use a fresh account, or cancel the subscription *immediately* from the Stripe
  test Dashboard.

**Manual tests for you:**
1. Run migration 003. Then rename the restaurant (`/vendor/profile`): it should still work, now through the server key.
2. Create a reservation with a €0 or €600 deposit: you should get a clear error. Try €10: the link is created.
3. Open the guest link: the date should read like "miércoles, 18 de noviembre de 2026, 20:30".
4. Restart `stripe listen` with `--forward-connect-to` (command above). Pay a deposit and **close the tab on Stripe's success page before `/success` loads**: the dashboard should still turn PAGADO.
5. Subscribe with a fresh account (or one with **no** live subscription): Checkout asks for the billing address, and ticking "Estoy comprando como empresa" shows the NIF/CIF field.

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
| 1 | ✅ | ~~Browser could write data it shouldn't (insert/update reservations, RPC for other users).~~ Fixed: migration 003 + server-side writes. | `supabase.sql`, migration 003 |
| 2 | ✅ | ~~`/api/guest/verify` didn't check the session belongs to the reservation.~~ Fixed: `lib/reservation-payments.ts`. | `app/api/guest/verify/route.ts` |
| 3 | ✅ | ~~No Connect webhook for guest payments.~~ Fixed: `/api/stripe/connect-webhook`. | new webhook endpoint |
| 4 | ✅ | ~~Unpayable deposits (€0 / > €500) could be created.~~ Fixed: shared limits in `lib/config.ts`. | `reservations/create/route.ts` |
| 5 | ✅ | ~~Timezone bugs.~~ Fixed: `lib/datetime.ts` (store UTC, show Europe/Madrid). Canary Islands still not handled. | form, guest page, dashboard |
| 6 | ⏸️ | Production setup: custom SMTP (or OAuth instead of magic links), live keys, live webhook endpoints (platform **and** Connect), Connect platform profile, prod redirect URLs, Vercel env vars. *Deferred by decision.* | config |
| 7 | 🟡 | Invoicing: NIF/CIF + billing address now collected ✅. **IVA line deliberately skipped for now** (owner decision). | `subscribe/route.ts`, Stripe settings |
| 8 | ✅ | ~~No way to cancel / refund / mark no-show; links payable forever.~~ Fixed: `lib/reservation-status.ts`, `lib/reservation-lifecycle.ts`, migration 004. | dashboard + status API |
| 9 | 🟠 | No email notifications (Resend is configured in `.env` but unused): "deposit received" to the restaurant, confirmation to the guest. | new |
| 10 | ✅ | ~~Prefilled "Juan Pérez", `alert()` popup, deposit field couldn't be empty.~~ Fixed: result screen with Copy/WhatsApp. | `new-reservation-client.tsx` |
| 11 | 🟡 | Dashboard shows only the latest 25 reservations (no pagination/search/filter). | dashboard |
| 12 | ✅ | ~~`trialing` inconsistent; admin title wrong.~~ Fixed: one `isSubscriptionActive()`. | admin, `lib/subscription.ts` |
| 13 | ✅ | ~~README outdated.~~ Rewritten. | `README.md` |
| 14 | 🟡 | No automated tests, no error monitoring. | — |
| 15 | ✅ | ~~Middleware ran `getUser()` on webhooks and guest routes.~~ Fixed: narrower matcher. | `middleware.ts` |

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
