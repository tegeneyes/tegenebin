"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { VolumeX, Users, CheckCircle2, Clock, Languages } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { cn } from "@/lib/utils";
import { ScreenWrapper } from "@/components/bingo/screen-wrapper";
import { getWallet, getReferralStats } from "@/lib/wallet.functions";
import { useTelegramUser } from "@/hooks/use-telegram-user";
import { useI18n, type Lang } from "@/lib/i18n";

interface ProfileScreenProps {
  soundEnabled: boolean;
  onToggleSound: () => void;
  onLogout: () => void;
  username?: string;
  initial?: string;
  mainBalance?: number;
  playBalance?: number;
  gameWin?: number;
  totalInvite?: number;
  totalEarned?: number;
}

export function ProfileScreen({
  soundEnabled,
  onToggleSound,
  username = "Guest",
  initial = "G",
  mainBalance = 0,
  playBalance = 0,
  gameWin = 0,
}: ProfileScreenProps) {
  const tg = useTelegramUser();
  const { t, lang, setLang } = useI18n();
  const fetchWallet = useServerFn(getWallet);
  const fetchReferrals = useServerFn(getReferralStats);
  const [phone, setPhone] = useState<string | null>(null);
  const [referrals, setReferrals] = useState<{
    total_invites: number;
    qualified_invites: number;
    total_earned: number;
    bonus_per_invite: number;
    invites: { telegram_id: number; name: string; deposited: boolean; joined_at: string }[];
  } | null>(null);

  useEffect(() => {
    if (!tg?.id) return;
    fetchWallet({ data: { telegram_id: tg.id } })
      .then((r: any) => setPhone(r?.player?.phone_number ?? null))
      .catch(() => {});
    fetchReferrals({ data: { telegram_id: tg.id } })
      .then((r: any) => setReferrals(r))
      .catch(() => {});
  }, [tg?.id, fetchWallet, fetchReferrals]);

  const avatarUrl = tg?.photo_url;

  return (
    <ScreenWrapper screenKey="profile">
      {/* Avatar + username */}
      <div className="flex flex-col items-center mb-6 mt-2">
        <div className="relative mb-4">
          <div className="w-20 h-20 rounded-2xl bg-bingo-deep-purple border-2 border-bingo-accent flex items-center justify-center shadow-[0_0_30px_-5px_rgba(139,92,246,0.5)] overflow-hidden">
            {avatarUrl ? (
              <img src={avatarUrl} alt={username} className="w-full h-full object-cover" />
            ) : (
              <span className="text-3xl font-black text-white">{initial}</span>
            )}
          </div>
        </div>
        <h2 className="text-xl font-display font-extrabold text-white">
          @{username}
        </h2>
        {tg?.id ? (
          <p className="text-gray-500 text-[10px] font-mono mt-1">ID: {tg.id} {phone ? `· ${phone}` : ""}</p>
        ) : null}
        <p className="text-bingo-accent text-[10px] font-black uppercase tracking-[0.25em] mt-1">
          {t("profile.verified")}
        </p>
      </div>

      {/* Wallet cards */}
      <div className="grid grid-cols-2 gap-3 mb-3">
        <ProfileWalletCard label={t("profile.main_wallet")} value={mainBalance} accent="text-bingo-green" subtitle={t("profile.withdrawable")} subtitleColor="text-bingo-green" />
        <ProfileWalletCard label={t("profile.play_wallet")} value={playBalance} accent="text-bingo-accent" subtitle={t("profile.game_credits")} subtitleColor="text-bingo-accent" />
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <StatCard label={t("profile.game_win")} value={gameWin} color="text-bingo-gold" />
        <StatCard label={t("profile.invites")} value={referrals?.total_invites ?? 0} color="text-blue-400" />
        <StatCard label={t("profile.earned")} value={referrals?.total_earned ?? 0} color="text-bingo-green" />
      </div>

      {/* Referrals list */}
      <div className="bg-white/[0.03] rounded-2xl border border-white/5 p-4 mb-3">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Users size={16} className="text-blue-400" />
            <span className="text-sm font-black text-white uppercase tracking-wider">{t("profile.my_invites")}</span>
          </div>
          <span className="text-[10px] text-gray-400 font-mono">
            {referrals?.qualified_invites ?? 0}/{referrals?.total_invites ?? 0} {t("profile.deposited")}
          </span>
        </div>
        {!referrals || referrals.invites.length === 0 ? (
          <p className="text-center text-gray-500 text-xs py-6">
            {t("profile.no_invites", { n: referrals?.bonus_per_invite ?? 10 })}
          </p>
        ) : (
          <ul className="flex flex-col gap-2 max-h-56 overflow-y-auto">
            {referrals.invites.map((inv) => (
              <li key={inv.telegram_id} className="flex items-center justify-between bg-white/[0.03] rounded-lg px-3 py-2 border border-white/5">
                <div className="flex items-center gap-2 min-w-0">
                  <div className={cn(
                    "w-7 h-7 rounded-full flex items-center justify-center shrink-0",
                    inv.deposited ? "bg-bingo-green/15 text-bingo-green" : "bg-white/5 text-gray-400"
                  )}>
                    {inv.deposited ? <CheckCircle2 size={14} /> : <Clock size={14} />}
                  </div>
                  <span className="text-xs font-semibold text-white truncate">{inv.name}</span>
                </div>
                <span className={cn(
                  "text-[10px] font-black uppercase tracking-wider shrink-0",
                  inv.deposited ? "text-bingo-green" : "text-gray-500"
                )}>
                  {inv.deposited ? `+${referrals.bonus_per_invite} ETB` : t("profile.pending")}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Language row */}
      <div className="bg-white/[0.03] rounded-2xl border border-white/5 p-4 flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-bingo-accent/15 flex items-center justify-center text-bingo-accent">
            <Languages size={18} />
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-bold text-white">{t("profile.language")}</span>
            <span className="text-[10px] text-gray-500">{t("profile.language_sub")}</span>
          </div>
        </div>
        <div className="flex gap-1 rounded-full bg-white/5 border border-white/10 p-0.5">
          {(["en", "am"] as Lang[]).map((l) => (
            <button
              key={l}
              onClick={() => setLang(l)}
              className={cn(
                "px-3 py-1 rounded-full text-[11px] font-bold transition-colors",
                lang === l ? "bg-bingo-gold text-bingo-deep-purple" : "text-white/70 hover:text-white",
              )}
            >
              {l === "en" ? "EN" : "አማ"}
            </button>
          ))}
        </div>
      </div>

      {/* Sound Effects row */}
      <div className="bg-white/[0.03] rounded-2xl border border-white/5 p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-bingo-red/15 flex items-center justify-center text-bingo-red">
            <VolumeX size={18} />
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-bold text-white">{t("profile.sound")}</span>
            <span className="text-[10px] text-gray-500">{t("profile.sound_sub")}</span>
          </div>
        </div>
        <button
          onClick={onToggleSound}
          className={cn(
            "w-12 h-6 rounded-full relative transition-colors p-1",
            soundEnabled ? "bg-bingo-green" : "bg-gray-700",
          )}
          aria-label="Toggle sound effects"
          aria-pressed={soundEnabled}
        >
          <motion.div
            animate={{ x: soundEnabled ? 24 : 0 }}
            className="w-4 h-4 bg-white rounded-full"
          />
        </button>
      </div>
    </ScreenWrapper>
  );
}

function ProfileWalletCard({
  label,
  value,
  accent,
  subtitle,
  subtitleColor,
}: {
  label: string;
  value: number;
  accent: string;
  subtitle: string;
  subtitleColor: string;
}) {
  return (
    <div className="bg-white/[0.03] rounded-2xl border border-white/5 p-4 flex flex-col gap-1">
      <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
        {label}
      </span>
      <p className="text-white font-mono text-2xl font-extrabold leading-none mt-1">
        {value} <span className={`text-xs font-bold ${accent}`}>ETB</span>
      </p>
      <span className={`text-[10px] font-semibold mt-1 ${subtitleColor}`}>
        {subtitle}
      </span>
    </div>
  );
}

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="bg-white/[0.03] rounded-2xl border border-white/5 p-3 flex flex-col items-center gap-1">
      <span className="text-[9px] font-black text-gray-500 uppercase tracking-widest">
        {label}
      </span>
      <span className={`text-2xl font-mono font-extrabold ${color}`}>
        {value}
      </span>
    </div>
  );
}
