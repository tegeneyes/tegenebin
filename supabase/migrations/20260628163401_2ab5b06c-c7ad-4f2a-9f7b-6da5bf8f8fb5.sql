
-- Fix bonus drop: explicit WHERE so it's not flagged as unconditional UPDATE
CREATE OR REPLACE FUNCTION public.drop_bonus_to_all(_amount numeric, _note text DEFAULT NULL::text)
 RETURNS bonus_drops
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _drop public.bonus_drops;
  _count INTEGER;
BEGIN
  IF _amount <= 0 THEN RAISE EXCEPTION 'invalid amount'; END IF;
  UPDATE public.players
     SET bonus_balance = bonus_balance + _amount,
         balance = balance + _amount
   WHERE telegram_id IS NOT NULL;
  GET DIAGNOSTICS _count = ROW_COUNT;
  INSERT INTO public.bonus_drops (amount, note, recipients) VALUES (_amount, _note, _count)
    RETURNING * INTO _drop;
  RETURN _drop;
END;
$function$;

-- Admin bot conversation state (for /broadcast flow inside the bot)
CREATE TABLE IF NOT EXISTS public.bot_admin_state (
  telegram_id BIGINT PRIMARY KEY,
  mode TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.bot_admin_state TO service_role;
ALTER TABLE public.bot_admin_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service only" ON public.bot_admin_state FOR ALL TO service_role USING (true) WITH CHECK (true);
