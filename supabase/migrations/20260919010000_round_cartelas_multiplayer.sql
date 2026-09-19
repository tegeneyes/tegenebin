-- Multiplayer: track which cartelas are reserved per round.
-- Each round is identified by its wall-clock index (floor(now / 110000)).
-- The UNIQUE constraint prevents two players from picking the same cartela.

CREATE TABLE IF NOT EXISTS public.round_cartelas (
  id          BIGSERIAL PRIMARY KEY,
  round_index BIGINT  NOT NULL,
  stake       NUMERIC NOT NULL,
  telegram_id BIGINT  NOT NULL,
  username    TEXT,
  cartela_id  INTEGER NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(round_index, stake, cartela_id)
);

CREATE INDEX IF NOT EXISTS idx_round_cartelas_lookup
  ON public.round_cartelas (round_index, stake);

ALTER TABLE public.round_cartelas ENABLE ROW LEVEL SECURITY;

-- Anyone can read (to see taken cartelas)
CREATE POLICY "Anyone can read round_cartelas"
  ON public.round_cartelas FOR SELECT
  USING (true);

-- Service role manages inserts/deletes
CREATE POLICY "Service role manages round_cartelas"
  ON public.round_cartelas FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- RPC: atomically reserve a cartela. Fails if already taken.
CREATE OR REPLACE FUNCTION public.reserve_cartela(
  _round_index BIGINT,
  _stake       NUMERIC,
  _telegram_id BIGINT,
  _username    TEXT,
  _cartela_id  INTEGER
) RETURNS public.round_cartelas
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.round_cartelas;
BEGIN
  IF _cartela_id < 1 OR _cartela_id > 500 THEN
    RAISE EXCEPTION 'invalid cartela_id';
  END IF;

  INSERT INTO public.round_cartelas (round_index, stake, telegram_id, username, cartela_id)
  VALUES (_round_index, _stake, _telegram_id, _username, _cartela_id)
  ON CONFLICT (round_index, stake, cartela_id) DO NOTHING
  RETURNING * INTO _row;

  IF _row IS NULL THEN
    RAISE EXCEPTION 'cartela_taken';
  END IF;

  RETURN _row;
END;
$$;

-- RPC: release a cartela (player backs out during selection)
CREATE OR REPLACE FUNCTION public.release_cartela(
  _round_index BIGINT,
  _stake       NUMERIC,
  _telegram_id BIGINT,
  _cartela_id  INTEGER
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.round_cartelas
   WHERE round_index = _round_index
     AND stake = _stake
     AND telegram_id = _telegram_id
     AND cartela_id = _cartela_id;
END;
$$;

-- RPC: get all taken cartela IDs for a round+stake
CREATE OR REPLACE FUNCTION public.get_round_cartelas(
  _round_index BIGINT,
  _stake       NUMERIC
) RETURNS TABLE(cartela_id INTEGER, telegram_id BIGINT)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT rc.cartela_id, rc.telegram_id
    FROM public.round_cartelas rc
   WHERE rc.round_index = _round_index
     AND rc.stake = _stake;
$$;

-- RPC: count distinct players in a round+stake
CREATE OR REPLACE FUNCTION public.get_round_player_count(
  _round_index BIGINT,
  _stake       NUMERIC
) RETURNS INTEGER
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(DISTINCT rc.telegram_id)::INTEGER
    FROM public.round_cartelas rc
   WHERE rc.round_index = _round_index
     AND rc.stake = _stake;
$$;

-- RPC: clean up old round_cartelas (older than 2 rounds = ~4 minutes)
CREATE OR REPLACE FUNCTION public.cleanup_round_cartelas()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _cutoff BIGINT;
BEGIN
  _cutoff := (floor(extract(epoch from now()) * 1000 / 110000) - 2)::BIGINT;
  DELETE FROM public.round_cartelas WHERE round_index < _cutoff;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reserve_cartela(BIGINT, NUMERIC, BIGINT, TEXT, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_cartela(BIGINT, NUMERIC, BIGINT, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_round_cartelas(BIGINT, NUMERIC) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_round_player_count(BIGINT, NUMERIC) TO service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_round_cartelas() TO service_role;

-- Enable realtime for round_cartelas so clients get live updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.round_cartelas;
