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
  -- balance is the total playable amount (main + bonus). Bonus portion is consumed first.
  UPDATE public.players
     SET balance = balance - _amount,
         bonus_balance = GREATEST(0, COALESCE(bonus_balance, 0) - _amount)
   WHERE telegram_id = _telegram_id AND balance >= _amount
   RETURNING balance INTO _new_balance;
  IF NOT FOUND THEN RAISE EXCEPTION 'insufficient balance'; END IF;
  RETURN _new_balance;
END;
$function$;

CREATE OR REPLACE FUNCTION public.redeem_promo_code(_telegram_id bigint, _code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _promo public.promo_codes;
  _credit NUMERIC;
BEGIN
  SELECT * INTO _promo FROM public.promo_codes WHERE code = upper(_code) AND active = true FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'invalid code'; END IF;
  IF _promo.expires_at IS NOT NULL AND _promo.expires_at < now() THEN RAISE EXCEPTION 'expired'; END IF;
  IF _promo.max_redemptions IS NOT NULL AND _promo.redemptions_count >= _promo.max_redemptions THEN RAISE EXCEPTION 'limit reached'; END IF;
  IF EXISTS (SELECT 1 FROM public.promo_redemptions WHERE promo_id = _promo.id AND telegram_id = _telegram_id) THEN
    RAISE EXCEPTION 'already redeemed';
  END IF;

  IF _promo.type IN ('bonus','free_credit') THEN
    _credit := _promo.amount;
    UPDATE public.players
       SET bonus_balance = bonus_balance + _credit,
           balance = balance + _credit
     WHERE telegram_id = _telegram_id;
    IF NOT FOUND THEN
      INSERT INTO public.players (telegram_id, bonus_balance, balance) VALUES (_telegram_id, _credit, _credit);
    END IF;
  ELSE
    _credit := 0;
  END IF;

  INSERT INTO public.promo_redemptions (promo_id, telegram_id, amount_credited) VALUES (_promo.id, _telegram_id, _credit);
  UPDATE public.promo_codes SET redemptions_count = redemptions_count + 1 WHERE id = _promo.id;

  RETURN jsonb_build_object('ok', true, 'credited', _credit, 'type', _promo.type);
END;
$function$;