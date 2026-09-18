-- Deposit anti-replay hardening.

-- 1. Ensure the reference uniqueness exists (idempotent).
CREATE UNIQUE INDEX IF NOT EXISTS transactions_reference_unique
  ON public.transactions (reference)
  WHERE reference IS NOT NULL;

-- 2. Also guard against reusing the same receipt text, so the same SMS can never
--    be deposited twice even if the extracted reference format drifts.
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS proof_hash TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS transactions_proof_hash_unique
  ON public.transactions (proof_hash)
  WHERE proof_hash IS NOT NULL;
