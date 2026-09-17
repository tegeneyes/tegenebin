import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

// Verifies the caller's Telegram initData signature server-side.
// `verified: false` means the bot token is not configured, so the check could
// not run — callers should fail open in that case rather than lock everyone out.
export const verifyTelegramAccess = createServerFn({ method: "POST" })
  .inputValidator((d: { init_data: string }) => ({
    init_data: z.string().max(8192).parse(d.init_data ?? ""),
  }))
  .handler(async ({ data }) => {
    const token = process.env.TELEGRAM_BOT_TOKEN
    if (!token) {
      return { verified: false, ok: true, telegram_id: null as number | null, reason: "bot token not configured" }
    }
    const { verifyTelegramInitData } = await import("@/lib/telegram-auth.server")
    const res = verifyTelegramInitData(data.init_data, token)
    return { verified: true, ok: res.ok, telegram_id: res.userId, reason: res.reason }
  })
