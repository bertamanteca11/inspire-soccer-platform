-- Run in Supabase SQL Editor after making a backup. Non-destructive migration.
BEGIN;
CREATE TABLE IF NOT EXISTS public.must_win_reviews (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 player_id uuid NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
 month_start date NOT NULL,
 trusted boolean NOT NULL,
 notes text,
 created_by uuid DEFAULT auth.uid() REFERENCES auth.users(id),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(player_id,month_start)
);
ALTER TABLE public.must_win_reviews ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admins manage must win" ON public.must_win_reviews;
CREATE POLICY "admins manage must win" ON public.must_win_reviews FOR ALL TO authenticated
USING (EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND role='admin'))
WITH CHECK (EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND role='admin'));
-- Coach may select standouts as requested by Susan.
DROP POLICY IF EXISTS "coach admin insert standouts" ON public.session_standouts;
CREATE POLICY "coach admin insert standouts" ON public.session_standouts FOR INSERT TO authenticated WITH CHECK (EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND role IN ('admin','coach')));
DROP POLICY IF EXISTS "coach admin update standouts" ON public.session_standouts;
CREATE POLICY "coach admin update standouts" ON public.session_standouts FOR UPDATE TO authenticated USING (EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND role IN ('admin','coach'))) WITH CHECK (EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND role IN ('admin','coach')));
DROP POLICY IF EXISTS "coach admin delete standouts" ON public.session_standouts;
CREATE POLICY "coach admin delete standouts" ON public.session_standouts FOR DELETE TO authenticated USING (EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND role IN ('admin','coach')));
COMMIT;
