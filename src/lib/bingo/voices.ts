export const voiceUrls: Record<string, string> = Object.fromEntries([
  ...Array.from({ length: 75 }, (_, index) => {
    const number = index + 1
    return [String(number), `/voices/${number}.mp3`]
  }),
  ["good_bingo", "/voices/good_bingo.mp3"],
])
