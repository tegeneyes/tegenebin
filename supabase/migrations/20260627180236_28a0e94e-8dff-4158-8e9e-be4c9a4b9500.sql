
-- game_results: remove public read policy and revoke anon/authenticated grants
DROP POLICY IF EXISTS "game_results readable by all" ON public.game_results;
REVOKE ALL ON public.game_results FROM anon, authenticated;
CREATE POLICY "game_results service only" ON public.game_results FOR ALL TO service_role USING (true) WITH CHECK (true);
GRANT ALL ON public.game_results TO service_role;

-- players: ensure RLS on, lock to service_role only
ALTER TABLE public.players ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.players FROM anon, authenticated;
DROP POLICY IF EXISTS "players service only" ON public.players;
CREATE POLICY "players service only" ON public.players FOR ALL TO service_role USING (true) WITH CHECK (true);
GRANT ALL ON public.players TO service_role;

-- transactions: ensure RLS on, lock to service_role only
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.transactions FROM anon, authenticated;
DROP POLICY IF EXISTS "transactions service only" ON public.transactions;
CREATE POLICY "transactions service only" ON public.transactions FOR ALL TO service_role USING (true) WITH CHECK (true);
GRANT ALL ON public.transactions TO service_role;
