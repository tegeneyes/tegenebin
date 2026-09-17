// Strict SMS parsers for Ethiopian payment providers (telebirr EN/AM, CBE).
// A deposit is accepted ONLY when the SMS matches one of these exact formats.
// No fuzzy fallbacks — anything that doesn't match is rejected outright.

export type ParsedSms = {
  provider: "telebirr" | "cbe" | null
  amount: number | null
  reference: string | null
  /** Recipient name as printed in the SMS (lower-cased, trimmed) */
  recipient_name: string | null
  /** Recipient account/phone as printed (may be masked, e.g. 0949****09 or 1****8669).
   *  null when the SMS only shows the SENDER's account (newer CBE format). */
  recipient_account: string | null
  /** CBE only: 8-digit account suffix embedded in the receipt link (needed by the verify API) */
  account_suffix: string | null
  matched: boolean
  reason: string
}

const NONE = (reason: string): ParsedSms => ({
  provider: null, amount: null, reference: null, recipient_name: null, recipient_account: null, account_suffix: null, matched: false, reason,
})

// ───────── telebirr ─────────
// EN: "Dear X You have transferred ETB 100.00 to betelehim haile (0949****09) on 06/05/2026 ...
//      Your transaction number is DE67LY0HPP. ... receipt/DE67LY0HPP"
// (telebirr itself misspells "transfered" in some messages — accept both)
const TELEBIRR_EN_RE =
  /you have (?:transferred|transfered|sent|paid)\s+ETB\s*([\d,]+(?:\.\d{1,2})?)\s+to\s+(.+?)\s*\(\s*([0-9*+]{6,20})\s*\)/i
const TELEBIRR_EN_REF_RE = /transaction number is\s*([A-Z0-9]{8,14})\b/i

// AM: "ውድ X ወደ betelehim haile(2519****1009) 100.00 ብር በ 12/05/2026 21:36:11 ልከዋል።
//      የሂሳብ እንቅስቃሴ ቁጥርዎ DEC7UM930N ነዉ። ... receipt/DEC7UM930N"
const TELEBIRR_AM_RE =
  /ወደ\s*(.+?)\s*\(\s*([0-9*+]{6,20})\s*\)\s*([\d,]+(?:\.\d{1,2})?)\s*ብር/
const TELEBIRR_AM_REF_RE = /ቁጥር\p{L}*\s+([A-Z0-9]{8,14})\b/u

const TELEBIRR_LINK_RE = /receipt\/([A-Z0-9]{8,14})/i

// ───────── CBE ─────────
// Old: "you have transferred ETB 100.00 to NAME account 1****8669 ... Ref No FT26123ABC12"
const CBE_OUT_ACCOUNT_RE =
  /transferred\s+ETB\s*([\d,]+(?:\.\d{1,2})?)\s+to\s+(.+?)\s+(?:account|acc(?:ount)?\.?\s*no\.?)\s*([0-9*]{6,20})/i
// New: "You have transfered ETB 100.00 to Tegene Wondimu on 11/05/2026 at 22:30:01
//       from your account 1*********0495. ... https://apps.cbe.com.et:100/?id=FT26132T5GJ552530495"
// (the account shown is the SENDER's own account — recipient account stays null)
const CBE_OUT_NAME_RE =
  /transfer(?:red|ed)\s+ETB\s*([\d,]+(?:\.\d{1,2})?)\s+to\s+(.+?)\s+on\s+\d{1,2}\/\d{1,2}\/\d{2,4}/i
// Incoming: "your Account 1****1234 has been credited with ETB 100.00 ..."
const CBE_IN_RE =
  /account\s*([0-9*]{6,20})\s+has been credited with\s+ETB\s*([\d,]+(?:\.\d{1,2})?)/i
const CBE_REF_TEXT_RE = /(?:ref(?:erence)?\s*(?:no\.?|number|:)?)\s*([A-Z0-9]{8,20})\b/i
const CBE_REF_URL_RE = /[?&]id=([A-Z0-9]{10,25})\b/i
// Mobile receipt: https://Mbreciept.cbe.com.et/FT26093S5WQ7-77824152
const CBE_MB_URL_RE = /cbe\.com\.et\/(FT[A-Z0-9]{8,20})(?:-(\d{4,10}))?/i
const CBE_REF_FT_RE = /\b(FT[A-Z0-9]{10,20})\b/

/** CBE references are "FT" + 10 chars; receipt links append the 8-digit account suffix. */
function splitCbeRef(raw: string): { reference: string; suffix: string | null } {
  const up = raw.toUpperCase()
  const m = up.match(/^(FT[A-Z0-9]{10})(\d{8})$/)
  if (m) return { reference: m[1]!, suffix: m[2]! }
  return { reference: up, suffix: null }
}

function cbeRef(cleaned: string): { reference: string; suffix: string | null } | null {
  const mb = cleaned.match(CBE_MB_URL_RE)
  if (mb) return { reference: mb[1]!.toUpperCase(), suffix: mb[2] ?? null }
  const url = cleaned.match(CBE_REF_URL_RE)
  if (url) return splitCbeRef(url[1]!)
  const txt = cleaned.match(CBE_REF_TEXT_RE) ?? cleaned.match(CBE_REF_FT_RE)
  if (txt) return splitCbeRef(txt[1]!)
  return null
}

function num(s: string): number {
  return Math.round(parseFloat(s.replace(/,/g, "")) * 100) / 100
}

function pickRef(cleaned: string, ...patterns: RegExp[]): string | null {
  for (const re of patterns) {
    const m = cleaned.match(re)
    if (m) return m[1]!.toUpperCase()
  }
  return null
}

export function parseSms(text: string): ParsedSms {
  if (!text) return NONE("empty")
  const cleaned = text.replace(/\s+/g, " ").trim()

  if (/telebirr|ethio ?telecom|transactioninfo\.ethiotelecom\.et|ቴሌብር|ኢትዮ\s?ቴሌኮም/i.test(cleaned)) {
    const linkRef = cleaned.match(TELEBIRR_LINK_RE)?.[1]?.toUpperCase() ?? null

    // English wording
    let m = cleaned.match(TELEBIRR_EN_RE)
    if (m) {
      const ref = pickRef(cleaned, TELEBIRR_EN_REF_RE) ?? linkRef
      if (!ref) return NONE("telebirr reference not found")
      if (linkRef && linkRef !== ref) return NONE("reference mismatch between text and receipt link")
      return {
        provider: "telebirr", amount: num(m[1]!), reference: ref,
        recipient_name: m[2]!.trim().toLowerCase(), recipient_account: m[3]!, account_suffix: null,
        matched: true, reason: "",
      }
    }

    // Amharic wording
    m = cleaned.match(TELEBIRR_AM_RE)
    if (m) {
      const ref = pickRef(cleaned, TELEBIRR_AM_REF_RE) ?? linkRef
      if (!ref) return NONE("telebirr reference not found")
      if (linkRef && linkRef !== ref) return NONE("reference mismatch between text and receipt link")
      return {
        provider: "telebirr", amount: num(m[3]!), reference: ref,
        recipient_name: m[1]!.trim().toLowerCase(), recipient_account: m[2]!, account_suffix: null,
        matched: true, reason: "",
      }
    }
    return NONE("telebirr SMS format not recognised")
  }

  if (/\bCBE\b|commercial bank|cbe\.com\.et/i.test(cleaned)) {
    const r = cbeRef(cleaned)
    const ref = r?.reference ?? null
    const suffix = r?.suffix ?? null

    // Outgoing transfer, recipient account printed
    let m = cleaned.match(CBE_OUT_ACCOUNT_RE)
    if (m && ref) {
      return {
        provider: "cbe", amount: num(m[1]!), reference: ref,
        recipient_name: m[2]!.trim().toLowerCase(), recipient_account: m[3]!, account_suffix: suffix,
        matched: true, reason: "",
      }
    }
    // Outgoing transfer, only recipient name + date (account shown is the sender's)
    m = cleaned.match(CBE_OUT_NAME_RE)
    if (m && ref) {
      return {
        provider: "cbe", amount: num(m[1]!), reference: ref,
        recipient_name: m[2]!.trim().toLowerCase(), recipient_account: null, account_suffix: suffix,
        matched: true, reason: "",
      }
    }
    // Incoming credit
    m = cleaned.match(CBE_IN_RE)
    if (m && ref) {
      return {
        provider: "cbe", amount: num(m[2]!), reference: ref,
        recipient_name: null, recipient_account: m[1]!, account_suffix: suffix,
        matched: true, reason: "",
      }
    }
    return NONE("CBE SMS format not recognised")
  }

  return NONE("not a telebirr or CBE confirmation SMS")
}

/** Normalize an Ethiopian phone: 2519XXXXXXXX / +2519... -> 09XXXXXXXX */
function normalizeEtPhone(digits: string): string {
  if (/^251\d{9}$/.test(digits)) return "0" + digits.slice(3)
  return digits
}

/** Does a (possibly masked) account/phone from the SMS match one of our destination numbers? */
export function accountMatches(printed: string | null, destinations: string[]): boolean {
  if (!printed) return false
  const p = printed.trim()
  for (const d of destinations) {
    const want = d.replace(/\D+/g, "")
    if (!want) continue
    if (!p.includes("*")) {
      const got = normalizeEtPhone(p.replace(/\D+/g, ""))
      if (got === want || got === normalizeEtPhone(want)) return true
      continue
    }
    const [rawHead = "", tail = ""] = p.split(/\*+/)
    if (rawHead.length + tail.length === 0) continue
    // A masked 2519****3801 must match 0907633801 too — compare both prefixes.
    const heads = [rawHead]
    if (rawHead.startsWith("251") && rawHead.length >= 4) heads.push("0" + rawHead.slice(3))
    if (heads.some(h => want.startsWith(h)) && want.endsWith(tail)) return true
  }
  return false
}
