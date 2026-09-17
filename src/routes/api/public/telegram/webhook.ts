import { createFileRoute } from "@tanstack/react-router";
import { createHash, timingSafeEqual } from "crypto";

function deriveSecret(token: string) {
  return createHash("sha256").update(`telegram-webhook:${token}`).digest("base64url");
}

function safeEq(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

async function tg(method: string, body: unknown, token: string) {
  return fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const BOT_USERNAME = "liyubingobot";
const APP_URL = process.env.APP_URL || process.env.PUBLIC_APP_URL || "http://localhost:8080";
const HARDCODED_ADMIN_IDS = [723559736];

function helpText(isAm: boolean) {
  return isAm
    ? `🎰 <b>የልዩ ቢንጎ እርዳታ</b>\n\n` +
        `/start — የቢንጎ ሚኒ-መተግበሪያውን ይክፈቱ\n` +
        `/invite — የግብዣ ሊንክዎን ያግኙ (+10 ብር በጓደኛ)\n` +
        `/help — ይህን መልዕክት አሳይ`
    : `🎰 <b>Liyu Bingo Help</b>\n\n` +
        `/start — launch the bingo mini-app\n` +
        `/invite — get your invite link (+10 ETB per friend)\n` +
        `/help — show this message`;
}

function getAdminIds(): Set<number> {
  const raw = process.env.ADMIN_TELEGRAM_IDS || "";
  const ids = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map(Number)
    .filter((n) => Number.isFinite(n) && n > 0);
  return new Set<number>([...HARDCODED_ADMIN_IDS, ...ids]);
}

// Parse `---` separator: text/caption above, button pairs (title\nurl) below.
function parseMessageAndButtons(raw: string | null | undefined) {
  if (!raw) return { text: "", buttons: [] as { text: string; url: string }[] };
  const sepIdx = raw.split("\n").findIndex((l) => l.trim() === "---");
  if (sepIdx === -1) return { text: raw, buttons: [] };
  const lines = raw.split("\n");
  const text = lines.slice(0, sepIdx).join("\n").trim();
  const rest = lines
    .slice(sepIdx + 1)
    .map((l) => l.trim())
    .filter(Boolean);
  const buttons: { text: string; url: string }[] = [];
  for (let i = 0; i + 1 < rest.length; i += 2) {
    const title = rest[i];
    const url = rest[i + 1];
    if (/^https?:\/\//i.test(url) || url.startsWith("tg://")) buttons.push({ text: title, url });
  }
  return { text, buttons };
}

function buildReplyMarkup(buttons: { text: string; url: string }[]) {
  if (!buttons.length) return undefined;
  return { inline_keyboard: buttons.map((b) => [{ text: b.text, url: b.url }]) };
}

async function broadcastToAll(
  token: string,
  payload: { text: string; buttons: { text: string; url: string }[]; photoFileId?: string },
) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: players } = await supabaseAdmin.from("players").select("telegram_id");
  const reply_markup = buildReplyMarkup(payload.buttons);
  let sent = 0,
    failed = 0;
  for (const p of players ?? []) {
    try {
      const r = payload.photoFileId
        ? await tg(
            "sendPhoto",
            {
              chat_id: p.telegram_id,
              photo: payload.photoFileId,
              caption: payload.text || undefined,
              parse_mode: "HTML",
              reply_markup,
            },
            token,
          )
        : await tg(
            "sendMessage",
            {
              chat_id: p.telegram_id,
              text: payload.text,
              parse_mode: "HTML",
              disable_web_page_preview: false,
              reply_markup,
            },
            token,
          );
      if (r.ok) sent++;
      else failed++;
      await new Promise((res) => setTimeout(res, 40));
    } catch {
      failed++;
    }
  }
  return { total: (players ?? []).length, sent, failed };
}

export const Route = createFileRoute("/api/public/telegram/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = process.env.TELEGRAM_BOT_TOKEN;
        if (!token) return new Response("Bot not configured", { status: 500 });

        const expected = process.env.TELEGRAM_WEBHOOK_SECRET || deriveSecret(token);
        const got = request.headers.get("X-Telegram-Bot-Api-Secret-Token") ?? "";
        if (!safeEq(got, expected)) return new Response("Unauthorized", { status: 401 });

        const update = (await request.json().catch(() => null)) as any;
        const callback = update?.callback_query;
        const callbackData = callback?.data as string | undefined;
        const msg = update?.message ?? update?.edited_message ?? callback?.message;
        const chatId = msg?.chat?.id;
        const text = ((update?.message ?? update?.edited_message)?.text ?? "") as string;
        const caption = (msg?.caption ?? "") as string;
        const fromId = (callback?.from?.id ?? msg?.from?.id) as number | undefined;
        const contact = msg?.contact;

        if (!chatId) return Response.json({ ok: true });

        {
          const admins = getAdminIds();
          const isAdmin = !!fromId && admins.has(fromId);
          const firstName = callback?.from?.first_name ?? msg?.from?.first_name ?? "player";

          // Inline button clicks must be answered immediately so Telegram stops the loading spinner.
          if (callback?.id) {
            await tg("answerCallbackQuery", { callback_query_id: callback.id }, token);
            if (callbackData === "help") {
              await tg("sendMessage", { chat_id: chatId, text: helpText(true), parse_mode: "HTML" }, token);
            }
            return Response.json({ ok: true });
          }

          // Phone share
          if (contact?.phone_number && contact.user_id && fromId && contact.user_id === fromId) {
            try {
              const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
              const phone = contact.phone_number.startsWith("+") ? contact.phone_number : `+${contact.phone_number}`;
              const { data: existing } = await supabaseAdmin
                .from("players")
                .select("telegram_id")
                .eq("telegram_id", fromId)
                .maybeSingle();
              if (existing) {
                await supabaseAdmin.from("players").update({ phone_number: phone }).eq("telegram_id", fromId);
              } else {
                await supabaseAdmin.from("players").insert({
                  telegram_id: fromId,
                  first_name: msg?.from?.first_name ?? null,
                  username: msg?.from?.username ?? null,
                  phone_number: phone,
                });
              }
              await tg(
                "sendMessage",
                {
                  chat_id: chatId,
                  text: "✅ Thanks! Your phone number has been saved.",
                  reply_markup: { remove_keyboard: true },
                },
                token,
              );
            } catch (e) {
              console.error("save phone failed", e);
            }
            return Response.json({ ok: true });
          }

          // ───────── Admin commands ─────────
          if (isAdmin) {
            const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

            if (text === "/admin" || text === "/admin@" + BOT_USERNAME) {
              await tg(
                "sendMessage",
                {
                  chat_id: chatId,
                  text:
                    `🛠 <b>Admin Menu</b>\n\n` +
                    `/broadcast — send a message (text or photo) to ALL users, with optional inline buttons\n` +
                    `/bonus &lt;amount&gt; [note] — credit ETB to every user (e.g. <code>/bonus 10 Friday gift</code>)\n` +
                    `/cancel — exit the current operation\n\n` +
                    `<b>Broadcast format</b>: send any text or a photo with caption. To add buttons, append a line with <code>---</code>, then pairs of:\n` +
                    `<code>Button Title\nhttps://...</code>`,
                  parse_mode: "HTML",
                },
                token,
              );
              return Response.json({ ok: true });
            }

            if (text === "/cancel") {
              await supabaseAdmin.from("bot_admin_state").delete().eq("telegram_id", fromId!);
              await tg("sendMessage", { chat_id: chatId, text: "✖️ Operation cancelled." }, token);
              return Response.json({ ok: true });
            }

            if (text.startsWith("/broadcast")) {
              await supabaseAdmin
                .from("bot_admin_state")
                .upsert({ telegram_id: fromId!, mode: "broadcast", updated_at: new Date().toISOString() });
              await tg(
                "sendMessage",
                {
                  chat_id: chatId,
                  text:
                    `📣 <b>Broadcast mode</b>\n\nSend the next message — text, or a photo with caption — and I'll forward it to every user.\n\n` +
                    `Add inline buttons by appending:\n<code>---\nButton Title\nhttps://...</code>\n\n` +
                    `Send /cancel to abort.`,
                  parse_mode: "HTML",
                },
                token,
              );
              return Response.json({ ok: true });
            }

            if (text.startsWith("/bonus")) {
              const parts = text.trim().split(/\s+/).slice(1);
              const amount = Number(parts[0]);
              const note = parts.slice(1).join(" ") || null;
              if (!Number.isFinite(amount) || amount <= 0) {
                await tg(
                  "sendMessage",
                  { chat_id: chatId, text: "Usage: <code>/bonus 10 Friday gift</code>", parse_mode: "HTML" },
                  token,
                );
                return Response.json({ ok: true });
              }
              try {
                const { data: drop, error } = await supabaseAdmin.rpc("drop_bonus_to_all", {
                  _amount: amount,
                  _note: note ?? undefined,
                });
                if (error) throw new Error(error.message);
                const recipients = (drop as any)?.recipients ?? 0;
                await tg(
                  "sendMessage",
                  {
                    chat_id: chatId,
                    text: `🎁 Dropped <b>${amount} ETB</b> to <b>${recipients}</b> users.`,
                    parse_mode: "HTML",
                  },
                  token,
                );

                // Notify all
                const { data: players } = await supabaseAdmin.from("players").select("telegram_id");
                const notice = `🎁 <b>Gift from Liyu Bingo!</b>\n\nYou just received <b>${amount} ETB</b>${note ? `\n\n<i>${note}</i>` : ""}.\n\n🎮 Open the app and play!`;
                for (const p of players ?? []) {
                  try {
                    await tg("sendMessage", { chat_id: p.telegram_id, text: notice, parse_mode: "HTML" }, token);
                    await new Promise((r) => setTimeout(r, 40));
                  } catch {
                    /* ignore */
                  }
                }
              } catch (e) {
                await tg("sendMessage", { chat_id: chatId, text: `❌ ${(e as Error).message}` }, token);
              }
              return Response.json({ ok: true });
            }

            // If admin is in broadcast mode, treat next message as the broadcast payload
            const { data: state } = await supabaseAdmin
              .from("bot_admin_state")
              .select("mode")
              .eq("telegram_id", fromId!)
              .maybeSingle();
            if (state?.mode === "broadcast" && !text.startsWith("/")) {
              // Photo? Take highest-res file_id
              const photos = msg?.photo as Array<{ file_id: string }> | undefined;
              const photoFileId = photos && photos.length ? photos[photos.length - 1].file_id : undefined;
              const raw = photoFileId ? caption : text;
              const parsed = parseMessageAndButtons(raw);
              if (!parsed.text && !photoFileId) {
                await tg(
                  "sendMessage",
                  { chat_id: chatId, text: "Send text or a photo (with optional caption). /cancel to abort." },
                  token,
                );
                return Response.json({ ok: true });
              }
              await tg(
                "sendMessage",
                {
                  chat_id: chatId,
                  text: `📤 Sending… (${parsed.buttons.length} button${parsed.buttons.length === 1 ? "" : "s"})`,
                },
                token,
              );
              const result = await broadcastToAll(token, { text: parsed.text, buttons: parsed.buttons, photoFileId });
              await supabaseAdmin.from("bot_admin_state").delete().eq("telegram_id", fromId!);
              await tg(
                "sendMessage",
                {
                  chat_id: chatId,
                  text: `✅ Broadcast sent to <b>${result.sent}</b> / ${result.total} (failed: ${result.failed}).`,
                  parse_mode: "HTML",
                },
                token,
              );
              return Response.json({ ok: true });
            }
          }

          // ───────── Regular user commands ─────────
          const langCode = (msg?.from?.language_code ?? "").toLowerCase();
          // Always default bot messages to Amharic
          const isAm = true;

          if (text.startsWith("/start")) {
            const parts = text.trim().split(/\s+/);
            const payload = parts[1];
            const refId = payload && /^\d+$/.test(payload) ? Number(payload) : null;

            let isNewUser = false;
            let inviterId: number | null = null;
            if (fromId) {
              try {
                const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
                const { data: existing } = await supabaseAdmin
                  .from("players")
                  .select("telegram_id")
                  .eq("telegram_id", fromId)
                  .maybeSingle();
                if (!existing) {
                  isNewUser = true;
                  inviterId = refId && refId !== fromId ? refId : null;
                  await supabaseAdmin.from("players").insert({
                    telegram_id: fromId,
                    first_name: msg?.from?.first_name ?? null,
                    username: msg?.from?.username ?? null,
                    referred_by: inviterId,
                  });
                }
              } catch (e) {
                console.error("referral save failed", e);
              }
            }

            // Notify inviter + admins about a brand-new user
            if (isNewUser && fromId) {
              const uname = msg?.from?.username ? `@${msg.from.username}` : "";
              const displayName =
                `${msg?.from?.first_name ?? ""} ${msg?.from?.last_name ?? ""}`.trim() || uname || `#${fromId}`;
              // Inviter notification
              if (inviterId) {
                try {
                  await tg(
                    "sendMessage",
                    {
                      chat_id: inviterId,
                      text:
                        `🎉 <b>አዲስ ግብዣ!</b>\n\n` +
                        `<b>${displayName}</b> ${uname ? `(${uname}) ` : ""}በእርስዎ ሊንክ ልዩ ቢንጎን ተቀላቅሏል።\n\n` +
                        `💰 ለመጀመሪያ ጊዜ 50 ብር ወይም በላይ ሲያስገባ <b>10 ብር</b> ወደ ቦርሳዎ ይጨመራል።`,
                      parse_mode: "HTML",
                    },
                    token,
                  );
                } catch (e) {
                  console.error("inviter notify failed", e);
                }
              }
              // Admin notifications
              for (const adminId of admins) {
                try {
                  await tg(
                    "sendMessage",
                    {
                      chat_id: adminId,
                      text:
                        `👤 <b>New user joined</b>\n\n` +
                        `Name: <b>${displayName}</b>\n` +
                        `Username: ${uname || "—"}\n` +
                        `TG ID: <code>${fromId}</code>\n` +
                        `Lang: ${langCode || "—"}\n` +
                        `Referred by: ${inviterId ? `<code>${inviterId}</code>` : "—"}`,
                      parse_mode: "HTML",
                    },
                    token,
                  );
                } catch (e) {
                  console.error("admin notify failed", e);
                }
              }
            }

            const inviteLink = `https://t.me/${BOT_USERNAME}?start=${fromId ?? ""}`;
            const welcomeImage = `${APP_URL}/bot-welcome.jpg`;

            let caption: string;
            let playBtn: string;
            let inviteBtn: string;
            let helpBtn: string;
            let shareText: string;

            if (isAm) {
              shareText = encodeURIComponent(`🎉 ልዩ ቢንጎ ላይ አብረን እንጫወት እና እውነተኛ የብር ሽልማት እናሸንፍ! በዚህ ሊንክ ይጀምሩ:`);
              caption =
                `🎉 <b>እንኳን ወደ ልዩ ቢንጎ በሰላም መጡ፣ ${firstName}!</b>\n\n` +
                `🎰 በቴሌግራም ላይ እጅግ አስደሳቹ የቢንጎ ጨዋታ።\n\n` +
                (isNewUser ? `🎁 <b>10 ብር የእንኳን ደህና መጡ ቦነስ</b> ወደ ቦርሳዎ ገብቷል!\n\n` : "") +
                `✨ <b>ምን ማድረግ ይችላሉ:</b>\n` +
                `• 🎟️ በአንድ ዙር እስከ 3 ካርቴላ ይምረጡ\n` +
                `• 💰 እውነተኛ የብር ሽልማት ያሸንፉ\n` +
                `• 🏆 በደረጃ ሰንጠረዡ ላይ ይውጡ\n` +
                `• 🎁 የፕሮሞ ኮድ በመጠቀም ጉርሻ ያግኙ\n\n` +
                `👥 <b>ጓደኞችዎን ይጋብዙ፣ 10 ብር ያግኙ!</b>\n` +
                `ሊንክዎን ያጋሩ። ጓደኛዎ ሲቀላቀልና ለመጀመሪያ ጊዜ 50 ብር ወይም በላይ ሲያስገባ <b>10 ብር</b> ወደ ቦርሳዎ ይገባል።\n\n` +
                `🔗 <b>የግብዣ ሊንክዎ:</b>\n<code>${inviteLink}</code>\n\n` +
                `💳 በቴሌብር ወይም በCBE ያስገቡ — ወጪዎች በፍጥነት ይሰራሉ።\n\n` +
                `👇 <b>ቢንጎ ጀምር</b>ን ይንኩ!`;
              playBtn = "🎮 ቢንጎ ጀምር";
              inviteBtn = "👥 ጓደኞች ይጋብዙ (+10 ብር)";
              helpBtn = "ℹ️ እርዳታ";
            } else {
              shareText = encodeURIComponent(
                `🎉 Join me on Liyu Bingo and win real ETB prizes! Use my link to start playing:`,
              );
              caption =
                `🎉 <b>Welcome to Liyu Bingo, ${firstName}!</b>\n\n` +
                `🎰 The most exciting bingo experience on Telegram.\n\n` +
                (isNewUser ? `🎁 <b>10 ETB welcome bonus</b> has been credited to your wallet!\n\n` : "") +
                `✨ <b>What you can do:</b>\n` +
                `• 🎟️ Pick up to 3 cartelas per round\n` +
                `• 💰 Win real ETB prizes\n` +
                `• 🏆 Climb the leaderboard\n` +
                `• 🎁 Redeem promo codes for bonuses\n\n` +
                `👥 <b>Invite friends, earn 10 ETB each!</b>\n` +
                `Share your link below. When a friend joins and makes their first deposit of 50 ETB or more, you get <b>10 ETB</b> credited to your wallet.\n\n` +
                `🔗 <b>Your invite link:</b>\n<code>${inviteLink}</code>\n\n` +
                `💳 Deposit via TeleBirr or CBE — withdrawals processed quickly.\n\n` +
                `👇 Tap <b>Play Bingo</b> to get started!`;
              playBtn = "🎮 Play Bingo";
              inviteBtn = "👥 Invite friends (+10 ETB)";
              helpBtn = "ℹ️ Help";
            }

            const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(inviteLink)}&text=${shareText}`;
            const supportUrl = "t.me/liyubing0";
            const supportBtn = isAm ? "💬 የድጋፍ ቡድን ይቀላቀሉ" : "💬 Join Support Group";

            const welcomeResponse = await tg(
              "sendPhoto",
              {
                chat_id: chatId,
                photo: welcomeImage,
                caption,
                parse_mode: "HTML",
                reply_markup: {
                  inline_keyboard: [
                    [{ text: playBtn, web_app: { url: APP_URL } }],
                    [{ text: inviteBtn, url: shareUrl }],
                    [{ text: supportBtn, url: supportUrl }],
                  ],
                },
              },
              token,
            );
            if (!welcomeResponse.ok) {
              await tg(
                "sendMessage",
                {
                  chat_id: chatId,
                  text: caption,
                  parse_mode: "HTML",
                  reply_markup: {
                    inline_keyboard: [
                      [{ text: playBtn, web_app: { url: APP_URL } }],
                      [{ text: inviteBtn, url: shareUrl }],
                      [{ text: supportBtn, url: supportUrl }],
                    ],
                  },
                },
                token,
              );
            }
          } else if (text.startsWith("/invite")) {
            const inviteLink = `https://t.me/${BOT_USERNAME}?start=${fromId ?? ""}`;
            const shareText = encodeURIComponent(
              isAm
                ? `🎉 ልዩ ቢንጎ ላይ አብረን እንጫወት እና እውነተኛ የብር ሽልማት እናሸንፍ!`
                : `🎉 Join me on Liyu Bingo and win real ETB prizes!`,
            );
            const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(inviteLink)}&text=${shareText}`;
            await tg(
              "sendMessage",
              {
                chat_id: chatId,
                text: isAm
                  ? `👥 <b>ጓደኞችን ይጋብዙ እና 10 ብር ያግኙ</b>\n\n` +
                    `ሊንክዎን ያጋሩ። ጓደኛዎ ሲቀላቀልና ለመጀመሪያ ጊዜ 50 ብር ወይም በላይ ሲያስገባ <b>10 ብር</b> ያገኛሉ።\n\n` +
                    `🔗 <code>${inviteLink}</code>`
                  : `👥 <b>Invite friends & earn 10 ETB</b>\n\n` +
                    `Share your link. When a friend joins and deposits 50 ETB or more for the first time, you earn <b>10 ETB</b>.\n\n` +
                    `🔗 <code>${inviteLink}</code>`,
                parse_mode: "HTML",
                reply_markup: {
                  inline_keyboard: [[{ text: isAm ? "📤 ሊንኬን አጋራ" : "📤 Share my link", url: shareUrl }]],
                },
              },
              token,
            );
          } else if (text.startsWith("/help")) {
            await tg(
              "sendMessage",
              {
                chat_id: chatId,
                text: helpText(isAm),
                parse_mode: "HTML",
              },
              token,
            );
          }
        }

        return Response.json({ ok: true });
      },
    },
  },
});
