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
  // Prefer an explicit public URL (works for both local + production)
  const explicit = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_BASE_URL;
  if (explicit) return explicit.replace(/\/$/, "");

  // Vercel provides the deployment host as VERCEL_URL (no protocol)
  const vercel = process.env.VERCEL_URL;
  if (vercel) return `https://${vercel}`;

  return "http://localhost:3000";
}
