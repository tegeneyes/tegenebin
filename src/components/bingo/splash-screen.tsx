"use client"

import { motion } from "framer-motion"
import { useEffect } from "react"

export function SplashScreen({ onDone, durationMs = 2200 }: { onDone: () => void; durationMs?: number }) {
  useEffect(() => {
    const t = setTimeout(onDone, durationMs)
    return () => clearTimeout(t)
  }, [onDone, durationMs])

  const letters = ["B", "I", "N", "G", "O"]
  const colors = ["#a855f7", "#22d3ee", "#f59e0b", "#ec4899", "#10b981"]

  return (
    <motion.div
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-bingo-deep-purple overflow-hidden"
    >
      {/* Radial glow */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(168,85,247,0.25),transparent_60%)]" />

      <motion.div
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 180, damping: 16 }}
        className="relative z-10 flex flex-col items-center gap-6"
      >
        <div className="flex gap-2">
          {letters.map((l, i) => (
            <motion.div
              key={l}
              initial={{ y: -40, opacity: 0, rotate: -12 }}
              animate={{ y: 0, opacity: 1, rotate: 0 }}
              transition={{ delay: 0.1 + i * 0.08, type: "spring", stiffness: 220, damping: 14 }}
              className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl flex items-center justify-center font-display font-extrabold text-3xl sm:text-4xl text-white shadow-2xl"
              style={{ backgroundColor: colors[i], boxShadow: `0 10px 30px ${colors[i]}66` }}
            >
              {l}
            </motion.div>
          ))}
        </div>

        <motion.h1
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.55 }}
          className="font-display font-extrabold text-2xl sm:text-3xl tracking-[0.3em] text-white"
        >
          LIYU BINGO
        </motion.h1>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8 }}
          className="text-xs uppercase tracking-[0.4em] text-bingo-gold-soft"
        >
          Play · Win · Repeat
        </motion.p>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.0 }}
          className="mt-4 flex gap-1.5"
        >
          {[0, 1, 2].map((i) => (
            <motion.span
              key={i}
              animate={{ y: [0, -6, 0] }}
              transition={{ duration: 0.7, repeat: Infinity, delay: i * 0.12 }}
              className="w-2 h-2 rounded-full bg-bingo-gold-soft"
            />
          ))}
        </motion.div>
      </motion.div>
    </motion.div>
  )
}
