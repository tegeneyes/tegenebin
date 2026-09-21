-- Prevent duplicate game rows + double payouts for the same round.
-- Multiple clients record the same round independently (winner AND losers),
-- so finish_game must be idempotent per (round_index, stake): only ONE game row
-- per round, and a winner is credited at most once.
ALTER TABLE public.games ADD COLUMN IF NOT EXISTS round_index BIGINT;
CREATE UNIQUE INDEX IF NOT EXISTS games_round_stake_unique
  ON public.games (round_index, stake) WHERE round_index IS NOT NULL;

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
  END IF;

  RETURN _game_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.finish_game(BIGINT, NUMERIC, INTEGER[], JSONB, BIGINT, INTEGER, NUMERIC) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finish_game(BIGINT, NUMERIC, INTEGER[], JSONB, BIGINT, INTEGER, NUMERIC) TO service_role;