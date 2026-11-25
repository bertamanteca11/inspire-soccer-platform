-- MANUAL, CONFIGURED DATA CORRECTION. This template intentionally has no targets.
-- Use a project-specific .local.sql copy populated from a read-only review and
-- the responsible person's explicit confirmation. Run the COMPLETE file as postgres.
-- Uses the existing authorized/audited RPC, including optimistic revisions and
-- match eligibility checks. No attendance, cards, evaluations or sessions change.
-- All cases succeed together or every change rolls back. An exact retry is a no-op.
BEGIN;
SET LOCAL lock_timeout='5s';
CREATE TEMP TABLE reviewed_sanction_setup(config jsonb NOT NULL) ON COMMIT DROP;
INSERT INTO reviewed_sanction_setup VALUES ($config${"reviewer_user_id":null,"cases":[]}$config$::jsonb);
CREATE TEMP TABLE reviewed_sanction_results(result jsonb NOT NULL) ON COMMIT DROP;

DO $repair$
DECLARE config jsonb;entry jsonb;game jsonb;reviewer uuid;pid uuid;case_id uuid;
  request_id uuid;workspace jsonb;s public.suspensions;origin_id uuid;notes text;
  duration integer;first_date date;service_count integer;already_applied boolean;
BEGIN
  IF current_user<>'postgres' THEN RAISE EXCEPTION 'Ejecuta el archivo completo como postgres.'; END IF;
  SELECT setup.config INTO config FROM reviewed_sanction_setup setup;
  reviewer:=(config->>'reviewer_user_id')::uuid;
  IF reviewer IS NULL OR jsonb_typeof(config->'cases') IS DISTINCT FROM 'array'
    OR jsonb_array_length(config->'cases')=0 THEN
    RAISE EXCEPTION 'Plantilla sin configurar. Usa la copia local revisada, nunca inventes jugadores o fechas.';
  END IF;
  -- The local file identifies the existing Admin responsible for verifying this
  -- correction. Claims last for this transaction only; no login/account changes.
  PERFORM set_config('request.jwt.claim.sub',reviewer::text,true);
  IF public.batch4_actor_role() IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'El perfil verificador no es un Admin autorizado. No se ha cambiado nada.';
  END IF;
  -- Follow the same match -> player -> case lock order as the regular RPCs.
  PERFORM 1 FROM public.sessions m WHERE m.id IN (
    SELECT (x->>'origin_session_id')::uuid FROM jsonb_array_elements(config->'cases') x
    UNION SELECT (g->>'session_id')::uuid FROM jsonb_array_elements(config->'cases') x
      CROSS JOIN LATERAL jsonb_array_elements(x->'served_matches') g
  ) ORDER BY m.id FOR UPDATE;
  PERFORM 1 FROM public.players p WHERE p.id IN (
    SELECT (x->>'player_id')::uuid FROM jsonb_array_elements(config->'cases') x
  ) ORDER BY p.id FOR UPDATE;
  FOR entry IN SELECT value FROM jsonb_array_elements(config->'cases') LOOP
    pid:=(entry->>'player_id')::uuid;case_id:=(entry->>'case_id')::uuid;
    origin_id:=(entry->>'origin_session_id')::uuid;
    request_id:=(entry->>'request_key')::uuid;
    duration:=(entry->>'matches_total')::integer;first_date:=(entry->>'applicable_from')::date;
    notes:=nullif(btrim(entry->>'notes'),'');
    IF pid IS NULL OR duration IS NULL OR duration<1 OR duration>99 OR first_date IS NULL OR notes IS NULL
      OR jsonb_typeof(entry->'served_matches') IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'Configuración incompleta. Se revierte toda la corrección.';
    END IF;
    IF jsonb_array_length(entry->'served_matches')>=duration THEN
      RAISE EXCEPTION 'Esta corrección solo registra sanciones parcialmente cumplidas; no completa ninguna sanción.';
    END IF;
    SELECT * INTO s FROM public.suspensions WHERE id=case_id
      OR (case_id IS NULL AND request_key=request_id) FOR UPDATE;
    IF s.id IS NOT NULL AND (s.player_id IS DISTINCT FROM pid
      OR s.source IS DISTINCT FROM entry->>'source'
      OR s.created_from_session_id IS DISTINCT FROM origin_id) THEN
      RAISE EXCEPTION 'El expediente no corresponde al jugador, tipo u origen revisados.';
    END IF;
    SELECT count(*) INTO service_count FROM public.discipline_service_matches v
      WHERE v.suspension_id=s.id AND v.revoked_at IS NULL;
    already_applied:=s.id IS NOT NULL AND s.matches_total=duration AND s.applicable_from=first_date
      AND NOT s.needs_review AND s.status='partially_served'
      AND s.matches_served=jsonb_array_length(entry->'served_matches')
      AND service_count=jsonb_array_length(entry->'served_matches')
      AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(entry->'served_matches') g WHERE NOT EXISTS(
        SELECT 1 FROM public.discipline_service_matches v WHERE v.suspension_id=s.id
          AND v.session_id=(g->>'session_id')::uuid AND v.revoked_at IS NULL));
    IF NOT coalesce(already_applied,false) THEN
      IF case_id IS NOT NULL THEN
        IF s.id IS NULL OR s.revision IS DISTINCT FROM (entry->>'expected_revision')::integer
          OR s.matches_total IS DISTINCT FROM (entry->>'expected_matches_total')::integer
          OR s.status IS DISTINCT FROM 'active' OR NOT s.needs_review
          OR s.matches_served<>0 OR s.applicable_from IS NOT NULL
          OR EXISTS(SELECT 1 FROM public.discipline_service_matches v WHERE v.suspension_id=s.id) THEN
          RAISE EXCEPTION 'El expediente ha cambiado desde la revisión. Ejecuta de nuevo el diagnóstico antes de corregirlo.';
        END IF;
      ELSE
        IF request_id IS NULL OR entry->>'source' IS DISTINCT FROM 'manual' OR origin_id IS NOT NULL
          OR EXISTS(SELECT 1 FROM public.suspensions other WHERE other.player_id=pid) THEN
          RAISE EXCEPTION 'Ya hay un expediente o la sanción externa no está identificada. Revisa antes de crear otro.';
        END IF;
      END IF;
      -- Exact fixture IDs and dates are reviewed; never match on an absence or
      -- guess the weekend date. The RPC also checks completion and participation.
      FOR game IN SELECT value FROM jsonb_array_elements(entry->'served_matches') LOOP
        IF NOT EXISTS(SELECT 1 FROM public.sessions m WHERE m.id=(game->>'session_id')::uuid
          AND m.session_date=(game->>'session_date')::date AND m.type::text='league_match'
          AND m.status::text='completed') THEN
          RAISE EXCEPTION 'Uno de los partidos no coincide con la revisión o no está completado. No se ha cambiado nada.';
        END IF;
      END LOOP;
      workspace:=public.discipline_action('save_case',jsonb_build_object(
        'id',case_id,'player_id',pid,'source',entry->>'source','request_key',request_id,
        'matches_total',duration,'applicable_from',first_date,'decision_date',NULL,
        'origin_session_id',origin_id,'decision_notes',notes,'review_history',case_id IS NOT NULL,
        'cancelled',false),CASE WHEN case_id IS NOT NULL THEN s.revision ELSE NULL END);
      SELECT (x->>'id')::uuid INTO case_id FROM jsonb_array_elements(workspace->'cases') x
        WHERE x->>'id'=case_id::text OR (case_id IS NULL AND x->>'request_key'=request_id::text);
      IF case_id IS NULL THEN RAISE EXCEPTION 'No se pudo identificar el expediente guardado. Se revierte todo.'; END IF;
      FOR game IN SELECT value FROM jsonb_array_elements(entry->'served_matches') LOOP
        SELECT * INTO s FROM public.suspensions WHERE id=case_id;
        PERFORM public.discipline_action('serve_match',jsonb_build_object('id',case_id,
          'session_id',game->>'session_id','verified_not_played',true,'notes',game->>'notes'),s.revision);
      END LOOP;
      SELECT * INTO s FROM public.suspensions WHERE id=case_id;
    END IF;
    IF s.matches_total IS DISTINCT FROM duration OR s.matches_served IS DISTINCT FROM jsonb_array_length(entry->'served_matches')
      OR s.status IS DISTINCT FROM 'partially_served' OR s.needs_review THEN
      RAISE EXCEPTION 'El resultado no coincide con lo confirmado. Se revierte toda la corrección.';
    END IF;
    INSERT INTO reviewed_sanction_results VALUES(jsonb_build_object('player_id',pid,'case_id',s.id,
      'matches_total',s.matches_total,'matches_served',s.matches_served,
      'matches_remaining',s.matches_total-s.matches_served,'status',s.status,
      'already_applied',coalesce(already_applied,false)));
  END LOOP;
END $repair$;
SELECT jsonb_build_object('all_ok',true,'cases',jsonb_agg(result),
  'next_step','Corrección guardada. Actualiza la app. Los partidos pendientes no se han dado por cumplidos.')
  AS reviewed_sanctions_correction FROM reviewed_sanction_results;
COMMIT;
