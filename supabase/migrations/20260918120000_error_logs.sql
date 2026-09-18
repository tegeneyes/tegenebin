-- Error log: client/server errors surfaced to the admin panel for monitoring.
CREATE TABLE IF NOT EXISTS public.error_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telegram_id BIGINT,
  level TEXT NOT NULL DEFAULT 'error' CHECK (level IN ('error','warning','info')),
  source TEXT NOT NULL DEFAULT 'client',
  message TEXT NOT NULL,
  detail TEXT,
  path TEXT,
  user_agent TEXT,
  resolved BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS error_logs_created_at_idx ON public.error_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS error_logs_unresolved_idx ON public.error_logs (resolved, created_at DESC);

GRANT ALL ON public.error_logs TO service_role;
ALTER TABLE public.error_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "error_logs service only" ON public.error_logs;
CREATE POLICY "error_logs service only"
  ON public.error_logs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
