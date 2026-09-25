"use client"

import { useState, useEffect, useRef } from "react"
import { ArrowLeft, X } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import type { Cartela } from "@/lib/bingo/types"
import { generateBingoCard } from "@/lib/bingo/logic"
import { useI18n } from "@/lib/i18n"
import { MIN_PLAYERS } from "@/lib/game.functions"
import { analytics } from "@/lib/analytics"

interface CartelaSelectionScreenProps {
  onBack: () => void
  onConfirm: (selected: Cartela[]) => void
  onWatch: () => void
  onTopUp: () => void
  stake: number
  playBalance: number
  mainBalance: number
  selectionEndsAt: number | null
  selectionStartsAt?: number | null
  livePlayers: number
  /** Returns true if a cartela ID is taken by another player in this round */
  isTakenByOthers?: (cartelaId: number) => boolean
  /** Called when user selects a cartela — should reserve it server-side */
  onReserve?: (cartelaId: number) => Promise<void>
  /** Called when user deselects a cartela — should release it server-side */
  onRelease?: (cartelaId: number) => Promise<void>
  /** Optimistically remove a cartela from the taken set (for instant UI feedback) */
  releaseLocally?: (cartelaId: number) => void
}


// Generate 500 cartelas for selection
const generateAllCartelas = (): Cartela[] => {
  return Array.from({ length: 500 }, (_, i) => ({
    id: i + 1,
    card: generateBingoCard(),
    selectedByOthers: false,
  }))
}

const secondsUntil = (deadline: number | null | undefined) =>
  Math.max(0, Math.ceil(((deadline ?? Date.now()) - Date.now()) / 1000))

const secondsUntilStart = (start: number | null | undefined) =>
  start ? Math.max(0, Math.ceil((start - Date.now()) / 1000)) : 0

export function CartelaSelectionScreen({
  onBack,
  onConfirm,
  onWatch,
  onTopUp,
  stake,
  playBalance,
  mainBalance,
  selectionEndsAt,
  selectionStartsAt,
  livePlayers,
  isTakenByOthers,
  onReserve,
  onRelease,
  releaseLocally,
}: CartelaSelectionScreenProps) {
  const { t } = useI18n()
  const [allCartelas] = useState<Cartela[]>(() => generateAllCartelas())
  const [selectedCartelas, setSelectedCartelas] = useState<Cartela[]>([])
  const [localSelectionEndsAt, setLocalSelectionEndsAt] = useState(selectionEndsAt)
  const [timeLeft, setTimeLeft] = useState(() => secondsUntil(localSelectionEndsAt))
  const [waitLeft, setWaitLeft] = useState(() => secondsUntilStart(selectionStartsAt))
  const finishedRef = useRef(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  const MAX_CARTELAS = 2
  // Only allow as many cartelas as the wallet can actually pay for, so a player
  // with e.g. 10 ETB at a 10 ETB stake can pick exactly 1.
  const affordableCartelas = stake > 0 ? Math.floor(playBalance / stake) : 0
  const maxCartelas = Math.max(0, Math.min(MAX_CARTELAS, affordableCartelas))
  const totalCost = selectedCartelas.length * stake
  const canAfford = playBalance >= totalCost
  // Live Derash = (players currently in this stake's lobby) × stake × 0.7 (30% house cut)
  const derash = Math.round(Math.max(livePlayers, 1) * stake * 0.7)

  useEffect(() => {
    finishedRef.current = false
    setLocalSelectionEndsAt(selectionEndsAt)
  }, [selectionEndsAt])

  // Timer countdown follows the shared game deadline, so it does not reset when leaving and returning.
  useEffect(() => {
    const updateTimeLeft = () => {
      const w = secondsUntilStart(selectionStartsAt)
      setWaitLeft(w)
      // Only count down selection after the wait is over.
      const nextTimeLeft = w > 0 ? 0 : secondsUntil(localSelectionEndsAt)

      // If we're in the waiting-for-next-round phase, show wait time and return
      if (w > 0) {
        setTimeLeft(0)
        return
      }

      // If timer hasn't hit 1s yet, update display
      if (nextTimeLeft > 1) {
        setTimeLeft(nextTimeLeft)
        return
      }

      // At 1s or less - check if we can start, otherwise restart to 30s immediately
      if (finishedRef.current) return
      finishedRef.current = true

      // Start the game only when at least MIN_PLAYERS are committed
      if (selectedCartelas.length > 0 && livePlayers >= MIN_PLAYERS) {
        onConfirm(selectedCartelas)
      } else {
        // Instantly restart to 30s without ever showing 0s
        finishedRef.current = false
        setLocalSelectionEndsAt(Date.now() + 30_000)
        setTimeLeft(30)
      }
    }

    updateTimeLeft()
    const timer = setInterval(updateTimeLeft, 250)

    return () => clearInterval(timer)
  }, [localSelectionEndsAt, selectionStartsAt, selectedCartelas, livePlayers, onConfirm, onBack, t])

  const handleSelectCartela = async (cartela: Cartela) => {
    const taken = isTakenByOthers?.(cartela.id) ?? false
    if (taken) return

    const isSelected = selectedCartelas.some(c => c.id === cartela.id)

    if (isSelected) {
      // Deselect — optimistic local release for instant feedback, then server release
      setSelectedCartelas(prev => prev.filter(c => c.id !== cartela.id))
      releaseLocally?.(cartela.id)
      try {
        await onRelease?.(cartela.id)
      } catch (e) {
        toast.error(t("sel.release_failed"))
      }
    } else if (selectedCartelas.length < maxCartelas) {
      // Try to reserve server-side first
      if (onReserve) {
        try {
          await onReserve(cartela.id)
        } catch (e) {
          const msg = e instanceof Error ? e.message : ""
          if (msg.includes("cartela_taken")) {
            toast.error(t("sel.taken"))
          } else {
            toast.error(t("sel.reserve_failed"))
          }
          return
        }
      }
      setSelectedCartelas(prev => [...prev, cartela])
      analytics.cartelaSelected(cartela.id, stake, selectedCartelas.length + 1)
    } else {
      toast.error(maxCartelas === 0 ? t("sel.insufficient") : t("sel.max_warn", { n: maxCartelas }))
    }
  }

  const handleUnselect = async (id: number) => {
    setSelectedCartelas(prev => prev.filter(c => c.id !== id))
    releaseLocally?.(id)
    try {
      await onRelease?.(id)
    } catch (e) {
      toast.error(t("sel.release_failed"))
    }
  }

  // Leaving selection must release every server-side reservation, otherwise
  // the cartelas stay "taken" and reappear as occupied on the next visit.
  const releaseReservations = async () => {
    for (const c of selectedCartelas) {
      releaseLocally?.(c.id)
      try {
        await onRelease?.(c.id)
      } catch (e) {
        toast.error(t("sel.release_failed"))
      }
    }
  }

  const handleLeave = async () => {
    await releaseReservations()
    onBack()
  }

  const handleTopUp = async () => {
    await releaseReservations()
    onTopUp()
  }

  const getCartelaStatus = (cartela: Cartela) => {
    const isSelectedByMe = selectedCartelas.some(c => c.id === cartela.id)
    const takenByOthers = isTakenByOthers?.(cartela.id) ?? false
    
    return {
      isSelectedByMe,
      isSelectedByOthers: takenByOthers,
      isAvailable: !isSelectedByMe && !takenByOthers
    }
  }

  const getCartelaStyle = (cartela: Cartela) => {
    const { isSelectedByMe, isSelectedByOthers } = getCartelaStatus(cartela)

    if (isSelectedByMe) {
      return "bg-bingo-gold text-bingo-deep-purple border-amber-200"
    }
    if (isSelectedByOthers) {
      return "bg-[#1a1530] text-[#4B5172] border-[#2a2548] line-through cursor-not-allowed opacity-60"
    }
    // Flat solid color for available tiles — avoids per-frame gradient repaint while scrolling
    return "bg-violet-700 text-white border-violet-500/40 active:bg-violet-600"
  }



  // Create rows of 5 cartelas each
  const rows: Cartela[][] = []
  for (let i = 0; i < allCartelas.length; i += 5) {
    rows.push(allCartelas.slice(i, i + 5))
  }

  return (
    <div className="flex flex-col h-dvh w-full bg-bingo-deep-purple max-w-[430px] md:max-w-[760px] mx-auto overflow-hidden">
      <div className="flex flex-1 min-h-0 flex-row">
        <div className="flex flex-col flex-1 min-h-0 min-w-0">

      {/* Header */}
      <header className="px-4 pt-3 pb-2 flex items-center justify-between border-b border-white/10 flex-shrink-0">
        <button 
          onClick={handleLeave}
          className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center hover:bg-white/10 transition-colors"
        >
          <ArrowLeft size={20} className="text-gray-300" />
        </button>
        <h1 className="text-lg font-display font-bold text-white">{t("sel.title")}</h1>
        <div className="w-10 h-10" aria-hidden="true" />
      </header>

      {/* Timer and Selection Status - Compact */}
      <div className="px-4 py-1 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2">
          {maxCartelas > 0 ? (
            <span className="text-white text-xs font-medium">
              {t("sel.selected")}: <span className="text-bingo-gold font-bold">{selectedCartelas.length}</span>/{maxCartelas}
            </span>
          ) : (
            <span className="text-bingo-red text-xs font-bold">{t("sel.insufficient")}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-gray-400 text-xs">{t("sel.time")}:</span>
          {timeLeft > 0 ? (
            <span className={cn(
              "font-mono text-base font-bold",
              timeLeft <= 5 ? "text-bingo-red" : "text-bingo-gold"
            )}>
              {timeLeft}s
            </span>
          ) : (
            <span className="text-bingo-green font-mono text-base font-bold">
              0s
            </span>
          )}
        </div>
      </div>

      {/* Available Cartelas Label */}
      <div className="px-4 py-1 flex-shrink-0">
        <p className="text-gray-400 text-[9px] uppercase font-bold">
          {t("sel.available")}
        </p>
      </div>

      {/* Scrollable Cartela Numbers Grid - Takes remaining space */}
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto custom-scrollbar px-2 pb-1 min-h-0"
        style={{ contain: "content", WebkitOverflowScrolling: "touch" as const }}
      >
        <div className="grid grid-cols-5 gap-1.5 md:gap-2" style={{ contentVisibility: "auto" as const }}>
          {allCartelas.map((cartela) => {
            const { isSelectedByOthers } = getCartelaStatus(cartela)
            return (
              <button
                key={cartela.id}
                onClick={() => handleSelectCartela(cartela)}
                disabled={isSelectedByOthers}
                className={cn(
                  "aspect-square rounded-md border flex items-center justify-center font-black font-mono leading-none transition-colors duration-100",
                  cartela.id >= 100 ? "text-[11px] md:text-lg" : "text-sm md:text-2xl",
                  getCartelaStyle(cartela),
                  isSelectedByOthers && "cursor-not-allowed"
                )}
              >
                {cartela.id}
              </button>
            )
          })}
        </div>

      </div>

        </div>

        {/* Side Panel: Selected Cartelas (always visible) */}
        <aside className="flex w-[190px] md:w-[240px] flex-col border-l border-bingo-gold/15 overflow-hidden bg-gradient-to-b from-bingo-deep-purple to-black/40">
          <p className="text-bingo-gold/80 text-[9px] uppercase font-bold mt-3 mb-1 tracking-[0.25em] text-center flex-shrink-0">
            {t("sel.your_cartelas")}
          </p>
          <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-2 md:px-3 py-2">
          {selectedCartelas.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center px-2 gap-2 h-full">
              <div className="w-10 h-10 rounded-full border border-dashed border-bingo-gold/30 flex items-center justify-center text-bingo-gold/40 text-lg">
                ★
              </div>
              <p className="text-gray-500 text-[10px] leading-relaxed">
                {t("sel.tap_hint_a")}<br/>{t("sel.tap_hint_b", { n: maxCartelas })}
              </p>
            </div>
          ) : (
            // Distribute the selected cards across the full sidebar height so 1 or 2 cards fill the space.
            <div className="flex flex-col h-full justify-evenly gap-3">
              {selectedCartelas.map((cartela) => (
                <div
                  key={cartela.id}
                  className="relative rounded-xl p-[1.5px] bg-gradient-to-br from-bingo-gold via-amber-500 to-bingo-gold/40 shadow-[0_8px_24px_-8px_rgba(212,175,55,0.55)]"
                >
                  <button
                    type="button"
                    onClick={() => handleUnselect(cartela.id)}
                    aria-label={`Remove cartela ${cartela.id}`}
                    className="absolute top-1 right-1 z-10 w-5 h-5 rounded-full bg-bingo-red text-white border border-white/30 shadow-md flex items-center justify-center hover:scale-110 transition-transform"
                  >
                    <X size={12} strokeWidth={3} />
                  </button>
                  <div className="rounded-[10px] bg-gradient-to-br from-bingo-deep-purple to-[#1a0e2e] p-2">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="font-display text-bingo-gold text-[11px] md:text-xs tracking-widest leading-none">
                        #{String(cartela.id).padStart(3, "0")}
                      </span>
                      <span className="px-1 py-[2px] rounded bg-bingo-gold/15 border border-bingo-gold/30 text-bingo-gold text-[6px] md:text-[7px] font-bold uppercase tracking-wider">
                        {t("sel.active")}
                      </span>
                    </div>
                    <SidebarCartelaCard card={cartela.card} />
                  </div>
                </div>
              ))}
            </div>
          )}
          </div>
        </aside>
      </div>

      {/* Unified Bottom Bar - Total Cost + waiting status */}
      <div className="p-3 border-t border-white/10 flex-shrink-0 pb-safe bg-bingo-deep-purple">
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-gray-400 text-[10px] uppercase tracking-wider">{t("sel.total_cost")}</span>
            <span className={cn(
              "font-mono text-lg font-bold leading-none",
              canAfford ? "text-bingo-green" : "text-bingo-red"
            )}>
              {totalCost} ETB
            </span>
          </div>
          <div className="flex flex-col items-end">
            <span className="text-gray-400 text-[10px] uppercase tracking-wider">{t("sel.starts_in")}</span>
            {waitLeft > 0 ? (
              <span className="text-bingo-cyan text-xs font-medium">
                ⏳ {t("sel.waiting")}
              </span>
            ) : (
              <span className={cn(
                "font-mono text-lg font-bold leading-none",
                timeLeft <= 5 ? "text-bingo-red" : "text-bingo-gold"
              )}>
                {timeLeft}s
              </span>
            )}
          </div>
        </div>
        {maxCartelas === 0 ? (
          <div className="mt-2 space-y-2">
            <p className="text-bingo-red text-[11px] text-center font-bold">{t("sel.insufficient")}</p>
            <button
              type="button"
              onClick={handleTopUp}
              className="w-full py-2.5 rounded-xl bg-bingo-green text-bingo-deep-purple font-black text-xs uppercase tracking-wider"
            >
              {t("sel.topup")}
            </button>
          </div>
        ) : (
          <>
            {!canAfford && selectedCartelas.length > 0 && (
              <p className="text-bingo-red text-[11px] text-center mt-2">{t("sel.insufficient")}</p>
            )}
            {selectedCartelas.length === 0 && (
              <p className="text-gray-400 text-[11px] text-center mt-2">{t("sel.pick_before", { n: maxCartelas })}</p>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// Larger version for the side panel
function SidebarCartelaCard({ card }: { card: any[][] }) {
  const headerColors = [
    "bg-blue-500",
    "bg-violet-500",
    "bg-pink-500",
    "bg-emerald-500",
    "bg-orange-500",
  ]
  return (
    <div className="w-full rounded-md bg-[#0d0820] p-1.5 border border-white/10">
      <div className="grid grid-cols-5 gap-1">
        {["B", "I", "N", "G", "O"].map((l, i) => (
          <div
            key={l}
            className={cn(
              "aspect-square rounded-[3px] flex items-center justify-center text-[11px] md:text-sm font-black text-white",
              headerColors[i]
            )}
          >
            {l}
          </div>
        ))}
        {card.map((row, r) =>
          row.map((cell, c) => {
            const isFree = cell.number === "FREE"
            return (
              <div
                key={`${r}-${c}`}
                className={cn(
                  "aspect-square rounded-[3px] flex items-center justify-center text-[11px] md:text-sm font-extrabold font-mono",
                  isFree
                    ? "bg-emerald-500 text-white text-base"
                    : "bg-white text-slate-900"
                )}
              >
                {isFree ? "★" : cell.number}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

// TINY version of cartela card - Even smaller for preview
function TinyCartelaCard({ card }: { card: any[][] }) {
  return (
    <div className="w-full">
      <div className="grid grid-cols-5 gap-0.5">
        {["B", "I", "N", "G", "O"].map((l) => (
          <div
            key={l}
            className="aspect-square bg-blue-600 rounded-sm flex items-center justify-center text-[6px] font-black text-white leading-none"
          >
            {l}
          </div>
        ))}
        {card.map((row, r) =>
          row.map((cell, c) => (
            <div
              key={`${r}-${c}`}
              className="aspect-square rounded-sm flex items-center justify-center text-[6px] font-bold bg-white/10 text-white border border-white/5 leading-none"
            >
              {cell.number === "FREE" ? "★" : cell.number}
            </div>
          ))
        )}
      </div>
    </div>
  )
}