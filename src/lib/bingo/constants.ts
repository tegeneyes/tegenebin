import type { RecentGame, TopPlayer } from "./types"

export const BINGO_COLUMNS: Record<string, [number, number]> = {
  B: [1, 15],
  I: [16, 30],
  N: [31, 45],
  G: [46, 60],
  O: [61, 75],
}

export const MOCK_RECENT_GAMES: RecentGame[] = []

export const MOCK_TOP_PLAYERS_DAILY: TopPlayer[] = []

export const MOCK_TOP_PLAYERS_WEEKLY: TopPlayer[] = []

export const INITIAL_GAME_STATS = {
  gameId: "",
  players: 0,
  bet: 0,
  derash: 0,
  calledCount: 0,
}