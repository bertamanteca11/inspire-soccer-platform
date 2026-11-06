-- MANUAL, READ ONLY. Complements the diagnostic already exported.
-- One JSON cell. No user records, no credentials and no changes.
SELECT jsonb_build_object(
  'role_functions', COALESCE((
    SELECT jsonb_agg(to_jsonb(result_row)) FROM (
      SELECT p.oid::regprocedure AS signature,
        pg_get_userbyid(p.proowner) AS owner,
        p.prosecdef,p.proconfig,p.proacl,pg_get_functiondef(p.oid) AS definition
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.prokind='f' AND p.proname='current_role'
      ORDER BY p.oid::regprocedure::text
    ) AS result_row
  ), '[]'::jsonb),
  'view_options', COALESCE((
    SELECT jsonb_agg(to_jsonb(result_row)) FROM (
      SELECT c.relname,c.reloptions,pg_get_userbyid(c.relowner) AS owner,c.relacl
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relkind='v' AND c.relname IN
        ('official_evaluations','active_suspensions','player_card_totals')
      ORDER BY c.relname
    ) AS result_row
  ), '[]'::jsonb)
) AS diagnostic;
