-- MANUAL POST-INSTALL CHECK. Reads catalogs; never edits sporting records.
-- Also asks PostgREST to reload its schema. Run after REVIEW_INSTALL.sql succeeds.
-- A true result checks installation metadata, not an authenticated user journey.
NOTIFY pgrst, 'reload schema';

WITH required_rpc(signature) AS (VALUES
  ('public.batch4_workflow_access(uuid,text)'),
  ('public.batch4_workflow_action(uuid,text,text,jsonb,boolean,jsonb)'),
  ('public.batch4_save_card(uuid,uuid,text,text,integer,jsonb)'),
  ('public.batch4_complete_suspension(uuid)'),
  ('public.batch4_initialize_discipline_cycle(uuid)'),
  ('public.batch4_discipline_balances()'),
  ('public.batch4_save_standouts(uuid,jsonb,jsonb)')
), required_trigger(table_name,trigger_name) AS (VALUES
  ('callups','batch4_callup_guard'),
  ('attendance','batch4_attendance_guard'),
  ('evaluations','batch4_evaluation_guard'),
  ('cards','batch4_card_guard'),
  ('sessions','batch4_session_flags_guard'),
  ('evaluations','batch4_evaluated_flag_guard'),
  ('cards','batch4_card_rpc_only'),
  ('suspensions','batch4_suspension_rpc_only'),
  ('session_standouts','batch4_standouts_rpc_only')
), required_view(view_name) AS (VALUES
  ('active_suspensions'),('player_card_totals'),('official_evaluations')
), checks(name,ok) AS (
  SELECT 'marker_column',EXISTS(SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='sessions'
      AND column_name='draft_defaults_version' AND data_type='smallint'
      AND is_nullable='YES' AND column_default IS NULL)
  UNION ALL
  SELECT 'rpc:'||signature,coalesce(to_regprocedure(signature) IS NOT NULL
    AND has_function_privilege('authenticated',to_regprocedure(signature),'EXECUTE')
    AND NOT has_function_privilege('anon',to_regprocedure(signature),'EXECUTE'),false)
  FROM required_rpc
  UNION ALL
  SELECT 'no_old_workflow_overload',to_regprocedure('public.batch4_workflow_action(uuid,text,text,jsonb,boolean)') IS NULL
  UNION ALL
  SELECT 'guard:'||trigger_name,EXISTS(SELECT 1 FROM pg_trigger t
    JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname=table_name AND t.tgname=trigger_name
      AND t.tgenabled IN ('O','A') AND NOT t.tgisinternal)
  FROM required_trigger
  UNION ALL
  SELECT 'view:'||v.view_name,EXISTS(SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname=v.view_name AND c.relkind='v'
      AND 'security_invoker=true'=ANY(c.reloptions)
      AND has_table_privilege('authenticated',c.oid,'SELECT')
      AND NOT has_table_privilege('anon',c.oid,'SELECT')
      AND NOT has_table_privilege('authenticated',c.oid,'INSERT,UPDATE,DELETE'))
  FROM required_view v
  UNION ALL
  SELECT 'discipline_rls',count(*)=2 AND bool_and(c.relrowsecurity)
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relname IN ('batch4_discipline_cycles','batch4_card_suspensions')
)
SELECT jsonb_build_object(
  'all_ok',bool_and(ok),
  'checks',jsonb_object_agg(name,ok),
  'next_step',CASE WHEN bool_and(ok)
    THEN 'Installation metadata verified; check authenticated Admin/Coach flows in the release before opening normal writes.'
    ELSE 'Do not publish; share this result to review the failed checks.' END
) AS release_check FROM checks;
