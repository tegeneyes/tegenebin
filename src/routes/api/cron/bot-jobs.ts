import { createFileRoute } from "@tanstack/react-router";
import { createHash, timingSafeEqual } from "crypto";

// Rounds are continuous on a shared wall-clock: 30s selection + 20 calls × 4s.
const SELECTION_MS = 30000;
const CALL_INTERVAL_MS = 4000;
const MAX_CALLS = 20;
const ROUND_MS = SELECTION_MS + MAX_CALLS * CALL_INTERVAL_MS; // 110000

const REMINDER_THROTTLE_MS = 45 * 60 * 1000; // max ~1 reminder per player / 45 min
const MAX_REMINDERS = 300; // per cron run

function deriveSecret(token: string) {
  return createHash("sha256").update(`telegram-webhook:${token}`).digest("base64url");
}

function safeEq(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export const Route = createFileRoute("/api/cron/bot-jobs")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = process.env.TELEGRAM_BOT_TOKEN;
        if (!token) return new Response("Bot not configured", { status: 500 });

        // Guard: if CRON_SECRET is set, require it. Otherwise allow any request
        // (safe — the route only does cleanup + best-effort bot messages).
        const cronSecret = process.env.CRON_SECRET;
        if (cronSecret) {
          const auth = request.headers.get("authorization") ?? "";
          const got = auth.startsWith("Bearer ") ? auth.slice(7) : request.headers.get("x-cron-secret") ?? "";
          if (!got || !safeEq(got, cronSecret)) return new Response("Unauthorized", { status: 401 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // 1. Clear stale cartela reservations (older than 2 rounds).
        try {
          await supabaseAdmin.rpc("cleanup_round_cartelas");
        } catch {
          /* best-effort */
        }

        // 2. Round-start reminder for warm players, throttled.
        let reminded = 0;
        try {
          const now = Date.now();
          const nextStart = (Math.floor(now / ROUND_MS) + 1) * ROUND_MS;
          const secToNext = Math.ceil((nextStart - now) / 1000);

          // Fire only near a round boundary so each round gets at most one reminder
          // window; the per-player throttle prevents spam.
          if (secToNext <= 50) {
            const { sendBotText, appUrl } = await import("@/lib/telegram-bot");
            const since = new Date(now - REMINDER_THROTTLE_MS).toISOString();
            const { data: warm } = await supabaseAdmin
              .from("players")
              .select("telegram_id")
              .or("balance.gt.0,bonus_balance.gt.0")
              .or(`last_bot_reminder_at.is.null,last_bot_reminder_at.lt.${since}`)
              .limit(MAX_REMINDERS);

            const playUrl = `${appUrl()}?v=c2c05db`;
            const text =
              `🎰 <b>አዲስ ዙር ሊጀምር ነው!</b>\n\n` +
              `⚡️ በልዩ ቢንጎ ይቀላቀሉ እና እውነተኛ የብር ሽልማት ያሸንፉ!\n\n` +
              `👇 ቢንጎ ጀምር ወደ ጨዋታው ይወስድዎታል`;
            const replyMarkup = {
              inline_keyboard: [[{ text: "🎮 ቢንጎ ጀምር", web_app: { url: playUrl } }]],
            };

            for (const p of warm ?? []) {
              if (reminded >= MAX_REMINDERS) break;
              await sendBotText(p.telegram_id, text, replyMarkup);
              await supabaseAdmin
                .from("players")
                .update({ last_bot_reminder_at: new Date().toISOString() })
                .eq("telegram_id", p.telegram_id);
              reminded++;
              await new Promise(r => setTimeout(r, 40));
            }
          }
        } catch {
          /* best-effort */
        }

        return Response.json({ ok: true, reminded });
      },
    },
  },
});