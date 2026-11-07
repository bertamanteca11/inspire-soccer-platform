-- MANUAL, READ ONLY. Run after supabase/staff/INSTALL_PRIVATE_STAFF.sql succeeds.
-- Installation metadata only; no staff names, sporting records, credentials or tokens.
WITH private_tables(name) AS (VALUES
  ('private_staff_control'),('private_staff_members'),('private_staff_workflows'),
  ('private_staff_callups'),('private_staff_attendance'),('private_staff_cards'),('private_staff_suspensions')
), legacy_views(name) AS (VALUES ('session_evaluation_summary'),('player_overview'),('active_player_injuries')
), checks(name,ok) AS (
  SELECT 'legacy_view:'||v.name,CASE WHEN c.oid IS NULL THEN true ELSE c.relkind='v'
    AND coalesce('security_invoker=true'=ANY(c.reloptions),false)
    AND has_table_privilege('authenticated',c.oid,'SELECT')
    AND NOT has_table_privilege('anon',c.oid,'SELECT')
    AND NOT has_table_privilege('authenticated',c.oid,'INSERT,UPDATE,DELETE') END
  FROM legacy_views v LEFT JOIN pg_namespace n ON n.nspname='public'
    LEFT JOIN pg_class c ON c.relnamespace=n.oid AND c.relname=v.name
  UNION ALL
  SELECT 'legacy_suspension_rpc_not_exposed',CASE WHEN to_regprocedure('public.advance_suspensions_for_match(uuid)') IS NULL THEN true ELSE
    NOT has_function_privilege('authenticated',to_regprocedure('public.advance_suspensions_for_match(uuid)'),'EXECUTE')
    AND NOT has_function_privilege('anon',to_regprocedure('public.advance_suspensions_for_match(uuid)'),'EXECUTE') END
  UNION ALL
  SELECT 'one_approved_coach',count(*) FILTER(WHERE p.role::text='coach')=1
    AND count(*) FILTER(WHERE p.role::text='admin')>=1 AND bool_and(p.role::text IN ('admin','coach'))
  FROM public.app_access_members m JOIN public.profiles p ON p.id=m.user_id
  UNION ALL
  SELECT 'existing_admin_accounts_approved',NOT EXISTS(SELECT 1 FROM public.profiles p WHERE p.role::text='admin'
    AND NOT EXISTS(SELECT 1 FROM public.app_access_members m WHERE m.user_id=p.id))
  UNION ALL
  SELECT 'account_directory_private',NOT has_table_privilege('authenticated','public.app_access_members','SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
    AND NOT has_table_privilege('anon','public.app_access_members','SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
  UNION ALL
  SELECT 'private_table:'||p.name,coalesce(c.relrowsecurity,false)
    AND has_table_privilege('authenticated',c.oid,'SELECT')
    AND NOT has_table_privilege('authenticated',c.oid,'INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER')
    AND NOT has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
    AND EXISTS(SELECT 1 FROM pg_policies x WHERE x.schemaname='public' AND x.tablename=p.name
      AND x.policyname='private_staff_read' AND x.cmd='SELECT' AND x.qual LIKE '%app_private_staff_access%')
  FROM private_tables p LEFT JOIN pg_namespace n ON n.nspname='public'
    LEFT JOIN pg_class c ON c.relnamespace=n.oid AND c.relname=p.name
  UNION ALL
  SELECT 'rpc:'||signature,coalesce(to_regprocedure('public.'||signature) IS NOT NULL
    AND has_function_privilege('authenticated',to_regprocedure('public.'||signature),'EXECUTE')
    AND NOT has_function_privilege('anon',to_regprocedure('public.'||signature),'EXECUTE'),false)
  FROM (VALUES ('app_access()'),('private_staff_workspace(uuid)'),('private_staff_action(uuid,text,jsonb,bigint)')) f(signature)
  UNION ALL
  SELECT 'operational_membership_policies',NOT EXISTS(
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind IN ('r','p') AND c.relname NOT LIKE 'private_staff_%'
      AND c.relname<>'app_access_members'
      AND NOT EXISTS(SELECT 1 FROM pg_depend d WHERE d.classid='pg_class'::regclass AND d.objid=c.oid AND d.deptype='e')
      AND (NOT c.relrowsecurity OR NOT EXISTS(SELECT 1 FROM pg_policies p WHERE p.schemaname='public' AND p.tablename=c.relname
        AND p.policyname='app_members_only' AND p.permissive='RESTRICTIVE'))
  )
)
SELECT jsonb_build_object('all_ok',bool_and(coalesce(ok,false)),'checks',jsonb_object_agg(name,coalesce(ok,false)),
  'next_step','Comparte el resultado para publicar la versión de staff: Admin privado, Coach sin staff.') AS private_staff_check FROM checks;
