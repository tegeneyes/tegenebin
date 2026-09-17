
REVOKE ALL ON FUNCTION public.drop_bonus_to_all(NUMERIC, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.drop_bonus_to_all(NUMERIC, TEXT) TO service_role;
