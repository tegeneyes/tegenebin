import { cn } from "@/lib/utils"

interface MasterBoardProps {
  calledNumbers: number[]
}

const COLUMN_LETTERS = [
  { letter: "B", bg: "bg-blue-500" },
  { letter: "I", bg: "bg-bingo-accent" },
  { letter: "N", bg: "bg-pink-500" },
  { letter: "G", bg: "bg-bingo-green" },
  { letter: "O", bg: "bg-orange-500" },
] as const

/**
 * The scrollable 1-75 "master board" shown on the left side during a game.
 */
export function MasterBoard({ calledNumbers }: MasterBoardProps) {
  return (
    <div className="w-[150px] bg-black/30 border border-white/10 rounded-2xl p-2 overflow-y-auto custom-scrollbar">
      <div className="grid grid-cols-5 gap-1 mb-1">
        {COLUMN_LETTERS.map(({ letter, bg }) => (
          <div
            key={letter}
            className={cn(
              "aspect-square rounded-md flex items-center justify-center text-[11px] font-black text-white",
              bg,
            )}
          >
            {letter}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-5 gap-1">
        {Array.from({ length: 15 }).map((_, rowIndex) =>
          [0, 1, 2, 3, 4].map((colIndex) => {
            const num = rowIndex + 1 + colIndex * 15
            const isCalled = calledNumbers.includes(num)
            return (
              <div
                key={num}
                className={cn(
                  "aspect-square rounded-md flex items-center justify-center text-[10px] font-bold border transition-colors",
                  isCalled
                    ? "bg-orange-500 border-orange-500 text-white shadow-[0_0_8px_rgba(251,146,60,0.4)]"
                    : "bg-white/[0.04] border-white/5 text-gray-400",
                )}
              >
                {num}
              </div>
            )
          }),
        )}
      </div>
    </div>
  )
}
