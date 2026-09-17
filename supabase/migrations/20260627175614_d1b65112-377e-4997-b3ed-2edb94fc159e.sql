
CREATE OR REPLACE FUNCTION public.debit_stake(_telegram_id BIGINT, _amount NUMERIC)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _new_balance NUMERIC;
BEGIN
  IF _amount <= 0 THEN RAISE EXCEPTION 'invalid amount'; END IF;
  UPDATE public.players
     SET balance = balance - _amount
   WHERE telegram_id = _telegram_id AND balance >= _amount
   RETURNING balance INTO _new_balance;
  IF NOT FOUND THEN RAISE EXCEPTION 'insufficient balance'; END IF;
  RETURN _new_balance;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.debit_stake(BIGINT, NUMERIC) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.debit_stake(BIGINT, NUMERIC) TO service_role;
