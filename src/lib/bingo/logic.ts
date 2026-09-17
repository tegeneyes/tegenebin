import type { BingoCell } from "./types"
import { BINGO_COLUMNS } from "./constants"

/**
 * Generates a random 5x5 Bingo card following standard B-I-N-G-O column rules.
 * The center cell (row 2, col 2) is the FREE space.
 */
export function generateBingoCard(): BingoCell[][] {
  const card: BingoCell[][] = Array(5)
    .fill(null)
    .map(() => Array(5).fill(null))

  Object.entries(BINGO_COLUMNS).forEach(([, [min, max]], colIndex) => {
    const columnNumbers: number[] = []
    while (columnNumbers.length < 5) {
      const num = Math.floor(Math.random() * (max - min + 1)) + min
      if (!columnNumbers.includes(num)) {
        columnNumbers.push(num)
      }
    }
    columnNumbers
      .sort((a, b) => a - b)
      .forEach((num, rowIndex) => {
        if (colIndex === 2 && rowIndex === 2) {
          card[rowIndex][colIndex] = { number: "FREE", marked: true, called: true }
        } else {
          card[rowIndex][colIndex] = { number: num, marked: false, called: false }
        }
      })
  })

  return card
}

/**
 * Returns true if the given card has a winning line (row, column, or diagonal).
 */
export function checkBingo(card: BingoCell[][]): boolean {
  // Rows
  for (let i = 0; i < 5; i++) {
    if (card[i].every((cell) => cell.marked)) return true
  }
  // Columns
  for (let j = 0; j < 5; j++) {
    let colWin = true
    for (let i = 0; i < 5; i++) {
      if (!card[i][j].marked) {
        colWin = false
        break
      }
    }
    if (colWin) return true
  }
  // Diagonals
  let diag1 = true
  let diag2 = true
  for (let i = 0; i < 5; i++) {
    if (!card[i][i].marked) diag1 = false
    if (!card[i][4 - i].marked) diag2 = false
  }
  return diag1 || diag2
}

/**
 * Returns the letter column (B/I/N/G/O) for a given bingo number.
 */
export function getNumberPrefix(n: number): "B" | "I" | "N" | "G" | "O" {
  if (n <= 15) return "B"
  if (n <= 30) return "I"
  if (n <= 45) return "N"
  if (n <= 60) return "G"
  return "O"
}

/**
 * Deep-clones a bingo card (rows + cells) to keep state updates immutable.
 */
export function cloneCard(card: BingoCell[][]): BingoCell[][] {
  return card.map((row) => row.map((cell) => ({ ...cell })))
}
