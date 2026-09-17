"use client"

import type { ReactNode } from "react"
import { motion } from "framer-motion"

interface ScreenWrapperProps {
  screenKey: string
  children: ReactNode
}

export function ScreenWrapper({ screenKey, children }: ScreenWrapperProps) {
  return (
    <motion.div
      key={screenKey}
      initial={{ opacity: 0, x: 10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -10 }}
      className="flex-1 min-h-0 overflow-y-auto custom-scrollbar flex flex-col pt-4 px-4"
      style={{ paddingBottom: "max(96px, calc(env(safe-area-inset-bottom) + 88px))" }}
    >
      {children}
    </motion.div>
  )
}
