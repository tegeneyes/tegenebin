# Wallet + Promo Codes Plan

Same model as MineRisk: users transfer manually via TeleBirr/CBE, paste the SMS confirmation, an admin approves. No third-party payment API integration yet (TeleBirr/CBE don't expose public APIs for individual sellers anyway — the manual+SMS flow is the standard Ethiopian approach).

## 1. Database changes

New migration:

- `public.promo_codes` table
  - `code` (text, unique, uppercase)
  - `type` ('bonus' | 'deposit_match' | 'free_credit')
  - `amount` (numeric) — bonus amount or % match
  - `max_redemptions` (int, nullable = unlimited)
  - `redemptions_count` (int, default 0)
  - `expires_at` (timestamptz, nullable)
  - `active` (bool, default true)
- `public.promo_redemptions` table
  - `promo_id`, `telegram_id`, `amount_credited`, unique(promo_id, telegram_id)
- Extend `transactions`: add `promo_code` (text, nullable) for tracking deposits that used a code.
- New SECURITY DEFINER function `redeem_promo_code(_telegram_id, _code)` — validates + credits `bonus_balance` atomically.
- GRANTs: service_role only on promo tables (admin-managed; redemption goes through server fn).

## 2. Server functions (TanStack `createServerFn`)

Under `src/lib/wallet.functions.ts`:

- `requestDeposit({ telegram_id, amount, provider: 'telebirr'|'cbe', phone_number?, cbe_account_name?, cbe_account_number?, proof_text, reference?, promo_code? })`
  - Inserts pending `transactions` row.
  - Validates `proof_text` length (>= 20 chars, contains digits).
- `requestWithdrawal({ telegram_id, amount, provider, phone_number?, cbe_account_name?, cbe_account_number? })`
  - Checks balance via admin client, inserts pending row.
- `listMyTransactions({ telegram_id })`
- `redeemPromo({ telegram_id, code })` → calls `redeem_promo_code` RPC.

Admin-only (require role check):
- `approveTransaction({ tx_id, admin_note? })`
- `rejectTransaction({ tx_id, admin_note? })`
- `listPendingTransactions()`
- `createPromoCode(...)`, `listPromoCodes()`, `togglePromoCode(...)`

Admin auth: simple `admin_telegram_ids` array in env secret `ADMIN_TELEGRAM_IDS` (comma-separated) for now — matches MineRisk simplicity.

## 3. UI Screens

Replace current placeholder Wallet/Profile screens:

- **Wallet screen** (`wallet-screen.tsx`)
  - Balance card (play + bonus).
  - Tabs: Deposit / Withdraw / History.
  - Deposit form: provider picker (TeleBirr / CBE), amount, payment instructions ("Send to 0911... then paste SMS below"), proof text area, optional promo code.
  - Withdraw form: provider, amount, account details.
  - History list: pending/approved/rejected badges.
- **Promo entry** also surfaced on Wallet deposit form.
- **Admin screen** (`/admin` route, gated by telegram_id check)
  - Pending transactions list with Approve/Reject + note.
  - Promo codes CRUD.

## 4. Auto-SMS regex (deferred, scaffolded)

Add `src/lib/sms-parser.ts` with regex stubs for TeleBirr ("ETB X.XX received from ...") and CBE ("Credited with ETB X.XX") that extract amount + reference. Used in admin UI to **suggest** approval (highlight match), not auto-approve. Easy to flip to auto-approve later.

## 5. Out of scope (explicit)

- No direct TeleBirr/CBE API integration (not publicly available).
- No automated SMS forwarding (would need a separate Android SMS-forwarder app pointing at a webhook — can add later as `/api/public/sms-webhook`).

---

Confirm and I'll run the migration + build the screens.
