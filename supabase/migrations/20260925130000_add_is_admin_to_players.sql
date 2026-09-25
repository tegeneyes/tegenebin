-- Add is_admin column to players table for RLS admin checks
ALTER TABLE public.players
ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false;

-- Grant is_admin = true to known admin telegram_ids (replace with actual admin IDs)
-- UPDATE public.players SET is_admin = true WHERE telegram_id IN (123456789, 987654321);