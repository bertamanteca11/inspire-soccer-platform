-- MANUAL upgrade after private staff installation. Run as postgres.
-- Members can be managed with p_session=NULL. Sporting workflows still require
-- a real operational session. No accounts, members or sporting data are edited.
-- Preserves function signatures, ownership, grants, revision locks and Admin-only access.
BEGIN;
DO $upgrade$
DECLARE
  target regprocedure;
  definition text;
  previous_metadata jsonb;
  current_metadata jsonb;
  signature text;
  workspace_old constant text := 'IF NOT EXISTS(SELECT 1 FROM public.sessions WHERE id=p_session) THEN';
  workspace_new constant text := 'IF p_session IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.sessions WHERE id=p_session) THEN';
  action_old constant text := 'SELECT * INTO s FROM public.sessions WHERE id=p_session FOR UPDATE;';
  action_new constant text := E'-- Member management is global. Only sporting workflows require a session.\n  IF p_action NOT IN (''add_member'',''member_active'') THEN\n  SELECT * INTO s FROM public.sessions WHERE id=p_session FOR UPDATE;';
  branch_old constant text := 'IF p_action=''add_member'' THEN';
  branch_new constant text := E'END IF;\n  IF p_action=''add_member'' THEN';
BEGIN
  FOREACH signature IN ARRAY ARRAY['public.private_staff_workspace(uuid)','public.private_staff_action(uuid,text,jsonb,bigint)'] LOOP
    target:=to_regprocedure(signature);
    IF target IS NULL THEN RAISE EXCEPTION 'Falta instalar Staff. No se ha modificado nada: %',signature; END IF;
    SELECT pg_get_functiondef(p.oid),jsonb_build_object('owner',p.proowner,'acl',p.proacl,'definer',p.prosecdef,'config',p.proconfig)
      INTO definition,previous_metadata FROM pg_proc p WHERE p.oid=target;
    IF signature='public.private_staff_workspace(uuid)' THEN
      IF position(workspace_new IN definition)>0 THEN CONTINUE; END IF;
      IF (length(definition)-length(replace(definition,workspace_old,'')))/length(workspace_old)<>1 THEN
        RAISE EXCEPTION 'La función de lectura difiere de la versión esperada. No se ha modificado nada.';
      END IF;
      definition:=replace(definition,workspace_old,workspace_new);
    ELSE
      IF position('IF p_action NOT IN (''add_member'',''member_active'') THEN' IN definition)>0 THEN CONTINUE; END IF;
      IF (length(definition)-length(replace(definition,action_old,'')))/length(action_old)<>1
        OR (length(definition)-length(replace(definition,branch_old,'')))/length(branch_old)<>1 THEN
        RAISE EXCEPTION 'La función de guardado difiere de la versión esperada. No se ha modificado nada.';
      END IF;
      IF position('UPDATE public.private_staff_control SET revision=revision+1 WHERE singleton = true;' IN definition)=0 THEN
        RAISE EXCEPTION 'Aplica primero FIX_STAFF_SAVE_WHERE.sql. No se ha modificado nada.';
      END IF;
      definition:=replace(replace(definition,action_old,action_new),branch_old,branch_new);
    END IF;
    EXECUTE definition;
    SELECT jsonb_build_object('owner',p.proowner,'acl',p.proacl,'definer',p.prosecdef,'config',p.proconfig)
      INTO current_metadata FROM pg_proc p WHERE p.oid=target;
    IF previous_metadata IS DISTINCT FROM current_metadata THEN
      RAISE EXCEPTION 'Se revierte la actualización: los metadatos de seguridad deben conservarse.';
    END IF;
  END LOOP;
END $upgrade$;
NOTIFY pgrst,'reload schema';
COMMIT;
SELECT jsonb_build_object('all_ok',
  position('IF p_session IS NOT NULL AND NOT EXISTS' IN pg_get_functiondef('public.private_staff_workspace(uuid)'::regprocedure))>0
  AND position('IF p_action NOT IN (''add_member'',''member_active'') THEN' IN pg_get_functiondef('public.private_staff_action(uuid,text,jsonb,bigint)'::regprocedure))>0,
  'next_step','Directorio del staff activado. Los miembros se gestionan sin seleccionar una sesión.') AS staff_directory_check;
