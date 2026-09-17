import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { isAdminId } from "@/lib/admin"
import { TELEBIRR_PHONE, CBE_ACCOUNT, ACCOUNT_NAME } from "@/lib/payment-config"

const TelegramIdSchema = z.union([z.string(), z.number()]).transform(v => Number(v)).refine(n => Number.isFinite(n) && n > 0, "invalid telegram_id")

// ───────── User-facing ─────────

export const ensurePlayer = createServerFn({ method: "POST" })
  .inputValidator((d: { telegram_id: string | number; first_name?: string; username?: string; photo_url?: string; referred_by?: string | number | null }) => ({
    telegram_id: TelegramIdSchema.parse(d.telegram_id),
    first_name: d.first_name?.toString().slice(0, 100) ?? null,
    username: d.username?.toString().slice(0, 100) ?? null,
    photo_url: d.photo_url?.toString().slice(0, 500) ?? null,
    referred_by: d.referred_by != null && Number(d.referred_by) > 0 ? Number(d.referred_by) : null,
  }))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server")
    const { data: existing } = await supabaseAdmin.from("players").select("*").eq("telegram_id", data.telegram_id).maybeSingle()
    if (existing) return existing
    const referred_by = data.referred_by && data.referred_by !== data.telegram_id ? data.referred_by : null
    const { data: created, error } = await supabaseAdmin.from("players").insert({
      telegram_id: data.telegram_id,
      first_name: data.first_name,
      username: data.username,
      photo_url: data.photo_url,
      referred_by,
    }).select().single()
    if (error) throw new Error(error.message)
    return created
  })

export const getWallet = createServerFn({ method: "POST" })
  .inputValidator((d: { telegram_id: string | number }) => ({ telegram_id: TelegramIdSchema.parse(d.telegram_id) }))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server")
    const { data: player } = await supabaseAdmin.from("players").select("*").eq("telegram_id", data.telegram_id).maybeSingle()
    const { data: txs } = await supabaseAdmin.from("transactions").select("*").eq("telegram_id", data.telegram_id).order("created_at", { ascending: false }).limit(50)
    return { player, transactions: txs ?? [] }
  })

export const requestDeposit = createServerFn({ method: "POST" })
  .inputValidator((d: {
    telegram_id: string | number
    amount: number
    provider: "telebirr" | "cbe"
    phone_number?: string
    cbe_account_name?: string
    cbe_account_number?: string
    proof_text?: string
    reference?: string
    account_suffix?: string
  }) => {
    const s = z.object({
      telegram_id: TelegramIdSchema,
      amount: z.number({ message: "Enter a valid amount" }).min(50, "Minimum deposit is 50 ETB").max(100000, "Amount is too large"),
      provider: z.enum(["telebirr", "cbe"]),
      phone_number: z.string().max(20).optional(),
      cbe_account_name: z.string().max(100).optional(),
      cbe_account_number: z.string().max(50).optional(),
      proof_text: z.string().trim().min(10, "Please paste the full confirmation SMS").max(2000, "SMS text is too long"),
      reference: z.string().trim().max(40).regex(/^[A-Za-z0-9]*$/, "The reference should contain only letters and numbers").optional(),
      account_suffix: z.string().trim().max(10).regex(/^[0-9]*$/, "Account suffix must be digits").optional(),
    }).safeParse(d)
    if (!s.success) {
      throw new Error(s.error.issues[0]?.message ?? "Invalid input")
    }
    return s.data
  })
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server")
    const { veritasVerify, veritasCheck, veritasLimits } = await import("@/lib/veritas.server")
    const { parseSms, accountMatches } = await import("@/lib/sms-parser")

    // Fully automatic: the SMS must match a known provider format exactly.
    const parsed = parseSms(data.proof_text)
    if (!parsed.matched || !parsed.reference || !parsed.amount || !parsed.provider) {
      throw new Error("This doesn't look like a real telebirr or CBE confirmation SMS. Paste the full message exactly as you received it.")
    }
    const reference = parsed.reference.toUpperCase()
    const provider = parsed.provider

    // 1. Money must have gone to OUR account.
    const destinations = provider === "telebirr" ? [TELEBIRR_PHONE] : [CBE_ACCOUNT]
    if (parsed.recipient_account) {
      if (!accountMatches(parsed.recipient_account, destinations)) {
        throw new Error(`This transfer was not sent to our ${provider === "telebirr" ? "telebirr number" : "CBE account"}. Only payments to the account shown in Payment Details are accepted.`)
      }
    } else if (!veritasLimits().enabled) {
      // Newer CBE SMS hides the recipient account — without Veritas we cannot prove the destination.
      throw new Error("We couldn't confirm the destination account from this SMS. Please try again shortly or contact support.")
    }
    if (parsed.recipient_name && !parsed.recipient_name.includes(ACCOUNT_NAME.toLowerCase())) {
      throw new Error("The recipient name in this SMS does not match our account. Only payments to the account shown in Payment Details are accepted.")
    }

    // 2. Amount checks — the SMS amount is authoritative.
    const smsAmount = parsed.amount
    if (Math.abs(smsAmount - data.amount) > 0.009) {
      throw new Error(`The SMS shows ${smsAmount.toFixed(2)} ETB but you entered ${data.amount.toFixed(2)} ETB. Enter the exact amount you transferred.`)
    }
    const limits = veritasLimits()
    if (smsAmount < limits.min) throw new Error(`Minimum deposit is ${limits.min} ETB.`)
    if (smsAmount > limits.max) throw new Error(`Maximum deposit is ${limits.max} ETB.`)

    // 3. Anti-replay: a reference can only ever be used once (also enforced by a unique index).
    {
      const { data: dup } = await supabaseAdmin.from("transactions").select("id").eq("reference", reference).limit(1)
      if (dup && dup.length > 0) throw new Error("This SMS has already been used. Each receipt can only be deposited once.")
    }

    // 4. Banned players cannot deposit.
    const { data: player } = await supabaseAdmin.from("players").select("phone_number, banned").eq("telegram_id", data.telegram_id).maybeSingle()
    if (!player) throw new Error("We couldn't find your wallet. Please reopen the app from Telegram.")
    if (player.banned) throw new Error("Your account is suspended. Contact support.")

    // 5. Independent receipt verification (Veritas) when configured — provider-specific endpoint.
    let verifiedAmount = smsAmount
    let note = `Auto-approved · SMS parsed · ${smsAmount.toFixed(2)} ETB`
    if (limits.enabled) {
      const v = await veritasVerify(reference, provider, parsed.account_suffix ?? data.account_suffix ?? "")
      if (/unreachable|bad response/i.test(v.error)) {
        throw new Error("Verification service is temporarily busy. Please try again in a minute — your money is safe.")
      }
      const check = veritasCheck(v, provider)
      if (!check.ok || !check.amount) {
        throw new Error(`We could not verify this receipt (${check.reason}). Make sure you pasted the real SMS for a completed transfer.`)
      }
      // Receipt may show the net (settled) amount; allow up to 1 ETB fee difference.
      if (Math.abs(check.amount - smsAmount) > 1) {
        throw new Error(`The verified receipt amount (${check.amount.toFixed(2)} ETB) does not match the SMS. Deposit declined.`)
      }
      verifiedAmount = smsAmount
      note = `Auto-verified by Veritas (${provider}) · ${check.amount.toFixed(2)} ETB`
    }

    // 6. Record + credit atomically.
    const { data: tx, error } = await supabaseAdmin.from("transactions").insert({
      telegram_id: data.telegram_id,
      type: "deposit",
      amount: verifiedAmount,
      status: "pending",
      provider,
      phone_number: data.phone_number ?? null,
      proof_text: data.proof_text,
      reference,
    }).select().single()
    if (error) {
      if (/duplicate key|unique constraint/i.test(error.message || "")) {
        throw new Error("This SMS has already been used. Each receipt can only be deposited once.")
      }
      console.error("deposit insert failed:", error.message)
      throw new Error("Could not process your deposit right now. Please try again in a moment.")
    }
    const { data: approved, error: pErr } = await supabaseAdmin.rpc("process_transaction", {
      _tx_id: tx.id, _new_status: "approved", _admin_note: note,
    })
    if (pErr || !approved) {
      console.error("deposit approve failed:", pErr?.message)
      await supabaseAdmin.from("transactions").update({ status: "rejected", admin_note: `Auto-credit failed: ${pErr?.message ?? "unknown"}`.slice(0, 500) }).eq("id", tx.id)
      throw new Error("Could not credit your deposit right now. Please try again in a moment.")
    }
    return { ...(approved as any), verified: true, message: "Deposit verified and credited." }
  })

export const requestWithdrawal = createServerFn({ method: "POST" })
  .inputValidator((d: {
    telegram_id: string | number
    amount: number
    provider: "telebirr" | "cbe"
    phone_number?: string
    cbe_account_name?: string
    cbe_account_number?: string
  }) => {
    const s = z.object({
      telegram_id: TelegramIdSchema,
      amount: z.number({ message: "Enter a valid amount" }).min(50, "Minimum withdrawal is 50 ETB").max(100000, "Amount is too large"),
      provider: z.enum(["telebirr", "cbe"]),
      phone_number: z.string().max(20).optional(),
      cbe_account_name: z.string().max(100).optional(),
      cbe_account_number: z.string().max(50).optional(),
    }).safeParse(d)
    if (!s.success) throw new Error(s.error.issues[0]?.message ?? "Invalid input")
    return s.data
  })
  .handler(async ({ data }) => {
    if (data.provider === "telebirr" && !data.phone_number?.trim()) {
      throw new Error("Please enter the TeleBirr phone number to receive your withdrawal.")
    }
    if (data.provider === "cbe" && (!data.cbe_account_name?.trim() || !data.cbe_account_number?.trim())) {
      throw new Error("Please enter your CBE account name and account number.")
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server")
    const { data: player } = await supabaseAdmin.from("players").select("balance").eq("telegram_id", data.telegram_id).maybeSingle()
    const bal = player ? Number(player.balance) : 0
    if (!player) throw new Error("We couldn't find your wallet. Please reopen the app and try again.")
    if (bal < data.amount) {
      throw new Error(`Insufficient balance. You have ${bal.toFixed(2)} ETB in your wallet — please deposit before withdrawing.`)
    }
    const { data: tx, error } = await supabaseAdmin.from("transactions").insert({
      telegram_id: data.telegram_id,
      type: "withdrawal",
      amount: data.amount,
      status: "pending",
      provider: data.provider,
      phone_number: data.phone_number ?? null,
      cbe_account_name: data.cbe_account_name ?? null,
      cbe_account_number: data.cbe_account_number ?? null,
    }).select().single()
    if (error) {
      console.error("withdrawal insert failed:", error.message)
      throw new Error("Could not submit your withdrawal right now. Please try again in a moment.")
    }
    return tx
  })

export const redeemPromo = createServerFn({ method: "POST" })
  .inputValidator((d: { telegram_id: string | number; code: string }) => ({
    telegram_id: TelegramIdSchema.parse(d.telegram_id),
    code: z.string().min(3).max(50).parse(d.code).toUpperCase(),
  }))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server")
    const { data: result, error } = await supabaseAdmin.rpc("redeem_promo_code", {
      _telegram_id: data.telegram_id,
      _code: data.code,
    })
    if (error) throw new Error(error.message)
    return result as { ok: boolean; credited: number; type: string }
  })

// ───────── Admin ─────────

export const adminListTransactions = createServerFn({ method: "POST" })
  .inputValidator((d: { admin_id: string | number; status?: "pending" | "approved" | "rejected" }) => ({
    admin_id: TelegramIdSchema.parse(d.admin_id),
    status: d.status,
  }))
  .handler(async ({ data }) => {
    if (!isAdminId(data.admin_id)) throw new Error("Forbidden")
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server")
    let q = supabaseAdmin.from("transactions").select("*").order("created_at", { ascending: false }).limit(200)
    if (data.status) q = q.eq("status", data.status)
    const { data: txs, error } = await q
    if (error) throw new Error(error.message)
    return txs
  })

export const adminProcessTransaction = createServerFn({ method: "POST" })
  .inputValidator((d: { admin_id: string | number; tx_id: string; action: "approve" | "reject"; note?: string }) => ({
    admin_id: TelegramIdSchema.parse(d.admin_id),
    tx_id: z.string().uuid().parse(d.tx_id),
    action: z.enum(["approve", "reject"]).parse(d.action),
    note: d.note?.toString().slice(0, 500) ?? undefined,
  }))
  .handler(async ({ data }) => {
    if (!isAdminId(data.admin_id)) throw new Error("Forbidden")
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server")
    const { data: tx, error } = await supabaseAdmin.rpc("process_transaction", {
      _tx_id: data.tx_id,
      _new_status: data.action === "approve" ? "approved" : "rejected",
      _admin_note: data.note,
    })
    if (error) throw new Error(error.message)
    return tx
  })

export const adminListPromos = createServerFn({ method: "POST" })
  .inputValidator((d: { admin_id: string | number }) => ({ admin_id: TelegramIdSchema.parse(d.admin_id) }))
  .handler(async ({ data }) => {
    if (!isAdminId(data.admin_id)) throw new Error("Forbidden")
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server")
    const { data: list, error } = await supabaseAdmin.from("promo_codes").select("*").order("created_at", { ascending: false })
    if (error) throw new Error(error.message)
    return list
  })

export const adminCreatePromo = createServerFn({ method: "POST" })
  .inputValidator((d: {
    admin_id: string | number
    code: string
    type: "bonus" | "deposit_match" | "free_credit"
    amount: number
    max_redemptions?: number | null
    expires_at?: string | null
  }) => ({
    admin_id: TelegramIdSchema.parse(d.admin_id),
    code: z.string().min(3).max(50).parse(d.code).toUpperCase(),
    type: z.enum(["bonus", "deposit_match", "free_credit"]).parse(d.type),
    amount: z.number().positive().parse(d.amount),
    max_redemptions: d.max_redemptions ?? null,
    expires_at: d.expires_at ?? null,
  }))
  .handler(async ({ data }) => {
    if (!isAdminId(data.admin_id)) throw new Error("Forbidden")
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server")
    const { data: row, error } = await supabaseAdmin.from("promo_codes").insert({
      code: data.code,
      type: data.type,
      amount: data.amount,
      max_redemptions: data.max_redemptions,
      expires_at: data.expires_at,
    }).select().single()
    if (error) throw new Error(error.message)
    return row
  })

export const getReferralStats = createServerFn({ method: "POST" })
  .inputValidator((d: { telegram_id: string | number }) => ({ telegram_id: TelegramIdSchema.parse(d.telegram_id) }))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server")
    const { data: invited } = await supabaseAdmin
      .from("players")
      .select("telegram_id, username, first_name, referral_bonus_paid, created_at")
      .eq("referred_by", data.telegram_id)
      .order("created_at", { ascending: false })
    const list = invited ?? []
    const paid_count = list.filter((p: any) => p.referral_bonus_paid).length
    const BONUS = 10
    return {
      total_invites: list.length,
      qualified_invites: paid_count,
      total_earned: paid_count * BONUS,
      bonus_per_invite: BONUS,
      invites: list.map((p: any) => ({
        telegram_id: p.telegram_id,
        name: p.username ? `@${p.username}` : (p.first_name || `User ${p.telegram_id}`),
        deposited: !!p.referral_bonus_paid,
        joined_at: p.created_at,
      })),
    }
  })

export const adminTogglePromo = createServerFn({ method: "POST" })
  .inputValidator((d: { admin_id: string | number; id: string; active: boolean }) => ({
    admin_id: TelegramIdSchema.parse(d.admin_id),
    id: z.string().uuid().parse(d.id),
    active: z.boolean().parse(d.active),
  }))
  .handler(async ({ data }) => {
    if (!isAdminId(data.admin_id)) throw new Error("Forbidden")
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server")
    const { data: row, error } = await supabaseAdmin.from("promo_codes").update({ active: data.active }).eq("id", data.id).select().single()
    if (error) throw new Error(error.message)
    return row
  })

export const setPlayerPhone = createServerFn({ method: "POST" })
  .inputValidator((d: { telegram_id: string | number; phone_number: string }) => {
    const s = z.object({
      telegram_id: TelegramIdSchema,
      phone_number: z.string().trim().min(6).max(20).regex(/^\+?[0-9\s\-()]+$/, "invalid phone"),
    }).parse(d)
    return s
  })
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server")
    const { data: existing } = await supabaseAdmin
      .from("players")
      .select("telegram_id")
      .eq("telegram_id", data.telegram_id)
      .maybeSingle()
    const { error } = existing
      ? await supabaseAdmin.from("players")
          .update({ phone_number: data.phone_number })
          .eq("telegram_id", data.telegram_id)
      : await supabaseAdmin.from("players")
          .insert({ telegram_id: data.telegram_id, phone_number: data.phone_number })
    if (error) throw new Error(error.message)
    return { ok: true }
  })
