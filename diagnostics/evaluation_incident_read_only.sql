-- MANUAL, READ ONLY. November 6 evaluation incident: state and installed code.
-- No RPC execution, NOTIFY, repair, confirmation or historical-record changes.
-- Share privately: includes profile UUIDs, but no email, notes or credentials.
WITH target_sessions AS (
  SELECT s.id,s.name,s.session_date,s.type,s.status,s.locked_at,
    s.callup_confirmed,s.callup_confirmed_at,s.attendance_confirmed,s.attendance_confirmed_at,
    s.evaluation_confirmed,s.evaluation_confirmed_at,s.records_only_confirmed,
    to_jsonb(s)->>'draft_defaults_version' AS draft_defaults_version,
    (SELECT count(*) FROM public.callups c WHERE c.session_id=s.id) AS callup_rows,
    (SELECT count(*) FROM public.attendance a WHERE a.session_id=s.id) AS attendance_rows,
    (SELECT count(*) FROM public.evaluations e WHERE e.session_id=s.id) AS evaluation_rows,
    (SELECT count(*) FROM public.callups c WHERE c.session_id=s.id
      AND c.status::text IN ('called_up','trial','guest_not_evaluable')
      AND NOT EXISTS(SELECT 1 FROM public.attendance a WHERE a.session_id=s.id AND a.player_id=c.player_id)) AS called_without_attendance
  FROM public.sessions s WHERE s.session_date='2026-11-06'
), relevant_triggers AS (
  SELECT c.relname,t.tgname,t.tgenabled,t.tgfoid,pg_get_triggerdef(t.oid,true) AS definition
  FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relname IN ('sessions','attendance','evaluations','callups') AND NOT t.tgisinternal
)
SELECT jsonb_build_object(
  'sessions',coalesce((SELECT jsonb_agg(to_jsonb(s) ORDER BY s.id) FROM target_sessions s),'[]'::jsonb),
  'profiles',coalesce((SELECT jsonb_agg(jsonb_build_object('id',p.id,'role',p.role,
    'approved',EXISTS(SELECT 1 FROM public.app_access_members m WHERE m.user_id=p.id)))
    FROM public.profiles p WHERE p.role::text IN ('admin','coach')),'[]'::jsonb),
  'triggers',coalesce((SELECT jsonb_agg(to_jsonb(t)-'tgfoid') FROM relevant_triggers t),'[]'::jsonb),
  'functions',coalesce((SELECT jsonb_agg(to_jsonb(f)) FROM (
    SELECT p.oid::regprocedure::text AS signature,pg_get_userbyid(p.proowner) AS owner,
      p.prosecdef AS security_definer,p.proconfig,p.proacl,pg_get_functiondef(p.oid) AS definition
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.prokind='f' AND (
      p.proname IN ('batch4_workflow_action','batch4_workflow_access','batch4_assert_global_access',
        'batch4_actor_role','current_role','app_has_access','app_access','batch4_finalize_evaluation')
      OR p.oid IN (SELECT tgfoid FROM relevant_triggers))
    ORDER BY p.oid::regprocedure::text
  ) f),'[]'::jsonb)
) AS evaluation_incident;
