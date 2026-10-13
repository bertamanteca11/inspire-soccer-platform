-- Execute once in Supabase SQL Editor BEFORE deploying the updated application.
-- Does not delete or rewrite existing evaluation scores.
ALTER TABLE public.evaluations
  ADD COLUMN IF NOT EXISTS not_applicable boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.evaluations.not_applicable IS
  'Player was called up but did not play; exclude this evaluation from performance averages.';
