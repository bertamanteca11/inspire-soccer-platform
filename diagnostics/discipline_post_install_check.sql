-- READ ONLY: installation and ambiguity counts, never completes or repairs cases.
WITH checks(name,ok) AS (
  SELECT 'table:'||name,coalesce(c.relrowsecurity,false)
    AND has_table_privilege('authenticated',c.oid,'SELECT')
    AND NOT has_table_privilege('authenticated',c.oid,'INSERT,UPDATE,DELETE,TRUNCATE')
    AND NOT has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')
  FROM (VALUES ('discipline_rules'),('discipline_service_matches'),('discipline_cycle_credits'),('discipline_audit')) t(name)
    LEFT JOIN pg_class c ON c.oid=to_regclass('public.'||name)
  UNION ALL
  SELECT 'rpc:'||signature,coalesce(p.prosecdef AND has_function_privilege('authenticated',p.oid,'EXECUTE')
    AND NOT has_function_privilege('anon',p.oid,'EXECUTE'),false)
  FROM (VALUES ('discipline_workspace(uuid)'),('discipline_action(text,jsonb,integer)'),
    ('discipline_save_card(uuid,uuid,text,text,integer,jsonb)')) f(signature)
    LEFT JOIN pg_proc p ON p.oid=to_regprocedure('public.'||signature)
  UNION ALL
  SELECT 'no_shared_service_match',EXISTS(SELECT 1 FROM pg_indexes WHERE schemaname='public'
    AND indexname='discipline_one_case_per_served_match' AND indexdef LIKE 'CREATE UNIQUE INDEX%')
  UNION ALL
  SELECT 'legacy_guards_kept',count(*)=2 AND bool_and(t.tgenabled IN ('O','A')) FROM pg_trigger t
    WHERE t.tgname IN ('batch4_card_rpc_only','batch4_suspension_rpc_only') AND NOT t.tgisinternal
  UNION ALL
  SELECT 'unknown_length_supported',EXISTS(SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='suspensions' AND column_name='matches_total' AND is_nullable='YES')
)
SELECT jsonb_build_object('all_ok',bool_and(coalesce(ok,false)),'checks',jsonb_object_agg(name,coalesce(ok,false)),
  'legacy_cases_to_review',(SELECT count(*) FROM public.suspensions WHERE needs_review),
  'undecided_dismissal_rules',(SELECT (double_yellow_units IS NULL OR yellow_red_units IS NULL) FROM public.discipline_rules),
  'next_step','Publicar la versión nueva de tarjetas. Revisar explícitamente las sanciones antiguas y confirmar las reglas pendientes; no se ha reparado ni completado ninguna sanción automáticamente.')
  AS discipline_install_check FROM checks;
