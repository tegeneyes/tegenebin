"use client"

import { AnimatePresence, motion } from "framer-motion"
import { Trophy } from "lucide-react"
import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"
import type { Cartela } from "@/lib/bingo/types"

interface WinModalProps {
  visible: boolean
  winningCartela: Cartela | null
  timer: number
  onBackToLobby: () => void
  winnerName?: string
  prize?: string
  autoCloseSeconds?: number
}

export function WinModal({ visible, winningCartela, onBackToLobby, winnerName, prize, autoCloseSeconds = 8 }: WinModalProps) {
  const hasWinner = winningCartela !== null || !!winnerName
  const cartelaNumber = winningCartela?.id || 410
  const card = winningCartela?.card || []
  const [countdown, setCountdown] = useState(autoCloseSeconds)

  useEffect(() => {
    if (!visible) { setCountdown(autoCloseSeconds); return }
    setCountdown(autoCloseSeconds)
    const id = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) { clearInterval(id); onBackToLobby(); return 0 }
        return c - 1
      })
    }, 1000)
    return () => clearInterval(id)
  }, [visible, autoCloseSeconds, onBackToLobby])

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-[200] px-6"
        >
          <motion.div
            initial={{ scale: 0.8, y: 50 }}
            animate={{ scale: 1, y: 0 }}
            className="w-full bg-bingo-purple rounded-[32px] p-6 border border-white/20 relative overflow-hidden flex flex-col items-center text-center shadow-2xl"
          >
            <div className="absolute top-0 inset-x-0 h-40 bg-gradient-to-b from-bingo-gold/20 to-transparent pointer-events-none" />

            <Trophy size={64} className={cn("mb-4 drop-shadow-[0_0_20px_rgba(251,191,36,0.5)]", hasWinner ? "text-bingo-gold" : "text-gray-400")} />

            {hasWinner ? (
              <>
                <h2 className="text-4xl font-display font-black text-white italic mb-2 tracking-tighter">BINGO!</h2>
                <p className="text-bingo-gold font-black uppercase tracking-widest text-sm mb-6">🏆 {winnerName ? `${winnerName} WON!` : "YOU WON!"} 🏆</p>
              </>
            ) : (
              <>
                <h2 className="text-3xl font-display font-black text-white italic mb-2 tracking-tighter">ROUND OVER</h2>
                <p className="text-gray-400 font-bold uppercase tracking-widest text-sm mb-6">No one got BINGO this round</p>
              </>
            )}

            {hasWinner && winningCartela && (
            <div className="relative w-full mb-6 rounded-2xl p-[1.5px] bg-gradient-to-br from-bingo-gold via-amber-500 to-bingo-gold/40 shadow-[0_8px_24px_-8px_rgba(212,175,55,0.55)]">
              <div className="rounded-[14px] bg-gradient-to-br from-bingo-deep-purple to-[#1a0e2e] p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-display text-bingo-gold text-xs tracking-widest leading-none">
                    #{String(cartelaNumber).padStart(3, "0")}
                  </span>
                  <span className="px-1.5 py-[2px] rounded bg-bingo-gold/15 border border-bingo-gold/30 text-bingo-gold text-[8px] font-bold uppercase tracking-wider">
                    Winner
                  </span>
                </div>
                <div className="w-full rounded-md bg-[#0d0820] p-2 border border-white/10">
                  <div className="grid grid-cols-5 gap-1">
                    {["B", "I", "N", "G", "O"].map((l, i) => (
                      <div
                        key={l}
                        className={cn(
                          "aspect-square rounded-[3px] flex items-center justify-center text-xs font-black text-white",
                          ["bg-blue-500", "bg-violet-500", "bg-pink-500", "bg-emerald-500", "bg-orange-500"][i],
                        )}
                      >
                        {l}
                      </div>
                    ))}
                    {card && card.length > 0 ? (
                      card.map((row, r) =>
                        row?.map((cell, c) => {
                          const isFree = cell?.number === "FREE"
                          return (
                            <div
                              key={`${r}-${c}`}
                              className={cn(
                                "aspect-square rounded-[3px] flex items-center justify-center text-xs font-extrabold font-mono",
                                isFree
                                  ? "bg-emerald-500 text-white"
                                  : cell?.marked
                                    ? "bg-bingo-gold text-slate-900"
                                    : "bg-white text-slate-900",
                              )}
                            >
                              {isFree ? "★" : cell?.number ?? ""}
                            </div>
                          )
                        }),
                      )
                    ) : (
                      <div className="col-span-5 text-center text-gray-500 py-2">Loading card...</div>
                    )}
                  </div>
                </div>
              </div>
            </div>
            )}

            {hasWinner && prize && !winningCartela && (
              <div className="w-full mb-6 rounded-2xl border border-bingo-gold/30 bg-bingo-gold/10 p-4 flex flex-col items-center">
                <span className="text-[10px] font-black uppercase tracking-widest text-bingo-gold mb-1">Derash</span>
                <span className="text-white font-mono text-3xl font-extrabold">{prize} <span className="text-xs text-gray-400">ETB</span></span>
              </div>
            )}

            <div className="w-full bg-white/5 py-2 px-4 rounded-full border border-white/10 flex items-center justify-center gap-3 mb-6">
              <div className="w-2 h-2 rounded-full bg-bingo-gold animate-ping" />
              <span className="text-[10px] font-bold text-gray-300 uppercase tracking-widest">
                Next game in {countdown}s
              </span>
            </div>

            <button
              onClick={onBackToLobby}
              className="w-full bg-white text-black py-4 rounded-2xl font-black uppercase tracking-widest text-sm active:scale-[0.98] transition-all"
            >
              BACK TO LOBBY
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}