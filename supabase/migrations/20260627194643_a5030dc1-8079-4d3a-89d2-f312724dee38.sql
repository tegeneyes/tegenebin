
CREATE SEQUENCE IF NOT EXISTS public.game_code_seq START 1;
ALTER TABLE public.games ADD COLUMN IF NOT EXISTS short_code text UNIQUE;

CREATE OR REPLACE FUNCTION public.set_game_short_code()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.short_code IS NULL THEN
    NEW.short_code := 'BG-' || lpad(nextval('public.game_code_seq')::text, 4, '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_game_short_code ON public.games;
CREATE TRIGGER trg_set_game_short_code
BEFORE INSERT ON public.games
FOR EACH ROW EXECUTE FUNCTION public.set_game_short_code();

UPDATE public.games SET short_code = 'BG-' || lpad(nextval('public.game_code_seq')::text, 4, '0')
WHERE short_code IS NULL;

-- Update finish_game to return short_code-bearing game (no signature change, still returns uuid)
