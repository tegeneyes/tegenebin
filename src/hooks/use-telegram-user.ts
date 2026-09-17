import { useEffect, useState } from "react"

export type TelegramUser = {
  id: number
  first_name?: string
  last_name?: string
  username?: string
  photo_url?: string
  language_code?: string
  start_param?: string
}

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        ready: () => void
        expand: () => void
        initData?: string
        initDataUnsafe?: { user?: TelegramUser; start_param?: string }
        requestContact?: (cb: (ok: boolean) => void) => void
        showAlert?: (msg: string) => void
        colorScheme?: string
      }
    }
  }
}

// True only on local dev / preview hosts. Production must NEVER fabricate an id,
// because every server-side record is keyed by the real Telegram id.
function isDevHost(): boolean {
  if (import.meta.env.DEV) return true
  if (typeof window === "undefined") return false
  const host = window.location.hostname
  return (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host.startsWith("id-preview--") ||
    /^project--.+-dev\./.test(host)
  )
}

function readTelegramUser(): TelegramUser | null {
  if (typeof window === "undefined") return null
  const tg = window.Telegram?.WebApp
  if (!tg) return null
  try {
    tg.ready()
    tg.expand()
  } catch {
    /* ignore */
  }
  const u = tg.initDataUnsafe?.user
  if (!u?.id) return null
  return {
    id: Number(u.id),
    first_name: u.first_name,
    last_name: u.last_name,
    username: u.username,
    photo_url: u.photo_url,
    language_code: u.language_code,
    start_param: tg.initDataUnsafe?.start_param,
  }
}

export function useTelegramUser(): TelegramUser | null {
  const [user, setUser] = useState<TelegramUser | null>(null)

  useEffect(() => {
    if (typeof window === "undefined") return

    // The Telegram script is loaded synchronously in <head>, so this usually
    // resolves on the first tick.
    const initial = readTelegramUser()
    if (initial) {
      setUser(initial)
      return
    }

    let tries = 0
    const MAX_TRIES = 40 // ~10s on a slow connection
    const tick = () => {
      tries++
      const u = readTelegramUser()
      if (u) {
        setUser(u)
        window.clearInterval(timer)
        return
      }
      if (tries >= MAX_TRIES) {
        window.clearInterval(timer)
        // Only ever invent an identity for local development / previews.
        // Inside real Telegram or a normal browser we must stay anonymous so we
        // never write to the wrong player row.
        if (isDevHost()) {
          let devId = window.localStorage.getItem("besh_dev_tg_id")
          if (!devId) {
            devId = String(900000000 + Math.floor(Math.random() * 1000000))
            window.localStorage.setItem("besh_dev_tg_id", devId)
          }
          setUser({ id: Number(devId), first_name: "Guest", username: "guest" })
        }
      }
    }
    const timer = window.setInterval(tick, 250)
    tick()

    // If the Telegram script finishes loading late, adopt the real user at once.
    const onLoad = () => {
      const u = readTelegramUser()
      if (u) {
        setUser(u)
        window.clearInterval(timer)
      }
    }
    window.addEventListener("load", onLoad)

    return () => {
      window.clearInterval(timer)
      window.removeEventListener("load", onLoad)
    }
  }, [])

  return user
}
