-- Bonus wagering requirement (5x playthrough).
--
-- New money flow:
--   * Any bonus credit (welcome, promo, drop, or winnings earned WHILE a bonus is
--     still clearing) adds to `bonus_locked` and grows the remaining wagering
--     requirement `bonus_required` (amount * 5).
--   * Locked funds ARE playable (they sit in `balance`) but NOT withdrawable.
--   * Every stake reduces `bonus_required` by the staked amount. Once it hits 0
--     the whole lock releases (`bonus_locked = 0`) and everything becomes
--     withdrawable.
--   * Withdrawable balance = `balance` - `bonus_locked`.

ALTER TABLE public.players
  ADD COLUMN IF NOT EXISTS bonus_locked NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bonus_required NUMERIC(14,2) NOT NULL DEFAULT 0;

-- Backfill: existing bonus balances are now locked with a 5x requirement so the
-- new policy applies to funds already in players' wallets.
UPDATE public.players
   SET bonus_locked = COALESCE(bonus_balance, 0),
       bonus_required = COALESCE(bonus_balance, 0) * 5
 WHERE COALESCE(bonus_balance, 0) > 0;

-- Central helper: credit a bonus and apply the lock + playthrough requirement.
-- Callers must ensure the player row exists (the app always runs ensurePlayer).
CREATE OR REPLACE FUNCTION public.lock_bonus(_telegram_id BIGINT, _amount NUMERIC)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
BEGIN
  IF _amount <= 0 THEN RETURN; END IF;
  UPDATE public.players
     SET balance = balance + _amount,
         bonus_balance = COALESCE(bonus_balance, 0) + _amount,
         bonus_locked = COALESCE(bonus_locked, 0) + _amount,
         bonus_required = COALESCE(bonus_required, 0) + _amount * 5
   WHERE telegram_id = _telegram_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'player not found'; END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.lock_bonus(BIGINT, NUMERIC) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lock_bonus(BIGINT, NUMERIC) TO service_role;

-- Welcome bonus credits through the lock (still granted only once per player).
CREATE OR REPLACE FUNCTION public.grant_new_player_welcome_bonus()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _claims_inserted INTEGER;
BEGIN
  INSERT INTO public.welcome_bonus_claims (telegram_id, amount)
  VALUES (NEW.telegram_id, 10)
  ON CONFLICT (telegram_id) DO NOTHING;

  GET DIAGNOSTICS _claims_inserted = ROW_COUNT;

  IF _claims_inserted = 1 THEN
    UPDATE public.players
       SET balance = COALESCE(balance, 0) + 10,
           bonus_balance = COALESCE(bonus_balance, 0) + 10,
           bonus_locked = COALESCE(bonus_locked, 0) + 10,
           bonus_required = COALESCE(bonus_required, 0) + 10 * 5,
           welcome_bonus_granted = true
     WHERE telegram_id = NEW.telegram_id;
  END IF;

  RETURN NEW;
END;
$$;

-- Promo redemption credits through the lock.
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
    PERFORM public.lock_bonus(_telegram_id, _credit);
  ELSE
    _credit := 0; -- deposit_match handled at deposit approval
  END IF;

  INSERT INTO public.promo_redemptions (promo_id, telegram_id, amount_credited) VALUES (_promo.id, _telegram_id, _credit);
  UPDATE public.promo_codes SET redemptions_count = redemptions_count + 1 WHERE id = _promo.id;

  RETURN jsonb_build_object('ok', true, 'credited', _credit, 'type', _promo.type);
END;
$function$;

-- Bonus drops credit through the lock.
CREATE OR REPLACE FUNCTION public.drop_bonus_to_all(_amount numeric, _note text DEFAULT NULL::text)
 RETURNS bonus_drops
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _drop public.bonus_drops;
  _count INTEGER;
BEGIN
  IF _amount <= 0 THEN RAISE EXCEPTION 'invalid amount'; END IF;
  UPDATE public.players
     SET balance = balance + _amount,
         bonus_balance = COALESCE(bonus_balance, 0) + _amount,
         bonus_locked = COALESCE(bonus_locked, 0) + _amount,
         bonus_required = COALESCE(bonus_required, 0) + _amount * 5
   WHERE telegram_id IS NOT NULL;
  GET DIAGNOSTICS _count = ROW_COUNT;
  INSERT INTO public.bonus_drops (amount, note, recipients) VALUES (_amount, _note, _count)
    RETURNING * INTO _drop;
  RETURN _drop;
END;
$function$;

-- Staking counts toward the playthrough requirement and releases the lock once
-- the requirement is met. Locked funds stay playable the whole time.
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

  -- Every stake counts as bonus turnover.
  UPDATE public.players
     SET bonus_required = GREATEST(0, COALESCE(bonus_required, 0) - _amount)
   WHERE telegram_id = _telegram_id;

  -- Requirement met -> release the whole lock back into withdrawable balance.
  UPDATE public.players
     SET bonus_locked = 0
   WHERE telegram_id = _telegram_id
     AND COALESCE(bonus_required, 0) <= 0
     AND COALESCE(bonus_locked, 0) > 0;

  RETURN _new_balance;
END;
$function$;

-- Winnings earned while a bonus is still clearing are also locked (and they add
-- to the playthrough requirement), so a player can't win once with a small
-- locked bonus and instantly withdraw a large prize.
CREATE OR REPLACE FUNCTION public.finish_game(
  _round_index      BIGINT,
  _stake            NUMERIC,
  _called_numbers   INTEGER[],
  _participants     JSONB,
  _winner_telegram_id BIGINT,
  _winner_cartela_id INTEGER,
  _prize_pool       NUMERIC
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _game_id UUID;
  _p JSONB;
  _player_count INTEGER;
  _existing_winner BIGINT;
BEGIN
  SELECT COUNT(DISTINCT (elem->>'telegram_id')::BIGINT)
    INTO _player_count
    FROM jsonb_array_elements(_participants) AS elem;

  -- First client to record this round inserts the authoritative game row.
  INSERT INTO public.games (round_index, stake, prize_pool, player_count, called_numbers,
    winner_telegram_id, winner_cartela_id, status, ended_at)
  VALUES (_round_index, _stake, _prize_pool, COALESCE(_player_count, 0), _called_numbers,
    _winner_telegram_id, _winner_cartela_id, 'finished', now())
  ON CONFLICT (round_index, stake) WHERE round_index IS NOT NULL DO NOTHING
  RETURNING id INTO _game_id;

  IF _game_id IS NULL THEN
    -- Round already recorded. Only upgrade to a real winner if the existing
    -- row has none (covers the loser-records-first race). Never double-credit.
    SELECT winner_telegram_id INTO _existing_winner
      FROM public.games
     WHERE round_index = _round_index AND stake = _stake
     LIMIT 1;

    IF _existing_winner IS NULL AND _winner_telegram_id IS NOT NULL THEN
      UPDATE public.games
         SET winner_telegram_id = _winner_telegram_id,
             winner_cartela_id  = _winner_cartela_id,
             prize_pool         = _prize_pool,
             called_numbers     = _called_numbers,
             player_count       = COALESCE(_player_count, 0),
             status             = 'finished',
             ended_at           = now()
       WHERE round_index = _round_index AND stake = _stake
       RETURNING id INTO _game_id;
      DELETE FROM public.game_results WHERE game_id = _game_id;
      FOR _p IN SELECT * FROM jsonb_array_elements(_participants) LOOP
        INSERT INTO public.game_results (game_id, telegram_id, username, cartela_id, stake, is_winner, payout)
        VALUES (
          _game_id,
          (_p->>'telegram_id')::BIGINT,
          _p->>'username',
          (_p->>'cartela_id')::INTEGER,
          _stake,
          COALESCE((_p->>'is_winner')::BOOLEAN, false),
          COALESCE((_p->>'payout')::NUMERIC, 0)
        );
      END LOOP;
      IF _prize_pool > 0 THEN
        UPDATE public.players SET balance = balance + _prize_pool
          WHERE telegram_id = _winner_telegram_id;
        -- Lock the win too while a bonus is still clearing.
        UPDATE public.players
           SET bonus_balance = bonus_balance + _prize_pool,
               bonus_locked = COALESCE(bonus_locked, 0) + _prize_pool,
               bonus_required = COALESCE(bonus_required, 0) + _prize_pool * 5
         WHERE telegram_id = _winner_telegram_id AND COALESCE(bonus_locked, 0) > 0;
      END IF;
    ELSE
      -- Existing row already decided (has a winner, or stays a no-winner round).
      SELECT id INTO _game_id
        FROM public.games
       WHERE round_index = _round_index AND stake = _stake
       LIMIT 1;
    END IF;
    RETURN _game_id;
  END IF;

  -- Fresh insert: persist participants and credit the winner once.
  FOR _p IN SELECT * FROM jsonb_array_elements(_participants) LOOP
    INSERT INTO public.game_results (game_id, telegram_id, username, cartela_id, stake, is_winner, payout)
    VALUES (
      _game_id,
      (_p->>'telegram_id')::BIGINT,
      _p->>'username',
      (_p->>'cartela_id')::INTEGER,
      _stake,
      COALESCE((_p->>'is_winner')::BOOLEAN, false),
      COALESCE((_p->>'payout')::NUMERIC, 0)
    );
  END LOOP;

  IF _winner_telegram_id IS NOT NULL AND _prize_pool > 0 THEN
    UPDATE public.players SET balance = balance + _prize_pool
      WHERE telegram_id = _winner_telegram_id;
    -- Lock the win too while a bonus is still clearing.
    UPDATE public.players
       SET bonus_balance = bonus_balance + _prize_pool,
           bonus_locked = COALESCE(bonus_locked, 0) + _prize_pool,
           bonus_required = COALESCE(bonus_required, 0) + _prize_pool * 5
     WHERE telegram_id = _winner_telegram_id AND COALESCE(bonus_locked, 0) > 0;
  END IF;

  RETURN _game_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.finish_game(BIGINT, NUMERIC, INTEGER[], JSONB, BIGINT, INTEGER, NUMERIC) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finish_game(BIGINT, NUMERIC, INTEGER[], JSONB, BIGINT, INTEGER, NUMERIC) TO service_role;

GRANT EXECUTE ON FUNCTION public.debit_stake(BIGINT, NUMERIC) TO service_role;