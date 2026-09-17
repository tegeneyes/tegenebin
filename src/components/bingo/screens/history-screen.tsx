"use client"

import { useEffect, useState } from "react"
import { Gamepad2 } from "lucide-react"
import { useServerFn } from "@tanstack/react-start"
import { cn } from "@/lib/utils"
import { ScreenWrapper } from "@/components/bingo/screen-wrapper"
import { getGameHistory } from "@/lib/game.functions"
import { useTelegramUser } from "@/hooks/use-telegram-user"
import { useI18n } from "@/lib/i18n"

type Row = {
  id: string
  game_id: string
  cartela_id: number
  stake: number
  is_winner: boolean
  payout: number
  created_at: string
  games?: { short_code?: string | null } | null
}

export function HistoryScreen() {
  const tg = useTelegramUser()
  const { t } = useI18n()
  const fetchHistory = useServerFn(getGameHistory)
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!tg) { setLoading(false); return }
    setLoading(true)
    fetchHistory({ data: { telegram_id: tg.id } })
      .then((r) => setRows(r as unknown as Row[]))
      .catch((e) => console.error(e))
      .finally(() => setLoading(false))
  }, [tg?.id, fetchHistory])

  const totalPlayed = rows.length
  const totalWins = rows.filter(r => r.is_winner).length

  return (
    <ScreenWrapper screenKey="history">
      <h2 className="text-xl font-display font-bold mb-6">{t("history.title")}</h2>

      <div className="grid grid-cols-2 gap-4 mb-8">
        <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
          <p className="text-[10px] font-bold text-gray-500 uppercase mb-1">{t("history.total_played")}</p>
          <p className="text-2xl font-mono font-bold">{totalPlayed}</p>
        </div>
        <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
          <p className="text-[10px] font-bold text-gray-500 uppercase mb-1">{t("history.total_wins")}</p>
          <p className="text-2xl font-mono font-bold text-bingo-green">{totalWins}</p>
        </div>
      </div>

      <p className="text-[10px] font-bold text-gray-500 uppercase mb-4 tracking-widest">{t("history.recent")}</p>
      {loading ? (
        <div className="text-center py-12 text-white/40 text-sm">{t("history.loading")}</div>
      ) : rows.length === 0 ? (
        <div className="text-center py-12 text-white/40 text-sm">{t("history.empty")}</div>
      ) : (
        <div className="flex flex-col gap-3">
          {rows.map((g) => (
            <div key={g.id} className="bg-white/5 rounded-2xl p-4 border border-white/5">
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-bingo-accent/20 flex items-center justify-center text-bingo-accent">
                    <Gamepad2 size={20} />
                  </div>
                  <div>
                    <p className="font-bold text-sm">{g.games?.short_code ?? `${t("history.cartela")} #${g.cartela_id}`}</p>
                    <p className="text-[10px] text-gray-500">{new Date(g.created_at).toLocaleString()}</p>
                  </div>
                </div>
                <span
                  className={cn(
                    "px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-tighter",
                    g.is_winner ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400",
                  )}
                >
                  {g.is_winner ? t("history.win") : t("history.loss")}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="flex flex-col">
                  <span className="text-[8px] font-bold text-gray-500 uppercase">{t("history.stake")}</span>
                  <span className="text-[10px] font-bold text-gray-200">{g.stake} ETB</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[8px] font-bold text-gray-500 uppercase">{t("history.payout")}</span>
                  <span className="text-[10px] font-bold text-gray-200">{g.payout} ETB</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[8px] font-bold text-gray-500 uppercase">{t("history.cartela")}</span>
                  <span className="text-[10px] font-bold text-gray-200">#{g.cartela_id}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </ScreenWrapper>
  )
}
