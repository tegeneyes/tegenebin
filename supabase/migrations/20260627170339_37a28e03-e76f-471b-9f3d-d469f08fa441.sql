REVOKE ALL ON FUNCTION public.process_transaction(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_transaction(UUID, TEXT, TEXT) TO service_role;