import Stripe from "stripe";
export function stripePlatform() {
  const key = process.env.STRIPE_PLATFORM_SECRET_KEY;
  if (!key) throw new Error("Missing STRIPE_PLATFORM_SECRET_KEY");
  return new Stripe(key, { apiVersion: "2024-06-20" as any });
}
export function asConnectedAccount(acct: string): Stripe.RequestOptions {
  return { stripeAccount: acct };
}
export function appBaseUrl() {
  return process.env.APP_BASE_URL || "http://localhost:3000";
}
