"use client";

import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { cn } from "@/lib/utils";
import type { ScoreFilter } from "@/lib/bingo/types";
import { ScreenWrapper } from "@/components/bingo/screen-wrapper";
import { getLeaderboard } from "@/lib/game.functions";
import { useI18n } from "@/lib/i18n";

interface ScoresScreenProps {
  scoreFilter: ScoreFilter;
  onScoreFilterChange: (filter: ScoreFilter) => void;
}

type Player = { name: string; wins: number; winnings: number };

export function ScoresScreen({ scoreFilter, onScoreFilterChange }: ScoresScreenProps) {
  const { t } = useI18n();
  const fetchLeaderboard = useServerFn(getLeaderboard);
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetchLeaderboard({ data: { period: scoreFilter } })
      .then((r) => setPlayers(r as Player[]))
      .catch((e) => console.error(e))
      .finally(() => setLoading(false));
  }, [scoreFilter, fetchLeaderboard]);

  return (
    <ScreenWrapper screenKey="scores">
      <h2 className="text-xl font-display font-bold mb-6">{t("scores.title")}</h2>

      <div className="flex gap-2 mb-6 p-1 bg-white/5 rounded-xl border border-white/5">
        <button
          onClick={() => onScoreFilterChange("daily")}
          className={cn(
            "flex-1 py-1.5 rounded-lg text-xs font-bold transition-all",
            scoreFilter === "daily" ? "bg-white/10 text-white" : "text-white/40",
          )}
        >
          {t("scores.daily")}
        </button>
        <button
          onClick={() => onScoreFilterChange("weekly")}
          className={cn(
            "flex-1 py-1.5 rounded-lg text-xs font-bold transition-all",
            scoreFilter === "weekly" ? "bg-white/10 text-white" : "text-white/40",
          )}
        >
          {t("scores.weekly")}
        </button>
      </div>

      {loading ? (
        <div className="text-center py-16 text-white/40 text-sm">{t("scores.loading")}</div>
      ) : players.length === 0 ? (
        <div className="text-center py-16 text-white/40 text-sm">
          {t("scores.empty")}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {players.map((player, i) => (
            <div
              key={`${player.name}-${i}`}
              className="flex items-center justify-between bg-white/5 p-4 rounded-2xl border border-white/5 backdrop-blur-sm"
            >
              <div className="flex items-center gap-4">
                <div
                  className={cn(
                    "w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black",
                    i === 0 ? "bg-bingo-gold text-black"
                      : i === 1 ? "bg-gray-300 text-black"
                      : i === 2 ? "bg-orange-600 text-white"
                      : "bg-white/10 text-white/40",
                  )}
                >
                  {i + 1}
                </div>
                <span className="text-sm font-bold text-gray-200">{player.name}</span>
              </div>
              <div className="flex flex-col items-end">
                <span className="text-sm font-mono font-bold text-bingo-gold">{player.wins}</span>
                <span className="text-[8px] text-gray-500 font-bold uppercase">{t("scores.games_won")}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </ScreenWrapper>
  );
}
