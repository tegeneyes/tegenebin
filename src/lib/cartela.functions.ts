import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { finiteNumber, roundIndex } from "@/lib/validate"

const TelegramIdSchema = z.union([z.string(), z.number()]).transform(v => Number(v)).refine(n => Number.isFinite(n) && n > 0, "invalid telegram_id")

export const reserveCartela = createServerFn({ method: "POST" })
  .inputValidator((d: {
    round_index: number | string
    stake: number
    telegram_id: number | string
    username?: string | null
    cartela_id: number
  }) => ({
    round_index: roundIndex("round_index", d.round_index),
    stake: z.number().positive().parse(finiteNumber("stake", d.stake)),
    telegram_id: TelegramIdSchema.parse(d.telegram_id),
    username: z.string().max(100).optional().nullable().parse(d.username),
    cartela_id: z.number().int().min(1).max(500).parse(finiteNumber("cartela_id", d.cartela_id)),
  }))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server")
    const { data: row, error } = await supabaseAdmin.rpc("reserve_cartela", {
      _round_index: data.round_index,
      _stake: data.stake,
      _telegram_id: data.telegram_id,
      _username: data.username ?? null,
      _cartela_id: data.cartela_id,
    } as never)
    if (error) {
      if (error.message?.includes("cartela_taken")) throw new Error("cartela_taken")
      throw new Error(error.message)
    }
    return row
  })

export const releaseCartela = createServerFn({ method: "POST" })
  .inputValidator((d: {
    round_index: number | string
    stake: number
    telegram_id: number | string
    cartela_id: number
  }) => ({
    round_index: roundIndex("round_index", d.round_index),
    stake: z.number().positive().parse(finiteNumber("stake", d.stake)),
    telegram_id: TelegramIdSchema.parse(d.telegram_id),
    cartela_id: z.number().int().min(1).max(500).parse(finiteNumber("cartela_id", d.cartela_id)),
  }))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server")
    const { error } = await supabaseAdmin.rpc("release_cartela", {
      _round_index: data.round_index,
      _stake: data.stake,
      _telegram_id: data.telegram_id,
      _cartela_id: data.cartela_id,
    } as never)
    if (error) throw new Error(error.message)
  })

export const getRoundCartelas = createServerFn({ method: "POST" })
  .inputValidator((d: { round_index: number | string; stake: number }) => ({
    round_index: roundIndex("round_index", d.round_index),
    stake: z.number().positive().parse(finiteNumber("stake", d.stake)),
  }))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server")
    const { data: rows, error } = await supabaseAdmin.rpc("get_round_cartelas", {
      _round_index: data.round_index,
      _stake: data.stake,
    } as never)
    if (error) throw new Error(error.message)
    return rows ?? []
  })

export const getRoundPlayerCount = createServerFn({ method: "POST" })
  .inputValidator((d: { round_index: number | string; stake: number }) => ({
    round_index: roundIndex("round_index", d.round_index),
    stake: z.number().positive().parse(finiteNumber("stake", d.stake)),
  }))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server")
    const { data: count, error } = await supabaseAdmin.rpc("get_round_player_count", {
      _round_index: data.round_index,
      _stake: data.stake,
    } as never)
    if (error) throw new Error(error.message)
    return Number(count) || 0
  })

export const getMyCartelas = createServerFn({ method: "POST" })
  .inputValidator((d: { round_index: number | string; stake: number; telegram_id: number | string }) => ({
    round_index: roundIndex("round_index", d.round_index),
    stake: z.number().positive().parse(finiteNumber("stake", d.stake)),
    telegram_id: TelegramIdSchema.parse(d.telegram_id),
  }))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server")
    const { data: rows, error } = await supabaseAdmin
      .from("round_cartelas")
      .select("cartela_id")
      .eq("round_index", data.round_index)
      .eq("stake", data.stake)
      .eq("telegram_id", data.telegram_id)
    if (error) throw new Error(error.message)
    return (rows ?? []).map(r => r.cartela_id)
  })
