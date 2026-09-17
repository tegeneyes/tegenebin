CREATE TABLE IF NOT EXISTS public.welcome_bonus_claims (
  telegram_id BIGINT PRIMARY KEY,
  amount NUMERIC(14,2) NOT NULL DEFAULT 10,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT ALL ON public.welcome_bonus_claims TO service_role;
ALTER TABLE public.welcome_bonus_claims ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "welcome bonus claims service only" ON public.welcome_bonus_claims;
CREATE POLICY "welcome bonus claims service only"
  ON public.welcome_bonus_claims
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

ALTER TABLE public.players
  ADD COLUMN IF NOT EXISTS welcome_bonus_granted BOOLEAN NOT NULL DEFAULT false;

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
           welcome_bonus_granted = true
     WHERE telegram_id = NEW.telegram_id;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.grant_new_player_welcome_bonus() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grant_new_player_welcome_bonus() TO service_role;

DROP TRIGGER IF EXISTS players_grant_welcome_bonus ON public.players;
CREATE TRIGGER players_grant_welcome_bonus
  AFTER INSERT ON public.players
  FOR EACH ROW
  EXECUTE FUNCTION public.grant_new_player_welcome_bonus();