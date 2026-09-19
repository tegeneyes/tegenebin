/**
 * Self-describing validation helpers for server-fn inputs.
 * Zod's default "Expected number, received nan" is ambiguous across the
 * many numeric fields we send. These helpers throw an error that names the
 * field AND the actual received value, so the admin error log pinpoints the
 * source instantly.
 */

export function finiteNumber(name: string, value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${name}: expected a finite number, got ${JSON.stringify(value)} (${typeof value})`)
  }
  return value
}

export function roundIndex(name: string, value: unknown): number {
  const n = Number(value)
  if (!Number.isFinite(n)) {
    throw new Error(`${name}: expected a numeric round index, got ${JSON.stringify(value)} (${typeof value})`)
  }
  return Math.trunc(n)
}