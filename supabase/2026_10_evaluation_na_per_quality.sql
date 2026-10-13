-- Execute ONCE in Supabase SQL Editor before using the new version.
-- Existing scores, comments and cards are untouched.
ALTER TABLE public.evaluations
  ADD COLUMN IF NOT EXISTS na_fields jsonb NOT NULL DEFAULT '{}'::jsonb;
COMMENT ON COLUMN public.evaluations.na_fields IS 'Per-quality N/A flags, e.g. {"decision_making":true}; excluded from app averages.';
NOTIFY pgrst, 'reload schema';
