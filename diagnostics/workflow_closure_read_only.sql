-- MANUAL, READ ONLY. Review privately; never confirms, reopens or edits records.
-- No names, emails, credentials, attendance notes or evaluation scores.
WITH routines AS (
  SELECT p.oid::regprocedure::text AS signature,p.prosecdef,p.proconfig,p.proacl,
    pg_get_userbyid(p.proowner) AS owner,pg_get_functiondef(p.oid) AS definition
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.proname IN
    ('batch4_guard_records','batch4_workflow_access','batch4_workflow_action',
     'batch4_guard_session_flags','batch4_actor_role','app_has_access')
), session_checks AS (
  SELECT s.id,s.session_date,s.type,s.status,s.locked_at,
    s.callup_confirmed,s.attendance_confirmed,s.evaluation_confirmed,
    s.callup_confirmed_at,s.attendance_confirmed_at,s.evaluation_confirmed_at,
    (SELECT count(*) FROM public.callups c WHERE c.session_id=s.id) AS callup_rows,
    (SELECT count(*) FROM public.players p WHERE (
      p.status::text IN ('active','injured','trial','guest')
      OR EXISTS(SELECT 1 FROM public.attendance a WHERE a.session_id=s.id AND a.player_id=p.id)
      OR EXISTS(SELECT 1 FROM public.evaluations e WHERE e.session_id=s.id AND e.player_id=p.id))
      AND NOT EXISTS(SELECT 1 FROM public.callups c WHERE c.session_id=s.id AND c.player_id=p.id)) AS roster_without_callup,
    (SELECT count(*) FROM public.callups c WHERE c.session_id=s.id
      AND c.status::text IN ('called_up','trial','guest_not_evaluable')
      AND NOT EXISTS(SELECT 1 FROM public.attendance a WHERE a.session_id=s.id AND a.player_id=c.player_id)) AS called_without_attendance,
    (SELECT count(*) FROM public.callups c JOIN public.attendance a ON a.session_id=c.session_id AND a.player_id=c.player_id
      WHERE c.session_id=s.id AND c.evaluable IS TRUE AND c.status::text IN ('called_up','trial')
      AND a.status::text IN ('present','late','justified_late')
      AND NOT EXISTS(SELECT 1 FROM public.evaluations e WHERE e.session_id=s.id AND e.player_id=c.player_id)) AS eligible_without_evaluation
  FROM public.sessions s WHERE s.status::text IN ('planned','completed','locked')
)
SELECT jsonb_build_object(
  'functions',coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY signature) FROM routines r),'[]'::jsonb),
  'roles',coalesce((SELECT jsonb_agg(to_jsonb(r)) FROM (
    SELECT p.role::text,count(*) AS profiles,
      count(*) FILTER(WHERE EXISTS(SELECT 1 FROM public.app_access_members m WHERE m.user_id=p.id)) AS listed_accounts
    FROM public.profiles p GROUP BY p.role ORDER BY p.role
  ) r),'[]'::jsonb),
  'sessions',coalesce((SELECT jsonb_agg(to_jsonb(s) ORDER BY session_date DESC,id) FROM session_checks s),'[]'::jsonb),
  'policies',coalesce((SELECT jsonb_agg(to_jsonb(p)) FROM pg_policies p WHERE p.schemaname='public'
    AND p.tablename IN ('sessions','callups','attendance','evaluations')),'[]'::jsonb),
  'triggers',coalesce((SELECT jsonb_agg(jsonb_build_object('table',c.relname,'trigger',t.tgname,'enabled',t.tgenabled,
    'definition',pg_get_triggerdef(t.oid,true))) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT t.tgisinternal
    AND c.relname IN ('sessions','callups','attendance','evaluations')),'[]'::jsonb)
) AS workflow_closure_review;
