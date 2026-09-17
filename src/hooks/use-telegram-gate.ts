"use client"

import { useEffect, useState } from "react"
import { useServerFn } from "@tanstack/react-start"
import { verifyTelegramAccess } from "@/lib/telegram.functions"
import { isDevHost } from "@/hooks/use-telegram-user"

export type GateState = "checking" | "in" | "out"

/**
 * Confirms the app is running inside a real Telegram Mini App session:
 *  - `initData` must be present (Telegram only injects it inside the app), and
 *  - its HMAC signature is verified server-side against the bot token, so a
 *    copycat client that fakes `window.Telegram` is rejected.
 *
 * Fails open when the bot token is not configured or the check request errors,
 * so a server hiccup never locks real players out.
 */
export function useTelegramGate(): { state: GateState; reason: string | null } {
  const verify = useServerFn(verifyTelegramAccess)
  const [state, setState] = useState<GateState>("checking")
  const [reason, setReason] = useState<string | null>(null)

  useEffect(() => {
    if (typeof window === "undefined") return
    let alive = true
    let waited = 0
    let timer: number | undefined

    const tick = async () => {
      if (!alive) return
      const initData = window.Telegram?.WebApp?.initData ?? ""

      if (!initData) {
        // The Telegram script may still be loading — wait briefly before blocking.
        waited += 300
        if (waited >= 6000) {
          setState(isDevHost() ? "in" : "out")
          setReason("no Telegram session")
          return
        }
        timer = window.setTimeout(tick, 300)
        return
      }

      try {
        const res = await verify({ data: { init_data: initData } })
        if (!alive) return
        if (!res.verified) {
          setState("in") // bot token not configured — cannot verify, don't block
          return
        }
        if (res.ok) {
          setState("in")
          return
        }
        setState("out")
        setReason(res.reason ?? null)
      } catch {
        if (alive) setState("in") // never block a real user on a server/network error
      }
    }

    void tick()
    return () => {
      alive = false
      if (timer) window.clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { state, reason }
}
