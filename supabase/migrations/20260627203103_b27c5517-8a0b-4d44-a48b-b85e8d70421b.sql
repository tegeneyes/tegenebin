
ALTER TABLE public.players
  ADD COLUMN IF NOT EXISTS referred_by BIGINT,
  ADD COLUMN IF NOT EXISTS referral_bonus_paid BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_players_referred_by ON public.players(referred_by);

CREATE OR REPLACE FUNCTION public.process_transaction(_tx_id uuid, _new_status text, _admin_note text DEFAULT NULL::text)
 RETURNS transactions
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _tx public.transactions;
  _player public.players;
  _ref_bonus NUMERIC := 10;
  _min_deposit NUMERIC := 50;
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

      -- Referral bonus: first qualifying deposit credits the inviter
      SELECT * INTO _player FROM public.players WHERE telegram_id = _tx.telegram_id;
      IF _player.referred_by IS NOT NULL
         AND _player.referral_bonus_paid = false
         AND _tx.amount >= _min_deposit THEN
        UPDATE public.players
          SET balance = balance + _ref_bonus
          WHERE telegram_id = _player.referred_by;
        IF FOUND THEN
          UPDATE public.players SET referral_bonus_paid = true WHERE telegram_id = _tx.telegram_id;
        END IF;
      END IF;
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
$function$;
