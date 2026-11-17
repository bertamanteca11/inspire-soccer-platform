-- MANUAL, READ ONLY. No workflow/RPC execution and no sporting-record changes.
-- Share privately: UUIDs and validation counts only; no names, comments or notes.
WITH open_sessions AS (
  SELECT s.id,s.session_date,s.type,s.status,s.locked_at,s.callup_confirmed,
    s.attendance_confirmed,s.evaluation_confirmed,s.records_only_confirmed,
    to_jsonb(s)->>'draft_defaults_version' AS draft_defaults_version,
    s.high_rating_limit,s.low_rating_limit
  FROM public.sessions s WHERE s.evaluation_confirmed IS DISTINCT FROM true
    AND s.status::text IN ('planned','completed','locked')
), evaluation_facts AS (
  SELECT e.*,EXISTS(SELECT 1 FROM public.callups c JOIN public.attendance a
    ON a.session_id=c.session_id AND a.player_id=c.player_id
    WHERE c.session_id=e.session_id AND c.player_id=e.player_id
      AND c.evaluable IS TRUE AND c.status::text IN ('called_up','trial')
      AND a.status::text IN ('present','late','justified_late')) AS eligible,
    EXISTS(SELECT 1 FROM jsonb_each(to_jsonb(e)) v WHERE v.key IN
      ('tactical_discipline','effort_commitment','decision_making','mentality_attitude')
      AND v.value<>'null'::jsonb AND e.not_applicable IS NOT TRUE
      AND coalesce(e.na_fields->v.key,'false'::jsonb)<>'true'::jsonb) AS has_numeric_scores
  FROM public.evaluations e JOIN open_sessions s ON s.id=e.session_id
), quality_counts AS (
  SELECT e.session_id,k.field,count(*) FILTER(WHERE (to_jsonb(e)->>k.field)::numeric>=4) AS high_count,
    count(*) FILTER(WHERE (to_jsonb(e)->>k.field)::numeric<=2) AS low_count
  FROM evaluation_facts e CROSS JOIN (VALUES ('tactical_discipline'),('effort_commitment'),
    ('decision_making'),('mentality_attitude')) k(field)
  WHERE e.eligible AND e.not_applicable IS NOT TRUE
    AND coalesce(e.na_fields->k.field,'false'::jsonb)<>'true'::jsonb
  GROUP BY e.session_id,k.field
)
SELECT jsonb_build_object(
  'total_score_column',(SELECT jsonb_build_object('is_generated',c.is_generated,'generation_expression',c.generation_expression)
    FROM information_schema.columns c WHERE c.table_schema='public' AND c.table_name='evaluations' AND c.column_name='total_score'),
  'sessions',coalesce((SELECT jsonb_agg(to_jsonb(s)||jsonb_build_object(
    'evaluation_rows',(SELECT count(*) FROM evaluation_facts e WHERE e.session_id=s.id),
    'noneligible_scored_rows',coalesce((SELECT jsonb_agg(jsonb_build_object('evaluation_id',e.id,'player_id',e.player_id,
      'callup_status',(SELECT c.status FROM public.callups c WHERE c.session_id=s.id AND c.player_id=e.player_id LIMIT 1),
      'attendance_status',(SELECT a.status FROM public.attendance a WHERE a.session_id=s.id AND a.player_id=e.player_id LIMIT 1)))
      FROM evaluation_facts e WHERE e.session_id=s.id AND NOT e.eligible AND e.has_numeric_scores),'[]'::jsonb),
    'invalid_na_flags',(SELECT count(*) FROM evaluation_facts e WHERE e.session_id=s.id
      AND (jsonb_typeof(e.na_fields) IS DISTINCT FROM 'object' OR EXISTS(
        SELECT 1 FROM jsonb_each(CASE WHEN jsonb_typeof(e.na_fields)='object' THEN e.na_fields ELSE '{}'::jsonb END) v
        WHERE v.key IN ('tactical_discipline','effort_commitment','decision_making','mentality_attitude') AND jsonb_typeof(v.value)<>'boolean'))),
    'quality_counts',coalesce((SELECT jsonb_agg(to_jsonb(q)-'session_id') FROM quality_counts q WHERE q.session_id=s.id),'[]'::jsonb),
    'duplicate_evaluations',(SELECT count(*) FROM (SELECT player_id FROM evaluation_facts e WHERE e.session_id=s.id GROUP BY player_id HAVING count(*)>1) d),
    'legacy_discipline_cycles_to_review',(SELECT count(DISTINCT c.player_id) FROM public.cards c WHERE c.session_id=s.id
      AND EXISTS(SELECT 1 FROM public.suspensions sp WHERE sp.player_id=c.player_id AND sp.source='yellow_accumulation' AND sp.status='served')
      AND NOT EXISTS(SELECT 1 FROM public.batch4_discipline_cycles dc WHERE dc.player_id=c.player_id))
  ) ORDER BY s.session_date DESC,s.id) FROM open_sessions s),'[]'::jsonb),
  'functions',coalesce((SELECT jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,
    'owner',pg_get_userbyid(p.proowner),'security_definer',p.prosecdef,'config',p.proconfig,
    'definition',pg_get_functiondef(p.oid))) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname IN
      ('batch4_finalize_evaluation','batch4_evaluation_snapshot','batch4_reconcile_yellows','enforce_high_rating_limit')),'[]'::jsonb)
) AS evaluation_confirmation_review;
