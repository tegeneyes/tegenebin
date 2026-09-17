// Veritas receipt verification — SERVER ONLY.
// The API key is read from process.env inside these functions and is never
// exposed to the client, never placed in a URL/query string.
//
// Endpoints (per provider):
//   POST /verify-telebirr  { reference }
//   POST /verify-cbe       { reference, accountSuffix }   (accountSuffix = last 8 digits of OUR CBE account)

export type Provider = "telebirr" | "cbe"

export type VeritasResult = {
  approved: boolean
  amount: number | null
  data: Record<string, any>
  error: string
}

function cfg() {
  const destAccount = process.env["VERITAS_DEST_ACCOUNT"] ?? "0907633801|1000604178669"
  const accounts = destAccount.split("|").map(s => s.trim().replace(/\D+/g, "")).filter(Boolean)
  const cbeAccount = accounts.find(a => a.length >= 13) ?? ""
  return {
    enabled: (process.env["VERITAS_ENABLED"] ?? "true") !== "false",
    base: (process.env["VERITAS_BASE"] || "https://verifyapi.leulzenebe.pro").replace(/\/+$/, ""),
    key: process.env["VERITAS_API_KEY"] || "",
    authHeader: process.env["VERITAS_AUTH_HEADER"] || "x-api-key",
    authPrefix: process.env["VERITAS_AUTH_PREFIX"] || "",
    destName: process.env["VERITAS_DEST_NAME"] ?? "Tegene",
    accounts,
    cbeSuffix: process.env["VERITAS_CBE_SUFFIX"] || cbeAccount.slice(-8),
    minDeposit: Number(process.env["MIN_DEPOSIT"] ?? 50),
    maxDeposit: Number(process.env["MAX_DEPOSIT"] ?? 100000),
  }
}

export function veritasLimits() {
  const c = cfg()
  return { min: c.minDeposit, max: c.maxDeposit, enabled: c.enabled && !!c.key }
}

export const REFERENCE_RE = /^[A-Za-z0-9]{6,40}$/

function parseBirr(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return Math.round(v * 100) / 100
  if (typeof v === "string") {
    if (v.trim().toUpperCase() === "N/A") return null
    const m = v.replace(/,/g, "").match(/(\d+(?:\.\d+)?)/)
    if (m) return Math.round(parseFloat(m[1]!) * 100) / 100
  }
  return null
}

// telebirr: prefer settledAmount (net, after fees), then totalPaidAmount. CBE: flat `amount`.
const EXTRA_AMOUNT_KEYS = ["verifiedAmount", "receiverAmount", "netAmount", "paidAmount"]
const AMOUNT_KEYS: Record<Provider, string[]> = {
  telebirr: ["settledAmount", "totalPaidAmount", "amount", "transactionAmount", ...EXTRA_AMOUNT_KEYS],
  cbe: ["amount", "Amount", "transactionAmount", "totalAmount", ...EXTRA_AMOUNT_KEYS],
}

function layers(res: Record<string, any>) {
  return [res, res?.["data"], res?.["data"]?.["data"]].filter(c => c && typeof c === "object") as Record<string, any>[]
}

export function veritasAmount(res: Record<string, any>, provider: Provider): number | null {
  for (const c of layers(res)) {
    for (const k of AMOUNT_KEYS[provider]) {
      if (k in c) {
        const f = parseBirr(c[k])
        if (f !== null) return f
      }
    }
  }
  return null
}

function field(res: Record<string, any>, keys: string[]): string {
  for (const c of layers(res)) {
    for (const k of keys) {
      const v = c[k]
      if (typeof v === "string" && v.trim() !== "") return v.trim()
    }
  }
  return ""
}

const EXTRA_ACCOUNT_KEYS = ["receivingAccount", "accountNo", "accountNumber", "destinationAccount"]
const ACCOUNT_KEYS: Record<Provider, string[]> = {
  telebirr: ["creditedPartyAccountNo", "receiverAccount", "receiverPhone", "creditedAccountNo", ...EXTRA_ACCOUNT_KEYS],
  cbe: ["receiverAccount", "receiverAccountNo", "creditedAccount", "beneficiaryAccount", "toAccount", ...EXTRA_ACCOUNT_KEYS],
}
const EXTRA_NAME_KEYS = ["destinationName", "accountName"]
const NAME_KEYS: Record<Provider, string[]> = {
  telebirr: ["creditedPartyName", "receiverName", "creditedTo", ...EXTRA_NAME_KEYS],
  cbe: ["receiverName", "receiver", "beneficiaryName", "creditedTo", ...EXTRA_NAME_KEYS],
}

export function veritasDestMatches(res: Record<string, any>, provider: Provider): { ok: boolean; reason: string } {
  const c = cfg()
  const acct = field(res, ACCOUNT_KEYS[provider])
  const name = field(res, NAME_KEYS[provider])

  if (c.destName && name && !name.toLowerCase().includes(c.destName.toLowerCase())) {
    return { ok: false, reason: `different account holder (${name})` }
  }
  if (!acct) {
    // No account exposed — accept only when the receiver name matched.
    return name ? { ok: true, reason: "" } : { ok: false, reason: "receiver not present on receipt" }
  }
  const masked = acct.includes("*")
  const digits = acct.replace(/[^0-9*]+/g, "")
  for (const want of c.accounts) {
    if (masked) {
      const [head = "", tail = ""] = digits.split(/\*+/)
      if ((head || tail) && want.startsWith(head) && want.endsWith(tail)) return { ok: true, reason: "" }
    } else {
      const full = digits.replace(/\D+/g, "")
      if (full === want || (full.length >= 4 && want.endsWith(full))) return { ok: true, reason: "" }
    }
  }
  return { ok: false, reason: `different account (${acct})` }
}

export async function veritasVerify(reference: string, provider: Provider, accountSuffix = ""): Promise<VeritasResult> {
  const c = cfg()
  if (!c.enabled || !c.base || !c.key || !reference) {
    return { approved: false, amount: null, data: {}, error: "Veritas not configured" }
  }
  const endpoint = provider === "cbe" ? "verify-cbe" : "verify-telebirr"
  const payload: Record<string, string> = { reference }
  if (provider === "cbe") payload["accountSuffix"] = accountSuffix || c.cbeSuffix

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 12000)
  try {
    const resp = await fetch(`${c.base}/${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        [c.authHeader]: `${c.authPrefix}${c.key}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
    const raw = await resp.text()
    let res: unknown
    try { res = JSON.parse(raw) } catch { return { approved: false, amount: null, data: {}, error: "bad response" } }
    if (!res || typeof res !== "object") return { approved: false, amount: null, data: {}, error: "bad response" }
    const obj = res as Record<string, any>
    // HTTP 200 does not mean verified — always read the JSON success flag.
    const success = obj["success"] === true || obj["success"] === "true"
    const msg = typeof obj["message"] === "string" ? obj["message"] : typeof obj["error"] === "string" ? obj["error"] : ""
    if (!success) {
      return { approved: false, amount: veritasAmount(obj, provider), data: obj, error: msg || (resp.ok ? "not verified" : `HTTP ${resp.status}`) }
    }
    return { approved: true, amount: veritasAmount(obj, provider), data: obj, error: "" }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unreachable"
    return { approved: false, amount: null, data: {}, error: `unreachable: ${msg}` }
  } finally {
    clearTimeout(timer)
  }
}

/** Decide whether a verification result may auto-credit, and for how much. */
export function veritasCheck(v: VeritasResult, provider: Provider): { ok: boolean; reason: string; amount: number | null } {
  if (!v.approved) return { ok: false, reason: v.error || "not verified", amount: v.amount }
  const amt = v.amount
  if (amt === null || amt <= 0) return { ok: false, reason: "amount not found on receipt", amount: null }
  const dest = veritasDestMatches(v.data, provider)
  if (!dest.ok) return { ok: false, reason: dest.reason, amount: amt }
  const { minDeposit: min, maxDeposit: max } = cfg()
  if (amt < min) return { ok: false, reason: `verified amount ${amt} is below the ${min} ETB minimum`, amount: amt }
  if (amt > max) return { ok: false, reason: `verified amount ${amt} exceeds the maximum`, amount: amt }
  return { ok: true, reason: "Verified", amount: amt }
}
