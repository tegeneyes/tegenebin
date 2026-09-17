-- Fix: games.player_count was set to the number of cartelas, not players.
-- A single player can hold several cartelas, so count DISTINCT telegram_id.
CREATE OR REPLACE FUNCTION public.finish_game(
  _stake NUMERIC,
  _called_numbers INTEGER[],
  _participants JSONB,
  _winner_telegram_id BIGINT,
  _winner_cartela_id INTEGER,
  _prize_pool NUMERIC
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _game_id UUID;
  _p JSONB;
  _player_count INTEGER;
BEGIN
  SELECT COUNT(DISTINCT (elem->>'telegram_id')::BIGINT)
    INTO _player_count
    FROM jsonb_array_elements(_participants) AS elem;

  INSERT INTO public.games (stake, prize_pool, player_count, called_numbers,
    winner_telegram_id, winner_cartela_id, status, ended_at)
  VALUES (_stake, _prize_pool, COALESCE(_player_count, 0), _called_numbers,
    _winner_telegram_id, _winner_cartela_id, 'finished', now())
  RETURNING id INTO _game_id;

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

REVOKE EXECUTE ON FUNCTION public.finish_game(NUMERIC, INTEGER[], JSONB, BIGINT, INTEGER, NUMERIC) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finish_game(NUMERIC, INTEGER[], JSONB, BIGINT, INTEGER, NUMERIC) TO service_role;
