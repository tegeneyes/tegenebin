-- The client reads this public reservation list to update the live player
-- counter and mark cartelas taken by other players.
GRANT EXECUTE ON FUNCTION public.get_round_cartelas(BIGINT, NUMERIC)
  TO anon, authenticated;