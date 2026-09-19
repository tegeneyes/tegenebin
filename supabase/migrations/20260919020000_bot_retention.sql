-- Throttle column for proactive bot round reminders (players table)
ALTER TABLE public.players
  ADD COLUMN IF NOT EXISTS last_bot_reminder_at TIMESTAMPTZ;

-- Jobs run by the /api/cron/bot-jobs route (Vercel cron / platform equivalent).
-- Trigger when a round boundary is crossed (rounds are 110000 ms wall-clock).

-- Any manually-queued bot job state (e.g. per-round dedupe) can live here.
CREATE TABLE IF NOT EXISTS public.bot_job_state (
  key TEXT PRIMARY KEY,
  value JSONB,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.bot_job_state TO service_role;
ALTER TABLE public.bot_job_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service only" ON public.bot_job_state FOR ALL TO service_role USING (true) WITH CHECK (true);