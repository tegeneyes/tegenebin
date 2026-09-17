// Fake/padded player names shown alongside real presence while user base is small.
// Deterministic per (stake, gameId) so the number doesn't jitter between renders.

const NAMES = [
  "Abel", "Sara", "Mikiyas", "Helen", "Yonas", "Tsion", "Dawit", "Bethel",
  "Kalkidan", "Henok", "Lily", "Robel", "Selam", "Nahom", "Eden", "Bereket",
  "Mahder", "Yared", "Hanna", "Mesi", "Fitsum", "Liya", "Daniel", "Rahel",
  "Samuel", "Marta", "Solomon", "Tigist", "Bisrat", "Meron",
]

function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) }
  return h >>> 0
}

/** Stable pseudo-random count between min and max for a given seed. */
export function paddedCount(realCount: number, seed: string, min = 15, max = 25): number {
  const r = hash(seed) % (max - min + 1)
  return Math.max(realCount, min + r)
}

/** Returns up to `n` deterministic fake display names for a seed. */
export function fakeNames(n: number, seed: string): string[] {
  const start = hash(seed) % NAMES.length
  const out: string[] = []
  for (let i = 0; i < n; i++) out.push(NAMES[(start + i) % NAMES.length])
  return out
}
