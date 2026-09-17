"use client"

import { useEffect, useState } from "react"
import { useServerFn } from "@tanstack/react-start"
import { History, Wallet as WalletIcon, ArrowDownToLine, ArrowUpFromLine, Gift, Copy, Check, Loader2 } from "lucide-react"
import { ScreenWrapper } from "@/components/bingo/screen-wrapper"
import { useTelegramUser } from "@/hooks/use-telegram-user"
import { ensurePlayer, getWallet, requestDeposit, requestWithdrawal, redeemPromo } from "@/lib/wallet.functions"
import { getDepositInstructions } from "@/lib/deposit-config.functions"
import { TELEBIRR_PHONE, CBE_ACCOUNT, ACCOUNT_NAME } from "@/lib/payment-config"
import { useI18n } from "@/lib/i18n"

type Tab = "balance" | "deposit" | "withdraw" | "promo" | "history"
type Tx = {
  id: string
  type: string
  amount: number
  status: string
  provider: string | null
  created_at: string
  admin_note: string | null
  promo_code: string | null
}
type Player = { balance: number; bonus_balance: number } | null
type DepositConfig = { telebirr: { phone: string; name: string }; cbe: { account_number: string; account_name: string } }

// Static deposit destinations so the info renders instantly (no fetch wait).
const DEFAULT_CONFIG: DepositConfig = {
  telebirr: { phone: TELEBIRR_PHONE, name: ACCOUNT_NAME },
  cbe: { account_number: CBE_ACCOUNT, account_name: ACCOUNT_NAME },
}

// Module-level cache so config & wallet data persist across tab switches and remounts.
let cachedConfig: DepositConfig | null = DEFAULT_CONFIG
let cachedPlayer: Player = null
let cachedTxs: Tx[] = []

export function WalletScreen() {
  const tg = useTelegramUser()
  const { t } = useI18n()
  const [tab, setTab] = useState<Tab>("deposit")
  const [player, setPlayer] = useState<Player>(cachedPlayer)
  const [txs, setTxs] = useState<Tx[]>(cachedTxs)
  const [config, setConfig] = useState<DepositConfig>(cachedConfig ?? DEFAULT_CONFIG)


  const ensure = useServerFn(ensurePlayer)
  const fetchWallet = useServerFn(getWallet)
  const getConfig = useServerFn(getDepositInstructions)

  const refresh = async () => {
    if (!tg) return
    const w = await fetchWallet({ data: { telegram_id: tg.id } })
    cachedPlayer = w.player as Player
    cachedTxs = w.transactions as Tx[]
    setPlayer(cachedPlayer)
    setTxs(cachedTxs)
  }

  useEffect(() => {
    if (!tg) return
    ;(async () => {
      await ensure({ data: { telegram_id: tg.id, first_name: tg.first_name, username: tg.username, photo_url: tg.photo_url } })
      await refresh()
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tg?.id])

  useEffect(() => {
    // Background refresh only — static defaults already rendered.
    getConfig().then(c => { cachedConfig = c as DepositConfig; setConfig(cachedConfig) }).catch(() => {})
  }, [getConfig])

  const balance = Number(player?.balance ?? 0)
  const bonus = Number(player?.bonus_balance ?? 0)

  return (
    <ScreenWrapper screenKey="wallet">
      <div className="mb-4">
        <h2 className="text-xl font-display font-extrabold text-white tracking-wide">{t("wallet.title")}</h2>
        <p className="text-[11px] font-mono text-gray-500 mt-0.5">{t("wallet.tg_id")}: {tg?.id ?? "—"}</p>
      </div>

      {/* Balance summary */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-white/[0.04] rounded-2xl border border-white/10 p-4">
          <div className="flex items-center gap-1.5 mb-2">
            <WalletIcon size={14} className="text-bingo-green" />
            <span className="text-[10px] font-black uppercase tracking-widest text-bingo-green">{t("wallet.main")}</span>
          </div>
          <p className="text-white font-mono text-2xl font-extrabold">{balance.toFixed(0)} <span className="text-xs text-gray-500">ETB</span></p>
        </div>
        <div className="bg-white/[0.04] rounded-2xl border border-white/10 p-4">
          <div className="flex items-center gap-1.5 mb-2">
            <Gift size={14} className="text-bingo-accent" />
            <span className="text-[10px] font-black uppercase tracking-widest text-bingo-accent">{t("wallet.bonus")}</span>
          </div>
          <p className="text-white font-mono text-2xl font-extrabold">{bonus.toFixed(0)} <span className="text-xs text-gray-500">ETB</span></p>
        </div>
      </div>

      {/* Tabs */}
      <div className="grid grid-cols-4 gap-1 mb-4 bg-white/[0.03] p-1 rounded-xl border border-white/5">
        <TabBtn icon={<ArrowDownToLine size={12} />} label={t("wallet.tab.deposit")} active={tab === "deposit"} onClick={() => setTab("deposit")} />
        <TabBtn icon={<ArrowUpFromLine size={12} />} label={t("wallet.tab.withdraw")} active={tab === "withdraw"} onClick={() => setTab("withdraw")} />
        <TabBtn icon={<Gift size={12} />} label={t("wallet.tab.promo")} active={tab === "promo"} onClick={() => setTab("promo")} />
        <TabBtn icon={<History size={12} />} label={t("wallet.tab.history")} active={tab === "history"} onClick={() => setTab("history")} />
      </div>

      {/* Keep forms mounted so switching tabs doesn't re-fetch or reset state */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div hidden={tab !== "deposit"}><DepositForm telegramId={tg?.id ?? null} onDone={refresh} config={config} /></div>
        {tg && (
          <>
            <div hidden={tab !== "withdraw"}><WithdrawForm telegramId={tg.id} balance={balance} onDone={refresh} /></div>
            <div hidden={tab !== "promo"}><PromoForm telegramId={tg.id} onDone={refresh} /></div>
          </>
        )}
        {tab === "history" && <HistoryList txs={txs} />}
      </div>

    </ScreenWrapper>
  )
}

function TabBtn({ icon, label, active, onClick }: { icon: React.ReactNode; label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`flex-1 min-w-[80px] flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-colors ${active ? "bg-bingo-accent text-bingo-deep-purple" : "text-gray-400 hover:text-white"}`}>
      {icon}{label}
    </button>
  )
}

function DepositForm({ telegramId, onDone, config }: { telegramId: number | null; onDone: () => void; config: DepositConfig }) {
  const { t } = useI18n()
  const [provider, setProvider] = useState<"telebirr" | "cbe">("telebirr")
  const [amount, setAmount] = useState("")
  const [proof, setProof] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [verified, setVerified] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)
  const [proofOpen, setProofOpen] = useState(false)

  const submit = useServerFn(requestDeposit)

  const handleCopy = (value: string, p: "telebirr" | "cbe") => {
    navigator.clipboard.writeText(value)
    setProvider(p)
    setCopied(p)
    setTimeout(() => setCopied(null), 1500)
  }

  const openProof = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!amount || Number(amount) < 50) { setError(t("wallet.min_amount")); return }
    setProofOpen(true)
  }

  const sendProof = async () => {
    setError(null)
    if (proof.trim().length < 10) { setError(t("wallet.sms_required")); return }
    if (!telegramId) { setError("Please reopen the app from Telegram."); return }
    setSubmitting(true)
    try {
      const res: any = await submit({ data: {
        telegram_id: telegramId,
        amount: Number(amount),
        provider,
        proof_text: proof.trim(),
      }})
      setProofOpen(false)
      setVerified(!!res?.verified)
      setSuccess(true)
      setAmount(""); setProof("")
      onDone()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSubmitting(false)
    }
  }


  return (
    <form onSubmit={openProof} className="space-y-3">
      {/* Single Payment Details card */}
      <div className="rounded-2xl bg-gradient-to-br from-bingo-accent/15 to-bingo-cyan/10 border border-bingo-accent/30 p-3.5 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-black uppercase tracking-widest text-bingo-accent">{t("wallet.payment_details")}</p>
          <span className="text-[10px] text-gray-400">{t("wallet.tap_copy")}</span>
        </div>

        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{t("wallet.telebirr")}</p>
            <p className="font-mono text-white text-base font-bold leading-tight">{config.telebirr.phone}</p>
            <p className="text-gray-400 text-[11px]">{t("wallet.name")}: {config.telebirr.name}</p>
          </div>
          <button type="button" onClick={() => handleCopy(config.telebirr.phone, "telebirr")} className="shrink-0 h-9 w-9 rounded-lg bg-white/10 text-white flex items-center justify-center">
            {copied === "telebirr" ? <Check size={15} className="text-bingo-green" /> : <Copy size={15} />}
          </button>
        </div>

        <div className="h-px bg-white/10" />

        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{t("wallet.cbe")}</p>
            <p className="font-mono text-white text-base font-bold leading-tight break-all">{config.cbe.account_number}</p>
            <p className="text-gray-400 text-[11px]">{t("wallet.name")}: {config.cbe.account_name}</p>
          </div>
          <button type="button" onClick={() => handleCopy(config.cbe.account_number, "cbe")} className="shrink-0 h-9 w-9 rounded-lg bg-white/10 text-white flex items-center justify-center">
            {copied === "cbe" ? <Check size={15} className="text-bingo-green" /> : <Copy size={15} />}
          </button>
        </div>
      </div>

      <p className="text-[10px] text-gray-400">{t("wallet.after_send")}</p>

      <div>
        <span className="block text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">{t("wallet.quick")}</span>
        <div className="grid grid-cols-4 gap-2 mb-2">
          {[50, 100, 200, 500].map(v => (
            <button key={v} type="button" onClick={() => setAmount(String(v))} className={`py-2 rounded-lg text-xs font-bold border transition-colors ${Number(amount) === v ? "bg-bingo-green text-bingo-deep-purple border-bingo-green" : "border-white/10 text-gray-300 hover:border-bingo-green/50"}`}>
              {v}
            </button>
          ))}
        </div>
      </div>
      <Input label={t("wallet.amount_label")} type="number" min={50} value={amount} onChange={setAmount} required />
      <p className="text-[11px] text-bingo-green font-bold">{t("wallet.min_note")}</p>

      {error && !proofOpen && <p className="text-red-400 text-xs">{error}</p>}

      <button type="submit" className="w-full py-3 rounded-xl bg-bingo-green text-bingo-deep-purple font-black uppercase tracking-wider text-sm">
        {t("wallet.submit_deposit")}
      </button>

      {proofOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={() => !submitting && setProofOpen(false)}>
          <div className="w-full max-w-sm bg-bingo-deep-purple border border-bingo-accent/40 rounded-2xl p-5 shadow-2xl space-y-3" onClick={e => e.stopPropagation()}>
            <div>
              <h3 className="text-base font-display font-extrabold text-white tracking-wide">{t("wallet.proof_title")}</h3>
              <p className="text-[11px] text-gray-400 mt-0.5">{t("wallet.proof_desc_sms", { amount })}</p>
            </div>
            <Textarea label={t("wallet.sms_label")} value={proof} onChange={setProof} required />
            <p className="text-[10px] text-gray-500 -mt-1">{t("wallet.sms_hint")}</p>
            {error && <p className="text-red-400 text-xs">{error}</p>}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button type="button" disabled={submitting} onClick={() => setProofOpen(false)} className="py-2.5 rounded-xl border border-white/15 text-white font-bold text-xs uppercase tracking-wider disabled:opacity-50">
                {t("wallet.cancel")}
              </button>
              <button type="button" disabled={submitting} onClick={sendProof} className="py-2.5 rounded-xl bg-bingo-green text-bingo-deep-purple font-black text-xs uppercase tracking-wider disabled:opacity-50 flex items-center justify-center gap-1.5">
                {submitting ? <><Loader2 size={14} className="animate-spin" /> {t("wallet.sending")}</> : t("wallet.send_proof")}
              </button>
            </div>
          </div>
        </div>
      )}

      <SuccessModal
        open={success}
        onClose={() => setSuccess(false)}
        title={verified ? t("wallet.verified_title") : t("wallet.deposit_ok_title")}
        message={verified ? t("wallet.verified_msg") : t("wallet.deposit_ok_msg")}
      />
    </form>
  )
}


function WithdrawForm({ telegramId, balance, onDone }: { telegramId: number; balance: number; onDone: () => void }) {
  const { t } = useI18n()
  const [provider, setProvider] = useState<"telebirr" | "cbe">("telebirr")
  const [amount, setAmount] = useState("")
  const [phone, setPhone] = useState("")
  const [accName, setAccName] = useState("")
  const [accNum, setAccNum] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const submit = useServerFn(requestWithdrawal)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await submit({ data: {
        telegram_id: telegramId,
        amount: Number(amount),
        provider,
        phone_number: provider === "telebirr" ? phone : undefined,
        cbe_account_name: provider === "cbe" ? accName : undefined,
        cbe_account_number: provider === "cbe" ? accNum : undefined,
      }})
      setSuccess(true)
      setAmount(""); setPhone(""); setAccName(""); setAccNum("")
      onDone()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        {(["telebirr", "cbe"] as const).map(p => (
          <button key={p} type="button" onClick={() => setProvider(p)} className={`py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider border ${provider === p ? "bg-bingo-accent text-bingo-deep-purple border-bingo-accent" : "border-white/10 text-gray-300"}`}>
            {p === "telebirr" ? "TeleBirr" : "CBE"}
          </button>
        ))}
      </div>

      <p className="text-xs text-gray-400">{t("wallet.available")}: <span className="font-mono text-white">{balance.toFixed(0)} ETB</span></p>

      <Input label={t("wallet.amount_eth")} type="number" min={50} max={balance} value={amount} onChange={setAmount} required />
      {provider === "telebirr" ? (
        <Input label={t("wallet.telebirr_phone")} value={phone} onChange={setPhone} required />
      ) : (
        <>
          <Input label={t("wallet.cbe_name")} value={accName} onChange={setAccName} required />
          <Input label={t("wallet.cbe_number")} value={accNum} onChange={setAccNum} required />
        </>
      )}

      {error && <p className="text-red-400 text-xs">{error}</p>}

      <button type="submit" disabled={submitting} className="w-full py-3 rounded-xl bg-bingo-accent text-bingo-deep-purple font-black uppercase tracking-wider text-sm disabled:opacity-50">
        {submitting ? t("wallet.submitting") : t("wallet.request_withdrawal")}
      </button>

      <SuccessModal
        open={success}
        onClose={() => setSuccess(false)}
        title={t("wallet.withdraw_ok_title")}
        message={t("wallet.withdraw_ok_msg")}
      />
    </form>
  )
}

function SuccessModal({ open, onClose, title, message }: { open: boolean; onClose: () => void; title: string; message: string }) {
  const { t } = useI18n()
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-sm bg-bingo-deep-purple border border-bingo-green/40 rounded-2xl p-6 text-center shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="w-16 h-16 mx-auto rounded-full bg-bingo-green/20 border border-bingo-green flex items-center justify-center mb-4">
          <Check size={32} className="text-bingo-green" />
        </div>
        <h3 className="text-lg font-display font-extrabold text-white tracking-wide mb-2">{title}</h3>
        <p className="text-sm text-gray-300 leading-relaxed">{message}</p>
        <button onClick={onClose} className="mt-5 w-full py-2.5 rounded-xl bg-bingo-green text-bingo-deep-purple font-black uppercase tracking-wider text-xs">
          {t("wallet.got_it")}
        </button>
      </div>
    </div>
  )
}

function PromoForm({ telegramId, onDone }: { telegramId: number; onDone: () => void }) {
  const { t } = useI18n()
  const [code, setCode] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ credited: number } | null>(null)
  const redeem = useServerFn(redeemPromo)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null); setResult(null)
    setSubmitting(true)
    try {
      const r = await redeem({ data: { telegram_id: telegramId, code } })
      setResult(r as { credited: number })
      setCode("")
      onDone()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <p className="text-xs text-gray-400">{t("wallet.promo_desc")}</p>
      <Input label={t("wallet.promo_label")} value={code} onChange={v => setCode(v.toUpperCase())} required />
      {error && <p className="text-red-400 text-xs">{error}</p>}
      {result && <p className="text-bingo-green text-xs">{t("wallet.promo_credited", { n: result.credited })}</p>}
      <button type="submit" disabled={submitting || !code} className="w-full py-3 rounded-xl bg-bingo-green text-bingo-deep-purple font-black uppercase tracking-wider text-sm disabled:opacity-50">
        {submitting ? t("wallet.redeeming") : t("wallet.redeem")}
      </button>
    </form>
  )
}

function HistoryList({ txs }: { txs: Tx[] }) {
  const { t } = useI18n()
  if (!txs.length) return <p className="text-gray-500 text-center py-12 text-sm">{t("wallet.no_tx")}</p>
  return (
    <ul className="space-y-2">
      {txs.map(tx => (
        <li key={tx.id} className="bg-white/[0.03] border border-white/10 rounded-xl p-3 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className={`text-[10px] font-black uppercase tracking-widest ${tx.type === "deposit" ? "text-bingo-green" : "text-bingo-accent"}`}>{tx.type === "deposit" ? t("wallet.tx.deposit") : t("wallet.tx.withdrawal")}</span>
              <span className="text-[10px] text-gray-500 uppercase">{tx.provider}</span>
            </div>
            <p className="text-white font-mono font-bold mt-0.5">{Number(tx.amount).toFixed(0)} ETB</p>
            <p className="text-[10px] text-gray-500">{new Date(tx.created_at).toLocaleString()}</p>
            {tx.admin_note && <p className="text-[10px] text-gray-400 italic mt-0.5">{t("wallet.note")}: {tx.admin_note}</p>}
          </div>
          <StatusBadge status={tx.status} />
        </li>
      ))}
    </ul>
  )
}

function StatusBadge({ status }: { status: string }) {
  const { t } = useI18n()
  const cls = status === "approved" ? "bg-bingo-green/20 text-bingo-green border-bingo-green/40"
    : status === "rejected" ? "bg-red-500/20 text-red-400 border-red-500/40"
    : "bg-yellow-500/20 text-yellow-400 border-yellow-500/40"
  const label = status === "approved" ? t("wallet.status.approved")
    : status === "rejected" ? t("wallet.status.rejected")
    : t("wallet.status.pending")
  return <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded border ${cls}`}>{label}</span>
}

function Input({ label, value, onChange, required, type = "text", min, max }: { label: string; value: string; onChange: (v: string) => void; required?: boolean; type?: string; min?: number; max?: number }) {
  return (
    <label className="block">
      <span className="block text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">{label}</span>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} required={required} min={min} max={max} className="w-full px-3 py-2.5 rounded-xl bg-white/[0.04] border border-white/10 text-white text-sm font-mono focus:border-bingo-accent focus:outline-none" />
    </label>
  )
}

function Textarea({ label, value, onChange, required }: { label: string; value: string; onChange: (v: string) => void; required?: boolean }) {
  return (
    <label className="block">
      <span className="block text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1">{label}</span>
      <textarea value={value} onChange={e => onChange(e.target.value)} required={required} rows={4} className="w-full px-3 py-2.5 rounded-xl bg-white/[0.04] border border-white/10 text-white text-xs font-mono focus:border-bingo-accent focus:outline-none resize-none" />
    </label>
  )
}
