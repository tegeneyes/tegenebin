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
  shortCode?: string | null
  playerCount: number
}

/** DM the winner and, if TELEGRAM_WINS_CHANNEL is set, post a public shout-out. */
export async function notifyWin({ winnerTg, username, payout, shortCode, playerCount }: WinNotifData) {
  if (!Number.isFinite(payout) || !winnerTg) return
  const roundTag = shortCode ? `#${shortCode}` : ""

  const dm =
    `🏆 <b>እንኳን ደስ አለዎት!</b>\n\n` +
    `ዙሩን <b>አሸንፈዋል</b> ${roundTag}!\n` +
    `💰 <b>+${Math.round(payout)} ETB</b> ወደ ቦርሳዎ ተጨምሯል።\n\n` +
    `🎮 መጫወትዎን ይቀጥሉ — የሚቀጥለው ዙር በፍጥነት ይጀምራል!`
  await sendBotText(winnerTg, dm)

  const channel = process.env.TELEGRAM_WINS_CHANNEL
  if (!channel) return
  const displayName = username || `#${winnerTg}`
  const post =
    `🏆 <b>${displayName}</b> ብር <b>${Math.round(payout)}</b> አሸንፈዋል! 🎉\n` +
    `${roundTag ? `ዙር ${roundTag} · ` : ""}${playerCount} ተጫዋቾች\n\n` +
    `👉 እርስዎም ይሞክሩ — በልዩ ቢንጎ እውነተኛ የብር ሽልማት ያሸንፉ!`
  await sendBotText(channel, post)
}