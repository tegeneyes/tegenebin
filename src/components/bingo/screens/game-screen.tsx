"use client"

import { motion } from "framer-motion"
import type { BingoCell, GameStats, Cartela } from "@/lib/bingo/types"
import { MasterBoard } from "@/components/bingo/game/master-board"
import { BallArea } from "@/components/bingo/game/ball-area"
import { SoundToggle } from "@/components/bingo/game/automatic-toggle"
import { CartelaCard, WatchingBanner } from "@/components/bingo/game/cartela-card"
import { cn } from "@/lib/utils"

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
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex-1 flex flex-col overflow-hidden"
    >
      {/* Top stats strip */}
      <div className="grid grid-cols-5 px-2 pt-3 pb-2 gap-1.5 flex-shrink-0">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="flex flex-col items-center bg-white/[0.04] border border-white/10 rounded-xl py-1.5 px-1"
          >
            <span className="text-[8px] text-gray-400 uppercase font-bold tracking-wider">{stat.label}</span>
            <span
              className={`text-[11px] font-mono font-extrabold truncate max-w-full ${
                stat.highlight ? "text-white" : "text-white"
              }`}
            >
              {stat.val}
            </span>
          </div>
        ))}
      </div>

      {/* Split view */}
      <div className="flex-1 min-h-0 flex overflow-hidden px-2 pb-2 gap-2">
        <MasterBoard calledNumbers={calledNumbers} />

        <div className="flex-1 flex flex-col overflow-hidden bg-white/[0.03] border border-white/10 rounded-2xl">
          <div className="p-3 flex flex-col items-center gap-3">
            <BallArea calledNumbers={calledNumbers} soundEnabled={soundEnabled} onToggleSound={onToggleSound} />

            <SoundToggle soundEnabled={soundEnabled} onToggle={onToggleSound} />
          </div>

          <div className="flex-1 overflow-y-auto px-3 pb-3">
            {isWatching ? (
              <WatchingBanner />
            ) : (
              <div className="flex flex-col gap-3">
                {/* Show all cartelas stacked vertically */}
                {cartelas.map((cartela, index) => (
                  <div key={cartela.id} className="flex flex-col">
                    {/* Cartela header with number */}
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-gray-400 text-[10px] font-bold uppercase tracking-wider">
                        Cartela {index + 1} of {cartelas.length} #{cartela.id}
                      </p>
                      {cartelas.length > 1 && (
                        <div className={cn(
                          "w-2 h-2 rounded-full",
                          index === activeCartelaIndex ? "bg-bingo-green" : "bg-white/20"
                        )} />
                      )}
                    </div>
                    
                    {/* Cartela Card */}
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

      {/* Bottom actions */}
      <div 
        className="px-3 pt-2 grid grid-cols-2 gap-2 flex-shrink-0"
        style={{ paddingBottom: 'max(16px, calc(env(safe-area-inset-bottom) + 12px))' }}
      >
        <button
          onClick={onLeave}
          className="bg-bingo-red text-white py-3 rounded-xl font-black text-xs tracking-wider shadow-[0_8px_20px_-8px_rgba(239,68,68,0.6)] active:scale-[0.98] transition-transform"
        >
          LEAVE
        </button>
        <button
          onClick={onRefresh}
          className="bg-white/[0.04] text-white py-3 rounded-xl font-black text-xs tracking-wider border border-white/10 active:scale-[0.98] transition-transform"
        >
          REFRESH
        </button>
      </div>
    </motion.div>
  )
}