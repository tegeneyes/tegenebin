
-- Extend transactions with promo_code
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS promo_code TEXT;

-- Promo codes table
CREATE TABLE public.promo_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL CHECK (type IN ('bonus','deposit_match','free_credit')),
  amount NUMERIC NOT NULL CHECK (amount > 0),
  max_redemptions INTEGER,
  redemptions_count INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.promo_codes TO service_role;
ALTER TABLE public.promo_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service only" ON public.promo_codes FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TRIGGER promo_codes_set_updated_at BEFORE UPDATE ON public.promo_codes
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Promo redemptions
CREATE TABLE public.promo_redemptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  promo_id UUID NOT NULL REFERENCES public.promo_codes(id) ON DELETE CASCADE,
  telegram_id BIGINT NOT NULL,
  amount_credited NUMERIC NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (promo_id, telegram_id)
);
GRANT ALL ON public.promo_redemptions TO service_role;
ALTER TABLE public.promo_redemptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service only" ON public.promo_redemptions FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Redeem promo function
CREATE OR REPLACE FUNCTION public.redeem_promo_code(_telegram_id BIGINT, _code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _promo public.promo_codes;
  _credit NUMERIC;
BEGIN
  SELECT * INTO _promo FROM public.promo_codes WHERE code = upper(_code) AND active = true FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'invalid code'; END IF;
  IF _promo.expires_at IS NOT NULL AND _promo.expires_at < now() THEN RAISE EXCEPTION 'expired'; END IF;
  IF _promo.max_redemptions IS NOT NULL AND _promo.redemptions_count >= _promo.max_redemptions THEN RAISE EXCEPTION 'limit reached'; END IF;
  IF EXISTS (SELECT 1 FROM public.promo_redemptions WHERE promo_id = _promo.id AND telegram_id = _telegram_id) THEN
    RAISE EXCEPTION 'already redeemed';
  END IF;

  IF _promo.type IN ('bonus','free_credit') THEN
    _credit := _promo.amount;
    UPDATE public.players SET bonus_balance = bonus_balance + _credit WHERE telegram_id = _telegram_id;
    IF NOT FOUND THEN
      INSERT INTO public.players (telegram_id, bonus_balance) VALUES (_telegram_id, _credit);
    END IF;
  ELSE
    _credit := 0; -- deposit_match handled at deposit approval
  END IF;

  INSERT INTO public.promo_redemptions (promo_id, telegram_id, amount_credited) VALUES (_promo.id, _telegram_id, _credit);
  UPDATE public.promo_codes SET redemptions_count = redemptions_count + 1 WHERE id = _promo.id;

  RETURN jsonb_build_object('ok', true, 'credited', _credit, 'type', _promo.type);
END;
$$;

REVOKE ALL ON FUNCTION public.redeem_promo_code(BIGINT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_promo_code(BIGINT, TEXT) TO service_role;
