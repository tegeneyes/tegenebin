"use client"

import { cn } from "@/lib/utils"
import type { BingoCell } from "@/lib/bingo/types"

interface CartelaCardProps {
  card: BingoCell[][]
  onCellClick: (row: number, col: number) => void
  cartelaNumber?: number
}

const HEADER_COLORS = [
  "bg-blue-500",
  "bg-violet-500",
  "bg-pink-500",
  "bg-emerald-500",
  "bg-orange-500",
]

export function CartelaCard({ card, onCellClick, cartelaNumber = 410 }: CartelaCardProps) {
  return (
    <div className="relative rounded-xl p-[1.5px] bg-gradient-to-br from-bingo-gold via-amber-500 to-bingo-gold/40 shadow-[0_8px_24px_-8px_rgba(212,175,55,0.55)]">
      <div className="rounded-[10px] bg-gradient-to-br from-bingo-deep-purple to-[#1a0e2e] p-2">
        <div className="flex items-center justify-between mb-1.5">
          <span className="font-display text-bingo-gold text-[11px] tracking-widest leading-none">
            #{String(cartelaNumber).padStart(3, "0")}
          </span>
          <span className="px-1 py-[2px] rounded bg-bingo-gold/15 border border-bingo-gold/30 text-bingo-gold text-[7px] font-bold uppercase tracking-wider">
            Active
          </span>
        </div>
        <div className="w-full rounded-md bg-[#0d0820] p-1.5 border border-white/10">
          <div className="grid grid-cols-5 gap-1">
            {["B", "I", "N", "G", "O"].map((l, i) => (
              <div
                key={l}
                className={cn(
                  "aspect-square rounded-[3px] flex items-center justify-center text-[11px] font-black text-white",
                  HEADER_COLORS[i],
                )}
              >
                {l}
              </div>
            ))}
            {card.map((row, r) =>
              row.map((cell, c) => {
                const isFree = cell.number === "FREE"
                return (
                  <button
                    key={`${r}-${c}`}
                    onClick={() => onCellClick(r, c)}
                    className={cn(
                      "aspect-square rounded-[3px] flex items-center justify-center text-[11px] font-extrabold font-mono transition-colors",
                      isFree
                        ? "bg-emerald-500 text-white text-sm"
                        : cell.marked
                          ? "bg-bingo-gold text-slate-900 shadow-inner"
                          : "bg-white text-slate-900",
                    )}
                  >
                    {isFree ? "★" : cell.number}
                  </button>
                )
              }),
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export function WatchingBanner() {
  return (
    <div className="flex flex-col items-center text-center gap-3 py-6 px-2">
      <h3 className="text-white font-display font-black text-2xl leading-tight tracking-wide">
        WATCHING
        <br />
        ONLY
      </h3>
      <p className="text-xs text-gray-400 leading-relaxed font-semibold max-w-[180px]">
        Game already
        <br />
        started
        <br />
        Wait for
        <br />
        round end.
      </p>
    </div>
  )
}
