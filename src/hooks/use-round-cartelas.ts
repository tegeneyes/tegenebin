"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { supabase } from "@/integrations/supabase/client"

interface RoundCartela {
  cartela_id: number
  telegram_id: number
  username: string | null
}

export type RoundPlayer = {
  telegram_id: number
  username: string | null
  cartela_ids: number[]
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
  const [players, setPlayers] = useState<RoundPlayer[]>([])
  const fetchedRef = useRef(false)
  const roundIndexRef = useRef(roundIndex)
  roundIndexRef.current = roundIndex

  // Fetch initial taken cartelas
  useEffect(() => {
    if (!enabled || roundIndex < 0 || stake <= 0) {
      setTakenIds(new Set())
      setPlayerIds(new Set())
      setPlayers([])
      return
    }

    let cancelled = false
    const fetchTaken = async () => {
      try {
        const { data: rows, error } = await supabase
          .from("round_cartelas")
          .select("cartela_id, telegram_id, username")
          .eq("round_index", roundIndex)
          .eq("stake", stake)
        if (cancelled || error) return
        applyRows((rows ?? []) as RoundCartela[])
        fetchedRef.current = true
      } catch {
        // ignore
      }
    }
    fetchTaken()

    return () => { cancelled = true }
  }, [roundIndex, stake, enabled])

  const applyRows = (rows: RoundCartela[]) => {
    const taken = new Set<number>()
    const ids = new Set<number>()
    const byPlayer = new Map<number, RoundPlayer>()
    for (const row of rows) {
      taken.add(row.cartela_id)
      ids.add(row.telegram_id)
      const player = byPlayer.get(row.telegram_id) ?? {
        telegram_id: row.telegram_id,
        username: row.username,
        cartela_ids: [],
      }
      player.cartela_ids.push(row.cartela_id)
      if (row.username) player.username = row.username
      byPlayer.set(row.telegram_id, player)
    }
    setTakenIds(taken)
    setPlayerIds(ids)
    setPlayers(Array.from(byPlayer.values()).sort((a, b) => a.cartela_ids[0] - b.cartela_ids[0]))
  }

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
            if (row.round_index !== roundIndex || Number(row.stake) !== Number(stake)) return
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
              setPlayers(prev => {
                const next = prev.map(player => ({ ...player, cartela_ids: [...player.cartela_ids] }))
                const player = next.find(item => item.telegram_id === row.telegram_id)
                if (player) {
                  player.cartela_ids.push(row.cartela_id)
                  if (row.username) player.username = row.username
                } else {
                  next.push({ telegram_id: row.telegram_id, username: row.username ?? null, cartela_ids: [row.cartela_id] })
                }
                return next.sort((a, b) => a.cartela_ids[0] - b.cartela_ids[0])
              })
            }
          } else if (payload.eventType === "DELETE") {
            const row = payload.old as RoundCartela | null
            if (row && (row.round_index !== roundIndex || Number(row.stake) !== Number(stake))) return
            if (row?.cartela_id) {
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
            }
            // Correct the full set (handles multi-cartela players, and keeps
            // us in sync when a DELETE event lacks the old row, e.g. before
            // REPLICA IDENTITY FULL is applied).
            supabase.rpc("get_round_cartelas", {
              _round_index: roundIndex,
              _stake: stake,
            } as never).then(({ data: rows }) => {
              if (roundIndexRef.current !== roundIndex) return
              const taken = new Set<number>()
              const players = new Set<number>()
              for (const r of (rows ?? []) as RoundCartela[]) {
                taken.add(r.cartela_id)
                players.add(r.telegram_id)
              }
              setTakenIds(taken)
              setPlayerIds(players)
              const grouped = new Map<number, RoundPlayer>()
              for (const r of (rows ?? []) as RoundCartela[]) {
                const player = grouped.get(r.telegram_id) ?? { telegram_id: r.telegram_id, username: r.username, cartela_ids: [] }
                player.cartela_ids.push(r.cartela_id)
                if (r.username) player.username = r.username
                grouped.set(r.telegram_id, player)
              }
              setPlayers(Array.from(grouped.values()).sort((a, b) => a.cartela_ids[0] - b.cartela_ids[0]))
            }).catch(() => {})
          }
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [roundIndex, stake, enabled])

  const isTaken = useCallback((cartelaId: number) => takenIds.has(cartelaId), [takenIds])

  const releaseLocally = useCallback((cartelaId: number) => {
    setTakenIds(prev => {
      const next = new Set(prev)
      next.delete(cartelaId)
      return next
    })
    setPlayerIds(prev => {
      const next = new Set(prev)
      // We don't know if player has other cartelas, but the refetch will correct
      return next
    })
  }, [])

  return { takenIds, isTaken, playerCount: playerIds.size, players, releaseLocally }
}
