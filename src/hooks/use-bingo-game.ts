"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import type { BingoCell, GameStats, ScoreFilter, TabType, Cartela, GameMode } from "@/lib/bingo/types"
import { INITIAL_GAME_STATS } from "@/lib/bingo/constants"
import { checkBingo, cloneCard } from "@/lib/bingo/logic"
import { voiceUrls } from "@/lib/bingo/voices"

const WAIT_SECONDS = 15
const SELECTION_SECONDS = 30
const CALL_INTERVAL_MS = 4000
const MAX_CALLS = 20
const SELECTION_MS = SELECTION_SECONDS * 1000
const CALLING_MS = MAX_CALLS * CALL_INTERVAL_MS
const ROUND_MS = SELECTION_MS + CALLING_MS

// Continuous rounds on a shared wall-clock, so every player is in the same
// phase: selection (30s) → 20 calls → selection → 20 calls …
// Each stake gets its own offset so 10 ETB and 20 ETB games run independently.
export const STAKE_OFFSETS: Record<number, number> = { 10: 0, 20: ROUND_MS / 2 }
export function currentRound(now = Date.now(), stake = 10) {
  const offset = STAKE_OFFSETS[stake] ?? 0
  const adjusted = now - offset
  const index = Math.floor(adjusted / ROUND_MS)
  const start = index * ROUND_MS + offset
  const selectingEndsAt = start + SELECTION_MS
  const callingStartsAt = selectingEndsAt
  const callingEndsAt = start + ROUND_MS
  const phase: "selecting" | "calling" = now < selectingEndsAt ? "selecting" : "calling"
  return { index, selectingEndsAt, callingStartsAt, callingEndsAt, phase }
}

// Deterministic per-round order so every client calls the same numbers.
function shuffleNumbers(seed = 0) {
  const arr = Array.from({ length: 75 }, (_, i) => i + 1)
  let s = ((seed + 1) * 2654435761) % 2147483647
  if (s <= 0) s += 2147483646
  const rand = () => {
    s = (s * 48271) % 2147483647
    return s / 2147483647
  }
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

export type GameResult = {
  winnerTelegramId: number | null
  winnerCartelaId: number | null
  winnerUsername: string | null
  calledNumbers: number[]
  prizePool: number
} | null

export function useBingoGame(telegramId?: number) {
  const [activeTab, setActiveTab] = useState<TabType>("game")
  const [gameMode, setGameMode] = useState<GameMode>("lobby")
  const [cartelas, setCartelas] = useState<Cartela[]>([])
  const [activeCartelaIndex, setActiveCartelaIndex] = useState(0)
  const [calledNumbers, setCalledNumbers] = useState<number[]>([])
  const [gameStats, setGameStats] = useState<GameStats>(INITIAL_GAME_STATS)
  const [automatic, setAutomatic] = useState(true)
  const [showWinModal, setShowWinModal] = useState(false)
  const [winningCartela, setWinningCartela] = useState<Cartela | null>(null) // Add this
  const [winningDisplayName, setWinningDisplayName] = useState<string | null>(null)
  const [winnerIsCurrentUser, setWinnerIsCurrentUser] = useState(false)
  const [soundEnabled, setSoundEnabled] = useState(true)
  const [loading, setLoading] = useState(false)
  const [timer] = useState(1)
  const [scoreFilter, setScoreFilter] = useState<ScoreFilter>("daily")
  const [wallet, setWallet] = useState({ mainBalance: 0, playBalance: 0 })
  const [stake, setStake] = useState(10)
  const [selectionEndsAt, setSelectionEndsAt] = useState<number | null>(null)
  const [selectionStartsAt, setSelectionStartsAt] = useState<number | null>(null)
  const [liveGameEndsAt, setLiveGameEndsAt] = useState<number | null>(null)
  const [liveGameStake, setLiveGameStake] = useState<number | null>(null)
  const [gameStartedAt, setGameStartedAt] = useState<number | null>(null)
  const [gameSequence, setGameSequence] = useState<number[]>([])
  const [roundIndex, setRoundIndex] = useState(0)
  const [waitTimeLeft, setWaitTimeLeft] = useState(0)
  const [gameResult, setGameResult] = useState<GameResult>(null)
  const appliedResultRef = useRef<string | null>(null)
  const audioUnlockedRef = useRef(false)

  const activeCard = cartelas[activeCartelaIndex]?.card || []

  const unlockAudio = useCallback(() => {
    if (audioUnlockedRef.current || typeof window === "undefined") return
    const audio = new Audio(voiceUrls["1"])
    audio.muted = true
    void audio.play().then(() => {
      audio.pause()
      audio.currentTime = 0
      audioUnlockedRef.current = true
    }).catch(() => {})
  }, [])

  const handlePlayClick = useCallback((selectedStake?: number) => {
    unlockAudio()
    const nextStake = selectedStake ?? stake
    if (selectedStake) setStake(selectedStake)

    const round = currentRound(Date.now(), nextStake)

    // Reset the player's own state for the round they are joining.
    setCartelas([])
    setActiveCartelaIndex(0)
    setCalledNumbers([])
    setShowWinModal(false)
    setWinningCartela(null)
    setWinningDisplayName(null)
    setWinnerIsCurrentUser(false)
    setGameResult(null)
    appliedResultRef.current = null
    setGameStats(prev => ({ ...prev, calledCount: 0, bet: nextStake }))
    setGameSequence(shuffleNumbers(round.index))
    setRoundIndex(round.index)
    setGameStartedAt(round.callingStartsAt)
    setLiveGameEndsAt(round.callingEndsAt)
    setLiveGameStake(nextStake)

    if (round.phase === "selecting") {
      // Selection window is open — pick cartelas.
      setSelectionStartsAt(null)
      setSelectionEndsAt(round.selectingEndsAt)
      setGameMode("selecting")
    } else {
      // Calls already running — drop into watching mode for the current game.
      // After it finishes, player returns to lobby and can select cartelas for the next round.
      setCartelas([])
      setSelectionStartsAt(null)
      setSelectionEndsAt(null)
      setCalledNumbers([])
      setShowWinModal(false)
      setWinningCartela(null)
      setWinningDisplayName(null)
      setWinnerIsCurrentUser(false)
      setGameResult(null)
      appliedResultRef.current = null
      setGameStats(prev => ({ ...prev, calledCount: 0, gameId: `R-${round.index}`, bet: nextStake, players: prev.players }))
      setGameSequence(shuffleNumbers(round.index))
      setRoundIndex(round.index)
      setGameStartedAt(round.callingStartsAt)
      setLiveGameEndsAt(round.callingEndsAt)
      setLiveGameStake(nextStake)
      setGameMode("playing")
    }
  }, [stake, unlockAudio])

  // Hop straight into the selection screen for the NEXT round during the
  // calling phase, so the player can reserve cartelas right away. Reservations
  // target the next round's index; when the selection window opens and >=2
  // players are committed, the round starts. The wait timer shows on screen.
  const joinNextSelection = useCallback((s: number) => {
    unlockAudio()
    setStake(s)
    setCartelas([])
    setActiveCartelaIndex(0)
    setCalledNumbers([])
    setShowWinModal(false)
    setWinningCartela(null)
    setWinningDisplayName(null)
    setWinnerIsCurrentUser(false)
    setGameResult(null)
    appliedResultRef.current = null
    setGameStats(prev => ({ ...prev, calledCount: 0, bet: s }))

    const now = Date.now()
    const round = currentRound(now, s)
    const nextRoundStart = (round.index + 1) * ROUND_MS + (STAKE_OFFSETS[s] ?? 0)
    const nextRound = currentRound(nextRoundStart, s)
    setSelectionStartsAt(nextRoundStart)
    setSelectionEndsAt(nextRound.selectingEndsAt)
    setRoundIndex(nextRound.index)
    setGameStartedAt(nextRound.callingStartsAt)
    setLiveGameEndsAt(nextRound.callingEndsAt)
    setLiveGameStake(s)
    setGameSequence(shuffleNumbers(nextRound.index))
    setGameMode("selecting")
  }, [unlockAudio])

  const handleSelectCartelas = useCallback((selected: Cartela[], players?: number) => {
    // Stake deduction is handled server-side by the caller (see BingoApp.handleConfirmCartelas)
    unlockAudio()
    setCartelas(selected)
    setCalledNumbers([])
    setGameResult(null)
    appliedResultRef.current = null
    // `players` is the true round size returned by startGame's MIN_PLAYERS gate,
    // not the number of cartelas this user bought.
    const roundPlayers = players ?? selected.length
    setGameStats(prev => ({
      ...prev,
      calledCount: 0,
      gameId: prev.gameId || `R-${currentRound(Date.now(), stake).index}`,
      bet: stake,
      players: roundPlayers,
      derash: Math.round(roundPlayers * stake * 0.7),
    }))
    setSelectionEndsAt(null)
    setGameMode("playing")
  }, [stake, unlockAudio])


  const handleBackFromSelection = useCallback(() => {
    // Manual back-out returns to the lobby.
    setSelectionStartsAt(null)
    setGameMode("lobby")
  }, [])

  const handleWatchGame = useCallback((players?: number) => {
    const round = currentRound(Date.now(), stake)
    setSelectionEndsAt(null)
    setSelectionStartsAt(null)
    setCartelas([])
    setActiveCartelaIndex(0)
    setCalledNumbers([])
    setShowWinModal(false)
    setWinningCartela(null)
    setWinningDisplayName(null)
    setWinnerIsCurrentUser(false)
    setGameResult(null)
    appliedResultRef.current = null
    setGameStats(prev => ({ ...prev, calledCount: 0, gameId: prev.gameId || `R-${round.index}`, bet: stake, players: players ?? prev.players }))
    setGameSequence(shuffleNumbers(round.index))
    setRoundIndex(round.index)
    setGameStartedAt(round.callingStartsAt)
    setLiveGameEndsAt(round.callingEndsAt)
    setLiveGameStake(stake)
    setGameMode("watching")
  }, [stake])

  const resetGameState = useCallback(() => {
    setCartelas([])
    setActiveCartelaIndex(0)
    setCalledNumbers([])
    setGameStats(prev => ({ ...prev, calledCount: 0 }))
    setShowWinModal(false)
    setSelectionEndsAt(null)
    setSelectionStartsAt(null)
    setWinningCartela(null) // Reset winning cartela
    setWinningDisplayName(null)
    setWinnerIsCurrentUser(false)
    setGameResult(null)
    appliedResultRef.current = null
  }, [])

  const handleCellClick = useCallback(
    (r: number, c: number, cartelaIndex: number = activeCartelaIndex) => {
      if (gameMode !== "playing") return
      
      const targetCartela = cartelas[cartelaIndex]
      if (!targetCartela) return
      
      const currentCard = targetCartela.card
      if (!currentCard) return
      
      const cell = currentCard[r]?.[c]
      if (!cell || cell.number === "FREE") return

      const newCartelas = [...cartelas]
      const newCard = cloneCard(currentCard)
      newCard[r][c].marked = !newCard[r][c].marked
      newCartelas[cartelaIndex] = { ...targetCartela, card: newCard }
      setCartelas(newCartelas)

      // Check each cartela for bingo
      for (const cartela of newCartelas) {
        if (checkBingo(cartela.card)) {
          setWinningCartela(cartela) // Set the winning cartela
          setWinningDisplayName(null)
          setWinnerIsCurrentUser(true)
          setShowWinModal(true)
          break
        }
      }
    },
    [cartelas, activeCartelaIndex, gameMode],
  )

  const switchCartela = useCallback((index: number) => {
    if (index >= 0 && index < cartelas.length) {
      setActiveCartelaIndex(index)
    }
  }, [cartelas.length])

  const callNextNumber = useCallback(() => {
    if (gameMode !== "playing" && gameMode !== "watching") return
    if (calledNumbers.length >= MAX_CALLS) return
    // Single source of truth: the manual caller draws from the same gameSequence
    // as the time-driven caller, so the two can never disagree. Auto-marking and
    // bingo detection are handled by the effect that watches calledNumbers.
    const nextNum = gameSequence[calledNumbers.length]
    if (typeof nextNum !== "number" || calledNumbers.includes(nextNum)) return

    const newCalled = [nextNum, ...calledNumbers]
    setCalledNumbers(newCalled)
    setGameStats(prev => ({ ...prev, calledCount: newCalled.length }))
  }, [calledNumbers, gameMode, gameSequence])

  const cartelaWinsWithCalls = useCallback((cartela: Cartela, calls: number[]) => {
    const simulated = cloneCard(cartela.card)
    simulated.forEach(row => row.forEach(cell => {
      if (cell.number === "FREE" || (typeof cell.number === "number" && calls.includes(cell.number))) {
        cell.marked = true
      }
    }))
    return checkBingo(simulated)
  }, [])

  const refreshCalled = useCallback(() => {
    if (gameMode !== "playing" && gameMode !== "watching") return
    setCalledNumbers([])
    setGameStats(prev => ({ ...prev, calledCount: 0 }))
  }, [gameMode])

  const leaveGame = useCallback(() => {
    // Keep liveGameEndsAt + calledNumbers so re-entering puts the user back as a watcher.
    setGameMode("lobby")
  }, [])

  const closeWinAndReturnToLobby = useCallback(() => {
    setShowWinModal(false)
    setGameMode("lobby")
    setLiveGameEndsAt(null)
    setLiveGameStake(null)
    setGameStartedAt(null)
    setGameSequence([])
    setGameResult(null)
    appliedResultRef.current = null
    resetGameState()
  }, [resetGameState])

  const logout = useCallback(() => {
    setGameMode("lobby")
    setLiveGameEndsAt(null)
    setLiveGameStake(null)
    setGameStartedAt(null)
    setGameSequence([])
    resetGameState()
    setActiveTab("game")
  }, [resetGameState])

  const isPlaying = gameMode === "playing"
  const isWatching = gameMode === "watching"

  // Time-derived number calling — always in sync with elapsed time, even after leaving + rejoining.
  useEffect(() => {
    if (gameMode !== "playing" && gameMode !== "watching") return
    if (showWinModal) return
    if (!gameStartedAt || gameSequence.length === 0) return

    const sync = () => {
      const elapsed = Date.now() - gameStartedAt
      const cap = gameResult && gameResult.calledNumbers.length < MAX_CALLS
        ? gameResult.calledNumbers.length
        : MAX_CALLS
      const expected = Math.min(cap, Math.max(0, Math.floor(elapsed / CALL_INTERVAL_MS) + 1))
      setCalledNumbers(prev => {
        if (expected <= prev.length) return prev
        // Latest number first
        return gameSequence.slice(0, expected).slice().reverse()
      })
      setGameStats(prev => ({ ...prev, calledCount: expected }))
    }

    sync()
    const id = setInterval(sync, 500)
    return () => clearInterval(id)
  }, [gameMode, showWinModal, gameStartedAt, gameSequence, gameResult])

  // Auto-mark newly called numbers on player's cartelas while playing
  useEffect(() => {
    if (gameMode !== "playing" || !automatic) return
    if (calledNumbers.length === 0) return
    setCartelas(prev => {
      let changed = false
      const next = prev.map(cartela => {
        const newCard = cloneCard(cartela.card)
        let markedAny = false
        newCard.forEach(row => row.forEach(cell => {
          if (typeof cell.number === "number" && calledNumbers.includes(cell.number) && !cell.marked) {
            cell.marked = true
            markedAny = true
          }
        }))
        if (markedAny) { changed = true; return { ...cartela, card: newCard } }
        return cartela
      })
      if (!changed) return prev
      for (const c of next) {
        if (checkBingo(c.card)) {
          setWinningCartela(c)
          setWinningDisplayName(null)
          setWinnerIsCurrentUser(true)
          setShowWinModal(true)
          break
        }
      }
      return next
    })
  }, [calledNumbers, gameMode, automatic])

  // If 20 calls pass with no player bingo, the round ends with no winner.
  // No result modal — just go back to the lobby.
  useEffect(() => {
    if (showWinModal || winningCartela) return
    if (gameMode !== "playing") return
    if (calledNumbers.length < MAX_CALLS) return
    if (cartelas.some((cartela) => cartelaWinsWithCalls(cartela, calledNumbers))) return
    // No bingo — clear the live game and return to lobby.
    resetGameState()
    setGameMode("lobby")
    setLiveGameEndsAt(null)
    setLiveGameStake(null)
    setGameStartedAt(null)
    setGameSequence([])
  }, [calledNumbers, cartelaWinsWithCalls, cartelas, gameMode, showWinModal, winningCartela, resetGameState])

  // Apply a game result received via realtime (broadcast finish).
  // This stops the calling loop and opens the result modal for all participants.
  useEffect(() => {
    if (!gameResult) return
    if (gameMode !== "playing" && gameMode !== "watching") return
    const resultKey = `${gameResult.winnerTelegramId}-${gameResult.calledNumbers.length}-${gameResult.prizePool}`
    if (appliedResultRef.current === resultKey) return
    appliedResultRef.current = resultKey

    // Clamp called numbers to the exact finish point.
    setCalledNumbers(gameResult.calledNumbers)
    setGameStats(prev => ({ ...prev, calledCount: gameResult.calledNumbers.length }))

    if (gameResult.winnerTelegramId == null) {
      // No winner — no result modal, straight back to the lobby.
      appliedResultRef.current = resultKey
      resetGameState()
      setGameMode("lobby")
      setLiveGameEndsAt(null)
      setLiveGameStake(null)
      setGameStartedAt(null)
      setGameSequence([])
      return
    } else if (telegramId != null && gameResult.winnerTelegramId === telegramId) {
      // Current user won — find their winning cartela
      const own = cartelas.find(c => c.id === gameResult.winnerCartelaId)
        ?? cartelas.find(c => cartelaWinsWithCalls(c, gameResult.calledNumbers))
        ?? null
      setWinningCartela(own)
      setWinningDisplayName(null)
      setWinnerIsCurrentUser(true)
    } else {
      // Someone else won — show their name, no card
      setWinningCartela(null)
      setWinningDisplayName(gameResult.winnerUsername ?? "Player")
      setWinnerIsCurrentUser(false)
    }
    setShowWinModal(true)
  }, [gameResult, gameMode, telegramId, cartelas, cartelaWinsWithCalls])

  // Watching is read-only: when the round's calls finish, return to the lobby.
  useEffect(() => {
    if (gameMode !== "watching") return
    if (showWinModal || gameResult) return
    if (!gameStartedAt) return
    const endsAt = gameStartedAt + CALLING_MS
    const tick = () => {
      if (Date.now() >= endsAt) {
        setGameMode("lobby")
        setLiveGameEndsAt(null)
        setGameStartedAt(null)
        setGameSequence([])
        setCalledNumbers([])
        setCartelas([])
      }
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameMode, gameStartedAt])

  // Clear the live-game flag once the round finishes
  useEffect(() => {
    if (calledNumbers.length >= MAX_CALLS || showWinModal) {
      setLiveGameEndsAt(null)
      setLiveGameStake(null)
    }
  }, [calledNumbers.length, showWinModal])


  // Voice-call the latest number using uploaded MP3 clips
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const playVoice = useCallback((url: string) => {
    try {
      audioRef.current?.pause()
      const audio = new Audio(url)
      audioRef.current = audio
      void audio.play().catch((error) => console.warn("Bingo audio playback failed", error))
    } catch {
      console.warn("Bingo audio could not be created")
    }
  }, [])

  useEffect(() => {
    if (!soundEnabled) return
    if (calledNumbers.length === 0) return
    if (typeof window === "undefined") return
    const num = calledNumbers[0]
    const url = voiceUrls[String(num)]
    if (url) playVoice(url)
  }, [calledNumbers, playVoice, soundEnabled])

  // Play win sound when a bingo is achieved
  useEffect(() => {
    if (!soundEnabled || !showWinModal) return
    const url = voiceUrls["good_bingo"]
    if (url) playVoice(url)
  }, [playVoice, showWinModal, soundEnabled])

  // Waiting countdown — when it hits 0, start the game
  useEffect(() => {
    if (gameMode !== "waiting") return
    if (waitTimeLeft <= 0) {
      setGameMode("playing")
      return
    }
    const id = setTimeout(() => setWaitTimeLeft((t) => t - 1), 1000)
    return () => clearTimeout(id)
  }, [gameMode, waitTimeLeft])



  return {
    // State
    activeTab,
    gameMode,
    isPlaying,
    isWatching,
    cartelas,
    activeCartelaIndex,
    card: activeCard,
    calledNumbers,
    gameStats,
    automatic,
    showWinModal,
    winningCartela, // Export winning cartela
    winningDisplayName,
    winnerIsCurrentUser,
    soundEnabled,
    loading,
    timer,
    scoreFilter,
    wallet,
    stake,
    selectionEndsAt,
    selectionStartsAt,
    roundIndex,
    waitTimeLeft,
    gameResult,

    // Setters
    setActiveTab,
    setAutomatic,
    setSoundEnabled,
    setScoreFilter,
    setWallet,
    setGameResult,

    // Actions
    handlePlayClick,
    handleSelectCartelas,
    handleBackFromSelection,
    handleWatchGame,
    handlePlayClick,
    joinNextSelection,
    handleCellClick,
    switchCartela,
    callNextNumber,
    refreshCalled,
    leaveGame,
    closeWinAndReturnToLobby,
    logout,
  }
}

export type UseBingoGame = ReturnType<typeof useBingoGame>