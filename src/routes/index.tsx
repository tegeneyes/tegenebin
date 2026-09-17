import { createFileRoute } from "@tanstack/react-router";
import { BingoApp } from "@/components/bingo/bingo-app";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Liyu Bingo" },
      { name: "description", content: "Play Liyu Bingo and win real ETB prizes on Telegram" },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <main className="h-screen w-screen overflow-hidden">
      <BingoApp />
    </main>
  );
}
