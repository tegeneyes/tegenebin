"use client"

import { AnimatePresence, motion } from "framer-motion"

interface LoadingOverlayProps {
  visible: boolean
  label?: string
}

export function LoadingOverlay({ visible, label = "Loading Game" }: LoadingOverlayProps) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-bingo-deep-purple flex flex-col items-center justify-center z-[100]"
        >
          <motion.div
            animate={{ rotate: 360, scale: [1, 1.2, 1] }}
            transition={{ repeat: Number.POSITIVE_INFINITY, duration: 1.5 }}
            className="w-16 h-16 border-4 border-bingo-gold border-t-transparent rounded-full mb-6"
          />
          <p className="text-bingo-gold font-display font-bold tracking-[0.3em] uppercase">{label}</p>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
