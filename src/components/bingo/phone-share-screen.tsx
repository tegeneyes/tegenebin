"use client"

import { useRef, useState } from "react"
import { motion } from "framer-motion"
import { Shield } from "lucide-react"
import { toast } from "sonner"
import { useServerFn } from "@tanstack/react-start"
import { getWallet } from "@/lib/wallet.functions"
import { useI18n, type Lang } from "@/lib/i18n"

const DEV_PHONE_BYPASS_KEY = "liyu-phone-dev-bypass"

function isDevPhoneBypassAllowed() {
  if (import.meta.env.DEV) return true
  if (typeof window === "undefined") return false
  const host = window.location.hostname
  return (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host.startsWith("id-preview--") ||
    /^project--.+-dev\./.test(host)
  )
}

export function PhoneShareScreen({
  telegramId,
  firstName,
  onSaved,
}: {
  telegramId: number
  firstName?: string
  onSaved: (phone: string) => void
}) {
  const { t, lang, setLang } = useI18n()
  const [saving, setSaving] = useState(false)
  const [contactStatus, setContactStatus] = useState<"idle" | "checking">("idle")
  const cancelledRef = useRef(false)
  const fetchWallet = useServerFn(getWallet)

  const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

  // Poll the wallet until the bot webhook has persisted the shared number.
  // The Telegram `requestContact` callback is unreliable and can fire before the
  // contact update reaches our bot, so we never depend on it alone.
  const pollForSavedPhone = async () => {
    setContactStatus("checking")
    setSaving(true)
    try {
      for (let i = 0; i < 15; i++) {
        if (i > 0) await wait(800)
        if (cancelledRef.current) return
        try {
          const wallet = await fetchWallet({ data: { telegram_id: telegramId } })
          const savedPhone = (wallet.player as { phone_number?: string | null } | null)?.phone_number
          if (savedPhone) {
            onSaved(savedPhone)
            return
          }
        } catch {
          // transient error — keep polling
        }
      }
      if (!cancelledRef.current) toast.error(t("phone.read_fail"))
    } finally {
      setSaving(false)
      setContactStatus("idle")
    }
  }

  const requestTelegramContact = () => {
    cancelledRef.current = false
    const tg = typeof window !== "undefined" ? window.Telegram?.WebApp : undefined
    if (!tg?.requestContact) {
      toast.error(t("phone.not_avail"))
      // The number may already have been shared through the bot's keyboard button.
      void pollForSavedPhone()
      return
    }
    try {
      tg.requestContact((ok) => {
        if (!ok) {
          cancelledRef.current = true
          toast.info(t("phone.cancelled"))
          return
        }
        toast.success(t("phone.shared_saving"))
      })
    } catch {
      toast.error(t("phone.not_avail"))
      return
    }
    // Advance as soon as the saved number shows up, even if the callback never fires.
    void pollForSavedPhone()
  }

  const skipInDev = () => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(DEV_PHONE_BYPASS_KEY, "1")
    }
    onSaved("dev-bypass")
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex flex-col h-dvh w-full font-sans select-none max-w-[430px] mx-auto overflow-hidden relative"
      style={{ background: "#0E0820" }}
    >
      {/* Ambient grain + spot light */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_18%,rgba(232,181,71,0.18),transparent_60%)] pointer-events-none" />
      <div
        className="absolute inset-0 opacity-[0.06] pointer-events-none mix-blend-overlay"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence baseFrequency='0.9'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")",
        }}
      />

      {/* Language toggle — quiet, top-right */}
      <div className="absolute top-5 right-5 z-20 flex gap-3 text-[10px] font-bold tracking-[0.25em]">
        {(["en", "am"] as Lang[]).map((l) => (
          <button
            key={l}
            onClick={() => setLang(l)}
            className={`transition-colors ${
              lang === l ? "text-[#E8B547]" : "text-white/30 hover:text-white/60"
            }`}
          >
            {l === "en" ? "EN" : "አማ"}
          </button>
        ))}
      </div>

      {/* Eyebrow — top-left */}
      <div className="absolute top-5 left-5 z-20 flex items-center gap-2">
        <span className="block w-6 h-px bg-[#E8B547]" />
        <span className="text-[10px] font-bold tracking-[0.3em] text-[#E8B547] uppercase">
          {lang === "am" ? "ማረጋገጫ" : "Verification"}
        </span>
      </div>

      <div className="relative z-10 flex-1 flex flex-col justify-between px-7 pt-24 pb-8">
        {/* Hero: the bingo ball */}
        <div className="flex-1 flex flex-col items-center justify-center">
          <motion.div
            initial={{ scale: 0.7, rotate: -8 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 140, damping: 16 }}
            className="relative"
          >
            {/* Outer ring shadow */}
            <div
              className="w-[240px] h-[240px] rounded-full relative"
              style={{
                background:
                  "radial-gradient(circle at 32% 28%, #FFF3D1 0%, #E8B547 35%, #8A5A12 88%, #3A2306 100%)",
                boxShadow:
                  "0 30px 60px -20px rgba(0,0,0,0.7), inset -18px -22px 40px rgba(0,0,0,0.45), inset 14px 16px 30px rgba(255,236,180,0.35)",
              }}
            >
              {/* Inner white circle (bingo ball face) */}
              <div
                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[150px] h-[150px] rounded-full flex flex-col items-center justify-center"
                style={{
                  background:
                    "radial-gradient(circle at 40% 35%, #FFFDF5 0%, #F5E9C9 70%, #D9C496 100%)",
                  boxShadow: "inset 0 4px 12px rgba(0,0,0,0.15)",
                }}
              >
                <span
                  className="text-[12px] font-extrabold tracking-[0.4em] text-[#8A5A12]"
                  style={{ fontFamily: "'Bebas Neue', sans-serif" }}
                >
                  {lang === "am" ? "ስልክ" : "PHONE"}
                </span>
                <span
                  className="text-[78px] leading-none font-black text-[#0E0820]"
                  style={{ fontFamily: "'Bebas Neue', sans-serif" }}
                >
                  ?
                </span>
              </div>

              {/* Highlight glint */}
              <div className="absolute top-4 left-8 w-16 h-10 rounded-full bg-white/40 blur-md" />
            </div>
          </motion.div>

          {/* Headline */}
          <h1
            className="mt-10 text-center text-white leading-[0.85] tracking-tight"
            style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: "44px" }}
          >
            {firstName ? (
              <>
                {lang === "am" ? "ሰላም" : "Hello"},{" "}
                <span className="text-[#E8B547]">{firstName}</span>
              </>
            ) : lang === "am" ? (
              "አንድ ጥሪ ይቀራል"
            ) : (
              "One last call"
            )}
          </h1>
          <p className="mt-3 text-center text-[13px] text-white/55 leading-relaxed max-w-[280px]">
            {t("phone.desc")}
          </p>
        </div>

        {/* CTA — quiet outlined pill, not gradient */}
        <div className="flex flex-col gap-4">
          <button
            onClick={requestTelegramContact}
            disabled={saving}
            className="group w-full py-5 rounded-none border-y-2 border-[#E8B547] text-[#E8B547] font-extrabold tracking-[0.3em] text-sm uppercase relative overflow-hidden disabled:opacity-50 disabled:cursor-not-allowed transition-colors hover:bg-[#E8B547] hover:text-[#0E0820]"
            style={{ fontFamily: "'Bebas Neue', sans-serif", letterSpacing: "0.35em" }}
          >
            <span className="relative z-10">
              {saving
                ? contactStatus === "checking"
                  ? t("phone.checking_tg")
                  : t("phone.saving")
                : lang === "am"
                  ? "ስልክ ቁጥር አጋራ →"
                  : "Share Contact →"}
            </span>
          </button>

          <div className="flex items-center justify-center gap-2 text-[10px] text-white/35 tracking-wide">
            <Shield size={11} className="text-[#E8B547]/60" />
            <span>{t("phone.privacy")}</span>
          </div>

          {isDevPhoneBypassAllowed() && (
            <button
              onClick={skipInDev}
              className="text-[10px] text-white/30 hover:text-[#E8B547] underline tracking-wider self-center"
            >
              skip (dev)
            </button>
          )}
        </div>
      </div>
    </motion.div>
  )
}
