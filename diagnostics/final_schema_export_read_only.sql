-- MANUAL, READ ONLY. One result containing the full diagnostic as JSON.
-- Copy the complete diagnostic cell or export its result privately.
-- Derived from final_schema_read_only.sql; no credentials or auth.users.
-- Multiple cards may be legitimate; this file never repairs data.

SELECT jsonb_build_object(
  'environment', COALESCE((
    SELECT jsonb_agg(to_jsonb(result_row)) FROM (
      SELECT current_database(), current_user, version()
    ) AS result_row
  ), '[]'::jsonb),
  'columns', COALESCE((
    SELECT jsonb_agg(to_jsonb(result_row)) FROM (
      SELECT table_name,column_name,data_type,udt_schema,udt_name,is_nullable,column_default
      FROM information_schema.columns
      WHERE table_schema='public' AND table_name IN
        ('profiles','players','sessions','callups','attendance','evaluations','cards','suspensions','session_standouts','staff_flags','must_win_reviews')
      ORDER BY table_name,ordinal_position
    ) AS result_row
  ), '[]'::jsonb),
  'relations', COALESCE((
    SELECT jsonb_agg(to_jsonb(result_row)) FROM (
      SELECT n.nspname,c.relname,c.relkind,c.relrowsecurity,c.relforcerowsecurity,
        pg_get_userbyid(c.relowner) AS owner,c.relacl
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname IN
        ('profiles','players','sessions','callups','attendance','evaluations','cards','suspensions','active_suspensions','player_card_totals','official_evaluations','session_standouts','staff_flags','must_win_reviews')
    ) AS result_row
  ), '[]'::jsonb),
  'policies', COALESCE((
    SELECT jsonb_agg(to_jsonb(result_row)) FROM (
      SELECT schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check
      FROM pg_policies WHERE schemaname='public'
      ORDER BY tablename,policyname
    ) AS result_row
  ), '[]'::jsonb),
  'table_privileges', COALESCE((
    SELECT jsonb_agg(to_jsonb(result_row)) FROM (
      SELECT table_name,grantee,privilege_type,is_grantable
      FROM information_schema.table_privileges WHERE table_schema='public'
      ORDER BY table_name,grantee,privilege_type
    ) AS result_row
  ), '[]'::jsonb),
  'column_privileges', COALESCE((
    SELECT jsonb_agg(to_jsonb(result_row)) FROM (
      SELECT table_name,column_name,grantee,privilege_type
      FROM information_schema.column_privileges WHERE table_schema='public'
      ORDER BY table_name,column_name,grantee,privilege_type
    ) AS result_row
  ), '[]'::jsonb),
  'triggers', COALESCE((
    SELECT jsonb_agg(to_jsonb(result_row)) FROM (
      SELECT c.relname,t.tgname,t.tgenabled,pg_get_triggerdef(t.oid,true) AS trigger_definition,
        p.oid::regprocedure AS function_signature
      FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
      JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_proc p ON p.oid=t.tgfoid
      WHERE n.nspname='public' AND NOT t.tgisinternal
      ORDER BY c.relname,t.tgname
    ) AS result_row
  ), '[]'::jsonb),
  'functions', COALESCE((
    SELECT jsonb_agg(to_jsonb(result_row)) FROM (
      SELECT p.oid::regprocedure AS signature,pg_get_userbyid(p.proowner) AS owner,
        p.prosecdef,p.proconfig,p.proacl,pg_get_functiondef(p.oid) AS definition
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.prokind='f' AND (
        p.proname IN ('prevent_locked_session_edits','enforce_high_rating_limit',
          'create_yellow_accumulation_suspensions','batch4_assert_global_access',
          'batch4_finalize_evaluation','batch4_workflow_access','batch4_workflow_action')
        OR p.oid IN (
          SELECT t.tgfoid FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
          JOIN pg_namespace ns ON ns.oid=c.relnamespace
          WHERE ns.nspname='public' AND NOT t.tgisinternal AND c.relname IN
            ('profiles','players','sessions','callups','attendance','evaluations','cards','suspensions')
        )
      ) ORDER BY p.oid::regprocedure::text
    ) AS result_row
  ), '[]'::jsonb),
  'constraints', COALESCE((
    SELECT jsonb_agg(to_jsonb(result_row)) FROM (
      SELECT c.relname,k.conname,k.contype,pg_get_constraintdef(k.oid,true) AS definition
      FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid
      JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'
      ORDER BY c.relname,k.conname
    ) AS result_row
  ), '[]'::jsonb),
  'indexes', COALESCE((
    SELECT jsonb_agg(to_jsonb(result_row)) FROM (
      SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='public'
      ORDER BY tablename,indexname
    ) AS result_row
  ), '[]'::jsonb),
  'enums', COALESCE((
    SELECT jsonb_agg(to_jsonb(result_row)) FROM (
      SELECT t.typname,e.enumlabel,e.enumsortorder FROM pg_enum e
      JOIN pg_type t ON t.oid=e.enumtypid JOIN pg_namespace n ON n.oid=t.typnamespace
      WHERE n.nspname='public' ORDER BY t.typname,e.enumsortorder
    ) AS result_row
  ), '[]'::jsonb),
  'views', COALESCE((
    SELECT jsonb_agg(to_jsonb(result_row)) FROM (
      SELECT viewname,definition FROM pg_views WHERE schemaname='public' AND viewname IN
        ('official_evaluations','active_suspensions','player_card_totals')
    ) AS result_row
  ), '[]'::jsonb),
  'roles', COALESCE((
    SELECT jsonb_agg(to_jsonb(result_row)) FROM (
      SELECT rolname,rolsuper,rolinherit,rolcreaterole,rolbypassrls
      FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role','postgres')
    ) AS result_row
  ), '[]'::jsonb),
  'schemas', COALESCE((
    SELECT jsonb_agg(to_jsonb(result_row)) FROM (
      SELECT nspname,nspacl FROM pg_namespace WHERE nspname IN ('public','auth')
    ) AS result_row
  ), '[]'::jsonb),
  'duplicate_callups', COALESCE((
    SELECT jsonb_agg(to_jsonb(result_row)) FROM (
      SELECT session_id,player_id,count(*) FROM public.callups GROUP BY session_id,player_id HAVING count(*)>1
    ) AS result_row
  ), '[]'::jsonb),
  'duplicate_attendance', COALESCE((
    SELECT jsonb_agg(to_jsonb(result_row)) FROM (
      SELECT session_id,player_id,count(*) FROM public.attendance GROUP BY session_id,player_id HAVING count(*)>1
    ) AS result_row
  ), '[]'::jsonb),
  'duplicate_evaluations', COALESCE((
    SELECT jsonb_agg(to_jsonb(result_row)) FROM (
      SELECT session_id,player_id,count(*) FROM public.evaluations GROUP BY session_id,player_id HAVING count(*)>1
    ) AS result_row
  ), '[]'::jsonb),
  'multiple_cards', COALESCE((
    SELECT jsonb_agg(to_jsonb(result_row)) FROM (
      SELECT session_id,player_id,count(*) FROM public.cards GROUP BY session_id,player_id HAVING count(*)>1
    ) AS result_row
  ), '[]'::jsonb),
  'draft_markers', COALESCE((
    SELECT jsonb_agg(to_jsonb(result_row)) FROM (
      SELECT to_jsonb(s)->>'draft_defaults_version' AS draft_defaults_version,count(*)
      FROM public.sessions AS s GROUP BY 1
    ) AS result_row
  ), '[]'::jsonb)
) AS diagnostic;
