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
        initDataUnsafe?: { user?: TelegramUser; start_param?: string }
        requestContact?: (cb: (ok: boolean) => void) => void
        showAlert?: (msg: string) => void
        colorScheme?: string
      }
    }
  }
}

export function useTelegramUser(): TelegramUser | null {
  const [user, setUser] = useState<TelegramUser | null>(null)

  useEffect(() => {
    if (typeof window === "undefined") return

    const tryInit = () => {
      const tg = window.Telegram?.WebApp
      if (tg) {
        try { tg.ready(); tg.expand() } catch {}
        const tgUser = tg.initDataUnsafe?.user
        const startParam = tg.initDataUnsafe?.start_param
        if (tgUser?.id) {
          setUser({
            id: Number(tgUser.id),
            first_name: tgUser.first_name,
            last_name: tgUser.last_name,
            username: tgUser.username,
            photo_url: tgUser.photo_url,
            language_code: tgUser.language_code,
            start_param: startParam,
          })
          return true
        }
      }
      return false
    }

    if (tryInit()) return
    // Script may still be loading — retry briefly
    let tries = 0
    const t = setInterval(() => {
      tries++
      if (tryInit() || tries > 20) {
        clearInterval(t)
        if (tries > 20 && !window.Telegram?.WebApp?.initDataUnsafe?.user) {
          // Dev fallback for browser preview
          let devId = window.localStorage.getItem("besh_dev_tg_id")
          if (!devId) {
            devId = String(900000000 + Math.floor(Math.random() * 1000000))
            window.localStorage.setItem("besh_dev_tg_id", devId)
          }
          setUser({ id: Number(devId), first_name: "Guest", username: "guest" })
        }
      }
    }, 150)
    return () => clearInterval(t)
  }, [])

  return user
}
