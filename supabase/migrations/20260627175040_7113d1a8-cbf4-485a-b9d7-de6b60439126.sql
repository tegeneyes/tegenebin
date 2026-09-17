
CREATE TABLE public.games (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  stake NUMERIC NOT NULL,
  prize_pool NUMERIC NOT NULL DEFAULT 0,
  player_count INTEGER NOT NULL DEFAULT 0,
  called_numbers INTEGER[] NOT NULL DEFAULT '{}',
  winner_telegram_id BIGINT,
  winner_cartela_id INTEGER,
  status TEXT NOT NULL DEFAULT 'in_progress',
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.games TO anon, authenticated;
GRANT ALL ON public.games TO service_role;
ALTER TABLE public.games ENABLE ROW LEVEL SECURITY;
CREATE POLICY "games readable by all" ON public.games FOR SELECT USING (true);

CREATE TABLE public.game_results (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  game_id UUID NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  telegram_id BIGINT NOT NULL,
  username TEXT,
  cartela_id INTEGER NOT NULL,
  stake NUMERIC NOT NULL,
  is_winner BOOLEAN NOT NULL DEFAULT false,
  payout NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX game_results_telegram_id_idx ON public.game_results(telegram_id);
CREATE INDEX game_results_game_id_idx ON public.game_results(game_id);
GRANT SELECT ON public.game_results TO anon, authenticated;
GRANT ALL ON public.game_results TO service_role;
ALTER TABLE public.game_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "game_results readable by all" ON public.game_results FOR SELECT USING (true);

CREATE TRIGGER games_set_updated_at BEFORE UPDATE ON public.games
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

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
BEGIN
  INSERT INTO public.games (stake, prize_pool, player_count, called_numbers,
    winner_telegram_id, winner_cartela_id, status, ended_at)
  VALUES (_stake, _prize_pool, jsonb_array_length(_participants), _called_numbers,
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
