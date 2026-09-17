
ALTER TABLE public.players ADD COLUMN IF NOT EXISTS banned BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.players ADD COLUMN IF NOT EXISTS banned_reason TEXT;
ALTER TABLE public.players ADD COLUMN IF NOT EXISTS banned_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.debit_stake(_telegram_id bigint, _amount numeric)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _new_balance NUMERIC;
  _is_banned BOOLEAN;
BEGIN
  IF _amount <= 0 THEN RAISE EXCEPTION 'invalid amount'; END IF;
  SELECT banned INTO _is_banned FROM public.players WHERE telegram_id = _telegram_id;
  IF _is_banned THEN RAISE EXCEPTION 'banned'; END IF;
  UPDATE public.players
     SET balance = balance - _amount
   WHERE telegram_id = _telegram_id AND balance >= _amount
   RETURNING balance INTO _new_balance;
  IF NOT FOUND THEN RAISE EXCEPTION 'insufficient balance'; END IF;
  RETURN _new_balance;
END;
$function$;
