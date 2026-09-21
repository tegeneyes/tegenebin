"use client";

import { AnimatePresence } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { useBingoGame, currentRound } from "@/hooks/use-bingo-game";
import { useTelegramUser, isTelegramWebApp } from "@/hooks/use-telegram-user";
import { useLobbyPresence } from "@/hooks/use-lobby-presence";
import { useRoundCartelas } from "@/hooks/use-round-cartelas";
import { supabase } from "@/integrations/supabase/client";
import { ensurePlayer, getWallet } from "@/lib/wallet.functions";
import { finishGame, startGame, getGameResult } from "@/lib/game.functions";
import { reserveCartela, releaseCartela, getRoundCartelas, getRoundPlayerCount } from "@/lib/cartela.functions";
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
import { LoadingOverlay } from "@/components/bingo/loading-overlay";
import { WinModal } from "@/components/bingo/win-modal";
import { SplashScreen } from "@/components/bingo/splash-screen";
import { PhoneShareScreen } from "@/components/bingo/phone-share-screen";
import { TelegramRequiredScreen } from "@/components/bingo/telegram-required-screen";
import { useTelegramGate } from "@/hooks/use-telegram-gate";
import { installGlobalErrorHandlers, reportError } from "@/lib/error-log";
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
  const tg = useTelegramUser();
  const game = useBingoGame(tg?.id);
  const gate = useTelegramGate();
  const ensure = useServerFn(ensurePlayer);
  const fetchWallet = useServerFn(getWallet);
  const recordGame = useServerFn(finishGame);
  const debitStake = useServerFn(startGame);
  const doReserve = useServerFn(reserveCartela);
  const doRelease = useServerFn(releaseCartela);
  const fetchPlayerCount = useServerFn(getRoundPlayerCount);
  const recordedGameRef = useRef<string | null>(null);
  const PRIZE_MULTIPLIER = 0.7; // 30% house cut

  const [splashDone, setSplashDone] = useState(false);
  const [hasPhone, setHasPhone] = useState<boolean | null>(() => (hasDevPhoneBypass() ? true : null));

  // Report uncaught client errors to the admin panel.
  useEffect(() => installGlobalErrorHandlers(), []);

  const presenceEnabled = game.gameMode === "selecting" || game.gameMode === "playing" || game.gameMode === "watching";
  const livePlayers = useLobbyPresence({
    telegramId: tg?.id,
    stake: game.stake,
    enabled: presenceEnabled,
    username: tg?.username || tg?.first_name,
  });

  // Real-time cartela tracking for the current round
  const roundCartelas = useRoundCartelas({
    roundIndex: game.roundIndex,
    stake: game.stake,
    telegramId: tg?.id,
    enabled: game.gameMode === "selecting" || game.gameMode === "playing" || game.gameMode === "watching",
  });

  // Real-time finish broadcast: when ANY client records a game row for this
  // round (early bingo < 20 calls, or a normal finish), everyone in the round —
  // players AND watchers — converges on the result. This is what stops the
  // calls for a winner that happened before the 20th number.
  useEffect(() => {
    if (game.gameMode !== "playing" && game.gameMode !== "watching") return;
    if (game.roundIndex < 0 || game.stake <= 0) return;

    const applyResult = async (round: number, basisStake: number) => {
      try {
        const res = await getGameResult({ data: { round_index: round, stake: basisStake } });
        if (res) game.setGameResult(res);
      } catch { /* realtime result polling is best-effort */ }
    };

    // If the game already finished before we subscribed (late join), catch up.
    applyResult(game.roundIndex, game.stake);

    // postgres_changes supports a single equality filter; stake is checked in
    // the handler because both 10 ETB and 20 ETB rounds share the same index.
    const channel = supabase
      .channel(`games:${game.roundIndex}:${game.stake}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "games",
          filter: `round_index=eq.${game.roundIndex}`,
        },
        (payload) => {
          const row = payload.new as { stake?: number } | null;
          if (row && Number(row.stake) === game.stake) {
            applyResult(game.roundIndex, game.stake);
          }
        },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.gameMode, game.roundIndex, game.stake]);

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

  const releaseCartelas = async (cartelas: Cartela[]) => {
    if (!tg) return;
    for (const c of cartelas) {
      try {
        await doRelease({ data: {
          round_index: game.roundIndex,
          stake: game.stake,
          telegram_id: tg.id,
          cartela_id: c.id,
        }});
      } catch { /* best effort */ }
    }
  };

  const handleConfirmCartelas = async (selected: Cartela[]) => {
    if (!tg) {
      game.handleSelectCartelas(selected);
      return;
    }
    const totalStake = selected.length * game.stake;
    if (!Number.isFinite(totalStake) || !Number.isFinite(game.roundIndex)) {
      const detail = `total_stake=${JSON.stringify(totalStake)} stake=${JSON.stringify(game.stake)} round_index=${JSON.stringify(game.roundIndex)} cartelas=${selected.length}`;
      console.error("startGame received non-finite values:", detail);
      reportError({ source: "game.stake.guard", message: `client guard: ${detail}`, detail });
      toast.error(t("toast.invalid_state"));
      game.handleWatchGame();
      return;
    }
    try {
      let res: Awaited<ReturnType<typeof debitStake>> | undefined;
      let lastError: unknown;
      for (let attempt = 0; attempt < 4; attempt += 1) {
        try {
          res = await debitStake({ data: { telegram_id: tg.id, total_stake: totalStake, round_index: game.roundIndex, stake: game.stake } });
          break;
        } catch (e) {
          lastError = e;
          const msg = e instanceof Error ? e.message.toLowerCase() : "";
          if (!msg.includes("need_players") || attempt === 3) throw e;
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
      if (!res) throw lastError instanceof Error ? lastError : new Error("Failed to start game");
      game.setWallet({ mainBalance: res.balance, playBalance: res.balance });
      // Bonus is consumed first server-side; mirror it locally.
      setBonusBalance(b => Math.max(0, b - totalStake));
      game.handleSelectCartelas(selected, res.players);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to start game";
      const low = msg.toLowerCase();
      if (low.includes("need_players")) {
        // Multiplayer gate: not enough players in this round — hop into the
        // next selection window so the player can reserve cartelas again.
        await releaseCartelas(selected);
        toast.error(t("toast.need_players"));
        game.joinNextSelection(game.stake);
      } else if (low.includes("banned")) {
        toast.error(t("toast.suspended"));
        game.handleWatchGame();
      } else if (low.includes("insufficient")) {
        toast.error(t("toast.insufficient"));
        game.handleWatchGame();
      } else {
        toast.error(msg);
        // Attach the exact client values so the next NaN/numeric error is attributable.
        reportError({
          source: "game.stake",
          message: msg,
          detail: `values total_stake=${JSON.stringify(totalStake)} stake=${JSON.stringify(game.stake)} round_index=${JSON.stringify(game.roundIndex)} cartelas=${selected.length}\n` + ((e as Error)?.stack ?? ""),
        });
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
        reportError({ source: "wallet.load", message: (e as Error)?.message ?? "wallet load failed", detail: (e as Error)?.stack });
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
    if (!game.showWinModal || !tg || game.cartelas.length === 0) return;
    const winKey = game.winningCartela?.id ?? "none"
    const key = `${tg.id}-${winKey}-${game.calledNumbers.length}`;
    if (recordedGameRef.current === key) return;
    recordedGameRef.current = key;

    // Fetch all participants in this round from round_cartelas
    const fetchParticipants = async () => {
      try {
        const rows = await getRoundCartelas({ data: {
          round_index: game.roundIndex,
          stake: game.stake,
        }}) as Array<{ cartela_id: number; telegram_id: number }>

        // Build participant list from round_cartelas
        const winningCartelaId = game.winningCartela?.id ?? null
        const isWinner = game.winnerIsCurrentUser && winningCartelaId !== null
        const participants = rows.map(r => ({
          telegram_id: r.telegram_id,
          username: r.telegram_id === tg.id ? (tg.username || tg.first_name || null) : null,
          cartela_id: r.cartela_id,
          is_winner: isWinner && r.telegram_id === tg.id && r.cartela_id === winningCartelaId,
          payout: isWinner && r.telegram_id === tg.id && r.cartela_id === winningCartelaId
            ? Math.round(rows.length * game.stake * PRIZE_MULTIPLIER * 100) / 100
            : 0,
        }))

        // If no round_cartelas found (fallback), use own cartelas
        if (participants.length === 0) {
          for (const c of game.cartelas) {
            participants.push({
              telegram_id: tg.id,
              username: tg.username || tg.first_name || null,
              cartela_id: c.id,
              is_winner: isWinner && c.id === winningCartelaId,
              payout: isWinner && c.id === winningCartelaId
                ? Math.round(game.cartelas.length * game.stake * PRIZE_MULTIPLIER * 100) / 100
                : 0,
            })
          }
        }

        const totalParticipants = participants.length
        const prizePool = isWinner
          ? Math.round(totalParticipants * game.stake * PRIZE_MULTIPLIER * 100) / 100
          : 0

        await recordGame({
          data: {
            round_index: game.roundIndex,
            stake: game.stake,
            called_numbers: game.calledNumbers,
            prize_pool: prizePool,
            winner_telegram_id: isWinner ? tg.id : null,
            winner_cartela_id: winningCartelaId,
            participants,
          },
        })
        await refreshWallet()
      } catch (e) {
        console.error("record game failed", e);
        reportError({ source: "game.record", message: (e as Error)?.message ?? "record game failed", detail: (e as Error)?.stack });
      }
    }
    fetchParticipants()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.showWinModal, game.winningCartela?.id]);

  // Release all reserved cartelas when the player returns to lobby.
  // This covers: leaving selection, leaving game, round end.
  useEffect(() => {
    if (game.gameMode !== "lobby" || !tg || game.cartelas.length === 0) return;
    // Release in background — best effort
    for (const c of game.cartelas) {
      doRelease({ data: {
        round_index: game.roundIndex,
        stake: game.stake,
        telegram_id: tg.id,
        cartela_id: c.id,
      }}).catch(() => {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.gameMode]);

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
          onWatch={async () => {
            let players: number | undefined;
            try {
              players = await fetchPlayerCount({ data: { round_index: game.roundIndex, stake: game.stake } });
            } catch { /* fallback to stale stats */ }
            if ((players ?? 0) < 2) {
              toast.error(t("toast.need_players"));
              return;
            }
            game.handleWatchGame(players);
          }}
          onTopUp={() => { game.handleBackFromSelection(); game.setActiveTab("wallet"); }}
          stake={game.stake}
          playBalance={game.wallet.playBalance}
          mainBalance={game.wallet.mainBalance}
          selectionEndsAt={game.selectionEndsAt}
          selectionStartsAt={game.selectionStartsAt}
          livePlayers={roundCartelas.playerCount}
          isTakenByOthers={(id) => roundCartelas.isTaken(id) && !game.cartelas.some(c => c.id === id)}
          onReserve={tg ? async (cartelaId) => {
            await doReserve({ data: {
              round_index: game.roundIndex,
              stake: game.stake,
              telegram_id: tg.id,
              username: tg.username || tg.first_name,
              cartela_id: cartelaId,
            }})
          } : undefined}
          onRelease={tg ? async (cartelaId) => {
            await doRelease({ data: {
              round_index: game.roundIndex,
              stake: game.stake,
              telegram_id: tg.id,
              cartela_id: cartelaId,
            }})
          } : undefined}
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
            onPlay={async (s) => {
              const round = currentRound(Date.now(), s)
              if (round.phase === "calling") {
                // A live game: watch it. Otherwise hop into selection for the
                // next round so the player can reserve cartelas immediately —
                // that's how other players see seats filling up.
                try {
                  const count = await fetchPlayerCount({ data: { round_index: round.index, stake: s } })
                  if (Number(count) >= 2) {
                    game.handlePlayClick(s)
                    return
                  }
                } catch {
                  /* fall through */
                }
                game.joinNextSelection(s)
                return
              }
              game.handlePlayClick(s)
            }}
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
              gameId: game.gameStats.gameId || `R-${game.roundIndex}`,
              players: game.gameStats.players || roundCartelas.playerCount,
              derash: Math.round((game.gameStats.players || roundCartelas.playerCount) * game.stake * 0.7),
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
        prize={game.gameResult?.winnerTelegramId != null && !game.winningCartela ? String(Math.round(game.gameResult.prizePool ?? 0)) : undefined}
        winnerName={game.winningDisplayName ?? (tg?.username ? `@${tg.username}` : tg?.first_name || "YOU")}
        onBackToLobby={game.closeWinAndReturnToLobby}
      />
    </div>
  );
}
