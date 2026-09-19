"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { supabase } from "@/integrations/supabase/client"

interface RoundCartela {
  cartela_id: number
  telegram_id: number
}

/**
 * Subscribes to real-time cartela reservations for a given round.
 * Returns the set of taken cartela IDs and the real player count.
 */
export function useRoundCartelas(opts: {
  roundIndex: number
  stake: number
  telegramId: number | undefined
  enabled: boolean
}) {
  const { roundIndex, stake, enabled } = opts
  const [takenIds, setTakenIds] = useState<Set<number>>(new Set())
  const [playerIds, setPlayerIds] = useState<Set<number>>(new Set())
  const fetchedRef = useRef(false)

  // Fetch initial taken cartelas
  useEffect(() => {
    if (!enabled || roundIndex < 0 || stake <= 0) {
      setTakenIds(new Set())
      setPlayerIds(new Set())
      return
    }

    let cancelled = false
    const fetchTaken = async () => {
      try {
        const { data: rows, error } = await supabase.rpc("get_round_cartelas", {
          _round_index: roundIndex,
          _stake: stake,
        } as never)
        if (cancelled || error) return
        const taken = new Set<number>()
        const players = new Set<number>()
        for (const r of (rows ?? []) as RoundCartela[]) {
          taken.add(r.cartela_id)
          players.add(r.telegram_id)
        }
        setTakenIds(taken)
        setPlayerIds(players)
        fetchedRef.current = true
      } catch {
        // ignore
      }
    }
    fetchTaken()

    return () => { cancelled = true }
  }, [roundIndex, stake, enabled])

  // Subscribe to real-time changes
  useEffect(() => {
    if (!enabled || roundIndex < 0 || stake <= 0) return

    const channel = supabase
      .channel(`round-cartelas:${roundIndex}:${stake}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "round_cartelas",
        },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const row = payload.new as RoundCartela
            if (row.cartela_id && row.telegram_id) {
              setTakenIds(prev => {
                const next = new Set(prev)
                next.add(row.cartela_id)
                return next
              })
              setPlayerIds(prev => {
                const next = new Set(prev)
                next.add(row.telegram_id)
                return next
              })
            }
          } else if (payload.eventType === "DELETE") {
            const row = payload.old as RoundCartela
            if (row.cartela_id) {
              setTakenIds(prev => {
                const next = new Set(prev)
                next.delete(row.cartela_id)
                return next
              })
              // Check if this player still has other reservations in the
              // current set before removing them from the player count.
              setPlayerIds(prev => {
                const next = new Set(prev)
                // Optimistically remove; the INSERT handler will re-add if
                // the player still has other cartelas in this round.
                next.delete(row.telegram_id)
                return next
              })
              // Re-fetch to correct the count (handles multi-cartela players)
              supabase.rpc("get_round_cartelas", {
                _round_index: roundIndex,
                _stake: stake,
              } as never).then(({ data: rows }) => {
                const players = new Set<number>()
                for (const r of (rows ?? []) as RoundCartela[]) {
                  players.add(r.telegram_id)
                }
                setPlayerIds(players)
              }).catch(() => {})
            }
          }
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [roundIndex, stake, enabled])

  const isTaken = useCallback((cartelaId: number) => takenIds.has(cartelaId), [takenIds])

  return { takenIds, isTaken, playerCount: playerIds.size }
}
