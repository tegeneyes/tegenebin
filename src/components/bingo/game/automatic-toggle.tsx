"use client"

import { motion } from "framer-motion"
import { Volume2, VolumeX } from "lucide-react"
import { cn } from "@/lib/utils"

interface SoundToggleProps {
  soundEnabled: boolean
  onToggle: () => void
}

export function SoundToggle({ soundEnabled, onToggle }: SoundToggleProps) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onToggle}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          onToggle()
        }
      }}
      className="w-full bg-white/[0.04] px-4 py-2.5 rounded-full flex items-center justify-between border border-white/10 cursor-pointer"
      aria-pressed={soundEnabled}
      aria-label={soundEnabled ? "Mute sound" : "Unmute sound"}
    >
      <span className="flex items-center gap-1.5 text-[11px] font-black text-white uppercase tracking-widest">
        {soundEnabled ? <Volume2 size={13} /> : <VolumeX size={13} />}
        Sound
      </span>
      <div
        className={cn(
          "w-10 h-5 rounded-full relative transition-colors p-0.5",
          soundEnabled ? "bg-bingo-green" : "bg-gray-700",
        )}
      >
        <motion.div animate={{ x: soundEnabled ? 20 : 0 }} className="w-4 h-4 bg-white rounded-full shadow" />
      </div>
    </div>
  )
}
