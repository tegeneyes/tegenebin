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
  adminBonusDrop, adminListBonusDrops, adminListPlayers, adminSetBanned, adminPlayerDetail, adminDeletePlayer,
  type PlayerGameRow, type PlayerCartelaRow,
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
  const [tab, setTab] = useState<"tx" | "promo" | "announce" | "bonus" | "users">("tx")
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

  const [txDialog, setTxDialog] = useState<{ tx_id: string; action: "approve" | "reject" } | null>(null)
  const [txBusy, setTxBusy] = useState(false)

  const runTxAction = async (note?: string) => {
    if (!txDialog) return
    setTxBusy(true)
    try {
      await process({ data: { admin_id: tg!.id, tx_id: txDialog.tx_id, action: txDialog.action, note } })
      await refresh()
      setTxDialog(null)
    } catch (e) { setError((e as Error).message) }
    finally { setTxBusy(false) }
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
    } catch (err) { setError((err as Error).message) }
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
                      <button onClick={() => setTxDialog({ tx_id: t.id, action: "approve" })} className="px-3 py-1.5 rounded bg-bingo-green text-bingo-deep-purple text-xs font-black uppercase">Approve</button>
                      <button onClick={() => setTxDialog({ tx_id: t.id, action: "reject" })} className="px-3 py-1.5 rounded bg-red-500 text-white text-xs font-black uppercase">Reject</button>
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

      <PromptDialog
        open={!!txDialog}
        title={txDialog?.action === "approve" ? "Approve transaction" : "Reject transaction"}
        message="Optional note — it is shown to the player in their transaction history."
        placeholder="Note (optional)"
        confirmLabel={txDialog?.action === "approve" ? "Approve" : "Reject"}
        busy={txBusy}
        onSubmit={(note) => runTxAction(note.trim() || undefined)}
        onCancel={() => setTxDialog(null)}
      />
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

  const [confirming, setConfirming] = useState(false)

  const doDrop = async () => {
    setBusy(true); setResult(null)
    try {
      const r = await drop({ data: { admin_id: adminId, amount, note: note || undefined, notify } }) as any
      setResult(`✅ Credited ${r.amount} ETB to ${r.recipients} players.`)
      setNote("")
      await refresh()
    } catch (err) { setResult((err as Error).message) }
    finally { setBusy(false); setConfirming(false) }
  }

  return (
    <div className="mt-6 space-y-4">
      <form className="bg-white/[0.04] border border-white/10 rounded-xl p-4 space-y-3"
        onSubmit={(e) => { e.preventDefault(); setConfirming(true) }}>
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

      <ConfirmDialog
        open={confirming}
        title="Bonus drop"
        message={`Credit ${amount} ETB to EVERY player? This cannot be undone.`}
        confirmLabel="Drop"
        busy={busy}
        onConfirm={doDrop}
        onCancel={() => setConfirming(false)}
      />
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
  const del = useServerFn(adminDeletePlayer)
  const PAGE = 200
  const [rows, setRows] = useState<PlayerRow[]>([])
  const [total, setTotal] = useState(0)
  const [bannedTotal, setBannedTotal] = useState(0)
  const [search, setSearch] = useState("")
  const [activeSearch, setActiveSearch] = useState("")
  const [busy, setBusy] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [actingId, setActingId] = useState<number | null>(null)
  const [dialog, setDialog] = useState<
    | { type: "ban"; row: PlayerRow }
    | { type: "unban"; row: PlayerRow }
    | { type: "delete"; row: PlayerRow }
    | null
  >(null)
  const [actionBusy, setActionBusy] = useState(false)

  const rowLabel = (row: PlayerRow) =>
    row.username ? `@${row.username}` : (row.first_name || String(row.telegram_id))

  const fetchPage = async (term: string, offset: number) => {
    const res = await list({ data: { admin_id: adminId, search: term || undefined, limit: PAGE, offset } })
    return res as { rows: PlayerRow[]; total: number; banned: number }
  }

  const refresh = async (s?: string) => {
    const term = s ?? ""
    setBusy(true); setErr(null)
    try {
      const res = await fetchPage(term, 0)
      setRows(res.rows); setTotal(res.total); setBannedTotal(res.banned); setActiveSearch(term)
    } catch (e) { setErr((e as Error).message) }
    finally { setBusy(false) }
  }
  useEffect(() => { refresh() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [])

  const loadMore = async () => {
    setLoadingMore(true); setErr(null)
    try {
      const res = await fetchPage(activeSearch, rows.length)
      setRows(prev => [...prev, ...res.rows]); setTotal(res.total); setBannedTotal(res.banned)
    } catch (e) { setErr((e as Error).message) }
    finally { setLoadingMore(false) }
  }

  const applyBan = async (row: PlayerRow, banned: boolean, reason?: string) => {
    setActionBusy(true)
    try {
      await setBanned({ data: { admin_id: adminId, telegram_id: row.telegram_id, banned, reason: reason || undefined } })
      await refresh(activeSearch)
      setDialog(null)
    } catch (e) { setErr((e as Error).message) }
    finally { setActionBusy(false) }
  }

  const removePlayer = async (row: PlayerRow) => {
    setActionBusy(true)
    try {
      await del({ data: { admin_id: adminId, telegram_id: row.telegram_id } })
      await refresh(activeSearch)
      setDialog(null)
    } catch (e) { setErr((e as Error).message) }
    finally { setActionBusy(false) }
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
        <span>{rows.length} / {total} users · {bannedTotal} banned</span>
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
              <tr key={r.telegram_id} onClick={() => setGamesFor(r)} className={`border-t border-white/5 hover:bg-white/[0.02] cursor-pointer ${r.banned ? "bg-red-500/5" : ""}`}>
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
                  <button onClick={(e) => { e.stopPropagation(); setGamesFor(r) }} className="text-[10px] font-black uppercase px-3 py-1 rounded border bg-bingo-accent/20 text-bingo-accent border-bingo-accent/40 hover:bg-bingo-accent/30 mr-1.5">Details</button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setDialog(r.banned ? { type: "unban", row: r } : { type: "ban", row: r }) }}
                    disabled={actingId === r.telegram_id}
                    className={`text-[10px] font-black uppercase px-3 py-1 rounded border mr-1.5 ${r.banned ? "bg-bingo-green/20 text-bingo-green border-bingo-green/40 hover:bg-bingo-green/30" : "bg-red-500/20 text-red-300 border-red-500/40 hover:bg-red-500/30"} disabled:opacity-50`}
                  >
                    {actingId === r.telegram_id ? "…" : r.banned ? "Unban" : "Ban"}
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setDialog({ type: "delete", row: r }) }}
                    disabled={actingId === r.telegram_id}
                    className="text-[10px] font-black uppercase px-3 py-1 rounded border bg-white/5 text-gray-300 border-white/15 hover:bg-red-500/20 hover:text-red-300 hover:border-red-500/40 disabled:opacity-50"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            )})}
            {rows.length === 0 && !busy && <tr><td colSpan={10} className="px-3 py-6 text-center text-gray-500">No users found.</td></tr>}
          </tbody>
        </table>
      </div>
      {rows.length < total && (
        <button onClick={loadMore} disabled={loadingMore}
          className="w-full py-2.5 rounded-xl border border-white/15 text-white font-bold text-xs uppercase disabled:opacity-50">
          {loadingMore ? "Loading…" : `Load ${Math.min(PAGE, total - rows.length)} more`}
        </button>
      )}
      {gamesFor && <PlayerDetailModal adminId={adminId} player={gamesFor} onClose={() => setGamesFor(null)} onChanged={() => refresh(activeSearch)} />}

      <PromptDialog
        open={dialog?.type === "ban"}
        title={`Ban ${dialog ? rowLabel(dialog.row) : ""}`}
        message="The player will be unable to play or deposit. The reason is optional and stored internally."
        placeholder="Reason (optional)"
        confirmLabel="Ban"
        busy={actionBusy}
        onSubmit={(reason) => dialog && applyBan(dialog.row, true, reason.trim())}
        onCancel={() => setDialog(null)}
      />
      <ConfirmDialog
        open={dialog?.type === "unban"}
        title={`Unban ${dialog ? rowLabel(dialog.row) : ""}`}
        message="This player will be able to play and deposit again."
        confirmLabel="Unban"
        busy={actionBusy}
        onConfirm={() => dialog && applyBan(dialog.row, false)}
        onCancel={() => setDialog(null)}
      />
      <ConfirmDialog
        open={dialog?.type === "delete"}
        title={`Delete ${dialog ? rowLabel(dialog.row) : ""}`}
        message="Permanently removes the player, their transactions, game history and bonuses. They can then register again with the same Telegram account."
        confirmLabel="Delete"
        danger
        busy={actionBusy}
        onConfirm={() => dialog && removePlayer(dialog.row)}
        onCancel={() => setDialog(null)}
      />
    </div>
  )
}

type PlayerTx = {
  id: string; type: string; amount: number; status: string; provider: string | null;
  reference: string | null; phone_number: string | null; cbe_account_name: string | null;
  cbe_account_number: string | null; proof_text: string | null; admin_note: string | null; created_at: string;
}

type PlayerDetail = {
  player: PlayerRow | null
  summary: {
    games: number; wins: number; losses: number; staked: number; won: number; net: number;
    deposited: number; deposit_pending: number; withdrawn: number; withdrawal_pending: number;
  }
  transactions: PlayerTx[]
  games: PlayerGameRow[]
  cartelas: PlayerCartelaRow[]
}

function PlayerDetailModal({ adminId, player, onClose, onChanged }: { adminId: number; player: PlayerRow; onClose: () => void; onChanged?: () => void }) {
  const fetchDetail = useServerFn(adminPlayerDetail)
  const setBanned = useServerFn(adminSetBanned)
  const [data, setData] = useState<PlayerDetail | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [view, setView] = useState<"overview" | "games" | "cartelas" | "tx">("overview")
  const [banned, setBannedState] = useState(player.banned)
  const [bannedReason, setBannedReason] = useState(player.banned_reason)
  const [banDialog, setBanDialog] = useState<"ban" | "unban" | null>(null)
  const [banBusy, setBanBusy] = useState(false)

  useEffect(() => {
    fetchDetail({ data: { admin_id: adminId, telegram_id: player.telegram_id } })
      .then(r => setData(r as PlayerDetail))
      .catch(e => setErr((e as Error).message))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player.telegram_id])

  const applyBan = async (next: boolean, reason?: string) => {
    setBanBusy(true)
    try {
      await setBanned({ data: { admin_id: adminId, telegram_id: player.telegram_id, banned: next, reason: reason || undefined } })
      setBannedState(next)
      setBannedReason(next ? (reason || null) : null)
      setBanDialog(null)
      onChanged?.()
    } catch (e) { setErr((e as Error).message) }
    finally { setBanBusy(false) }
  }

  const label = player.username ? `@${player.username}` : (player.first_name || String(player.telegram_id))
  const s = data?.summary

  const Stat = ({ k, v, c = "text-white" }: { k: string; v: string | number; c?: string }) => (
    <div className="rounded-lg bg-white/5 py-2 px-1">
      <p className="text-gray-500 uppercase tracking-wider text-[9px]">{k}</p>
      <p className={`font-mono font-bold ${c}`}>{v}</p>
    </div>
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-3xl max-h-[88vh] flex flex-col bg-bingo-deep-purple border border-bingo-accent/40 rounded-2xl shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <div>
            <h3 className="font-display font-extrabold text-white">{label}</h3>
            <p className="text-[11px] text-gray-400 font-mono">
              {player.telegram_id}{player.phone_number ? ` · ${player.phone_number}` : ""}{banned ? " · BANNED" : ""}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl leading-none px-2">×</button>
        </div>

        <div className="flex gap-2 px-4 pt-3 flex-wrap">
          {(["overview", "games", "cartelas", "tx"] as const).map(v => (
            <button key={v} onClick={() => setView(v)}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase ${view === v ? "bg-bingo-accent text-bingo-deep-purple" : "bg-white/5 text-gray-300"}`}>
              {v === "tx" ? "Deposits" : v}
            </button>
          ))}
        </div>

        {err && <div className="m-4 bg-red-500/20 border border-red-500/40 rounded p-2 text-sm">{err}</div>}
        {!data && !err && <p className="p-6 text-gray-400 text-sm flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Loading…</p>}

        {data && s && (
          <div className="flex-1 overflow-auto p-4 space-y-4">
            {view === "overview" && (
              <>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 text-center text-[11px]">
                  <Stat k="Main balance" v={Number(data.player?.balance ?? 0).toFixed(2)} c="text-bingo-green" />
                  <Stat k="Bonus" v={Number(data.player?.bonus_balance ?? 0).toFixed(2)} c="text-bingo-gold" />
                  <Stat k="Deposited" v={s.deposited.toFixed(2)} c="text-bingo-green" />
                  <Stat k="Deposit pending" v={s.deposit_pending.toFixed(2)} c="text-yellow-400" />
                  <Stat k="Withdrawn" v={s.withdrawn.toFixed(2)} c="text-bingo-accent" />
                  <Stat k="Withdraw pending" v={s.withdrawal_pending.toFixed(2)} c="text-yellow-400" />
                  <Stat k="Games" v={s.games} />
                  <Stat k="Wins" v={s.wins} c="text-bingo-green" />
                  <Stat k="Losses" v={s.losses} c="text-red-300" />
                  <Stat k="Staked" v={s.staked.toFixed(2)} />
                  <Stat k="Payouts" v={s.won.toFixed(2)} c="text-bingo-gold" />
                  <Stat k="Net" v={`${s.net >= 0 ? "+" : ""}${s.net.toFixed(2)}`} c={s.net >= 0 ? "text-bingo-green" : "text-red-300"} />
                </div>
                <div className="text-[11px] text-gray-400 space-y-1">
                  <p>Name: <span className="text-gray-200">{player.first_name || "—"}</span></p>
                  <p>Username: <span className="text-gray-200">{player.username ? `@${player.username}` : "—"}</span></p>
                  <p>Phone: <span className="font-mono text-gray-200">{player.phone_number || "—"}</span></p>
                  <p>Telegram ID: <span className="font-mono text-gray-200">{player.telegram_id}</span></p>
                  <p>Joined: <span className="text-gray-200">{new Date(player.created_at).toLocaleString()}</span></p>
                  <p>Referred by: <span className="font-mono text-gray-200">{player.referred_by ?? "—"}</span> {player.referral_bonus_paid ? <span className="text-bingo-green">· bonus paid</span> : ""}</p>
                </div>

                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] uppercase tracking-widest text-gray-400">Account status</span>
                    {banned
                      ? <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-red-500/20 text-red-300 border border-red-500/40">Banned</span>
                      : <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-bingo-green/20 text-bingo-green border border-bingo-green/40">Active</span>}
                  </div>
                  {banned && <p className="text-[11px] text-red-300">Reason: {bannedReason || "—"}</p>}
                  <button
                    onClick={() => setBanDialog(banned ? "unban" : "ban")}
                    disabled={banBusy}
                    className={`w-full py-2.5 rounded-xl font-black text-xs uppercase disabled:opacity-50 ${banned ? "bg-bingo-green text-bingo-deep-purple" : "bg-red-500 text-white"}`}
                  >
                    {banned ? "Unban player" : "Ban player"}
                  </button>
                </div>
              </>
            )}

            {view === "games" && (
              <table className="w-full text-[12px]">
                <thead className="text-gray-400 uppercase text-[10px] tracking-wider">
                  <tr>
                    <th className="text-left py-1.5">Game</th>
                    <th className="text-left py-1.5">Cartela</th>
                    <th className="text-right py-1.5">Bet</th>
                    <th className="text-center py-1.5">Result</th>
                    <th className="text-right py-1.5">Payout</th>
                    <th className="text-right py-1.5">Players</th>
                    <th className="text-right py-1.5">Calls</th>
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
                      <td className="py-1.5 text-right font-mono text-gray-400">{g.called_count}</td>
                      <td className="py-1.5 text-right text-gray-400 whitespace-nowrap">{new Date(g.created_at).toLocaleString()}</td>
                    </tr>
                  ))}
                  {data.games.length === 0 && <tr><td colSpan={8} className="py-6 text-center text-gray-500">No games played yet.</td></tr>}
                </tbody>
              </table>
            )}

            {view === "cartelas" && (
              <table className="w-full text-[12px]">
                <thead className="text-gray-400 uppercase text-[10px] tracking-wider">
                  <tr>
                    <th className="text-left py-1.5">Cartela</th>
                    <th className="text-right py-1.5">Plays</th>
                    <th className="text-right py-1.5">Wins</th>
                    <th className="text-right py-1.5">Staked</th>
                    <th className="text-right py-1.5">Won</th>
                    <th className="text-right py-1.5">Net</th>
                  </tr>
                </thead>
                <tbody>
                  {data.cartelas.map(c => (
                    <tr key={c.cartela_id} className="border-t border-white/5">
                      <td className="py-1.5 font-mono">#{c.cartela_id}</td>
                      <td className="py-1.5 text-right font-mono text-gray-300">{c.plays}</td>
                      <td className="py-1.5 text-right font-mono text-bingo-green">{c.wins}</td>
                      <td className="py-1.5 text-right font-mono">{c.staked.toFixed(2)}</td>
                      <td className="py-1.5 text-right font-mono text-bingo-gold">{c.won.toFixed(2)}</td>
                      <td className={`py-1.5 text-right font-mono ${c.won - c.staked >= 0 ? "text-bingo-green" : "text-red-300"}`}>{(c.won - c.staked).toFixed(2)}</td>
                    </tr>
                  ))}
                  {data.cartelas.length === 0 && <tr><td colSpan={6} className="py-6 text-center text-gray-500">No cartelas played yet.</td></tr>}
                </tbody>
              </table>
            )}

            {view === "tx" && (
              <table className="w-full text-[12px]">
                <thead className="text-gray-400 uppercase text-[10px] tracking-wider">
                  <tr>
                    <th className="text-left py-1.5">Type</th>
                    <th className="text-right py-1.5">Amount</th>
                    <th className="text-center py-1.5">Status</th>
                    <th className="text-left py-1.5">Provider</th>
                    <th className="text-left py-1.5">Reference / Account</th>
                    <th className="text-right py-1.5">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {data.transactions.map(t => (
                    <tr key={t.id} className="border-t border-white/5">
                      <td className="py-1.5">
                        <span className={`text-[10px] font-black uppercase ${t.type === "deposit" ? "text-bingo-green" : "text-bingo-accent"}`}>{t.type}</span>
                      </td>
                      <td className="py-1.5 text-right font-mono">{Number(t.amount).toFixed(2)}</td>
                      <td className="py-1.5 text-center">
                        <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded border ${t.status === "approved" ? "bg-bingo-green/20 text-bingo-green border-bingo-green/40" : t.status === "pending" ? "bg-yellow-500/20 text-yellow-400 border-yellow-500/40" : "bg-red-500/20 text-red-300 border-red-500/40"}`}>{t.status}</span>
                      </td>
                      <td className="py-1.5 uppercase text-gray-400">{t.provider ?? "—"}</td>
                      <td className="py-1.5 font-mono text-gray-300 break-all">{t.reference || t.phone_number || t.cbe_account_number || "—"}</td>
                      <td className="py-1.5 text-right text-gray-400 whitespace-nowrap">{new Date(t.created_at).toLocaleString()}</td>
                    </tr>
                  ))}
                  {data.transactions.length === 0 && <tr><td colSpan={6} className="py-6 text-center text-gray-500">No transactions yet.</td></tr>}
                </tbody>
              </table>
            )}
          </div>
        )}

        <PromptDialog
          open={banDialog === "ban"}
          title={`Ban ${label}`}
          message="The player will be unable to play or deposit. The reason is optional."
          placeholder="Reason (optional)"
          confirmLabel="Ban"
          busy={banBusy}
          onSubmit={(reason) => applyBan(true, reason.trim())}
          onCancel={() => setBanDialog(null)}
        />
        <ConfirmDialog
          open={banDialog === "unban"}
          title={`Unban ${label}`}
          message="This player will be able to play and deposit again."
          confirmLabel="Unban"
          busy={banBusy}
          onConfirm={() => applyBan(false)}
          onCancel={() => setBanDialog(null)}
        />
      </div>
    </div>
  )
}

function ConfirmDialog({
  open, title, message, confirmLabel = "Confirm", danger = false, busy = false, onConfirm, onCancel,
}: {
  open: boolean; title: string; message: string; confirmLabel?: string; danger?: boolean; busy?: boolean;
  onConfirm: () => void; onCancel: () => void;
}) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={onCancel}>
      <div className="w-full max-w-sm bg-bingo-deep-purple border border-white/15 rounded-2xl p-5 space-y-4 shadow-2xl" onClick={e => e.stopPropagation()}>
        <h3 className="font-display font-extrabold text-white text-lg">{title}</h3>
        <p className="text-sm text-gray-300 whitespace-pre-wrap">{message}</p>
        <div className="grid grid-cols-2 gap-2">
          <button onClick={onCancel} disabled={busy} className="py-2.5 rounded-xl border border-white/15 text-white font-bold text-xs uppercase disabled:opacity-50">Cancel</button>
          <button onClick={onConfirm} disabled={busy} className={`py-2.5 rounded-xl font-black text-xs uppercase disabled:opacity-50 ${danger ? "bg-red-500 text-white" : "bg-bingo-green text-bingo-deep-purple"}`}>
            {busy ? "…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

function PromptDialog({
  open, title, message, placeholder, confirmLabel = "Save", busy = false, onSubmit, onCancel,
}: {
  open: boolean; title: string; message: string; placeholder?: string; confirmLabel?: string; busy?: boolean;
  onSubmit: (value: string) => void; onCancel: () => void;
}) {
  const [value, setValue] = useState("")
  useEffect(() => { if (open) setValue("") }, [open])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={onCancel}>
      <div className="w-full max-w-sm bg-bingo-deep-purple border border-white/15 rounded-2xl p-5 space-y-4 shadow-2xl" onClick={e => e.stopPropagation()}>
        <h3 className="font-display font-extrabold text-white text-lg">{title}</h3>
        <p className="text-sm text-gray-300 whitespace-pre-wrap">{message}</p>
        <textarea value={value} onChange={e => setValue(e.target.value)} placeholder={placeholder} rows={3}
          className="w-full px-3 py-2 rounded-xl bg-white/[0.04] border border-white/10 text-white text-sm focus:border-bingo-accent focus:outline-none resize-none" />
        <div className="grid grid-cols-2 gap-2">
          <button onClick={onCancel} disabled={busy} className="py-2.5 rounded-xl border border-white/15 text-white font-bold text-xs uppercase disabled:opacity-50">Cancel</button>
          <button onClick={() => onSubmit(value)} disabled={busy} className="py-2.5 rounded-xl bg-bingo-green text-bingo-deep-purple font-black text-xs uppercase disabled:opacity-50">
            {busy ? "…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

