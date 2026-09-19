// Server-only helpers for proactive bot messages (win broadcasts, round
// reminders). Best-effort by design: a notification failure must never break
// the game flow.

export function botToken() {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN not configured")
  return token
}

export function appUrl() {
  return process.env.APP_URL || process.env.PUBLIC_APP_URL || "http://localhost:8080"
}

export async function botApi(method: string, body: unknown, token = botToken()) {
  const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  const json = (await r.json().catch(() => null)) as { ok?: boolean } | null
  return { ok: !!json?.ok, json }
}

export async function sendBotText(chatId: number | string, text: string, replyMarkup?: unknown) {
  try {
    await botApi("sendMessage", {
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: false,
      reply_markup: replyMarkup,
    })
  } catch {
    /* best-effort */
  }
}

export interface WinNotifData {
  winnerTg: number
  username?: string | null
  payout: number
  stake: number
  shortCode?: string | null
  playerCount: number
}

// Only "newsworthy" wins hit the public channel, so we never spam followers:
// big payouts (>500 ETB) or high-multiplier highlights (≥200 ETB won off a
// comparatively small bet, e.g. 200 ETB from a 10 ETB stake).
function isNoteworthy(payout: number, stake: number) {
  if (!Number.isFinite(payout) || payout <= 0) return false
  if (payout > 500) return true
  const multiplier = stake > 0 ? payout / stake : 0
  return payout >= 200 && multiplier >= 20
}

/** DM the winner and, if TELEGRAM_WINS_CHANNEL is set, post a public shout-out only for noteworthy wins. */
export async function notifyWin({ winnerTg, username, payout, stake, shortCode, playerCount }: WinNotifData) {
  if (!Number.isFinite(payout) || !winnerTg) return
  const roundTag = shortCode ? `#${shortCode}` : ""

  // The winner always gets the personal congratulations.
  const dm =
    `🏆 <b>እንኳን ደስ አለዎት!</b>\n\n` +
    `ዙሩን <b>አሸንፈዋል</b> ${roundTag}!\n` +
    `💰 <b>+${Math.round(payout)} ETB</b> ወደ ቦርሳዎ ተጨምሯል።\n\n` +
    `🎮 መጫወትዎን ይቀጥሉ — የሚቀጥለው ዙር በፍጥነት ይጀምራል!`
  await sendBotText(winnerTg, dm)

  const channel = process.env.TELEGRAM_WINS_CHANNEL
  if (!channel || !isNoteworthy(payout, stake)) return
  const displayName = username || `#${winnerTg}`
  const highlight = stake > 0 ? ` 🚀 በ<b>${Math.round(stake)} ETB</b> ተወራርዷል!` : ""
  const post =
    `🏆 <b>${displayName}</b> ብር <b>${Math.round(payout)}</b> አሸንፈዋል! 🎉${highlight}\n` +
    `${roundTag ? `ዙር ${roundTag} · ` : ""}${playerCount} ተጫዋቾች\n\n` +
    `👉 እርስዎም ይሞክሩ — በልዩ ቢንጎ እውነተኛ የብር ሽልማት ያሸንፉ!`
  await sendBotText(channel, post)
}