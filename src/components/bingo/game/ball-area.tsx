"use client"

import { motion } from "framer-motion"
import { getNumberPrefix } from "@/lib/bingo/logic"
import { cn } from "@/lib/utils"

interface BallAreaProps {
  calledNumbers: number[]
  soundEnabled?: boolean
  onToggleSound?: () => void
}

const LETTER_STYLES: Record<string, string> = {
  B: "bg-blue-500",
  I: "bg-bingo-accent",
  N: "bg-pink-500",
  G: "bg-bingo-green",
  O: "bg-orange-500",
}

export function BallArea({ calledNumbers }: BallAreaProps) {
  const currentNumber = calledNumbers[0]
  const previousNumbers = calledNumbers.slice(1, 5)

  return (
    <>
      <div className="flex items-center justify-between w-full gap-1">
        <div className="flex gap-1 flex-1">
          {previousNumbers.map((n, i) => {
            const letter = getNumberPrefix(n)
            return (
              <div
                key={`${n}-${i}`}
                className={cn(
                  "h-6 px-2 rounded-full flex items-center justify-center text-[9px] font-black text-white",
                  LETTER_STYLES[letter] ?? "bg-white/10",
                )}
              >
                {letter}-{n}
              </div>
            )
          })}
        </div>
      </div>

      <div className="relative">
        <motion.div
          key={currentNumber}
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="w-20 h-20 rounded-full bg-white flex items-center justify-center border-4 border-bingo-gold shadow-[0_0_30px_-5px_rgba(251,191,36,0.6)]"
        >
          {currentNumber !== undefined ? (
            <p className="text-black text-xl font-black leading-none">
              {getNumberPrefix(currentNumber)}-{currentNumber}
            </p>
          ) : (
            <p className="text-gray-400 text-[10px] font-bold uppercase leading-tight">Waiting</p>
          )}
        </motion.div>
      </div>
    </>
  )
}
