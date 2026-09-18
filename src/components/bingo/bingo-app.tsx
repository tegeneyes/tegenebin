"use client";

import { AnimatePresence } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { useBingoGame } from "@/hooks/use-bingo-game";
import { useTelegramUser, isTelegramWebApp } from "@/hooks/use-telegram-user";
import { useLobbyPresence } from "@/hooks/use-lobby-presence";
import { ensurePlayer, getWallet } from "@/lib/wallet.functions";
import { finishGame, startGame } from "@/lib/game.functions";
import { isAdminId } from "@/lib/admin";
import type { Cartela } from "@/lib/bingo/types";
import { BottomNav } from "@/components/bingo/bottom-nav";

import { HomeScreen } from "@/components/bingo/screens/home-screen";
import { GameScreen } from "@/components/bingo/screens/game-screen";
import { ScoresScreen } from "@/components/bingo/screens/scores-screen";
import { HistoryScreen } from "@/components/bingo/screens/history-screen";
import { WalletScreen } from "@/components/bingo/screens/wallet-screen";
import { ProfileScreen } from "@/components/bingo/screens/profile-screen";
import { RulesScreen } from "@/components/bingo/screens/rules-screen";
import { CartelaSelectionScreen } from "@/components/bingo/screens/cartela-selection-screen";
import { paddedCount } from "@/lib/bingo/fake-players";

import { LoadingOverlay } from "@/components/bingo/loading-overlay";
import { WinModal } from "@/components/bingo/win-modal";
import { SplashScreen } from "@/components/bingo/splash-screen";
import { PhoneShareScreen } from "@/components/bingo/phone-share-screen";
import { TelegramRequiredScreen } from "@/components/bingo/telegram-required-screen";
import { useTelegramGate } from "@/hooks/use-telegram-gate";
import { I18nProvider, useI18n } from "@/lib/i18n";

function hasDevPhoneBypass() {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname;
  return (
    import.meta.env.DEV ||
    host === "localhost" ||
    host === "127.0.0.1" ||
    host.startsWith("id-preview--") ||
    /^project--.+-dev\./.test(host)
  );
}

export function BingoApp() {
  return (
    <I18nProvider>
      <BingoAppInner />
    </I18nProvider>
  );
}

function BingoAppInner() {
  const { t } = useI18n();
  const game = useBingoGame();
  const tg = useTelegramUser();
  const gate = useTelegramGate();
  const ensure = useServerFn(ensurePlayer);
  const fetchWallet = useServerFn(getWallet);
  const recordGame = useServerFn(finishGame);
  const debitStake = useServerFn(startGame);
  const recordedGameRef = useRef<string | null>(null);
  const PRIZE_MULTIPLIER = 0.7; // 30% house cut

  const [splashDone, setSplashDone] = useState(false);
  const [hasPhone, setHasPhone] = useState<boolean | null>(() => (hasDevPhoneBypass() ? true : null));

  const presenceEnabled = game.gameMode === "selecting" || game.gameMode === "playing" || game.gameMode === "watching";
  const livePlayers = useLobbyPresence({
    telegramId: tg?.id,
    stake: game.stake,
    enabled: presenceEnabled,
    username: tg?.username || tg?.first_name,
  });

  const [bonusBalance, setBonusBalance] = useState(0);

  const refreshWallet = async () => {
    if (!tg) return;
    try {
      const w = await fetchWallet({ data: { telegram_id: tg.id } });
      const p = w.player as { balance: number; bonus_balance: number } | null;
      if (p) {
        game.setWallet({ mainBalance: Number(p.balance), playBalance: Number(p.balance) });
        setBonusBalance(Number(p.bonus_balance || 0));
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleConfirmCartelas = async (selected: Cartela[]) => {
    if (!tg) {
      game.handleSelectCartelas(selected);
      return;
    }
    const totalStake = selected.length * game.stake;
    try {
      const res = await debitStake({ data: { telegram_id: tg.id, total_stake: totalStake } });
      game.setWallet({ mainBalance: res.balance, playBalance: res.balance });
      // Bonus is consumed first server-side; mirror it locally.
      setBonusBalance(b => Math.max(0, b - totalStake));
      game.handleSelectCartelas(selected);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to start game";
      const low = msg.toLowerCase();
      if (low.includes("banned")) {
        toast.error(t("toast.suspended"));
        game.handleWatchGame();
      } else if (low.includes("insufficient")) {
        toast.error(t("toast.insufficient"));
        game.handleWatchGame();
      } else {
        toast.error(msg);
      }
    }
  };

  useEffect(() => {
    if (!tg) return;
    (async () => {
      try {
        await ensure({
          data: {
            telegram_id: tg.id,
            first_name: tg.first_name,
            username: tg.username,
            photo_url: tg.photo_url,
            referred_by: tg.start_param ?? null,
          },
        });
        const w = await fetchWallet({ data: { telegram_id: tg.id } });
        const p = w.player as { balance: number; bonus_balance: number; phone_number: string | null } | null;
        if (p) {
          game.setWallet({ mainBalance: Number(p.balance), playBalance: Number(p.balance) });
          setBonusBalance(Number(p.bonus_balance || 0));
        }
        setHasPhone((current) => current || hasDevPhoneBypass() || isAdminId(tg.id) || !!p?.phone_number);
      } catch (e) {
        console.error(e);
        setHasPhone((current) => current || hasDevPhoneBypass() || isAdminId(tg.id));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tg?.id]);

  // If the contact was shared but the screen didn't advance, re-check whenever
  // the mini app regains focus (covers the bot-update arriving late).
  useEffect(() => {
    if (hasPhone !== false || !tg) return;
    const recheck = async () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      try {
        const w = await fetchWallet({ data: { telegram_id: tg.id } });
        const p = w.player as { phone_number?: string | null } | null;
        if (p?.phone_number) setHasPhone(true);
      } catch {
        /* ignore */
      }
    };
    document.addEventListener("visibilitychange", recheck);
    window.addEventListener("focus", recheck);
    return () => {
      document.removeEventListener("visibilitychange", recheck);
      window.removeEventListener("focus", recheck);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasPhone, tg?.id]);

  // Record the player's result whenever their selected game ends.
  useEffect(() => {
    if (!game.showWinModal || !game.winningCartela || !tg || game.cartelas.length === 0) return;
    const key = `${tg.id}-${game.winningCartela.id}-${game.calledNumbers.length}`;
    if (recordedGameRef.current === key) return;
    recordedGameRef.current = key;
    const totalStake = game.cartelas.length * game.stake;
    const prize = game.winnerIsCurrentUser
      ? Math.round(totalStake * PRIZE_MULTIPLIER * 100) / 100
      : 0;
    recordGame({
      data: {
        stake: game.stake,
        called_numbers: game.calledNumbers,
        prize_pool: prize,
        winner_telegram_id: game.winnerIsCurrentUser ? tg.id : null,
        winner_cartela_id: game.winnerIsCurrentUser ? game.winningCartela.id : null,
        participants: game.cartelas.map((c) => ({
          telegram_id: tg.id,
          username: tg.username || tg.first_name || null,
          cartela_id: c.id,
          is_winner: game.winnerIsCurrentUser && c.id === game.winningCartela!.id,
          payout: game.winnerIsCurrentUser && c.id === game.winningCartela!.id ? prize : 0,
        })),
      },
    })
      .then(() => refreshWallet())
      .catch((e) => console.error("record game failed", e));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.showWinModal, game.winningCartela?.id]);

  const showGame = (game.gameMode === "playing" || game.gameMode === "watching") && game.activeTab === "game";
  const showHome = game.gameMode === "lobby" && game.activeTab === "game";
  const showSelection = game.gameMode === "selecting" && game.activeTab === "game";

  const showRules = game.activeTab === "rules";
  const showHeader = showHome;

  const handleBackFromRules = () => {
    game.setActiveTab("game");
  };

  // Splash screen (always shown briefly on app load)
  if (!splashDone || gate.state === "checking") {
    return <SplashScreen onDone={() => setSplashDone(true)} />;
  }

  // Only allow the game inside a real Telegram Mini App session.
  if (gate.state === "out") {
    return <TelegramRequiredScreen reason={gate.reason} />;
  }

  // Ask for phone number once, before entering the app. Only meaningful with a
  // real Telegram identity — a browser/preview session has no shareable contact.
  if (tg && hasPhone === false && isTelegramWebApp()) {
    return <PhoneShareScreen telegramId={tg.id} firstName={tg.first_name} onSaved={() => setHasPhone(true)} />;
  }

  // Cartela Selection Screen
  if (showSelection) {
    return (
      <div className="flex flex-col h-dvh w-full bg-bingo-deep-purple font-sans select-none max-w-[430px] mx-auto overflow-hidden relative border-x border-white/5">
        <CartelaSelectionScreen
          onBack={game.handleBackFromSelection}
          onConfirm={handleConfirmCartelas}
          onWatch={game.handleWatchGame}
          onTopUp={() => { game.handleBackFromSelection(); game.setActiveTab("wallet"); }}
          stake={game.stake}
          playBalance={game.wallet.playBalance}
          mainBalance={game.wallet.mainBalance}
          selectionEndsAt={game.selectionEndsAt}
          livePlayers={paddedCount(livePlayers, `selecting:${game.stake}`)}
        />
      </div>
    );
  }

  // Rules Screen
  if (showRules) {
    return (
      <div className="flex flex-col h-dvh w-full bg-bingo-deep-purple font-sans select-none max-w-[430px] mx-auto overflow-hidden relative border-x border-white/5">
        <RulesScreen onBack={handleBackFromRules} />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-dvh w-full bg-bingo-deep-purple font-sans select-none max-w-[430px] mx-auto overflow-hidden relative border-x border-white/5">
      {showHeader && (
        <header className="px-6 pt-5 pb-2 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-display font-extrabold tracking-wide text-white">ልዩ BINGO</h1>
          </div>

          <button
            onClick={() => game.setActiveTab("rules")}
            className="bg-white/5 px-4 py-1.5 rounded-full text-xs font-semibold border border-white/10 backdrop-blur-md text-gray-100 hover:bg-white/10 transition-colors"
          >
            {t("header.rules")}
          </button>
        </header>
      )}

      <AnimatePresence mode="wait">
        {showHome && (
          <HomeScreen
            key="home"
            onPlay={game.handlePlayClick}
            onWatch={() => toast.info(t("home.no_live"))}
            walletBalance={game.wallet.playBalance}
            bonusBalance={bonusBalance}
          />
        )}

        {showGame && (
          <GameScreen
            key="game"
            card={game.card}
            cartelas={game.cartelas}
            activeCartelaIndex={game.activeCartelaIndex}
            onSwitchCartela={game.switchCartela}
            calledNumbers={game.calledNumbers}
            gameStats={{
              ...game.gameStats,
              players: Math.max(1, livePlayers),
              derash: Math.round(Math.max(1, livePlayers) * game.stake * 0.7),
            }}
            automatic={game.automatic}
            soundEnabled={game.soundEnabled}
            isWatching={game.isWatching}
            onToggleAutomatic={() => game.setAutomatic(!game.automatic)}
            onToggleSound={() => game.setSoundEnabled(!game.soundEnabled)}
            onCellClick={game.handleCellClick}
            onLeave={game.leaveGame}
            onRefresh={game.refreshCalled}
            onNextNumber={game.callNextNumber}
          />
        )}

        {game.activeTab === "scores" && (
          <ScoresScreen key="scores" scoreFilter={game.scoreFilter} onScoreFilterChange={game.setScoreFilter} />
        )}

        {game.activeTab === "history" && <HistoryScreen key="history" />}

        {game.activeTab === "wallet" && <WalletScreen key="wallet" />}

        {game.activeTab === "profile" && (
          <ProfileScreen
            key="profile"
            soundEnabled={game.soundEnabled}
            onToggleSound={() => game.setSoundEnabled(!game.soundEnabled)}
            onLogout={game.logout}
            username={tg?.username || tg?.first_name || "Guest"}
            initial={(tg?.first_name || tg?.username || "G").charAt(0).toUpperCase()}
            mainBalance={game.wallet.mainBalance}
            playBalance={game.wallet.playBalance}
          />
        )}
      </AnimatePresence>

      {!showGame && <BottomNav activeTab={game.activeTab} onChange={game.setActiveTab} />}

      <LoadingOverlay visible={game.loading} />

      <WinModal
        visible={game.showWinModal}
        winningCartela={game.winningCartela}
        timer={game.timer}
        winnerName={game.winningDisplayName ?? (tg?.username ? `@${tg.username}` : tg?.first_name || "YOU")}
        onBackToLobby={game.closeWinAndReturnToLobby}
      />
    </div>
  );
}
