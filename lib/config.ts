/**
 * Application-wide configuration constants.
 * Bump LEGAL_VERSION whenever the terms, privacy policy, or subscription
 * conditions change — this forces all existing vendors to re-accept.
 */
export const LEGAL_VERSION = "2026-02-10_v1";

/**
 * Deposit limits, in cents (EUR). Shared by the create-reservation form, the
 * create-reservation API and the guest checkout API, so a link can never be
 * created with an amount that checkout would later reject.
 *  - MIN: Stripe's minimum charge for EUR is €0.50.
 *  - MAX: product decision (abuse / fraud cap for a reservation deposit).
 */
export const MIN_DEPOSIT_CENTS = 50; // €0.50
export const MAX_DEPOSIT_CENTS = 50_000; // €500.00

/**
 * Timezone used to DISPLAY reservation times. All restaurants are in mainland
 * Spain for now. Times are stored as UTC ISO strings, so this only affects
 * formatting. (Canary Islands use Atlantic/Canary: a per-restaurant timezone
 * column would be the next step if needed.)
 */
export const APP_TIMEZONE = "Europe/Madrid";
