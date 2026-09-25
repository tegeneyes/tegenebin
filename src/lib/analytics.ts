"use client"

import { supabase } from "@/integrations/supabase/client"
import { useEffect, useRef } from "react"

type EventProps = Record<string, string | number | boolean | null>

let sessionId: string | null = null

function getSessionId(): string {
  if (typeof window === "undefined") return "ssr"
  if (!sessionId) {
    sessionId = sessionStorage.getItem("analytics_session_id")
    if (!sessionId) {
      sessionId = crypto.randomUUID()
      sessionStorage.setItem("analytics_session_id", sessionId)
    }
  }
  return sessionId
}

/** Track an analytics event. Fire-and-forget. */
export async function track(
  eventName: string,
  properties: EventProps = {}
): Promise<void> {
  try {
    const session_id = getSessionId()
    const { error } = await supabase.rpc("track_event", {
      _event_name: eventName,
      _properties: properties,
      _session_id: session_id,
    } as never)
    if (error) console.warn("[analytics] track error:", error.message)
  } catch (e) {
    console.warn("[analytics] track exception:", e)
  }
}

/** Initialize session on app load. Call once at app root. */
export function useAnalyticsInit(): void {
  const inited = useRef(false)
  useEffect(() => {
    if (inited.current) return
    inited.current = true
    getSessionId() // ensure session exists
  }, [])
}

/** Convenience helpers for key funnel events */
export const analytics = {
  // Acquisition
  miniAppOpen: () => track("mini_app_open", { source: "telegram" }),
  botStart: (startParam?: string) => track("bot_start", { start_param: startParam ?? "" }),

  // Selection / Gameplay
  cartelaSelected: (cartelaId: number, stake: number, cartelaCount: number) =>
    track("cartela_selected", { cartela_id: cartelaId, stake, cartela_count: cartelaCount }),
  roundJoined: (roundIndex: number, stake: number, playerCount: number) =>
    track("round_joined", { round_index: roundIndex, stake, player_count: playerCount }),
  roundLeft: (reason: "leave" | "topup" | "timeout") =>
    track("round_left", { reason }),

  // Gameplay outcomes
  gameWin: (stake: number, prize: number, cartelaCount: number, isJackpot?: boolean) =>
    track("game_win", { stake, prize, cartela_count: cartelaCount, is_jackpot: isJackpot ?? false }),
  gameLoss: (stake: number, cartelaCount: number) =>
    track("game_loss", { stake, cartela_count: cartelaCount }),

  // Daily bonus
  dailyBonusClaimed: (amount: number) =>
    track("daily_bonus_claimed", { amount }),
  dailyBonusSkipped: () => track("daily_bonus_skipped"),

  // Wallet / Deposits
  depositInitiated: (amount: number, provider: "telebirr" | "cbe") =>
    track("deposit_initiated", { amount, provider }),
  depositApproved: (amount: number, provider: "telebirr" | "cbe", txId: string) =>
    track("deposit_approved", { amount, provider, tx_id: txId }),
  depositRejected: (amount: number, reason: string) =>
    track("deposit_rejected", { amount, reason }),
  withdrawalRequested: (amount: number, provider: "telebirr" | "cbe") =>
    track("withdrawal_requested", { amount, provider }),

  // Referral
  inviteGenerated: (inviteCode: string) =>
    track("invite_generated", { invite_code: inviteCode }),
  inviteShared: (channel: "telegram" | "copy" | "qr") =>
    track("invite_shared", { channel }),
  inviteClicked: (inviteCode: string) =>
    track("invite_clicked", { invite_code: inviteCode }),
  inviteJoined: (inviteCode: string, newUserTelegramId: number) =>
    track("invite_joined", { invite_code: inviteCode, new_user_id: newUserTelegramId }),
  inviteDeposited: (inviteCode: string, amount: number) =>
    track("invite_deposited", { invite_code: inviteCode, amount }),

  // Engagement
  dailyBonusViewed: () => track("daily_bonus_viewed"),
  walletOpened: () => track("wallet_opened"),
  profileOpened: () => track("profile_opened"),
  rulesOpened: () => track("rules_opened"),

  // Errors
  errorOccurred: (source: string, message: string, detail?: string) =>
    track("error_occurred", { source, message, detail: detail ?? "" }),
}