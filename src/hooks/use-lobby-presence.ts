import { useEffect, useState } from "react"
import { supabase } from "@/integrations/supabase/client"

/**
 * Tracks how many players are currently in the lobby/selecting/playing for a given stake.
 * Uses Supabase Realtime presence — no DB writes.
 */
export function useLobbyPresence(opts: {
  telegramId: number | undefined
  stake: number
  enabled: boolean
  username?: string
}) {
  const { telegramId, stake, enabled, username } = opts
  const [count, setCount] = useState(0)

  useEffect(() => {
    if (!enabled || !telegramId) { setCount(0); return }
    const channel = supabase.channel(`lobby:stake-${stake}`, {
      config: { presence: { key: String(telegramId) } },
    })

    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState()
        setCount(Object.keys(state).length)
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({ tg: telegramId, name: username ?? null, at: Date.now() })
        }
      })

    return () => { supabase.removeChannel(channel) }
  }, [telegramId, stake, enabled, username])

  return count
}
