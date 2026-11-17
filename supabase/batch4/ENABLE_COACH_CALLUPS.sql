-- MANUAL UPGRADE for an existing Batch 4 installation. Run as postgres.
-- Admin and Coach may confirm callups; confirmed workflows stay closed.
-- Reopening remains Admin-only. Changes three function definitions only.
-- Does not invoke workflows or modify sessions, players, profiles or records.
BEGIN;
DO $patch$
DECLARE
  item record;
  target regprocedure;
  definition text;
  before_metadata jsonb;
  after_metadata jsonb;
  marker constant text := '/* Coach callup access enabled; workflow locks still apply. */';
BEGIN
  FOR item IN SELECT * FROM (VALUES
    ('public.batch4_guard_records()', 'OR (wf = ''callup'' AND actor_role <> ''admin'')'),
    ('public.batch4_workflow_access(uuid,text)', 'OR (p_workflow = ''callup'' AND r <> ''admin'')'),
    ('public.batch4_workflow_action(uuid,text,text,jsonb,boolean,jsonb)', 'OR (p_workflow = ''callup'' AND r <> ''admin'')')
  ) AS changes(signature,old_clause) LOOP
    target:=to_regprocedure(item.signature);
    IF target IS NULL THEN RAISE EXCEPTION 'Falta la función %. No repitas el instalador; comparte este error.',item.signature; END IF;
    SELECT pg_get_functiondef(p.oid),jsonb_build_object('owner',p.proowner,'acl',p.proacl,
      'definer',p.prosecdef,'config',p.proconfig,'volatility',p.provolatile,'language',p.prolang)
      INTO definition,before_metadata FROM pg_proc p WHERE p.oid=target;
    IF position(item.old_clause IN definition)=0 AND position(marker IN definition)>0 THEN CONTINUE; END IF;
    IF (length(definition)-length(replace(definition,item.old_clause,'')))/length(item.old_clause)<>1
      OR before_metadata->>'definer'<>'true' THEN
      RAISE EXCEPTION 'La función % difiere de la versión esperada. Se revierte todo el parche; comparte este error.',item.signature;
    END IF;
    EXECUTE replace(definition,item.old_clause,marker);
    SELECT jsonb_build_object('owner',p.proowner,'acl',p.proacl,
      'definer',p.prosecdef,'config',p.proconfig,'volatility',p.provolatile,'language',p.prolang)
      INTO after_metadata FROM pg_proc p WHERE p.oid=target;
    IF before_metadata IS DISTINCT FROM after_metadata THEN
      RAISE EXCEPTION 'No se conservaron los metadatos de seguridad de %. Se revierte todo el parche.',item.signature;
    END IF;
  END LOOP;
END $patch$;
NOTIFY pgrst,'reload schema';
COMMIT;

WITH checks(name,ok) AS (
  SELECT 'coach:'||signature,p.prosecdef
    AND position('/* Coach callup access enabled; workflow locks still apply. */' IN p.prosrc)>0
    AND position(old_clause IN p.prosrc)=0
  FROM (VALUES
    ('public.batch4_guard_records()', 'OR (wf = ''callup'' AND actor_role <> ''admin'')'),
    ('public.batch4_workflow_access(uuid,text)', 'OR (p_workflow = ''callup'' AND r <> ''admin'')'),
    ('public.batch4_workflow_action(uuid,text,text,jsonb,boolean,jsonb)', 'OR (p_workflow = ''callup'' AND r <> ''admin'')')
  ) f(signature,old_clause) JOIN pg_proc p ON p.oid=to_regprocedure(signature)
  UNION ALL
  SELECT 'reopen_admin_only',position('(p_action = ''reopen'' AND r <> ''admin'')' IN p.prosrc)>0
    FROM pg_proc p WHERE p.oid='public.batch4_workflow_action(uuid,text,text,jsonb,boolean,jsonb)'::regprocedure
  UNION ALL
  SELECT 'confirmed_records_still_locked',position('Workflow closed: Admin must reopen first' IN p.prosrc)>0
    FROM pg_proc p WHERE p.oid='public.batch4_guard_records()'::regprocedure
  UNION ALL
  SELECT 'rpc_permissions',bool_and(has_function_privilege('authenticated',p.oid,'EXECUTE')
    AND NOT has_function_privilege('anon',p.oid,'EXECUTE'))
    FROM pg_proc p WHERE p.oid IN ('public.batch4_workflow_access(uuid,text)'::regprocedure,
      'public.batch4_workflow_action(uuid,text,text,jsonb,boolean,jsonb)'::regprocedure)
)
SELECT jsonb_build_object('all_ok',bool_and(ok),'checks',jsonb_object_agg(name,ok),
  'next_step','Permisos de convocatoria instalados. Comprobar la versión nueva de la app con Admin y Coach; confirmar bloquea, reabrir requiere Admin.')
  AS coach_workflow_check FROM checks;
