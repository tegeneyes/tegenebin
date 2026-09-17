
CREATE TABLE public.announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.announcements TO service_role;
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "announcements service only" ON public.announcements FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE public.bonus_drops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  amount NUMERIC NOT NULL,
  note TEXT,
  recipients INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.bonus_drops TO service_role;
ALTER TABLE public.bonus_drops ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bonus_drops service only" ON public.bonus_drops FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.drop_bonus_to_all(_amount NUMERIC, _note TEXT DEFAULT NULL)
RETURNS public.bonus_drops
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _drop public.bonus_drops;
  _count INTEGER;
BEGIN
  IF _amount <= 0 THEN RAISE EXCEPTION 'invalid amount'; END IF;
  UPDATE public.players SET bonus_balance = bonus_balance + _amount, balance = balance + _amount;
  GET DIAGNOSTICS _count = ROW_COUNT;
  INSERT INTO public.bonus_drops (amount, note, recipients) VALUES (_amount, _note, _count)
    RETURNING * INTO _drop;
  RETURN _drop;
END;
$$;
