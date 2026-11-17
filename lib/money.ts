/**
 * "10", "10.5", "10,50" (Spanish keyboards use a comma) -> cents.
 * Empty or not a number -> 0, so the min-deposit rule shows its message
 * instead of the input refusing to be empty.
 * Pure: safe to import from client components.
 */
export function parseEurosToCents(input: string): number {
  const n = Number(input.trim().replace(",", "."));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

export const formatEUR = (cents: number) => `€${(cents / 100).toFixed(2)}`;
