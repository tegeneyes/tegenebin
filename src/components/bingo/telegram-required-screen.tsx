"use client"

import { motion } from "framer-motion"
import { Send, ShieldAlert } from "lucide-react"
import { isDevHost } from "@/hooks/use-telegram-user"
import { useI18n } from "@/lib/i18n"

const BOT_URL = "https://t.me/liyubingobot"

export function TelegramRequiredScreen({ reason }: { reason?: string | null }) {
  const { t, lang } = useI18n()

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex flex-col h-dvh w-full font-sans select-none max-w-[430px] mx-auto overflow-hidden relative items-center justify-center px-7 text-center"
      style={{ background: "#0E0820" }}
    >
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_20%,rgba(232,181,71,0.18),transparent_60%)] pointer-events-none" />

      <div className="relative z-10 flex flex-col items-center gap-5">
        <div className="w-20 h-20 rounded-full bg-white/5 border border-[#E8B547]/40 flex items-center justify-center">
          <ShieldAlert size={34} className="text-[#E8B547]" />
        </div>

        <h1 className="text-white text-2xl font-extrabold tracking-wide">{t("block.title")}</h1>
        <p className="text-[13px] text-white/60 leading-relaxed max-w-[300px]">{t("block.desc")}</p>

        <a
          href={BOT_URL}
          target="_blank"
          rel="noreferrer"
          className="mt-1 inline-flex items-center gap-2 px-6 py-4 rounded-2xl bg-gradient-to-r from-[#E8B547] to-[#c99a2e] text-[#0E0820] font-black uppercase tracking-widest text-xs"
        >
          <Send size={16} />
          {t("block.open")}
        </a>

        <p className="text-[10px] text-white/30 tracking-wide">{t("block.hint")}</p>
        {reason && !isDevHost() && (
          <p className="text-[10px] text-white/25 font-mono">{lang === "am" ? "ምክንያት" : "reason"}: {reason}</p>
        )}
      </div>
    </motion.div>
  )
}
