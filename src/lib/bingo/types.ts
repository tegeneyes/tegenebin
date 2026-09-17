export interface BingoCell {
  number: number | "FREE"
  marked: boolean
  called: boolean
}

export interface Cartela {
  id: number
  card: BingoCell[][]
  markedCount?: number
  selectedByOthers?: boolean
}

export type TabType = "game" | "scores" | "history" | "wallet" | "profile" | "rules"

export interface GameStats {
  gameId: string
  players: number
  bet: number
  derash: number
  calledCount: number
}

export interface RecentGame {
  id: string
  date: string
  stake: number
  cards: number
  prize: number
  winners: number
  status: "Win" | "Lost"
}

export interface Transaction {
  id: string
  date: string
  amount: number
  type: "Deposit" | "Withdraw" | "Win" | "Stake"
}

export interface TopPlayer {
  name: string
  wins: number
}

export type ScoreFilter = "daily" | "weekly"

// New types for game state
export type GameMode = "lobby" | "selecting" | "waiting" | "playing" | "watching" | "spectating"

export interface UserWallet {
  mainBalance: number
  playBalance: number
}