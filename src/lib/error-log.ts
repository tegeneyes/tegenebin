// Client-side error reporting. Sends errors to the server so the admin panel
// can surface them. Reporting must never throw or slow the app down.
import { logClientError } from "@/lib/error-log.functions"

type Level = "error" | "warning" | "info"

const recent = new Map<string, number>()
const DEDUPE_MS = 15000

function shouldSend(key: string): boolean {
  const now = Date.now()
  const prev = recent.get(key)
  if (prev && now - prev < DEDUPE_MS) return false
  recent.set(key, now)
  if (recent.size > 100) {
    for (const [k, t] of recent) if (now - t > 60000) recent.delete(k)
  }
  return true
}

function currentTelegramId(): number | null {
  if (typeof window === "undefined") return null
  const id = window.Telegram?.WebApp?.initDataUnsafe?.user?.id
  return id ? Number(id) : null
}

export function reportError(input: {
  source: string
  message: string
  detail?: string
  level?: Level
  telegramId?: number | null
}): void {
  if (typeof window === "undefined") return
  const message = String(input.message || "Unknown error")

  // Ignore noise:
  //  - "Script error." is a cross-origin throw (Telegram SDK etc.) with no info.
  //  - anything raised by the reporter's own request (e.g. a network blip while
  //    sending an error) — otherwise the reporter reports itself in a loop.
  if (message.trim() === "Script error.") return
  if (input.detail && /error-log\.functions/.test(input.detail)) return
  if (/^(Failed to fetch|NetworkError|Load failed|Network request failed)$/i.test(message.trim())) return

  const key = `${input.source}|${message}`.slice(0, 200)
  if (!shouldSend(key)) return
  void logClientError({
    data: {
      telegram_id: input.telegramId ?? currentTelegramId(),
      source: input.source.slice(0, 60),
      message: message.slice(0, 1000),
      detail: input.detail?.slice(0, 8000),
      level: input.level ?? "error",
      path: window.location.pathname,
      user_agent: navigator.userAgent,
    },
  }).catch(() => {
    /* never let reporting break the app */
  })
}

export function installGlobalErrorHandlers(): () => void {
  if (typeof window === "undefined") return () => {}

  const onError = (event: ErrorEvent) => {
    reportError({
      source: "window.onerror",
      message: event.message || "Unknown error",
      detail: (event.error as Error | undefined)?.stack ?? `${event.filename}:${event.lineno}:${event.colno}`,
    })
  }

  const onRejection = (event: PromiseRejectionEvent) => {
    const reason = event.reason as { message?: string; stack?: string } | string | undefined
    reportError({
      source: "unhandledrejection",
      message: typeof reason === "string" ? reason : (reason?.message ?? "Unhandled rejection"),
      detail: typeof reason === "string" ? undefined : reason?.stack,
    })
  }

  window.addEventListener("error", onError)
  window.addEventListener("unhandledrejection", onRejection)
  return () => {
    window.removeEventListener("error", onError)
    window.removeEventListener("unhandledrejection", onRejection)
  }
}
