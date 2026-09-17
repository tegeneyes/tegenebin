import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { isAdminId } from "@/lib/admin"

const TelegramIdSchema = z.union([z.string(), z.number()]).transform(v => Number(v)).refine(n => Number.isFinite(n) && n > 0, "invalid telegram_id")

// ───────── Announcement (lobby banner) ─────────

export const getActiveAnnouncement = createServerFn({ method: "GET" })
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server")
    const { data } = await supabaseAdmin
      .from("announcements")
      .select("id,message,created_at")
      .eq("active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    return data
  })

export const adminListAnnouncements = createServerFn({ method: "POST" })
  .inputValidator((d: { admin_id: string | number }) => ({ admin_id: TelegramIdSchema.parse(d.admin_id) }))
  .handler(async ({ data }) => {
    if (!isAdminId(data.admin_id)) throw new Error("Forbidden")
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server")
    const { data: rows, error } = await supabaseAdmin
      .from("announcements")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20)
    if (error) throw new Error(error.message)
    return rows
  })

export const adminSetAnnouncement = createServerFn({ method: "POST" })
  .inputValidator((d: { admin_id: string | number; message: string }) => ({
    admin_id: TelegramIdSchema.parse(d.admin_id),
    message: z.string().trim().min(2, "Message is too short").max(500, "Message too long").parse(d.message),
  }))
  .handler(async ({ data }) => {
    if (!isAdminId(data.admin_id)) throw new Error("Forbidden")
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server")
    // Deactivate any existing active banner so only one shows in the lobby.
    await supabaseAdmin.from("announcements").update({ active: false }).eq("active", true)
    const { data: row, error } = await supabaseAdmin
      .from("announcements")
      .insert({ message: data.message, active: true })
      .select()
      .single()
    if (error) throw new Error(error.message)
    return row
  })

export const adminClearAnnouncement = createServerFn({ method: "POST" })
  .inputValidator((d: { admin_id: string | number }) => ({ admin_id: TelegramIdSchema.parse(d.admin_id) }))
  .handler(async ({ data }) => {
    if (!isAdminId(data.admin_id)) throw new Error("Forbidden")
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server")
    const { error } = await supabaseAdmin.from("announcements").update({ active: false }).eq("active", true)
    if (error) throw new Error(error.message)
    return { ok: true }
  })

// ───────── Broadcast Telegram message to all players ─────────

export const adminBroadcast = createServerFn({ method: "POST" })
  .inputValidator((d: { admin_id: string | number; text: string }) => ({
    admin_id: TelegramIdSchema.parse(d.admin_id),
    text: z.string().trim().min(2, "Message is too short").max(3500, "Message too long").parse(d.text),
  }))
  .handler(async ({ data }) => {
    if (!isAdminId(data.admin_id)) throw new Error("Forbidden")
    const token = process.env.TELEGRAM_BOT_TOKEN
    if (!token) throw new Error("Bot not configured")
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server")
    const { data: players, error } = await supabaseAdmin.from("players").select("telegram_id")
    if (error) throw new Error(error.message)

    let sent = 0, failed = 0
    for (const p of players ?? []) {
      try {
        const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: p.telegram_id, text: data.text, parse_mode: "HTML", disable_web_page_preview: true }),
        })
        if (r.ok) sent++; else failed++
        // Telegram rate-limit ~30 msg/s; small delay to be safe
        await new Promise(res => setTimeout(res, 50))
      } catch { failed++ }
    }
    return { total: (players ?? []).length, sent, failed }
  })

// ───────── Bonus drop (10 ETB to everyone) ─────────

export const adminBonusDrop = createServerFn({ method: "POST" })
  .inputValidator((d: { admin_id: string | number; amount: number; note?: string; notify?: boolean }) => ({
    admin_id: TelegramIdSchema.parse(d.admin_id),
    amount: z.number().positive().max(10000).parse(d.amount),
    note: d.note?.toString().slice(0, 300) ?? null,
    notify: d.notify ?? true,
  }))
  .handler(async ({ data }) => {
    if (!isAdminId(data.admin_id)) throw new Error("Forbidden")
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server")
    const { data: drop, error } = await supabaseAdmin.rpc("drop_bonus_to_all", {
      _amount: data.amount,
      _note: data.note ?? undefined,
    })
    if (error) throw new Error(error.message)

    // Optionally notify users in Telegram
    if (data.notify) {
      const token = process.env.TELEGRAM_BOT_TOKEN
      if (token) {
        const { data: players } = await supabaseAdmin.from("players").select("telegram_id")
        const msg = `🎁 <b>Gift from Liyu Bingo!</b>\n\nYou just received <b>${data.amount} ETB</b> in your wallet${data.note ? `\n\n<i>${data.note}</i>` : ""}.\n\n🎮 Open the app and start playing!`
        for (const p of players ?? []) {
          try {
            await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ chat_id: p.telegram_id, text: msg, parse_mode: "HTML" }),
            })
            await new Promise(res => setTimeout(res, 50))
          } catch { /* ignore */ }
        }
      }
    }
    return drop
  })

export const adminListBonusDrops = createServerFn({ method: "POST" })
  .inputValidator((d: { admin_id: string | number }) => ({ admin_id: TelegramIdSchema.parse(d.admin_id) }))
  .handler(async ({ data }) => {
    if (!isAdminId(data.admin_id)) throw new Error("Forbidden")
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server")
    const { data: rows, error } = await supabaseAdmin
      .from("bonus_drops")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20)
    if (error) throw new Error(error.message)
    return rows
  })

// ───────── Players directory (admin) ─────────

export const adminListPlayers = createServerFn({ method: "POST" })
  .inputValidator((d: { admin_id: string | number; search?: string; limit?: number; offset?: number }) => ({
    admin_id: TelegramIdSchema.parse(d.admin_id),
    search: z.string().trim().max(100).optional().parse(d.search),
    limit: Math.min(Math.max(Number(d.limit) || 200, 1), 1000),
    offset: Math.max(Number(d.offset) || 0, 0),
  }))
  .handler(async ({ data }) => {
    if (!isAdminId(data.admin_id)) throw new Error("Forbidden")
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server")

    let orFilter: string | null = null
    if (data.search) {
      const s = data.search
      const asNum = Number(s)
      const filters = [`username.ilike.%${s}%`, `first_name.ilike.%${s}%`, `phone_number.ilike.%${s}%`]
      if (Number.isFinite(asNum)) filters.push(`telegram_id.eq.${asNum}`)
      orFilter = filters.join(",")
    }

    let rowsQuery = supabaseAdmin
      .from("players")
      .select("telegram_id, first_name, username, phone_number, balance, bonus_balance, referred_by, referral_bonus_paid, photo_url, created_at, banned, banned_reason, banned_at", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(data.offset, data.offset + data.limit - 1)
    if (orFilter) rowsQuery = rowsQuery.or(orFilter)

    let bannedQuery = supabaseAdmin
      .from("players")
      .select("telegram_id", { count: "exact", head: true })
      .eq("banned", true)
    if (orFilter) bannedQuery = bannedQuery.or(orFilter)

    const [rowsRes, bannedRes] = await Promise.all([rowsQuery, bannedQuery])
    if (rowsRes.error) throw new Error(rowsRes.error.message)
    if (bannedRes.error) throw new Error(bannedRes.error.message)

    return { rows: rowsRes.data ?? [], total: rowsRes.count ?? 0, banned: bannedRes.count ?? 0 }
  })

// Full per-player breakdown: balances, win/loss, bets, cartela picks and deposits.
export const adminPlayerDetail = createServerFn({ method: "POST" })
  .inputValidator((d: { admin_id: string | number; telegram_id: string | number }) => ({
    admin_id: TelegramIdSchema.parse(d.admin_id),
    telegram_id: TelegramIdSchema.parse(d.telegram_id),
  }))
  .handler(async ({ data }) => {
    if (!isAdminId(data.admin_id)) throw new Error("Forbidden")
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server")

    const [playerRes, txRes, gameRes] = await Promise.all([
      supabaseAdmin.from("players").select("*").eq("telegram_id", data.telegram_id).maybeSingle(),
      supabaseAdmin
        .from("transactions")
        .select("id, type, amount, status, provider, reference, phone_number, cbe_account_name, cbe_account_number, proof_text, admin_note, created_at")
        .eq("telegram_id", data.telegram_id)
        .order("created_at", { ascending: false })
        .limit(200),
      supabaseAdmin
        .from("game_results")
        .select("id, cartela_id, stake, is_winner, payout, created_at, games(short_code, prize_pool, player_count, called_numbers)")
        .eq("telegram_id", data.telegram_id)
        .order("created_at", { ascending: false })
        .limit(200),
    ])

    if (playerRes.error) throw new Error(playerRes.error.message)
    if (txRes.error) throw new Error(txRes.error.message)
    if (gameRes.error) throw new Error(gameRes.error.message)

    const txs = (txRes.data ?? []) as PlayerTx[]

    const games: PlayerGameRow[] = (gameRes.data ?? []).map((raw) => {
      const r = raw as unknown as {
        id: string; cartela_id: number; stake: number; is_winner: boolean; payout: number; created_at: string
        games: { short_code: string | null; prize_pool: number | null; player_count: number | null; called_numbers: number[] | null } | null
      }
      return {
        id: r.id,
        game_code: r.games?.short_code ?? null,
        cartela_id: Number(r.cartela_id),
        stake: Number(r.stake),
        is_winner: !!r.is_winner,
        payout: Number(r.payout || 0),
        prize_pool: Number(r.games?.prize_pool || 0),
        player_count: Number(r.games?.player_count || 0),
        called_count: Array.isArray(r.games?.called_numbers) ? r.games.called_numbers.length : 0,
        called_numbers: Array.isArray(r.games?.called_numbers) ? r.games.called_numbers : [],
        created_at: r.created_at,
      }
    })

    const wins = games.filter(g => g.is_winner).length
    const staked = games.reduce((s, g) => s + g.stake, 0)
    const won = games.reduce((s, g) => s + g.payout, 0)

    const sumTx = (type: string, status: string) =>
      txs.filter(t => t.type === type && t.status === status).reduce((s, t) => s + Number(t.amount || 0), 0)

    // Cartela breakdown — which cartela numbers the player picks and how they perform.
    const cartMap = new Map<number, PlayerCartelaRow>()
    for (const g of games) {
      const c = cartMap.get(g.cartela_id) ?? { cartela_id: g.cartela_id, plays: 0, wins: 0, staked: 0, won: 0 }
      c.plays += 1
      c.staked += g.stake
      c.won += g.payout
      if (g.is_winner) c.wins += 1
      cartMap.set(g.cartela_id, c)
    }
    const cartelas = Array.from(cartMap.values()).sort((a, b) => b.plays - a.plays)

    return {
      player: playerRes.data ?? null,
      summary: {
        games: games.length,
        wins,
        losses: games.length - wins,
        staked,
        won,
        net: won - staked,
        deposited: sumTx("deposit", "approved"),
        deposit_pending: sumTx("deposit", "pending"),
        withdrawn: sumTx("withdrawal", "approved"),
        withdrawal_pending: sumTx("withdrawal", "pending"),
      },
      transactions: txs,
      games,
      cartelas,
    }
  })

type PlayerTx = {
  id: string; type: string; amount: number; status: string; provider: string | null;
  reference: string | null; phone_number: string | null; cbe_account_name: string | null;
  cbe_account_number: string | null; proof_text: string | null; admin_note: string | null; created_at: string
}

export type PlayerGameRow = {
  id: string; game_code: string | null; cartela_id: number; stake: number; is_winner: boolean;
  payout: number; prize_pool: number; player_count: number; called_count: number;
  called_numbers: number[]; created_at: string
}

export type PlayerCartelaRow = {
  cartela_id: number; plays: number; wins: number; staked: number; won: number
}

export const adminSetBanned = createServerFn({ method: "POST" })
  .inputValidator((d: { admin_id: string | number; telegram_id: string | number; banned: boolean; reason?: string }) => ({
    admin_id: TelegramIdSchema.parse(d.admin_id),
    telegram_id: TelegramIdSchema.parse(d.telegram_id),
    banned: z.boolean().parse(d.banned),
    reason: z.string().trim().max(300).optional().parse(d.reason),
  }))
  .handler(async ({ data }) => {
    if (!isAdminId(data.admin_id)) throw new Error("Forbidden")
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server")
    const patch = {
      banned: data.banned,
      banned_reason: data.banned ? (data.reason ?? null) : null,
      banned_at: data.banned ? new Date().toISOString() : null,
    }
    const { data: row, error } = await supabaseAdmin
      .from("players")
      .update(patch)
      .eq("telegram_id", data.telegram_id)
      .select("telegram_id, banned, banned_reason, banned_at")
      .single()
    if (error) throw new Error(error.message)
    return row
  })

// ───────── Delete player (admin) ─────────

export const adminDeletePlayer = createServerFn({ method: "POST" })
  .inputValidator((d: { admin_id: string | number; telegram_id: string | number }) => ({
    admin_id: TelegramIdSchema.parse(d.admin_id),
    telegram_id: TelegramIdSchema.parse(d.telegram_id),
  }))
  .handler(async ({ data }) => {
    if (!isAdminId(data.admin_id)) throw new Error("Forbidden")
    if (data.admin_id === data.telegram_id) throw new Error("You cannot delete your own admin account.")
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server")

    // Clear every record keyed by this Telegram id so the account can register
    // fresh (welcome bonus, promo claims and game history).
    const games = await supabaseAdmin.from("game_results").delete().eq("telegram_id", data.telegram_id)
    if (games.error) throw new Error(games.error.message)
    const promos = await supabaseAdmin.from("promo_redemptions").delete().eq("telegram_id", data.telegram_id)
    if (promos.error) throw new Error(promos.error.message)
    const bonuses = await supabaseAdmin.from("welcome_bonus_claims").delete().eq("telegram_id", data.telegram_id)
    if (bonuses.error) throw new Error(bonuses.error.message)

    // Deleting the player cascades their transactions (FK ON DELETE CASCADE).
    const player = await supabaseAdmin.from("players").delete().eq("telegram_id", data.telegram_id)
    if (player.error) throw new Error(player.error.message)
    return { ok: true, telegram_id: data.telegram_id }
  })

