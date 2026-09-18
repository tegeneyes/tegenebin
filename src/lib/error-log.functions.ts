import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { isAdminId } from "@/lib/admin"

const TelegramIdSchema = z.union([z.string(), z.number()]).transform(v => Number(v)).refine(n => Number.isFinite(n) && n > 0, "invalid telegram_id")

// ───────── Public: report an error from the app ─────────

export const logClientError = createServerFn({ method: "POST" })
  .inputValidator((d: {
    telegram_id?: string | number | null
    level?: "error" | "warning" | "info"
    source?: string
    message: string
    detail?: string
    path?: string
    user_agent?: string
  }) => {
    const s = z.object({
      telegram_id: z.union([z.string(), z.number()]).optional().nullable(),
      level: z.enum(["error", "warning", "info"]).optional(),
      source: z.string().max(60).optional(),
      message: z.string().trim().min(1).max(1000),
      detail: z.string().max(8000).optional(),
      path: z.string().max(300).optional(),
      user_agent: z.string().max(400).optional(),
    }).safeParse(d)
    if (!s.success) throw new Error("Invalid error payload")
    return s.data
  })
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server")
    const tgNum = data.telegram_id != null ? Number(data.telegram_id) : NaN
    const { error } = await supabaseAdmin.from("error_logs").insert({
      telegram_id: Number.isFinite(tgNum) && tgNum > 0 ? tgNum : null,
      level: data.level ?? "error",
      source: data.source ?? "client",
      message: data.message.slice(0, 1000),
      detail: data.detail?.slice(0, 8000) ?? null,
      path: data.path?.slice(0, 300) ?? null,
      user_agent: data.user_agent?.slice(0, 400) ?? null,
    })
    if (error) {
      // Never let error reporting break the app.
      console.error("logClientError failed:", error.message)
      return { ok: false }
    }
    return { ok: true }
  })

// ───────── Admin ─────────

export const adminListErrors = createServerFn({ method: "POST" })
  .inputValidator((d: { admin_id: string | number; resolved?: boolean; limit?: number; offset?: number }) => ({
    admin_id: TelegramIdSchema.parse(d.admin_id),
    resolved: typeof d.resolved === "boolean" ? d.resolved : undefined,
    limit: Math.min(Math.max(Number(d.limit) || 100, 1), 500),
    offset: Math.max(Number(d.offset) || 0, 0),
  }))
  .handler(async ({ data }) => {
    if (!isAdminId(data.admin_id)) throw new Error("Forbidden")
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server")

    let q = supabaseAdmin
      .from("error_logs")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(data.offset, data.offset + data.limit - 1)
    if (data.resolved !== undefined) q = q.eq("resolved", data.resolved)

    const [rowsRes, unresolvedRes] = await Promise.all([
      q,
      supabaseAdmin.from("error_logs").select("id", { count: "exact", head: true }).eq("resolved", false),
    ])
    if (rowsRes.error) throw new Error(rowsRes.error.message)
    if (unresolvedRes.error) throw new Error(unresolvedRes.error.message)

    return { rows: rowsRes.data ?? [], total: rowsRes.count ?? 0, unresolved: unresolvedRes.count ?? 0 }
  })

export const adminUnresolvedErrorCount = createServerFn({ method: "POST" })
  .inputValidator((d: { admin_id: string | number }) => ({ admin_id: TelegramIdSchema.parse(d.admin_id) }))
  .handler(async ({ data }) => {
    if (!isAdminId(data.admin_id)) throw new Error("Forbidden")
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server")
    const { count, error } = await supabaseAdmin.from("error_logs").select("id", { count: "exact", head: true }).eq("resolved", false)
    if (error) throw new Error(error.message)
    return { unresolved: count ?? 0 }
  })

export const adminSetErrorResolved = createServerFn({ method: "POST" })
  .inputValidator((d: { admin_id: string | number; id: string; resolved: boolean }) => ({
    admin_id: TelegramIdSchema.parse(d.admin_id),
    id: z.string().uuid().parse(d.id),
    resolved: z.boolean().parse(d.resolved),
  }))
  .handler(async ({ data }) => {
    if (!isAdminId(data.admin_id)) throw new Error("Forbidden")
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server")
    const { error } = await supabaseAdmin.from("error_logs").update({ resolved: data.resolved }).eq("id", data.id)
    if (error) throw new Error(error.message)
    return { ok: true }
  })

export const adminClearErrors = createServerFn({ method: "POST" })
  .inputValidator((d: { admin_id: string | number; resolvedOnly?: boolean }) => ({
    admin_id: TelegramIdSchema.parse(d.admin_id),
    resolvedOnly: d.resolvedOnly ?? true,
  }))
  .handler(async ({ data }) => {
    if (!isAdminId(data.admin_id)) throw new Error("Forbidden")
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server")
    let q = supabaseAdmin.from("error_logs").delete()
    q = data.resolvedOnly ? q.eq("resolved", true) : q.not("id", "is", null)
    const { error } = await q
    if (error) throw new Error(error.message)
    return { ok: true }
  })
