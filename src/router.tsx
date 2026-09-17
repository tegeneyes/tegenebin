import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

// After a deploy, a page cached by the browser/Telegram WebView can reference JS
// chunks that no longer exist (404). Vite fires `vite:preloadError` when such a
// dynamic import fails — reload once so the user gets the current build instead
// of a broken page. The timestamp guard prevents a reload loop.
if (typeof window !== "undefined") {
  window.addEventListener("vite:preloadError", () => {
    const KEY = "liyu_chunk_reload_at";
    try {
      const last = Number(window.sessionStorage.getItem(KEY) || 0);
      if (Date.now() - last < 10000) return;
      window.sessionStorage.setItem(KEY, String(Date.now()));
    } catch {
      /* ignore */
    }
    window.location.reload();
  });
}

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
