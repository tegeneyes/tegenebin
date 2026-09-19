"use client"

import { Play, Eye, Megaphone, Users, Gift, Trophy } from "lucide-react"
import { useEffect, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { useServerFn } from "@tanstack/react-start"
import { ScreenWrapper } from "@/components/bingo/screen-wrapper"
import { getActiveAnnouncement } from "@/lib/admin-tools.functions"
import { getRecentWinners } from "@/lib/game.functions"
import { useTelegramUser } from "@/hooks/use-telegram-user"
import { useLobbyPresence } from "@/hooks/use-lobby-presence"
import { paddedCount } from "@/lib/bingo/fake-players"
import { cn } from "@/lib/utils"
import { useI18n } from "@/lib/i18n"

interface HomeScreenProps {
  onPlay: (stake: number) => void
  onWatch?: () => void
  walletBalance?: number
  bonusBalance?: number
}

const STAKES = [10, 20, 50, 100] as const

export function HomeScreen({ onPlay, onWatch, walletBalance = 0, bonusBalance = 0 }: HomeScreenProps) {
  const [selectedStake, setSelectedStake] = useState<number>(10)
  const [announcement, setAnnouncement] = useState<{ id: string; message: string } | null>(null)
  const [winners, setWinners] = useState<{ username: string; payout: number }[]>([])
  const fetchAnnouncement = useServerFn(getActiveAnnouncement)
  const fetchWinners = useServerFn(getRecentWinners)
  const tg = useTelegramUser()
  const { t } = useI18n()
  const livePlayers = useLobbyPresence({ telegramId: tg?.id, stake: 0, enabled: !!tg, username: tg?.username || tg?.first_name })
  // Stable per-minute baseline so the count "breathes" naturally
  const onlineSeed = `lobby:${Math.floor(Date.now() / 60000)}`
  const onlineNow = paddedCount(livePlayers, onlineSeed, 60, 200)

  useEffect(() => {
    let active = true
    const load = async () => {
      try {
        const a = await fetchAnnouncement()
        if (active) setAnnouncement(a as any)
      } catch { /* ignore */ }
      try {
        const w = await fetchWinners()
        if (active) setWinners((w as any) ?? [])
      } catch { /* ignore */ }
    }
    load()
    const t = setInterval(load, 30000)
    return () => { active = false; clearInterval(t) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])


  return (
    <ScreenWrapper screenKey="home">
      <div className="relative w-full flex flex-col items-center justify-start px-4 pt-2 pb-2">
        {/* Ambient glow */}
        <div className="pointer-events-none absolute -top-32 left-1/2 -translate-x-1/2 h-96 w-96 rounded-full blur-3xl opacity-50"
             style={{ background: "radial-gradient(circle, rgba(180,92,255,0.6), transparent 70%)" }} />

        {/* Hero */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="relative text-center mt-1 mb-3"
        >
          <h2 className="font-display text-[48px] leading-[0.9] tracking-wider mt-2 shimmer-gold">
            LIYU BINGO
          </h2>

          <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-bingo-green/15 border border-bingo-green/30 px-2.5 py-0.5 text-[10px] text-bingo-green font-bold">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full rounded-full bg-bingo-green opacity-75 animate-ping" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-bingo-green" />
            </span>
            <Users size={10} />
            {onlineNow} {t("home.online")}
          </div>
        </motion.div>

        {/* Announcement banner */}
        <AnimatePresence>
          {announcement && (
            <motion.div
              key={announcement.id}
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="relative w-full max-w-md mb-3 rounded-2xl border border-bingo-gold/40 bg-gradient-to-r from-bingo-gold/15 via-bingo-magenta/10 to-bingo-gold/15 overflow-hidden shadow-[0_0_24px_rgba(252,210,107,0.15)]"
            >
              <div className="flex items-center gap-2.5 px-3 py-2.5">
                <Megaphone size={16} className="text-bingo-gold-soft shrink-0" />
                <div className="relative flex-1 overflow-hidden">
                  <div className="marquee-track">
                    <span className="text-[12px] leading-snug text-white/90 pr-12">{announcement.message}</span>
                    <span className="text-[12px] leading-snug text-white/90 pr-12" aria-hidden="true">{announcement.message}</span>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Recent winners ticker — social proof */}
        {winners.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="relative w-full max-w-md mb-3 rounded-2xl border border-bingo-magenta/25 bg-gradient-to-r from-bingo-magenta/10 via-bingo-gold/5 to-bingo-magenta/10 overflow-hidden"
          >
            <div className="flex items-center gap-2.5 px-3 py-2">
              <Trophy size={15} className="text-bingo-gold-soft shrink-0" />
              <div className="relative flex-1 overflow-hidden">
                <div className="marquee-track">
                  <span className="text-[12px] leading-snug text-white/85 pr-12">
                    {winners.map(w => `🏆 ${w.username} +${Math.round(w.payout)} ETB`).join("   ·   ")}
                  </span>
                  <span className="text-[12px] leading-snug text-white/85 pr-12" aria-hidden="true">
                    {winners.map(w => `🏆 ${w.username} +${Math.round(w.payout)} ETB`).join("   ·   ")}
                  </span>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* Wallet ribbon */}

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.05 }}
          className="relative w-full max-w-md surface-panel shadow-panel-elev px-4 py-2 mb-3 flex items-center justify-between"
        >
          <div>
            <p className="text-[9px] uppercase tracking-[0.25em] text-white/50">{t("home.balance")}</p>
            <p className="digit text-2xl text-bingo-gold-soft leading-tight">
              {walletBalance} <span className="text-xs text-white/40 font-sans font-bold">ETB</span>
            </p>
          </div>
          <div className="text-right">
            <p className="text-[9px] uppercase tracking-[0.25em] text-white/50">{t("home.stake")}</p>
            <p className="digit text-2xl text-bingo-cyan leading-tight">
              {selectedStake} <span className="text-xs text-white/40 font-sans font-bold">ETB</span>
            </p>
          </div>
        </motion.div>

        {/* Bonus hint — nudges users to actually use their free credit */}
        {bonusBalance > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1 }}
            className="relative w-full max-w-md mb-3 -mt-1 rounded-xl border border-bingo-green/40 bg-bingo-green/10 px-3 py-2 flex items-center gap-2.5"
          >
            <Gift size={15} className="text-bingo-green shrink-0" />
            <p className="text-[12px] leading-snug text-white/90 font-semibold">
              {t("home.bonus_hint", { n: Math.round(bonusBalance) })}
            </p>
          </motion.div>
        )}

        {/* Stake card */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="relative w-full max-w-md surface-panel shadow-panel-elev p-4 flex flex-col gap-3"
        >
          {/* Corner ornaments */}
          <span className="pointer-events-none absolute top-3 left-3 h-2 w-2 rounded-full bg-bingo-gold/70" />
          <span className="pointer-events-none absolute top-3 right-3 h-2 w-2 rounded-full bg-bingo-magenta/70" />
          <span className="pointer-events-none absolute bottom-3 left-3 h-2 w-2 rounded-full bg-bingo-magenta/70" />
          <span className="pointer-events-none absolute bottom-3 right-3 h-2 w-2 rounded-full bg-bingo-gold/70" />

          <div className="flex flex-col items-center gap-1">
            <p className="text-bingo-gold-soft text-[10px] font-extrabold uppercase tracking-[0.35em]">{t("home.choose_stake")}</p>
            <div className="h-px w-16 bg-gradient-to-r from-transparent via-bingo-gold to-transparent" />
          </div>

          {/* Stake grid */}
          <div className="grid grid-cols-4 gap-2">
            {STAKES.map((s) => {
              const active = selectedStake === s
              return (
                <button
                  key={s}
                  onClick={() => setSelectedStake(s)}
                  className={cn(
                    "relative py-2.5 rounded-xl font-display text-lg tracking-wider transition-all",
                    active
                      ? "bg-gradient-gold text-[#1A0633] shadow-gold scale-[1.04]"
                      : "bg-white/[0.04] text-white/60 border border-white/10 hover:bg-white/[0.08]",
                  )}
                >
                  {s}
                </button>
              )
            })}
          </div>

          {/* Pot preview */}
          <div className="flex items-center justify-between bg-black/30 rounded-xl px-4 py-2.5 border border-white/5">
            <span className="text-[10px] uppercase tracking-[0.25em] text-white/50">{t("home.pot")}</span>
            <span className="digit text-lg text-bingo-gold-soft">
              ≈ {(selectedStake * 18).toLocaleString()} ETB
            </span>
          </div>

          {/* Play */}
          <button
            onClick={() => onPlay(selectedStake)}
            className="group relative w-full py-3 rounded-2xl flex items-center justify-center gap-3 font-display text-xl tracking-[0.2em] text-[#1A0633] bg-gradient-gold shadow-gold active:scale-[0.98] transition-all overflow-hidden"
          >
            <span className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/40 to-white/0 -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
            <Play size={22} fill="currentColor" />
            {t("home.play")} {selectedStake}
          </button>

          {/* Watch */}
          {onWatch && (
            <button
              onClick={onWatch}
              className="w-full py-3 rounded-2xl flex items-center justify-center gap-2 font-sans font-bold text-sm tracking-[0.2em] uppercase text-white/80 bg-white/[0.04] border border-white/10 hover:bg-white/[0.08] transition-colors"
            >
              <Eye size={16} />
              {t("home.watch")}
            </button>
          )}
        </motion.div>

        {/* Footer line */}
        <p className="text-[9px] uppercase tracking-[0.4em] text-white/30 mt-3">
          {t("home.footer")}
        </p>

      </div>
    </ScreenWrapper>
  )
}
