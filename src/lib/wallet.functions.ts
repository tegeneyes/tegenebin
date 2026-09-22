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

// Lightweight poll target for the phone-verification screen. Unlike getWallet it
// surfaces DB errors instead of silently returning null, so the app can tell the
// difference between "not saved yet" and "lookup failed".
export const getPhoneStatus = createServerFn({ method: "POST" })
  .inputValidator((d: { telegram_id: string | number }) => ({ telegram_id: TelegramIdSchema.parse(d.telegram_id) }))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server")
    const { data: player, error } = await supabaseAdmin
      .from("players")
      .select("telegram_id, phone_number")
      .eq("telegram_id", data.telegram_id)
      .maybeSingle()
    if (error) throw new Error(error.message)
    return {
      telegram_id: data.telegram_id,
      exists: !!player,
      phone_number: player?.phone_number ?? null,
    }
  })

// Deposits are reviewed manually by an admin by default. Set
// DEPOSIT_AUTO_VERIFY=true to re-enable the strict SMS + Veritas auto-credit path.
const DEPOSIT_AUTO_VERIFY = (process.env.DEPOSIT_AUTO_VERIFY ?? "false") === "true"

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
      proof_text: z.string().trim().max(2000, "SMS text is too long").optional(),
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

    // Banned players cannot deposit.
    const { data: player } = await supabaseAdmin.from("players").select("phone_number, banned").eq("telegram_id", data.telegram_id).maybeSingle()
    if (!player) throw new Error("We couldn't find your wallet. Please reopen the app from Telegram.")
    if (player.banned) throw new Error("Your account is suspended. Contact support.")

    // One deposit at a time: no new request while one is awaiting review.
    {
      const { data: pending } = await supabaseAdmin
        .from("transactions")
        .select("id")
        .eq("telegram_id", data.telegram_id)
        .eq("type", "deposit")
        .eq("status", "pending")
        .limit(1)
      if (pending && pending.length > 0) {
        throw new Error("You already have a deposit awaiting review. Please wait until it is approved or rejected before submitting another.")
      }
    }

    const limits = veritasLimits()

    // Parse the receipt once and validate it the SAME way in both modes, so a
    // receipt that shows a different amount or account can never be credited.
    const parsed = parseSms(data.proof_text ?? "")
    const receipt = parsed.matched && parsed.reference && parsed.amount && parsed.provider
      ? {
          reference: parsed.reference,
          amount: parsed.amount,
          provider: parsed.provider,
          recipient_account: parsed.recipient_account,
          recipient_name: parsed.recipient_name,
        }
      : null

    const reference: string | null = receipt ? receipt.reference : ((data.reference?.trim() || null)?.toUpperCase() ?? null)
    const provider: "telebirr" | "cbe" = receipt ? receipt.provider : data.provider
    const amount = receipt ? receipt.amount : data.amount

    if (receipt) {
      // 1. Money must have gone to OUR account.
      const destinations = provider === "telebirr" ? [TELEBIRR_PHONE] : [CBE_ACCOUNT]
      if (receipt.recipient_account && !accountMatches(receipt.recipient_account, destinations)) {
        throw new Error(`This transfer was not sent to our ${provider === "telebirr" ? "telebirr number" : "CBE account"}. Only payments to the account shown in Payment Details are accepted.`)
      }
      if (receipt.recipient_name && !receipt.recipient_name.includes(ACCOUNT_NAME.toLowerCase())) {
        throw new Error("The recipient name in this SMS does not match our account. Only payments to the account shown in Payment Details are accepted.")
      }
      // 2. The receipt amount is authoritative and must match what was entered.
      if (Math.abs(receipt.amount - data.amount) > 0.009) {
        throw new Error(`The SMS shows ${receipt.amount.toFixed(2)} ETB but you entered ${data.amount.toFixed(2)} ETB. Enter the exact amount you transferred.`)
      }
    }

    // 3. Minimum / maximum apply to the amount actually sent.
    if (amount < limits.min) throw new Error(`Minimum deposit is ${limits.min} ETB.`)
    if (amount > limits.max) throw new Error(`Maximum deposit is ${limits.max} ETB.`)

    // 4. Anti-replay: hash the raw receipt text too, so the same SMS can never be
    //    deposited twice even if the extracted reference format drifts.
    const normalizedProof = (data.proof_text ?? "").trim().toLowerCase().replace(/\s+/g, " ")
    let proofHashValue: string | null = null
    if (normalizedProof) {
      const { createHash } = await import("crypto")
      proofHashValue = createHash("sha256").update(normalizedProof).digest("hex")
    }
    if (reference) {
      const { data: dup } = await supabaseAdmin.from("transactions").select("id").eq("reference", reference).limit(1)
      if (dup && dup.length > 0) throw new Error("This receipt has already been used. Each receipt can only be deposited once.")
    }
    if (proofHashValue) {
      const { data: dupHash } = await supabaseAdmin.from("transactions").select("id").eq("proof_hash", proofHashValue).limit(1)
      if (dupHash && dupHash.length > 0) throw new Error("This receipt has already been used. Each receipt can only be deposited once.")
    }

    // Queue a deposit for admin review. Used directly in manual mode, and as the
    // fallback whenever automatic verification cannot confirm the payment.
    const submitForReview = async (note?: string) => {
      const { data: tx, error } = await supabaseAdmin.from("transactions").insert({
        telegram_id: data.telegram_id,
        type: "deposit",
        amount,
        status: "pending",
        provider,
        phone_number: data.phone_number ?? null,
        proof_text: data.proof_text ?? null,
        proof_hash: proofHashValue,
        reference,
        admin_note: note ? note.slice(0, 500) : null,
      }).select().single()
      if (error) {
        if (/duplicate key|unique constraint/i.test(error.message || "")) {
          throw new Error("This receipt has already been used. Each receipt can only be deposited once.")
        }
        console.error("deposit insert failed:", error.message)
        throw new Error("Could not submit your deposit right now. Please try again in a moment.")
      }
      return {
        ...(tx as any),
        verified: false,
        pending: true,
        message: "Deposit submitted. It will be reviewed and credited shortly.",
      }
    }

    // A valid confirmation SMS is required — no deposit reaches the admin without one.
    if (!receipt) {
      throw new Error("Paste the full telebirr or CBE confirmation SMS for this deposit.")
    }

    // Record why a deposit couldn't be auto-verified so the admin can monitor it.
    const noteAutoFallback = async (reason: string) => {
      try {
        await supabaseAdmin.from("error_logs").insert({
          telegram_id: data.telegram_id,
          level: "warning",
          source: "deposit.auto",
          message: reason.slice(0, 1000),
          detail: (data.proof_text ?? "").slice(0, 2000) || null,
          path: "/wallet",
        })
      } catch { /* logging must never break the deposit */ }
    }

    // ───── Manual review mode ─────
    if (!DEPOSIT_AUTO_VERIFY) return submitForReview()

    // ───── Auto-verify path (DEPOSIT_AUTO_VERIFY=true) ─────
    if (!limits.enabled) {
      await noteAutoFallback("Auto-verify not configured (VERITAS_ENABLED / VERITAS_API_KEY missing)")
      return submitForReview("Auto-verify not configured")
    }

    const v = await veritasVerify(receipt.reference, provider)

    // Transient service problems → queue for manual review (the payment is real).
    if (!v.approved && /unreachable|bad response|abort|timeout|fetch/i.test(v.error)) {
      await noteAutoFallback(`Auto-verify unavailable: ${v.error}`)
      return submitForReview(`Auto-verify unavailable: ${v.error}`)
    }

    const check = veritasCheck(v, provider)
    if (!check.ok || !check.amount) {
      // Definitive verification failure (not found / wrong account / bad amount).
      await noteAutoFallback(`Auto-verify rejected: ${check.reason}`)
      throw new Error(`We could not verify this receipt (${check.reason}). Deposit rejected.`)
    }

    // The verified amount is authoritative — it must match the receipt/entered
    // amount. This is what stops a doctored SMS (e.g. 100 -> 1000).
    if (Math.abs(check.amount - amount) > 1) {
      await noteAutoFallback(`Auto-verify amount mismatch (verified ${check.amount} vs ${amount})`)
      throw new Error(`Verification shows ${check.amount.toFixed(2)} ETB but this receipt says ${amount.toFixed(2)} ETB. Deposit rejected.`)
    }

    // Verified — record + credit atomically.
    const note = `Auto-verified by Veritas (${provider}) · ${check.amount.toFixed(2)} ETB`
    const { data: tx, error } = await supabaseAdmin.from("transactions").insert({
      telegram_id: data.telegram_id,
      type: "deposit",
      amount,
      status: "pending",
      provider,
      phone_number: data.phone_number ?? null,
      proof_text: data.proof_text,
      proof_hash: proofHashValue,
      reference,
    }).select().single()
    if (error) {
      if (/duplicate key|unique constraint/i.test(error.message || "")) {
        throw new Error("This receipt has already been used. Each receipt can only be deposited once.")
      }
      console.error("deposit insert failed:", error.message)
      throw new Error("Could not process your deposit right now. Please try again in a moment.")
    }
    const { data: approved, error: pErr } = await supabaseAdmin.rpc("process_transaction", {
      _tx_id: tx.id, _new_status: "approved", _admin_note: note,
    })
    if (pErr || !approved) {
      // Auto-credit failed — leave it pending for an admin rather than rejecting.
      console.error("deposit auto-credit failed:", pErr?.message)
      await supabaseAdmin.from("transactions")
        .update({ status: "pending", admin_note: `Auto-credit failed: ${pErr?.message ?? "unknown"}`.slice(0, 500) })
        .eq("id", tx.id)
      return { ...(tx as any), verified: false, pending: true, message: "Deposit submitted. It will be reviewed and credited shortly." }
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
    const { data: player } = await supabaseAdmin.from("players").select("balance, bonus_balance, banned").eq("telegram_id", data.telegram_id).maybeSingle()
    if (!player) throw new Error("We couldn't find your wallet. Please reopen the app and try again.")
    if (player.banned) throw new Error("Your account is suspended. Contact support.")
    // Bonus balance is for playing only: withdrawals may only cover funds the
    // player deposited or won (real money), never the bonus portion.
    const withdrawable = Math.max(0, Number(player.balance) - Number(player.bonus_balance ?? 0))
    if (withdrawable < data.amount) {
      throw new Error(`Bonus balance can only be used to play, not withdrawn. You can withdraw ${withdrawable.toFixed(2)} ETB.`)
    }
    // One withdrawal at a time: no new request while one is awaiting review.
    {
      const { data: pending } = await supabaseAdmin
        .from("transactions")
        .select("id")
        .eq("telegram_id", data.telegram_id)
        .eq("type", "withdrawal")
        .eq("status", "pending")
        .limit(1)
      if (pending && pending.length > 0) {
        throw new Error("You already have a withdrawal awaiting review. Please wait until it is processed before submitting another.")
      }
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

/** Active promo codes surfaced in the Wallet (social/offers). */
export const getActiveOffers = createServerFn({ method: "POST" })
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server")
    const now = new Date().toISOString()
    const { data: rows, error } = await supabaseAdmin
      .from("promo_codes")
      .select("code, type, amount, max_redemptions, redemptions_count, expires_at")
      .eq("active", true)
      .or(`expires_at.is.null,expires_at.gte.${now}`)
      .order("created_at", { ascending: false })
      .limit(20)
    if (error) throw new Error(error.message)
    return (rows ?? []).map(r => ({
      code: r.code,
      type: r.type,
      amount: Number(r.amount),
      remaining: r.max_redemptions != null ? Math.max(0, r.max_redemptions - (r.redemptions_count ?? 0)) : null,
      expires_at: r.expires_at,
    }))
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
