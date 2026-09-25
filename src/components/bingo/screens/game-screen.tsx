"use client"

import { motion } from "framer-motion"
import type { BingoCell, GameStats, Cartela } from "@/lib/bingo/types"
import { MasterBoard } from "@/components/bingo/game/master-board"
import { BallArea } from "@/components/bingo/game/ball-area"
import { SoundToggle } from "@/components/bingo/game/automatic-toggle"
import { CartelaCard, WatchingBanner } from "@/components/bingo/game/cartela-card"
import { cn } from "@/lib/utils"
import { useI18n } from "@/lib/i18n"

interface GameScreenProps {
  card: BingoCell[][]
  calledNumbers: number[]
  gameStats: GameStats
  automatic: boolean
  soundEnabled: boolean
  isWatching: boolean
  onToggleAutomatic: () => void
  onToggleSound: () => void
  onCellClick: (row: number, col: number, cartelaIndex?: number) => void
  onLeave: () => void
  onRefresh: () => void
  onNextNumber: () => void
  cartelas?: Cartela[]
  activeCartelaIndex?: number
  onSwitchCartela?: (index: number) => void
}

export function GameScreen({
  card,
  calledNumbers,
  gameStats,
  automatic,
  soundEnabled,
  isWatching,
  onToggleAutomatic,
  onToggleSound,
  onCellClick,
  onLeave,
  onRefresh,
  onNextNumber,
  cartelas = [],
  activeCartelaIndex = 0,
  onSwitchCartela,
}: GameScreenProps) {
  const { t } = useI18n()
  const stats = [
    { label: "Game ID", val: gameStats.gameId, highlight: true },
    { label: "Players", val: gameStats.players },
    { label: "Bet", val: gameStats.bet },
    { label: "Derash", val: gameStats.derash },
    { label: "Called", val: gameStats.calledCount },
  ]

  return (
    <motion.div
      key="game-active"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="flex-1 flex flex-col overflow-hidden"
    >
      {/* Top stats strip - cleaner, more breathing room */}
      <div className="grid grid-cols-5 px-3 pt-4 pb-3 gap-2 flex-shrink-0">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="flex flex-col items-center bg-gradient-to-b from-white/[0.03] to-white/[0.01] border border-white/5 rounded-xl py-2.5 px-1.5"
          >
            <span className="text-[7px] text-gray-400 uppercase font-bold tracking-widest">{stat.label}</span>
            <span className={`text-[12px] font-mono font-extrabold tabular-nums truncate max-w-full ${stat.highlight ? "text-bingo-gold" : "text-white"}`}>
              {stat.val}
            </span>
          </div>
        ))}
      </div>

      {/* Split view - more breathing room, clearer hierarchy */}
      <div className="flex-1 min-h-0 flex overflow-hidden px-3 gap-3">
        {/* Left: Master Board (called numbers grid) - player's selected numbers reference */}
        <div className="w-[140px] flex-shrink-0">
          <MasterBoard calledNumbers={calledNumbers} />
        </div>

        {/* Right: Main gameplay area - clear hierarchy */}
        <div className="flex-1 flex flex-col overflow-hidden bg-gradient-to-b from-white/[0.02] to-white/[0.01] border border-white/5 rounded-2xl">
          {/* Current number - MOST PROMINENT */}
          <div className="p-4 flex flex-col items-center gap-3 border-b border-white/5">
            <BallArea calledNumbers={calledNumbers} soundEnabled={soundEnabled} onToggleSound={onToggleSound} />

            <SoundToggle soundEnabled={soundEnabled} onToggle={onToggleSound} />
          </div>

          {/* Bingo card(s) - SECONDARY FOCUS */}
          <div className="flex-1 overflow-y-auto px-4 py-4">
            {isWatching ? (
              <WatchingBanner />
            ) : (
              <div className="flex flex-col gap-4">
                {cartelas.map((cartela, index) => (
                  <div key={cartela.id} className="flex flex-col">
                    {/* Cartela header */}
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-gray-400 text-[9px] font-bold uppercase tracking-widest">
                        {t("game.cartela", { n: index + 1, total: cartelas.length, id: cartela.id })}
                      </p>
                      {cartelas.length > 1 && (
                        <div className={cn(
                          "w-2 h-2 rounded-full",
                          index === activeCartelaIndex ? "bg-bingo-green" : "bg-white/20"
                        )} />
                      )}
                    </div>
                    
                    {/* Cartela Card - the focal point */}
                    <CartelaCard 
                      card={cartela.card} 
                      onCellClick={(r, c) => onCellClick(r, c, index)} 
                      cartelaNumber={cartela.id}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom status bar - compact wallet/balance + actions */}
      <div 
        className="px-3 py-3 border-t border-white/5 flex-shrink-0"
        style={{ paddingBottom: 'max(16px, calc(env(safe-area-inset-bottom) + 12px))' }}
      >
        <div className="flex items-center justify-between gap-3">
          {/* Compact wallet/balance - integrates 100 ETB naturally */}
          <div className="flex items-center gap-2 px-3 py-2 bg-white/[0.03] border border-white/5 rounded-xl flex-1 min-w-0">
            <span className="text-gray-400 text-[9px] uppercase font-bold tracking-wider">{t("game.wallet")}</span>
            <span className="text-white font-mono font-extrabold tabular-nums text-lg">
              {gameStats.balance ?? 0}
            </span>
            <span className="text-gray-400 text-xs font-bold">ETB</span>
          </div>

          {/* Actions - secondary */}
          <div className="flex gap-2">
            <button
              onClick={onLeave}
              className="bg-bingo-red/90 hover:bg-bingo-red text-white py-2.5 px-4 rounded-xl font-black text-[10px] tracking-wider shadow-[0_4px_12px_-4px_rgba(239,68,68,0.5)] active:scale-[0.97] transition-all"
            >
              {t("game.leave")}
            </button>
            <button
              onClick={onRefresh}
              className="bg-white/[0.04] hover:bg-white/[0.08] text-white py-2.5 px-4 rounded-xl font-black text-[10px] tracking-wider border border-white/10 active:scale-[0.97] transition-all"
            >
              {t("game.refresh")}
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  )
}