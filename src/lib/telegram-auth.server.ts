// Telegram Mini App initData verification — SERVER ONLY.
// Reference: https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
//
// This is the real mechanism that proves a request actually came from the
// Telegram app (and not a copycat client): Telegram signs the initData with the
// bot token, so we can recompute the HMAC and compare.
import { createHmac, timingSafeEqual } from "crypto"

export type InitDataCheck = { ok: boolean; userId: number | null; reason: string }

export function verifyTelegramInitData(
  initData: string,
  botToken: string,
  maxAgeSeconds = 86400,
): InitDataCheck {
  if (!initData) return { ok: false, userId: null, reason: "missing initData" }
  if (!botToken) return { ok: false, userId: null, reason: "bot token not configured" }

  const params = new URLSearchParams(initData)
  const hash = params.get("hash")
  if (!hash) return { ok: false, userId: null, reason: "missing hash" }
  params.delete("hash")

  const dataCheckString = Array.from(params.entries())
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join("\n")

  const secretKey = createHmac("sha256", "WebAppData").update(botToken).digest()
  const computed = createHmac("sha256", secretKey).update(dataCheckString).digest("hex")

  const a = Buffer.from(computed)
  const b = Buffer.from(hash)
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, userId: null, reason: "invalid signature" }
  }

  const authDate = Number(params.get("auth_date") || 0)
  if (maxAgeSeconds > 0 && authDate > 0 && Date.now() / 1000 - authDate > maxAgeSeconds) {
    return { ok: false, userId: null, reason: "expired session" }
  }

  let userId: number | null = null
  try {
    const user = JSON.parse(params.get("user") || "{}") as { id?: number }
    if (user.id) userId = Number(user.id)
  } catch {
    /* ignore */
  }

  return { ok: true, userId, reason: "verified" }
}
