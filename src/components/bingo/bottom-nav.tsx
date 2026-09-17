"use client"

import { Gamepad2, History, Trophy, User, Wallet } from "lucide-react"
import type { ReactNode } from "react"
import { cn } from "@/lib/utils"
import type { TabType } from "@/lib/bingo/types"
import { useI18n } from "@/lib/i18n"

interface BottomNavProps {
  activeTab: TabType
  onChange: (tab: TabType) => void
}

export function BottomNav({ activeTab, onChange }: BottomNavProps) {
  const { t } = useI18n()
  const tabs: { id: TabType; icon: ReactNode; label: string }[] = [
    { id: "game", icon: <Gamepad2 size={20} />, label: t("nav.game") },
    { id: "scores", icon: <Trophy size={20} />, label: t("nav.scores") },
    { id: "history", icon: <History size={20} />, label: t("nav.history") },
    { id: "wallet", icon: <Wallet size={20} />, label: t("nav.wallet") },
    { id: "profile", icon: <User size={20} />, label: t("nav.profile") },
  ]
  return (
    <nav
      aria-label="Primary"
      className="absolute bottom-0 left-0 right-0 z-40 px-3 pb-3 pt-2"
      style={{ paddingBottom: 'max(12px, calc(env(safe-area-inset-bottom) + 6px))' }}
    >
      <div className="mx-auto max-w-md surface-glass rounded-2xl px-2 py-1.5 flex items-center justify-between shadow-panel-elev">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => onChange(tab.id)}
              className={cn(
                "relative flex flex-col items-center justify-center gap-0.5 flex-1 py-2 rounded-xl transition-all",
                isActive
                  ? "text-[#1A0633] bg-gradient-gold shadow-gold"
                  : "text-white/55 hover:text-white/80",
              )}
              aria-current={isActive ? "page" : undefined}
            >
              {tab.icon}
              <span className={cn(
                "text-[9px] font-extrabold uppercase tracking-[0.2em]",
                isActive ? "" : "tracking-[0.18em]"
              )}>
                {tab.label}
              </span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
