DROP POLICY IF EXISTS "games readable by all" ON public.games;
REVOKE SELECT ON public.games FROM anon, authenticated;
GRANT ALL ON public.games TO service_role;
CREATE POLICY "games service only" ON public.games FOR ALL TO service_role USING (true) WITH CHECK (true);