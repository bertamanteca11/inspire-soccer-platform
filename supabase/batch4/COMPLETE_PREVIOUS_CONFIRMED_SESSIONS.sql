-- MANUAL status correction explicitly requested for previous sessions.
-- Run the complete file as postgres in Supabase SQL Editor. Safe to run again.
-- Only planned, unlocked sessions dated today or earlier with all three
-- workflows ALREADY confirmed become completed. No workflow is confirmed here.
-- Does not change scores, attendance, callups, cards, timestamps or access rules.
BEGIN;
DO $$ BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION 'Ejecuta este archivo en el SQL Editor como postgres.';
  END IF;
END $$;

WITH changed AS (
  UPDATE public.sessions
    SET status='completed'
    WHERE status::text='planned' AND locked_at IS NULL
      AND session_date <= (statement_timestamp() AT TIME ZONE 'Europe/Copenhagen')::date
      AND callup_confirmed IS TRUE AND attendance_confirmed IS TRUE
      AND evaluation_confirmed IS TRUE
    RETURNING id,name,session_date
), pending AS (
  SELECT id,name,session_date,callup_confirmed,attendance_confirmed,evaluation_confirmed
  FROM public.sessions
  WHERE status::text='planned' AND locked_at IS NULL
    AND session_date <= (statement_timestamp() AT TIME ZONE 'Europe/Copenhagen')::date
    AND (callup_confirmed IS NOT TRUE OR attendance_confirmed IS NOT TRUE
      OR evaluation_confirmed IS NOT TRUE)
)
SELECT jsonb_build_object(
  'all_ok',true,
  'updated_count',(SELECT count(*) FROM changed),
  'updated_sessions',coalesce((SELECT jsonb_agg(to_jsonb(c) ORDER BY session_date,id) FROM changed c),'[]'::jsonb),
  'pending_count',(SELECT count(*) FROM pending),
  'pending_sessions',coalesce((SELECT jsonb_agg(to_jsonb(p) ORDER BY session_date,id) FROM pending p),'[]'::jsonb),
  'next_step','Actualiza Sesiones en la app. Las sesiones enumeradas en pending_sessions necesitan confirmar sus apartados pendientes; no se han cerrado automáticamente.'
) AS previous_sessions_completion;
COMMIT;
