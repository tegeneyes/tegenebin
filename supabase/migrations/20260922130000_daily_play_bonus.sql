-- Daily engagement bonus: every player once per calendar day gets 10 ETB of
-- playable (5x-wagering-locked) bonus, auto-claimed when they open the app.

ALTER TABLE public.players ADD COLUMN IF NOT EXISTS last_daily_bonus_at DATE;

-- Atomic per-day claim: the gated UPDATE makes a second attempt in the same
-- day a no-op. Credits through lock_bonus so it honours the wagering rule.
CREATE OR REPLACE FUNCTION public.claim_daily_bonus(_telegram_id BIGINT, _amount NUMERIC DEFAULT 10)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
DECLARE
  _credited BOOLEAN;
  _today DATE := CURRENT_DATE;
BEGIN
  IF _amount <= 0 THEN RAISE EXCEPTION 'invalid amount'; END IF;

  UPDATE public.players
     SET last_daily_bonus_at = _today
   WHERE telegram_id = _telegram_id
     AND (last_daily_bonus_at IS NULL OR last_daily_bonus_at < _today);

  GET DIAGNOSTICS _credited = ROW_COUNT;

  IF _credited THEN
    PERFORM public.lock_bonus(_telegram_id, _amount);
    RETURN jsonb_build_object('claimed', true, 'amount', _amount);
  END IF;

  RETURN jsonb_build_object('claimed', false, 'amount', 0);
END;
$function$;

REVOKE ALL ON FUNCTION public.claim_daily_bonus(BIGINT, NUMERIC) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_daily_bonus(BIGINT, NUMERIC) TO service_role;