-- MANUAL HOTFIX. Run this complete file as postgres in Supabase SQL Editor.
-- Fixes SQLSTATE 428C9 when total_score is a generated column.
-- Changes only the finalization function; never confirms or reopens a session.
-- Keeps the column and its generation expression, sporting records, RLS and grants.
BEGIN;
DO $patch$
DECLARE
  target regprocedure:=to_regprocedure('public.batch4_finalize_evaluation(uuid,uuid,jsonb,boolean)');
  definition text;
  before_metadata jsonb;
  after_metadata jsonb;
  before_column jsonb;
  after_column jsonb;
  marker constant text:='-- Respect database-generated totals; the app calculates four-quality means.';
  old_statement constant text:=replace($old$UPDATE public.evaluations SET evaluated=(valid AND NOT p_records_only),
      submitted_by=p_actor,submitted_at=now(),total_score=CASE WHEN divisor>0 THEN round(scored/divisor,2) ELSE NULL END
      WHERE id=e.id;$old$,chr(13),'');
  new_statement constant text:=replace($new$-- Respect database-generated totals; the app calculates four-quality means.
    IF EXISTS(SELECT 1 FROM pg_catalog.pg_attribute a
      WHERE a.attrelid='public.evaluations'::regclass AND a.attname='total_score'
        AND NOT a.attisdropped AND a.attgenerated<>'') THEN
      UPDATE public.evaluations SET evaluated=(valid AND NOT p_records_only),
        submitted_by=p_actor,submitted_at=now()
        WHERE id=e.id;
    ELSE
      UPDATE public.evaluations SET evaluated=(valid AND NOT p_records_only),
        submitted_by=p_actor,submitted_at=now(),total_score=CASE WHEN divisor>0 THEN round(scored/divisor,2) ELSE NULL END
        WHERE id=e.id;
    END IF;$new$,chr(13),'');
BEGIN
  IF target IS NULL THEN RAISE EXCEPTION 'No está instalada la función de confirmación esperada. No repitas el instalador; comparte este error.'; END IF;
  SELECT jsonb_build_object('number',a.attnum,'type',a.atttypid,'modifier',a.atttypmod,
    'generated',a.attgenerated,'not_null',a.attnotnull,'expression',pg_get_expr(d.adbin,d.adrelid))
    INTO before_column FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
    WHERE a.attrelid='public.evaluations'::regclass AND a.attname='total_score' AND NOT a.attisdropped;
  IF before_column IS NULL THEN RAISE EXCEPTION 'Falta la columna total_score esperada. No se ha modificado nada.'; END IF;
  SELECT replace(pg_get_functiondef(p.oid),chr(13),''),jsonb_build_object('owner',p.proowner,'acl',p.proacl,
    'definer',p.prosecdef,'config',p.proconfig,'volatility',p.provolatile,'language',p.prolang)
    INTO definition,before_metadata FROM pg_proc p WHERE p.oid=target;
  IF position(old_statement IN definition)=0 AND position(new_statement IN definition)>0 THEN
    RAISE NOTICE 'La compatibilidad con total_score generado ya está instalada.'; RETURN;
  END IF;
  IF (length(definition)-length(replace(definition,old_statement,'')))/length(old_statement)<>1
    OR position(marker IN definition)>0 OR before_metadata->>'definer'<>'true' THEN
    RAISE EXCEPTION 'La función difiere de la versión esperada. Se revierte la corrección; comparte este error.';
  END IF;
  EXECUTE replace(definition,old_statement,new_statement);
  SELECT jsonb_build_object('owner',p.proowner,'acl',p.proacl,
    'definer',p.prosecdef,'config',p.proconfig,'volatility',p.provolatile,'language',p.prolang)
    INTO after_metadata FROM pg_proc p WHERE p.oid=target;
  SELECT jsonb_build_object('number',a.attnum,'type',a.atttypid,'modifier',a.atttypmod,
    'generated',a.attgenerated,'not_null',a.attnotnull,'expression',pg_get_expr(d.adbin,d.adrelid))
    INTO after_column FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
    WHERE a.attrelid='public.evaluations'::regclass AND a.attname='total_score' AND NOT a.attisdropped;
  IF before_metadata IS DISTINCT FROM after_metadata OR before_column IS DISTINCT FROM after_column THEN
    RAISE EXCEPTION 'No se conservaron los metadatos de seguridad o de la columna. Se revierte la corrección.';
  END IF;
END $patch$;
NOTIFY pgrst,'reload schema';
COMMIT;

SELECT jsonb_build_object(
  'all_ok',position('-- Respect database-generated totals; the app calculates four-quality means.' IN p.prosrc)>0
    AND p.prosecdef AND NOT has_function_privilege('authenticated',p.oid,'EXECUTE')
    AND NOT has_function_privilege('anon',p.oid,'EXECUTE'),
  'total_score_generated',a.attgenerated<>'',
  'generation_expression',pg_get_expr(d.adbin,d.adrelid),
  'next_step','Corrección instalada. Vuelve a confirmar la evaluación como Coach desde la app. Este archivo no ha cerrado ni cambiado ninguna sesión.'
) AS evaluation_total_patch
FROM pg_proc p JOIN pg_attribute a ON a.attrelid='public.evaluations'::regclass AND a.attname='total_score' AND NOT a.attisdropped
LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
WHERE p.oid='public.batch4_finalize_evaluation(uuid,uuid,jsonb,boolean)'::regprocedure;
