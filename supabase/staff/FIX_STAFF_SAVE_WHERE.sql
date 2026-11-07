-- MANUAL HOTFIX for an already installed private staff section.
-- Run once in Supabase SQL Editor as postgres. Safe to run again.
-- Only patches the function definition. Never invokes a staff action or edits
-- members, attendance, cards, sanctions, sessions, access lists or revision data.
-- Keeps safeupdate, RLS, SECURITY DEFINER, ownership and existing grants intact.
BEGIN;
DO $patch$
DECLARE
  target regprocedure := to_regprocedure('public.private_staff_action(uuid,text,jsonb,bigint)');
  definition text;
  before_metadata jsonb;
  after_metadata jsonb;
  old_statement constant text := 'UPDATE public.private_staff_control SET revision=revision+1;';
  new_statement constant text := 'UPDATE public.private_staff_control SET revision=revision+1 WHERE singleton = true;';
BEGIN
  IF target IS NULL THEN
    RAISE EXCEPTION 'La función de staff no está instalada. No ejecutes de nuevo el instalador completo; comparte este error.';
  END IF;
  SELECT pg_get_functiondef(p.oid),jsonb_build_object('owner',p.proowner,'acl',p.proacl,
    'definer',p.prosecdef,'config',p.proconfig)
    INTO definition,before_metadata FROM pg_proc p WHERE p.oid=target;
  IF position(old_statement IN definition)=0 AND position(new_statement IN definition)>0 THEN
    RAISE NOTICE 'La corrección del guardado de staff ya está instalada.';
    RETURN;
  END IF;
  IF (length(definition)-length(replace(definition,old_statement,'')))/length(old_statement)<>1 THEN
    RAISE EXCEPTION 'La función instalada difiere de la versión esperada. No se ha modificado nada; comparte este error.';
  END IF;
  -- pg_get_functiondef returns CREATE OR REPLACE FUNCTION. Replace exactly the
  -- known unfiltered counter update and preserve every other line of live code.
  EXECUTE replace(definition,old_statement,new_statement);
  SELECT jsonb_build_object('owner',p.proowner,'acl',p.proacl,
    'definer',p.prosecdef,'config',p.proconfig)
    INTO after_metadata FROM pg_proc p WHERE p.oid=target;
  IF before_metadata IS DISTINCT FROM after_metadata THEN
    RAISE EXCEPTION 'No se conservaron los metadatos de seguridad. Se revierte la corrección.';
  END IF;
END $patch$;
NOTIFY pgrst,'reload schema';
COMMIT;

SELECT jsonb_build_object(
  'all_ok',position('UPDATE public.private_staff_control SET revision=revision+1 WHERE singleton = true;'
    IN pg_get_functiondef(p.oid))>0 AND p.prosecdef
    AND has_function_privilege('authenticated',p.oid,'EXECUTE')
    AND NOT has_function_privilege('anon',p.oid,'EXECUTE'),
  'next_step','Pulsa Actualizar staff y vuelve a añadir el miembro. No hace falta reinstalar ni desplegar la app.'
) AS staff_save_patch
FROM pg_proc p WHERE p.oid='public.private_staff_action(uuid,text,jsonb,bigint)'::regprocedure;
