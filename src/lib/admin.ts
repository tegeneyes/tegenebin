// Shared admin allow-list. Dependency-free so it can be imported from both
// server functions and the Telegram webhook route without duplication.
export const HARDCODED_ADMIN_IDS = [723559736]

export function getAdminIds(): Set<number> {
  const raw = (typeof process !== "undefined" && process.env && process.env.ADMIN_TELEGRAM_IDS) || ""
  const ids = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map(Number)
    .filter((n) => Number.isFinite(n) && n > 0 && n < 1e13)
  return new Set<number>([...HARDCODED_ADMIN_IDS, ...ids])
}

export function isAdminId(telegramId: number): boolean {
  return getAdminIds().has(telegramId)
}
