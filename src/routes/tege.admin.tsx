"use client"

import { createFileRoute, Link } from "@tanstack/react-router"
import { useEffect, useState } from "react"
import { useServerFn } from "@tanstack/react-start"
import { Loader2, Lock } from "lucide-react"
import {
  adminListTransactions, adminProcessTransaction,
  adminListPromos, adminCreatePromo, adminTogglePromo,
} from "@/lib/wallet.functions"
import {
  adminListAnnouncements, adminSetAnnouncement, adminClearAnnouncement,
  adminBonusDrop, adminListBonusDrops, adminListPlayers, adminSetBanned, adminPlayerGames,
  adminListGames,
} from "@/lib/admin-tools.functions"
import { parseSms } from "@/lib/sms-parser"


export const Route = createFileRoute("/tege/admin")({ component: AdminGate })

// Admin credentials (client-side gate). Server functions still verify ADMIN_TELEGRAM_IDS.
const ADMIN_EMAIL = "tegene@tegen.com"
const ADMIN_PASSWORD = "Tegenepro"
const ADMIN_TG_ID = 723559736
const SESSION_KEY = "liyu_admin_session_v1"

type Tx = {
  id: string; telegram_id: number; type: string; amount: number; status: string;
  provider: string | null; phone_number: string | null; cbe_account_name: string | null;
  cbe_account_number: string | null; proof_text: string | null; reference: string | null;
  promo_code: string | null; admin_note: string | null; created_at: string;
}
type Promo = { id: string; code: string; type: string; amount: number; max_redemptions: number | null; redemptions_count: number; expires_at: string | null; active: boolean }

function AdminGate() {
  const [hydrated, setHydrated] = useState(false)
  const [authed, setAuthed] = useState(false)
  useEffect(() => {
    setAuthed(window.sessionStorage.getItem(SESSION_KEY) === "1")
    setHydrated(true)
  }, [])
  if (!hydrated) return <div className="min-h-screen bg-bingo-deep-purple" />
  if (!authed) return <LoginForm onSuccess={() => setAuthed(true)} />
  return <AdminPage onLogout={() => { window.sessionStorage.removeItem(SESSION_KEY); setAuthed(false) }} />
}

function LoginForm({ onSuccess }: { onSuccess: () => void }) {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (email.trim().toLowerCase() === ADMIN_EMAIL && password === ADMIN_PASSWORD) {
      window.sessionStorage.setItem(SESSION_KEY, "1")
      setError(null)
      onSuccess()
    } else {
      setError("Invalid email or password.")
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-bingo-deep-purple text-white p-4">
      <form onSubmit={handleSubmit} className="w-full max-w-sm bg-white/[0.04] border border-white/10 rounded-2xl p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Lock size={18} className="text-bingo-accent" />
          <h1 className="text-lg font-display font-extrabold tracking-wide">ADMIN LOGIN</h1>
        </div>
        <label className="block">
          <span className="block text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">Email</span>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="username"
            className="w-full px-3 py-2.5 rounded-xl bg-white/[0.04] border border-white/10 text-white text-sm font-mono focus:border-bingo-accent focus:outline-none" />
        </label>
        <label className="block">
          <span className="block text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">Password</span>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} required autoComplete="current-password"
            className="w-full px-3 py-2.5 rounded-xl bg-white/[0.04] border border-white/10 text-white text-sm font-mono focus:border-bingo-accent focus:outline-none" />
        </label>
        {error && <p className="text-red-400 text-xs">{error}</p>}
        <button type="submit" className="w-full py-3 rounded-xl bg-bingo-accent text-bingo-deep-purple font-black uppercase tracking-wider text-sm">Sign in</button>
        <Link to="/" className="block text-center text-xs text-gray-400 hover:text-white">← Back to app</Link>
      </form>
    </div>
  )
}

function AdminPage({ onLogout }: { onLogout: () => void }) {
  const tg = { id: ADMIN_TG_ID }
  const [tab, setTab] = useState<"tx" | "promo" | "announce" | "bonus" | "users" | "games">("tx")
  const [error, setError] = useState<string | null>(null)
  const [txs, setTxs] = useState<Tx[]>([])
  const [promos, setPromos] = useState<Promo[]>([])
  const [loading, setLoading] = useState(true)

  const listTx = useServerFn(adminListTransactions)
  const process = useServerFn(adminProcessTransaction)
  const listPromos = useServerFn(adminListPromos)
  const createPromo = useServerFn(adminCreatePromo)
  const togglePromo = useServerFn(adminTogglePromo)

  const refresh = async () => {
    if (!tg) return
    setLoading(true); setError(null)
    try {
      const [t, p] = await Promise.all([
        listTx({ data: { admin_id: tg.id } }),
        listPromos({ data: { admin_id: tg.id } }),
      ])
      setTxs(t as Tx[])
      setPromos(p as Promo[])
    } catch (e) { setError((e as Error).message) }
    finally { setLoading(false) }
  }

  useEffect(() => { if (tg) refresh() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [tg?.id])

  const handleAction = async (tx_id: string, action: "approve" | "reject") => {
    const note = window.prompt(`Note for ${action}? (optional)`) || undefined
    try {
      await process({ data: { admin_id: tg!.id, tx_id, action, note } })
      await refresh()
    } catch (e) { alert((e as Error).message) }
  }

  const handleCreatePromo = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    try {
      await createPromo({ data: {
        admin_id: tg!.id,
        code: String(f.get("code")),
        type: f.get("type") as "bonus" | "deposit_match" | "free_credit",
        amount: Number(f.get("amount")),
        max_redemptions: f.get("max") ? Number(f.get("max")) : null,
        expires_at: f.get("expires") ? new Date(String(f.get("expires"))).toISOString() : null,
      }})
      ;(e.target as HTMLFormElement).reset()
      await refresh()
    } catch (err) { alert((err as Error).message) }
  }

  return (
    <div className="min-h-screen bg-bingo-deep-purple text-white p-4 md:p-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-display font-extrabold tracking-wide">ADMIN PANEL</h1>
        <div className="flex items-center gap-3">
          <Link to="/" className="text-xs text-bingo-accent">← Back to app</Link>
          <button onClick={onLogout} className="text-xs text-gray-400 hover:text-white border border-white/10 rounded px-2 py-1">Logout</button>
        </div>
      </div>
      <p className="text-xs text-gray-400 mb-4">Signed in as <span className="font-mono text-white">{ADMIN_EMAIL}</span></p>

      {error && <div className="bg-red-500/20 border border-red-500/40 rounded-xl p-3 mb-4 text-sm">{error}</div>}

      <div className="flex gap-2 mb-4 flex-wrap">
        <button onClick={() => setTab("tx")} className={`px-4 py-2 rounded-lg text-xs font-bold uppercase ${tab === "tx" ? "bg-bingo-accent text-bingo-deep-purple" : "bg-white/5"}`}>Transactions</button>
        <button onClick={() => setTab("promo")} className={`px-4 py-2 rounded-lg text-xs font-bold uppercase ${tab === "promo" ? "bg-bingo-accent text-bingo-deep-purple" : "bg-white/5"}`}>Promo Codes</button>
        <button onClick={() => setTab("announce")} className={`px-4 py-2 rounded-lg text-xs font-bold uppercase ${tab === "announce" ? "bg-bingo-accent text-bingo-deep-purple" : "bg-white/5"}`}>Lobby Banner</button>
        <button onClick={() => setTab("bonus")} className={`px-4 py-2 rounded-lg text-xs font-bold uppercase ${tab === "bonus" ? "bg-bingo-accent text-bingo-deep-purple" : "bg-white/5"}`}>Bonus Drop</button>
        <button onClick={() => setTab("users")} className={`px-4 py-2 rounded-lg text-xs font-bold uppercase ${tab === "users" ? "bg-bingo-accent text-bingo-deep-purple" : "bg-white/5"}`}>Users</button>
        <button onClick={() => setTab("games")} className={`px-4 py-2 rounded-lg text-xs font-bold uppercase ${tab === "games" ? "bg-bingo-accent text-bingo-deep-purple" : "bg-white/5"}`}>Games</button>
      </div>


      {loading && <div className="flex justify-center py-12"><Loader2 className="animate-spin" /></div>}

      {!loading && tab === "tx" && (
        <ul className="space-y-3">
          {txs.length === 0 && <p className="text-gray-500 text-sm">No transactions.</p>}
          {txs.map(t => {
            const parsed = t.proof_text ? parseSms(t.proof_text) : null
            const matches = parsed?.matched && parsed.amount === Number(t.amount)
            return (
              <li key={t.id} className="bg-white/[0.04] border border-white/10 rounded-xl p-4">
                <div className="flex items-start justify-between gap-3 mb-2 flex-wrap">
                  <div>
                    <span className={`text-[10px] font-black uppercase mr-2 ${t.type === "deposit" ? "text-bingo-green" : "text-bingo-accent"}`}>{t.type}</span>
                    <span className="text-[10px] uppercase text-gray-400">{t.provider}</span>
                    <span className={`ml-2 text-[10px] font-black uppercase px-2 py-0.5 rounded border ${t.status === "pending" ? "bg-yellow-500/20 text-yellow-400 border-yellow-500/40" : t.status === "approved" ? "bg-bingo-green/20 text-bingo-green border-bingo-green/40" : "bg-red-500/20 text-red-400 border-red-500/40"}`}>{t.status}</span>
                    <p className="text-2xl font-mono font-extrabold mt-1">{Number(t.amount).toFixed(0)} ETB</p>
                    <p className="text-[11px] text-gray-500">TG: <span className="font-mono text-gray-300">{t.telegram_id}</span> · {new Date(t.created_at).toLocaleString()}</p>
                  </div>
                  {t.status === "pending" && (
                    <div className="flex gap-2">
                      <button onClick={() => handleAction(t.id, "approve")} className="px-3 py-1.5 rounded bg-bingo-green text-bingo-deep-purple text-xs font-black uppercase">Approve</button>
                      <button onClick={() => handleAction(t.id, "reject")} className="px-3 py-1.5 rounded bg-red-500 text-white text-xs font-black uppercase">Reject</button>
                    </div>
                  )}
                </div>
                {t.type === "withdrawal" && (
                  <div className="text-[11px] text-gray-300 mb-2">
                    {t.provider === "telebirr" ? `→ ${t.phone_number}` : `→ ${t.cbe_account_name} / ${t.cbe_account_number}`}
                  </div>
                )}
                {t.proof_text && (
                  <details className="mt-2">
                    <summary className="text-[11px] font-bold uppercase text-gray-400 cursor-pointer">
                      Proof SMS {parsed && (
                        <span className={`ml-2 text-[10px] ${matches ? "text-bingo-green" : "text-yellow-400"}`}>
                          {matches ? "✓ matches" : `parsed: ${parsed.amount ?? "?"} ETB · ref ${parsed.reference ?? "?"}`}
                        </span>
                      )}
                    </summary>
                    <pre className="mt-2 text-[11px] bg-black/30 p-2 rounded whitespace-pre-wrap font-mono">{t.proof_text}</pre>
                  </details>
                )}
                {t.promo_code && <p className="text-[11px] text-bingo-accent mt-1">Promo: {t.promo_code}</p>}
                {t.admin_note && <p className="text-[11px] text-gray-400 italic mt-1">Note: {t.admin_note}</p>}
              </li>
            )
          })}
        </ul>
      )}

      {!loading && tab === "promo" && (
        <div className="space-y-6">
          <form onSubmit={handleCreatePromo} className="bg-white/[0.04] border border-white/10 rounded-xl p-4 grid grid-cols-2 md:grid-cols-5 gap-2">
            <input name="code" placeholder="CODE" required className="col-span-2 md:col-span-1 px-3 py-2 bg-white/5 rounded text-sm font-mono uppercase" />
            <select name="type" defaultValue="bonus" className="px-3 py-2 bg-white/5 rounded text-sm">
              <option value="bonus">Bonus</option>
              <option value="free_credit">Free credit</option>
              <option value="deposit_match">Deposit match</option>
            </select>
            <input name="amount" type="number" placeholder="Amount" required min={1} className="px-3 py-2 bg-white/5 rounded text-sm" />
            <input name="max" type="number" placeholder="Max uses" className="px-3 py-2 bg-white/5 rounded text-sm" />
            <input name="expires" type="datetime-local" className="px-3 py-2 bg-white/5 rounded text-sm" />
            <button className="col-span-2 md:col-span-5 py-2 bg-bingo-green text-bingo-deep-purple font-black text-xs uppercase rounded">Create promo</button>
          </form>

          <ul className="space-y-2">
            {promos.length === 0 && <p className="text-gray-500 text-sm">No promo codes yet.</p>}
            {promos.map(p => (
              <li key={p.id} className="bg-white/[0.04] border border-white/10 rounded-xl p-3 flex items-center justify-between">
                <div>
                  <p className="font-mono font-bold text-bingo-accent">{p.code}</p>
                  <p className="text-[11px] text-gray-400">{p.type} · {p.amount} ETB · used {p.redemptions_count}{p.max_redemptions ? `/${p.max_redemptions}` : ""} {p.expires_at ? `· exp ${new Date(p.expires_at).toLocaleDateString()}` : ""}</p>
                </div>
                <button onClick={async () => { await togglePromo({ data: { admin_id: tg!.id, id: p.id, active: !p.active } }); refresh() }}
                  className={`text-[10px] font-black uppercase px-2 py-1 rounded border ${p.active ? "bg-bingo-green/20 text-bingo-green border-bingo-green/40" : "bg-white/5 text-gray-400 border-white/10"}`}>
                  {p.active ? "Active" : "Inactive"}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {tab === "announce" && <AnnouncePanel adminId={tg.id} />}
      {tab === "bonus" && <BonusPanel adminId={tg.id} />}
      {tab === "users" && <UsersPanel adminId={tg.id} />}
      {tab === "games" && <GamesPanel adminId={tg.id} />}
    </div>
  )
}

function AnnouncePanel({ adminId }: { adminId: number }) {
  const list = useServerFn(adminListAnnouncements)
  const setOne = useServerFn(adminSetAnnouncement)
  const clearOne = useServerFn(adminClearAnnouncement)
  const [rows, setRows] = useState<any[]>([])
  const [message, setMessage] = useState("")
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const refresh = async () => {
    try { setRows((await list({ data: { admin_id: adminId } })) as any[]) } catch (e) { setMsg((e as Error).message) }
  }
  useEffect(() => { refresh() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [])
  const active = rows.find(r => r.active)

  return (
    <div className="space-y-4 mt-6">
      <div className="bg-white/[0.04] border border-white/10 rounded-xl p-4 space-y-3">
        <p className="text-xs uppercase tracking-widest text-gray-400">Active Banner</p>
        {active ? (
          <div className="rounded-lg border border-bingo-gold/40 bg-bingo-gold/10 p-3 text-sm whitespace-pre-wrap">{active.message}</div>
        ) : <p className="text-gray-500 text-sm">No active banner.</p>}
        {active && (
          <button onClick={async () => { setBusy(true); try { await clearOne({ data: { admin_id: adminId } }); setMsg("Banner cleared."); await refresh() } catch (e) { setMsg((e as Error).message) } finally { setBusy(false) } }}
            className="text-xs text-red-400 hover:text-red-300">Clear active banner</button>
        )}
      </div>

      <form onSubmit={async (e) => {
        e.preventDefault(); setBusy(true); setMsg(null)
        try { await setOne({ data: { admin_id: adminId, message } }); setMessage(""); setMsg("Banner published."); await refresh() }
        catch (err) { setMsg((err as Error).message) } finally { setBusy(false) }
      }} className="bg-white/[0.04] border border-white/10 rounded-xl p-4 space-y-3">
        <p className="text-xs uppercase tracking-widest text-gray-400">Publish New Banner (replaces current)</p>
        <textarea value={message} onChange={e => setMessage(e.target.value)} required maxLength={500} rows={3}
          placeholder="e.g. 🎁 Tonight at 8PM: free 10 ETB drop for everyone!"
          className="w-full px-3 py-2 bg-white/5 rounded text-sm" />
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-gray-500">{message.length}/500</span>
          <button disabled={busy} className="px-4 py-2 bg-bingo-accent text-bingo-deep-purple font-black text-xs uppercase rounded disabled:opacity-50">{busy ? "Saving..." : "Publish"}</button>
        </div>
        {msg && <p className="text-xs text-gray-300">{msg}</p>}
      </form>
    </div>
  )
}


function BonusPanel({ adminId }: { adminId: number }) {
  const drop = useServerFn(adminBonusDrop)
  const list = useServerFn(adminListBonusDrops)
  const [amount, setAmount] = useState(10)
  const [note, setNote] = useState("")
  const [notify, setNotify] = useState(true)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [history, setHistory] = useState<any[]>([])

  const refresh = async () => {
    try { setHistory((await list({ data: { admin_id: adminId } })) as any[]) } catch { /* ignore */ }
  }
  useEffect(() => { refresh() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [])

  return (
    <div className="mt-6 space-y-4">
      <form className="bg-white/[0.04] border border-white/10 rounded-xl p-4 space-y-3"
        onSubmit={async (e) => {
          e.preventDefault()
          if (!window.confirm(`Credit ${amount} ETB to EVERY player?`)) return
          setBusy(true); setResult(null)
          try {
            const r = await drop({ data: { admin_id: adminId, amount, note: note || undefined, notify } }) as any
            setResult(`✅ Credited ${r.amount} ETB to ${r.recipients} players.`)
            setNote("")
            await refresh()
          } catch (err) { setResult((err as Error).message) }
          finally { setBusy(false) }
        }}>
        <p className="text-xs uppercase tracking-widest text-gray-400">Bonus Drop to All Users</p>
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="text-[10px] uppercase text-gray-400">Amount (ETB)</span>
            <input type="number" min={1} max={10000} value={amount} onChange={e => setAmount(Number(e.target.value))} required
              className="w-full px-3 py-2 bg-white/5 rounded text-sm font-mono" />
          </label>
          <label className="flex items-end gap-2 pb-2">
            <input type="checkbox" checked={notify} onChange={e => setNotify(e.target.checked)} className="accent-bingo-gold" />
            <span className="text-xs text-gray-300">Notify users in Telegram</span>
          </label>
        </div>
        <input value={note} onChange={e => setNote(e.target.value)} maxLength={300}
          placeholder="Note (e.g. 'Weekend gift from Liyu Bingo')"
          className="w-full px-3 py-2 bg-white/5 rounded text-sm" />
        <button disabled={busy} className="w-full py-2.5 bg-bingo-accent text-bingo-deep-purple font-black text-xs uppercase rounded disabled:opacity-50">
          {busy ? "Sending..." : `Drop ${amount} ETB to everyone`}
        </button>
        {result && <p className="text-xs text-gray-300">{result}</p>}
      </form>

      <div className="bg-white/[0.04] border border-white/10 rounded-xl p-4">
        <p className="text-xs uppercase tracking-widest text-gray-400 mb-2">Recent Drops</p>
        {history.length === 0 ? <p className="text-gray-500 text-sm">No drops yet.</p> : (
          <ul className="space-y-2">
            {history.map(h => (
              <li key={h.id} className="flex items-center justify-between text-sm">
                <div>
                  <span className="font-mono font-bold text-bingo-gold-soft">{h.amount} ETB</span>
                  <span className="text-gray-400"> · {h.recipients} players</span>
                  {h.note && <p className="text-[11px] text-gray-500 italic">{h.note}</p>}
                </div>
                <span className="text-[11px] text-gray-500">{new Date(h.created_at).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}


type PlayerRow = {
  telegram_id: number; first_name: string | null; username: string | null;
  phone_number: string | null; balance: number; bonus_balance: number;
  referred_by: number | null; referral_bonus_paid: boolean;
  photo_url: string | null; created_at: string;
  banned: boolean; banned_reason: string | null; banned_at: string | null;
}

function UsersPanel({ adminId }: { adminId: number }) {
  const list = useServerFn(adminListPlayers)
  const setBanned = useServerFn(adminSetBanned)
  const [rows, setRows] = useState<PlayerRow[]>([])
  const [search, setSearch] = useState("")
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [actingId, setActingId] = useState<number | null>(null)

  const refresh = async (s?: string) => {
    setBusy(true); setErr(null)
    try {
      const r = await list({ data: { admin_id: adminId, search: s || undefined } })
      setRows(r as PlayerRow[])
    } catch (e) { setErr((e as Error).message) }
    finally { setBusy(false) }
  }
  useEffect(() => { refresh() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [])

  const handleBanToggle = async (row: PlayerRow) => {
    const goingToBan = !row.banned
    const label = `${row.first_name || row.username || row.telegram_id}`
    if (goingToBan) {
      const reason = window.prompt(`Ban ${label}? Enter a reason (optional):`)
      if (reason === null) return
      setActingId(row.telegram_id)
      try { await setBanned({ data: { admin_id: adminId, telegram_id: row.telegram_id, banned: true, reason: reason || undefined } }); await refresh(search) }
      catch (e) { alert((e as Error).message) } finally { setActingId(null) }
    } else {
      if (!window.confirm(`Unban ${label}?`)) return
      setActingId(row.telegram_id)
      try { await setBanned({ data: { admin_id: adminId, telegram_id: row.telegram_id, banned: false } }); await refresh(search) }
      catch (e) { alert((e as Error).message) } finally { setActingId(null) }
    }
  }

  const totalMain = rows.reduce((s, r) => s + Math.max(0, Number(r.balance || 0) - Number(r.bonus_balance || 0)), 0)
  const totalBonus = rows.reduce((s, r) => s + Number(r.bonus_balance || 0), 0)
  const [gamesFor, setGamesFor] = useState<PlayerRow | null>(null)

  return (
    <div className="mt-6 space-y-3">
      <form onSubmit={(e) => { e.preventDefault(); refresh(search) }} className="flex gap-2 items-center">
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search username, name, phone or telegram id…"
          className="flex-1 px-3 py-2 bg-white/5 rounded text-sm" />
        <button className="px-4 py-2 bg-bingo-accent text-bingo-deep-purple font-black text-xs uppercase rounded">Search</button>
        {search && <button type="button" onClick={() => { setSearch(""); refresh("") }} className="text-xs text-gray-400">Clear</button>}
      </form>
      <div className="flex flex-wrap justify-between gap-2 text-[11px] text-gray-400">
        <span>{rows.length} users · {rows.filter(r => r.banned).length} banned</span>
        <span>
          Main: <span className="text-white font-mono">{totalMain.toFixed(2)}</span>
          <span className="mx-2 text-white/20">|</span>
          Bonus: <span className="text-bingo-gold font-mono">{totalBonus.toFixed(2)}</span>
          <span className="mx-2 text-white/20">|</span>
          Total: <span className="text-bingo-green font-mono">{(totalMain + totalBonus).toFixed(2)} ETB</span>
        </span>
      </div>
      {err && <div className="bg-red-500/20 border border-red-500/40 rounded p-2 text-sm">{err}</div>}
      {busy && <p className="text-gray-400 text-sm">Loading…</p>}
      <div className="overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full text-[12px]">
          <thead className="bg-white/5 text-gray-400 uppercase text-[10px] tracking-wider">
            <tr>
              <th className="text-left px-3 py-2">User</th>
              <th className="text-left px-3 py-2">Telegram ID</th>
              <th className="text-left px-3 py-2">Username</th>
              <th className="text-left px-3 py-2">Phone</th>
              <th className="text-right px-3 py-2 border-l border-white/15">Main balance</th>
              <th className="text-right px-3 py-2 border-l border-white/15">Bonus</th>
              <th className="text-right px-3 py-2 border-l border-r border-white/15">Total</th>
              <th className="text-left px-3 py-2">Referred by</th>
              <th className="text-left px-3 py-2">Status</th>
              <th className="text-right px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => {
              const total = Number(r.balance || 0)
              const bonus = Math.min(total, Number(r.bonus_balance || 0))
              const main = total - bonus
              return (
              <tr key={r.telegram_id} className={`border-t border-white/5 hover:bg-white/[0.02] ${r.banned ? "bg-red-500/5" : ""}`}>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    {r.photo_url
                      ? <img src={r.photo_url} alt="" className="w-7 h-7 rounded-full" />
                      : <div className="w-7 h-7 rounded-full bg-bingo-accent/30 flex items-center justify-center text-[10px] font-black">{(r.first_name || r.username || "?").charAt(0).toUpperCase()}</div>}
                    <span className="font-semibold">{r.first_name || "—"}</span>
                  </div>
                </td>
                <td className="px-3 py-2 font-mono text-gray-300">{r.telegram_id}</td>
                <td className="px-3 py-2 text-bingo-accent">{r.username ? `@${r.username}` : "—"}</td>
                <td className="px-3 py-2 font-mono">{r.phone_number || <span className="text-gray-600">—</span>}</td>
                <td className="px-3 py-2 text-right font-mono border-l border-white/10">{main.toFixed(2)}</td>
                <td className="px-3 py-2 text-right font-mono text-bingo-gold border-l border-white/10">{bonus.toFixed(2)}</td>
                <td className="px-3 py-2 text-right font-mono text-bingo-green font-bold border-l border-r border-white/10">{total.toFixed(2)}</td>
                <td className="px-3 py-2 font-mono text-gray-400">
                  {r.referred_by ? <>{r.referred_by} {r.referral_bonus_paid && <span className="text-bingo-green">✓</span>}</> : "—"}
                </td>
                <td className="px-3 py-2">
                  {r.banned
                    ? <span title={r.banned_reason || ""} className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-red-500/20 text-red-300 border border-red-500/40">Banned</span>
                    : <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-bingo-green/20 text-bingo-green border border-bingo-green/40">Active</span>}
                </td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  <button onClick={() => setGamesFor(r)} className="text-[10px] font-black uppercase px-3 py-1 rounded border bg-bingo-accent/20 text-bingo-accent border-bingo-accent/40 hover:bg-bingo-accent/30 mr-1.5">Games</button>
                  <button
                    onClick={() => handleBanToggle(r)}
                    disabled={actingId === r.telegram_id}
                    className={`text-[10px] font-black uppercase px-3 py-1 rounded border ${r.banned ? "bg-bingo-green/20 text-bingo-green border-bingo-green/40 hover:bg-bingo-green/30" : "bg-red-500/20 text-red-300 border-red-500/40 hover:bg-red-500/30"} disabled:opacity-50`}
                  >
                    {actingId === r.telegram_id ? "…" : r.banned ? "Unban" : "Ban"}
                  </button>
                </td>
              </tr>
            )})}
            {rows.length === 0 && !busy && <tr><td colSpan={10} className="px-3 py-6 text-center text-gray-500">No users found.</td></tr>}
          </tbody>
        </table>
      </div>
      {gamesFor && <PlayerGamesModal adminId={adminId} player={gamesFor} onClose={() => setGamesFor(null)} />}
    </div>
  )
}

type PlayerGame = {
  id: string; game_code: string | null; cartela_id: number; stake: number; is_winner: boolean;
  payout: number; prize_pool: number; player_count: number; created_at: string;
}

function PlayerGamesModal({ adminId, player, onClose }: { adminId: number; player: PlayerRow; onClose: () => void }) {
  const fetchGames = useServerFn(adminPlayerGames)
  const [data, setData] = useState<{ games: PlayerGame[]; summary: { games: number; wins: number; losses: number; staked: number; won: number; net: number } } | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    fetchGames({ data: { admin_id: adminId, telegram_id: player.telegram_id } })
      .then(r => setData(r as any))
      .catch(e => setErr((e as Error).message))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player.telegram_id])

  const label = player.username ? `@${player.username}` : (player.first_name || String(player.telegram_id))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-2xl max-h-[85vh] flex flex-col bg-bingo-deep-purple border border-bingo-accent/40 rounded-2xl shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <div>
            <h3 className="font-display font-extrabold text-white">Games · {label}</h3>
            <p className="text-[11px] text-gray-400 font-mono">{player.telegram_id}{player.phone_number ? ` · ${player.phone_number}` : ""}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl leading-none px-2">×</button>
        </div>
        {err && <div className="m-4 bg-red-500/20 border border-red-500/40 rounded p-2 text-sm">{err}</div>}
        {!data && !err && <p className="p-6 text-gray-400 text-sm flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Loading…</p>}
        {data && (
          <>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 p-4 text-center text-[11px]">
              {[
                ["Games", data.summary.games, "text-white"],
                ["Won", data.summary.wins, "text-bingo-green"],
                ["Lost", data.summary.losses, "text-red-300"],
                ["Staked", data.summary.staked.toFixed(2), "text-white"],
                ["Payouts", data.summary.won.toFixed(2), "text-bingo-gold"],
                ["Net", `${data.summary.net >= 0 ? "+" : ""}${data.summary.net.toFixed(2)}`, data.summary.net >= 0 ? "text-bingo-green" : "text-red-300"],
              ].map(([k, v, c]) => (
                <div key={k as string} className="rounded-lg bg-white/5 py-2">
                  <p className="text-gray-500 uppercase tracking-wider text-[9px]">{k}</p>
                  <p className={`font-mono font-bold ${c}`}>{v}</p>
                </div>
              ))}
            </div>
            <div className="overflow-auto px-4 pb-4">
              <table className="w-full text-[12px]">
                <thead className="text-gray-400 uppercase text-[10px] tracking-wider">
                  <tr>
                    <th className="text-left py-1.5">Game</th>
                    <th className="text-left py-1.5">Cartela</th>
                    <th className="text-right py-1.5">Bet</th>
                    <th className="text-center py-1.5">Result</th>
                    <th className="text-right py-1.5">Payout</th>
                    <th className="text-right py-1.5">Players</th>
                    <th className="text-right py-1.5">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {data.games.map(g => (
                    <tr key={g.id} className="border-t border-white/5">
                      <td className="py-1.5 font-mono text-gray-300">{g.game_code ?? "—"}</td>
                      <td className="py-1.5 font-mono">#{g.cartela_id}</td>
                      <td className="py-1.5 text-right font-mono">{g.stake.toFixed(2)}</td>
                      <td className="py-1.5 text-center">
                        {g.is_winner
                          ? <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-bingo-green/20 text-bingo-green border border-bingo-green/40">Won</span>
                          : <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-red-500/15 text-red-300 border border-red-500/30">Lost</span>}
                      </td>
                      <td className="py-1.5 text-right font-mono text-bingo-gold">{g.payout > 0 ? g.payout.toFixed(2) : "—"}</td>
                      <td className="py-1.5 text-right font-mono text-gray-400">{g.player_count}</td>
                      <td className="py-1.5 text-right text-gray-400 whitespace-nowrap">{new Date(g.created_at).toLocaleString()}</td>
                    </tr>
                  ))}
                  {data.games.length === 0 && <tr><td colSpan={7} className="py-6 text-center text-gray-500">No games played yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

type GameRow = {
  id: string; short_code: string | null; stake: number; prize_pool: number;
  player_count: number; called_numbers: number[] | null; winner_telegram_id: number | null;
  status: string; started_at: string | null; ended_at: string | null; created_at: string;
}

function GamesPanel({ adminId }: { adminId: number }) {
  const list = useServerFn(adminListGames)
  const [rows, setRows] = useState<GameRow[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const refresh = async () => {
    setBusy(true); setErr(null)
    try { setRows((await list({ data: { admin_id: adminId, limit: 100 } })) as GameRow[]) }
    catch (e) { setErr((e as Error).message) }
    finally { setBusy(false) }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { refresh() }, [])

  const totalStaked = rows.reduce((s, g) => s + Number(g.stake || 0) * Math.max(1, Number(g.player_count || 0)), 0)
  const totalPayout = rows.reduce((s, g) => s + Number(g.prize_pool || 0), 0)

  return (
    <div className="mt-6 space-y-3">
      <div className="flex flex-wrap justify-between gap-2 text-[11px] text-gray-400">
        <span>{rows.length} recent games</span>
        <span>
          Staked: <span className="text-white font-mono">{totalStaked.toFixed(2)}</span>
          <span className="mx-2 text-white/20">|</span>
          Payouts: <span className="text-bingo-gold font-mono">{totalPayout.toFixed(2)}</span>
          <span className="mx-2 text-white/20">|</span>
          House: <span className="text-bingo-green font-mono">{(totalStaked - totalPayout).toFixed(2)} ETB</span>
        </span>
      </div>
      {err && <div className="bg-red-500/20 border border-red-500/40 rounded p-2 text-sm">{err}</div>}
      {busy && <p className="text-gray-400 text-sm">Loading…</p>}
      <div className="overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full text-[12px]">
          <thead className="bg-white/5 text-gray-400 uppercase text-[10px] tracking-wider">
            <tr>
              <th className="text-left px-3 py-2">Game</th>
              <th className="text-right px-3 py-2">Stake</th>
              <th className="text-right px-3 py-2">Players</th>
              <th className="text-right px-3 py-2">Prize pool</th>
              <th className="text-left px-3 py-2">Winner</th>
              <th className="text-center px-3 py-2">Calls</th>
              <th className="text-left px-3 py-2">Status</th>
              <th className="text-right px-3 py-2">Date</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(g => (
              <tr key={g.id} className="border-t border-white/5 hover:bg-white/[0.02]">
                <td className="px-3 py-2 font-mono text-gray-300">{g.short_code ?? "—"}</td>
                <td className="px-3 py-2 text-right font-mono">{Number(g.stake || 0).toFixed(2)}</td>
                <td className="px-3 py-2 text-right font-mono text-gray-400">{g.player_count}</td>
                <td className="px-3 py-2 text-right font-mono text-bingo-gold">{Number(g.prize_pool || 0).toFixed(2)}</td>
                <td className="px-3 py-2 font-mono text-gray-300">{g.winner_telegram_id ?? "—"}</td>
                <td className="px-3 py-2 text-center font-mono text-gray-400">{Array.isArray(g.called_numbers) ? g.called_numbers.length : 0}</td>
                <td className="px-3 py-2">
                  <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-white/5 text-gray-300 border border-white/10">{g.status}</span>
                </td>
                <td className="px-3 py-2 text-right text-gray-400 whitespace-nowrap">{new Date(g.created_at).toLocaleString()}</td>
              </tr>
            ))}
            {rows.length === 0 && !busy && <tr><td colSpan={8} className="px-3 py-6 text-center text-gray-500">No games yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}

