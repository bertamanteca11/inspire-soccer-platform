-- MANUAL HOTFIX. Run this complete file in Supabase SQL Editor as postgres.
-- Restores application access by Coach profile role. Private staff stays Admin-only.
-- Changes only app_has_access(): no sporting records, profiles or access-list rows.
-- Keeps RLS policies, workflow guards, ownership and grants. Safe to run again.
BEGIN;
DO $patch$
DECLARE
  target regprocedure := to_regprocedure('public.app_has_access()');
  installed_body text;
  before_metadata jsonb;
  after_metadata jsonb;
  old_body constant text := $old$
    SELECT EXISTS(SELECT 1 FROM public.app_access_members m JOIN public.profiles p ON p.id=m.user_id
      WHERE m.user_id=auth.uid() AND p.role::text IN ('admin','coach'))
  $old$;
  new_body constant text := $new$
  -- Coach access follows the profile role; Admin still requires approval.
  SELECT EXISTS(SELECT 1 FROM public.profiles p WHERE p.id=auth.uid() AND (
    p.role::text='coach' OR (p.role::text='admin' AND EXISTS(
      SELECT 1 FROM public.app_access_members m WHERE m.user_id=p.id))))
  $new$;
BEGIN
  IF target IS NULL OR to_regprocedure('public.app_private_staff_access()') IS NULL THEN
    RAISE EXCEPTION 'No está instalado el control de acceso esperado. No repitas el instalador; comparte este error.';
  END IF;
  SELECT p.prosrc,jsonb_build_object('owner',p.proowner,'acl',p.proacl,
    'definer',p.prosecdef,'config',p.proconfig,'volatility',p.provolatile,'language',p.prolang)
    INTO installed_body,before_metadata FROM pg_proc p WHERE p.oid=target;
  IF regexp_replace(installed_body,'\s','','g')=regexp_replace(new_body,'\s','','g') THEN
    RAISE NOTICE 'El acceso de Coach por rol ya está instalado.';
    RETURN;
  END IF;
  IF regexp_replace(installed_body,'\s','','g')<>regexp_replace(old_body,'\s','','g') THEN
    RAISE EXCEPTION 'La función de acceso difiere de la versión esperada. No se ha modificado nada; comparte este error.';
  END IF;
  EXECUTE format('CREATE OR REPLACE FUNCTION public.app_has_access() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='''' AS %L',new_body);
  SELECT jsonb_build_object('owner',p.proowner,'acl',p.proacl,
    'definer',p.prosecdef,'config',p.proconfig,'volatility',p.provolatile,'language',p.prolang)
    INTO after_metadata FROM pg_proc p WHERE p.oid=target;
  IF before_metadata IS DISTINCT FROM after_metadata THEN
    RAISE EXCEPTION 'No se conservaron los metadatos de seguridad. Se revierte la corrección.';
  END IF;
END $patch$;
NOTIFY pgrst,'reload schema';
COMMIT;

WITH checks(name,ok) AS (
  SELECT 'coach_access_by_role',p.prosecdef AND p.provolatile='s'
    AND p.proconfig=ARRAY['search_path=""']::text[]
    AND has_function_privilege('authenticated',p.oid,'EXECUTE')
    AND position('p.role::text=''coach'' OR (p.role::text=''admin'' AND EXISTS(' IN p.prosrc)>0
    FROM pg_proc p WHERE p.oid='public.app_has_access()'::regprocedure
  UNION ALL
  SELECT 'private_staff_still_admin_only',p.prosecdef
    AND regexp_replace(p.prosrc,'\s','','g')=regexp_replace(
      'SELECT public.app_has_access() AND EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND role::text=''admin'')','\s','','g')
    AND NOT has_function_privilege('anon',p.oid,'EXECUTE')
    FROM pg_proc p WHERE p.oid='public.app_private_staff_access()'::regprocedure
)
SELECT jsonb_build_object('all_ok',bool_and(ok),'checks',jsonb_object_agg(name,ok),
  'next_step','Juli puede pulsar Reintentar permisos o volver a abrir la app. El staff sigue siendo privado para Admin.')
  AS coach_access_patch FROM checks;
