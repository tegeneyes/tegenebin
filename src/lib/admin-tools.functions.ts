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
  .inputValidator((d: { admin_id: string | number; search?: string }) => ({
    admin_id: TelegramIdSchema.parse(d.admin_id),
    search: z.string().trim().max(100).optional().parse(d.search),
  }))
  .handler(async ({ data }) => {
    if (!isAdminId(data.admin_id)) throw new Error("Forbidden")
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server")
    let q = supabaseAdmin
      .from("players")
      .select("telegram_id, first_name, username, phone_number, balance, bonus_balance, referred_by, referral_bonus_paid, photo_url, created_at, banned, banned_reason, banned_at")
      .order("created_at", { ascending: false })
      .limit(500)
    if (data.search) {
      const s = data.search
      const asNum = Number(s)
      const filters = [`username.ilike.%${s}%`, `first_name.ilike.%${s}%`, `phone_number.ilike.%${s}%`]
      if (Number.isFinite(asNum)) filters.push(`telegram_id.eq.${asNum}`)
      q = q.or(filters.join(","))
    }
    const { data: rows, error } = await q
    if (error) throw new Error(error.message)
    return rows ?? []
  })

export const adminPlayerGames = createServerFn({ method: "POST" })
  .inputValidator((d: { admin_id: string | number; telegram_id: string | number }) => ({
    admin_id: TelegramIdSchema.parse(d.admin_id),
    telegram_id: TelegramIdSchema.parse(d.telegram_id),
  }))
  .handler(async ({ data }) => {
    if (!isAdminId(data.admin_id)) throw new Error("Forbidden")
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server")
    const { data: rows, error } = await supabaseAdmin
      .from("game_results")
      .select("id, cartela_id, stake, is_winner, payout, created_at, games(short_code, prize_pool, player_count)")
      .eq("telegram_id", data.telegram_id)
      .order("created_at", { ascending: false })
      .limit(100)
    if (error) throw new Error(error.message)
    const list = (rows ?? []).map((r: any) => ({
      id: r.id as string,
      game_code: (r.games?.short_code as string | null) ?? null,
      cartela_id: Number(r.cartela_id),
      stake: Number(r.stake),
      is_winner: !!r.is_winner,
      payout: Number(r.payout || 0),
      prize_pool: Number(r.games?.prize_pool || 0),
      player_count: Number(r.games?.player_count || 0),
      created_at: r.created_at as string,
    }))
    const games = list.length
    const wins = list.filter(g => g.is_winner).length
    const staked = list.reduce((s, g) => s + g.stake, 0)
    const won = list.reduce((s, g) => s + g.payout, 0)
    return { games: list, summary: { games, wins, losses: games - wins, staked, won, net: won - staked } }
  })

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

// ───────── Games list (admin) ─────────

export const adminListGames = createServerFn({ method: "POST" })
  .inputValidator((d: { admin_id: string | number; limit?: number }) => ({
    admin_id: TelegramIdSchema.parse(d.admin_id),
    limit: Math.min(Math.max(Number(d.limit) || 50, 1), 200),
  }))
  .handler(async ({ data }) => {
    if (!isAdminId(data.admin_id)) throw new Error("Forbidden")
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server")
    const { data: rows, error } = await supabaseAdmin
      .from("games")
      .select("id, short_code, stake, prize_pool, player_count, called_numbers, winner_telegram_id, status, started_at, ended_at, created_at")
      .order("created_at", { ascending: false })
      .limit(data.limit)
    if (error) throw new Error(error.message)
    return rows ?? []
  })

