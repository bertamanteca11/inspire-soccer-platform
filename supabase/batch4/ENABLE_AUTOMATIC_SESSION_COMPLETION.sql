-- MANUAL UPGRADE. Run this complete file as postgres in Supabase SQL Editor.
-- Future successful confirmations mark an unlocked planned session completed
-- only when callup, attendance and evaluation are all confirmed.
-- Reopening keeps the completed status; each workflow retains its own lock.
-- Changes one function only. Does not update existing sessions or sporting data.
BEGIN;
DO $patch$
DECLARE
  target regprocedure:=to_regprocedure('public.batch4_workflow_action(uuid,text,text,jsonb,boolean,jsonb)');
  definition text;
  before_metadata jsonb;
  after_metadata jsonb;
  marker constant text:='-- Complete the session atomically after all three reviewed confirmations.';
  old_statement constant text:=replace($old$  SELECT * INTO s FROM public.sessions WHERE id=p_session;
  RETURN to_jsonb(s);$old$,chr(13),'');
  new_statement constant text:=replace($new$  -- Complete the session atomically after all three reviewed confirmations.
  -- Reopening a workflow does not undo the fact that the session took place.
  IF p_action = 'confirm' THEN
    UPDATE public.sessions SET status='completed'
      WHERE id=p_session AND status::text='planned' AND locked_at IS NULL
        AND callup_confirmed IS TRUE AND attendance_confirmed IS TRUE
        AND evaluation_confirmed IS TRUE;
  END IF;
  SELECT * INTO s FROM public.sessions WHERE id=p_session;
  RETURN to_jsonb(s);$new$,chr(13),'');
BEGIN
  IF target IS NULL THEN RAISE EXCEPTION 'Falta el RPC de confirmación esperado. No repitas el instalador; comparte este error.'; END IF;
  SELECT replace(pg_get_functiondef(p.oid),chr(13),''),jsonb_build_object('owner',p.proowner,'acl',p.proacl,
    'definer',p.prosecdef,'config',p.proconfig,'volatility',p.provolatile,'language',p.prolang)
    INTO definition,before_metadata FROM pg_proc p WHERE p.oid=target;
  IF position(new_statement IN definition)>0 THEN
    RAISE NOTICE 'La finalización automática ya está instalada.'; RETURN;
  END IF;
  IF (length(definition)-length(replace(definition,old_statement,'')))/length(old_statement)<>1
    OR position(marker IN definition)>0 OR before_metadata->>'definer'<>'true' THEN
    RAISE EXCEPTION 'El RPC difiere de la versión esperada. Se revierte el parche; comparte este error.';
  END IF;
  EXECUTE replace(definition,old_statement,new_statement);
  SELECT jsonb_build_object('owner',p.proowner,'acl',p.proacl,
    'definer',p.prosecdef,'config',p.proconfig,'volatility',p.provolatile,'language',p.prolang)
    INTO after_metadata FROM pg_proc p WHERE p.oid=target;
  IF before_metadata IS DISTINCT FROM after_metadata THEN
    RAISE EXCEPTION 'No se conservaron los metadatos de seguridad. Se revierte el parche.';
  END IF;
END $patch$;
NOTIFY pgrst,'reload schema';
COMMIT;

WITH checks(name,ok) AS (
  SELECT 'automatic_completion',position('-- Complete the session atomically after all three reviewed confirmations.' IN p.prosrc)>0
    FROM pg_proc p WHERE p.oid='public.batch4_workflow_action(uuid,text,text,jsonb,boolean,jsonb)'::regprocedure
  UNION ALL
  SELECT 'rpc_permissions',p.prosecdef AND has_function_privilege('authenticated',p.oid,'EXECUTE')
    AND NOT has_function_privilege('anon',p.oid,'EXECUTE')
    FROM pg_proc p WHERE p.oid='public.batch4_workflow_action(uuid,text,text,jsonb,boolean,jsonb)'::regprocedure
  UNION ALL
  SELECT 'reopen_admin_only',position('(p_action = ''reopen'' AND r <> ''admin'')' IN p.prosrc)>0
    FROM pg_proc p WHERE p.oid='public.batch4_workflow_action(uuid,text,text,jsonb,boolean,jsonb)'::regprocedure
)
SELECT jsonb_build_object('all_ok',bool_and(ok),'checks',jsonb_object_agg(name,ok),
  'next_step','Automatización instalada. Al confirmar las tres partes, una sesión planificada pasará a Completada. Las sesiones cerradas anteriormente no se modifican con este archivo.')
  AS automatic_session_completion_check FROM checks;
