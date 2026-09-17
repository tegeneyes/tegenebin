-- Telegram-identified players (no Supabase auth)
CREATE TABLE public.players (
  telegram_id BIGINT PRIMARY KEY,
  first_name TEXT,
  username TEXT,
  photo_url TEXT,
  balance NUMERIC(14,2) NOT NULL DEFAULT 0,
  bonus_balance NUMERIC(14,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT ALL ON public.players TO service_role;
ALTER TABLE public.players ENABLE ROW LEVEL SECURITY;
-- No client policies: all access is via server functions using the service-role client.

-- Transactions: deposits & withdrawals
CREATE TABLE public.transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_id BIGINT NOT NULL REFERENCES public.players(telegram_id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('deposit','withdrawal')),
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  phone_number TEXT,
  provider TEXT CHECK (provider IN ('telebirr','cbe')),
  proof_text TEXT,
  reference TEXT,
  cbe_account_name TEXT,
  cbe_account_number TEXT,
  admin_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX transactions_reference_unique
  ON public.transactions (reference)
  WHERE reference IS NOT NULL;

CREATE INDEX transactions_telegram_id_created_at_idx
  ON public.transactions (telegram_id, created_at DESC);

CREATE INDEX transactions_status_idx
  ON public.transactions (status, created_at DESC);

GRANT ALL ON public.transactions TO service_role;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
-- No client policies: all access is via server functions using the service-role client.

-- updated_at trigger for players
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER players_set_updated_at
  BEFORE UPDATE ON public.players
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Atomic approval helper (runs as definer; safe because only callable from server with service role)
CREATE OR REPLACE FUNCTION public.process_transaction(
  _tx_id UUID,
  _new_status TEXT,
  _admin_note TEXT DEFAULT NULL
)
RETURNS public.transactions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _tx public.transactions;
BEGIN
  IF _new_status NOT IN ('approved','rejected') THEN
    RAISE EXCEPTION 'invalid status %', _new_status;
  END IF;

  SELECT * INTO _tx FROM public.transactions WHERE id = _tx_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'transaction not found'; END IF;
  IF _tx.status <> 'pending' THEN RAISE EXCEPTION 'transaction already processed'; END IF;

  IF _new_status = 'approved' THEN
    IF _tx.type = 'deposit' THEN
      UPDATE public.players SET balance = balance + _tx.amount WHERE telegram_id = _tx.telegram_id;
    ELSIF _tx.type = 'withdrawal' THEN
      UPDATE public.players SET balance = balance - _tx.amount
        WHERE telegram_id = _tx.telegram_id AND balance >= _tx.amount;
      IF NOT FOUND THEN RAISE EXCEPTION 'insufficient balance'; END IF;
    END IF;
  END IF;

  UPDATE public.transactions
     SET status = _new_status,
         admin_note = COALESCE(_admin_note, admin_note),
         processed_at = now()
   WHERE id = _tx_id
   RETURNING * INTO _tx;

  RETURN _tx;
END;
$$;

REVOKE ALL ON FUNCTION public.process_transaction(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.process_transaction(UUID, TEXT, TEXT) TO service_role;