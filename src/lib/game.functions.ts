import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { finiteNumber, roundIndex } from "@/lib/validate"

const TelegramIdSchema = z.union([z.string(), z.number()]).transform(v => Number(v)).refine(n => Number.isFinite(n) && n > 0, "invalid telegram_id")

const ParticipantSchema = z.object({
  telegram_id: TelegramIdSchema,
  username: z.string().max(100).optional().nullable(),
  cartela_id: z.number().int(),
  is_winner: z.boolean().default(false),
  payout: z.number().nonnegative().default(0),
})

/** Multiplayer minimum — a round cannot start with fewer players than this. */
export const MIN_PLAYERS = 2

export const startGame = createServerFn({ method: "POST" })
  .inputValidator((d: { telegram_id: string | number; total_stake: number; round_index: number | string; stake: number }) => ({
    telegram_id: TelegramIdSchema.parse(d.telegram_id),
    total_stake: z.number().positive().min(0.01, "total_stake must be at least 0.01").parse(finiteNumber("total_stake", d.total_stake)),
    round_index: roundIndex("round_index", d.round_index),
    stake: z.number().positive().min(0.01, "stake must be at least 0.01").parse(finiteNumber("stake", d.stake)),
  }))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server")

    // Multiplayer gate: refuse to start unless at least MIN_PLAYERS have committed
    // cartelas for this round+stake. A lone player cannot start the game.
    const { data: count, error: countError } = await supabaseAdmin.rpc("get_round_player_count", {
      _round_index: data.round_index,
      _stake: data.stake,
    } as never)
    if (countError) throw new Error(countError.message)
    if (Number(count) < MIN_PLAYERS) throw new Error("need_players")

    const { data: newBalance, error } = await supabaseAdmin.rpc("debit_stake", {
      _telegram_id: data.telegram_id,
      _amount: data.total_stake,
    } as never)
    if (error) throw new Error(error.message)
    return { balance: Number(newBalance) }
  })

export const finishGame = createServerFn({ method: "POST" })
  .inputValidator((d: {
    stake: number
    called_numbers: number[]
    prize_pool?: number
    winner_telegram_id?: number | string | null
    winner_cartela_id?: number | null
    participants: Array<{
      telegram_id: number | string
      username?: string | null
      cartela_id: number
      is_winner?: boolean
      payout?: number
    }>
  }) => z.object({
    stake: z.number().positive(),
    called_numbers: z.array(z.number().int()).max(75),
    prize_pool: z.number().nonnegative().default(0),
    winner_telegram_id: z.union([z.string(), z.number()]).nullable().optional(),
    winner_cartela_id: z.number().int().nullable().optional(),
    participants: z.array(ParticipantSchema).min(1),
  }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server")
    const winnerTg = data.winner_telegram_id != null ? Number(data.winner_telegram_id) : null
    const { data: gameId, error } = await supabaseAdmin.rpc("finish_game", {
      _stake: data.stake,
      _called_numbers: data.called_numbers,
      _participants: data.participants.map(p => ({
        telegram_id: Number(p.telegram_id),
        username: p.username ?? null,
        cartela_id: p.cartela_id,
        is_winner: p.is_winner ?? false,
        payout: p.payout ?? 0,
      })),
      _winner_telegram_id: winnerTg as number,
      _winner_cartela_id: (data.winner_cartela_id ?? null) as number,
      _prize_pool: data.prize_pool ?? 0,
    } as never)
    if (error) throw new Error(error.message)

    // Best-effort proactive notifications: DM the winner and, if configured,
    // post a public win shout-out. Failure here must not fail the game record.
    if (winnerTg) {
      try {
        const { data: gRow } = await supabaseAdmin
          .from("games")
          .select("short_code")
          .eq("id", gameId as string)
          .maybeSingle()
        const winner = data.participants.find(p => Number(p.telegram_id) === winnerTg)
        if (winner) {
          const { notifyWin } = await import("@/lib/telegram-bot")
          await notifyWin({
            winnerTg,
            username: winner.username,
            payout: Number(winner.payout ?? 0),
            stake: data.stake,
            shortCode: (gRow as { short_code?: string | null } | null)?.short_code ?? null,
            playerCount: data.participants.length,
          })
        }
      } catch {
        /* best-effort */
      }
    }

    return { game_id: gameId as string }
  })

/** Recent winners for the public home ticker (social proof). */
export const getRecentWinners = createServerFn({ method: "POST" })
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server")
    const { data: rows, error } = await supabaseAdmin
      .from("game_results")
      .select("telegram_id, username, payout, created_at, games(short_code, stake, player_count, prize_pool)")
      .eq("is_winner", true)
      .gt("payout", 0)
      .order("created_at", { ascending: false })
      .limit(10)
    if (error) throw new Error(error.message)
    return (rows ?? []).map(r => ({
      telegram_id: Number(r.telegram_id),
      username: r.username || `#${r.telegram_id}`,
      payout: Number(r.payout || 0),
      won_at: r.created_at,
      short_code: (r.games as { short_code?: string | null } | null)?.short_code ?? null,
      stake: Number((r.games as { stake?: unknown } | null)?.stake ?? 0),
      player_count: Number((r.games as { player_count?: unknown } | null)?.player_count ?? 0),
    }))
  })

export const getGameHistory = createServerFn({ method: "POST" })
  .inputValidator((d: { telegram_id: string | number }) => ({ telegram_id: TelegramIdSchema.parse(d.telegram_id) }))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server")
    const { data: rows, error } = await supabaseAdmin
      .from("game_results")
      .select("id, game_id, cartela_id, stake, is_winner, payout, created_at, games(short_code, prize_pool, player_count, called_numbers, winner_telegram_id)")
      .eq("telegram_id", data.telegram_id)
      .order("created_at", { ascending: false })
      .limit(50)
    if (error) throw new Error(error.message)
    return rows ?? []
  })

export const getLeaderboard = createServerFn({ method: "POST" })
  .inputValidator((d: { period: "daily" | "weekly" }) => ({ period: z.enum(["daily", "weekly"]).parse(d.period) }))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server")
    const sinceMs = data.period === "daily" ? 24 * 3600 * 1000 : 7 * 24 * 3600 * 1000
    const since = new Date(Date.now() - sinceMs).toISOString()
    const { data: rows, error } = await supabaseAdmin
      .from("game_results")
      .select("telegram_id, username, is_winner, payout")
      .eq("is_winner", true)
      .gte("created_at", since)
      .limit(1000)
    if (error) throw new Error(error.message)
    const agg = new Map<number, { name: string; wins: number; winnings: number }>()
    for (const r of rows ?? []) {
      const tg = Number(r.telegram_id)
      const cur = agg.get(tg) ?? { name: r.username || `Player ${tg}`, wins: 0, winnings: 0 }
      cur.wins += 1
      cur.winnings += Number(r.payout || 0)
      agg.set(tg, cur)
    }
    return Array.from(agg.values()).sort((a, b) => b.wins - a.wins).slice(0, 20)
  })
