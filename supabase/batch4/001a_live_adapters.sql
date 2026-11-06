-- REVIEWED LOCAL DRAFT based on the diagnostic supplied on 2026-11-06.
-- Run only on the isolated validation database first. No historical backfill.
-- Order: 001 marker -> this file -> 002 guards -> 003 discipline/standouts.
BEGIN;

CREATE FUNCTION public.batch4_assert_global_access(p_session uuid,p_actor uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE s public.sessions; r text;
BEGIN
  SELECT role::text INTO r FROM public.profiles WHERE id=p_actor;
  IF p_actor IS NULL OR p_actor IS DISTINCT FROM auth.uid() OR r IS NULL OR r NOT IN ('admin','coach') THEN
    RAISE EXCEPTION 'Workflow permission denied' USING ERRCODE='42501';
  END IF;
  SELECT * INTO s FROM public.sessions WHERE id=p_session;
  IF NOT FOUND THEN RAISE EXCEPTION 'Session not found'; END IF;
  IF s.status::text IN ('cancelled','archived') OR s.status IS NULL THEN
    RAISE EXCEPTION 'Session is not operational' USING ERRCODE='42501';
  END IF;
  -- Same predicate and Admin exception as the exported live trigger.
  IF (s.status::text='locked' OR s.locked_at IS NOT NULL) AND r<>'admin' THEN
    RAISE EXCEPTION 'Session globally locked' USING ERRCODE='42501';
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.batch4_assert_global_access(uuid,uuid) FROM PUBLIC,anon,authenticated;

-- Canonical form includes the retired fifth quality to detect concurrent edits,
-- while current sporting totals use only the first four qualities.
CREATE FUNCTION public.batch4_evaluation_snapshot(p_rows jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id',x->'id','session_id',x->'session_id','player_id',x->'player_id',
    'evaluated',coalesce(x->'evaluated','false'::jsonb),
    'not_applicable',coalesce(x->'not_applicable','false'::jsonb),
    'comment',nullif(x->>'comment',''),
    'tactical_discipline',x->'tactical_discipline','effort_commitment',x->'effort_commitment',
    'decision_making',x->'decision_making','mentality_attitude',x->'mentality_attitude',
    'coachability',x->'coachability','na_fields',coalesce(x->'na_fields','{}'::jsonb)
  ) ORDER BY x->>'id'),'[]'::jsonb) FROM jsonb_array_elements(p_rows) x
$$;
REVOKE ALL ON FUNCTION public.batch4_evaluation_snapshot(jsonb) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.batch4_finalize_evaluation(p_session uuid,p_actor uuid,p_rows jsonb,p_records_only boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE s public.sessions; stored jsonb; e public.evaluations; k text; n integer; pid uuid;
  reviewed_existing jsonb;default_row jsonb;expected_default jsonb;
  valid boolean; eligible uuid[]; scored numeric; divisor integer;
  fields text[]:=ARRAY['tactical_discipline','effort_commitment','decision_making','mentality_attitude'];
BEGIN
  PERFORM public.batch4_assert_global_access(p_session,p_actor);
  SELECT * INTO s FROM public.sessions WHERE id=p_session FOR UPDATE;
  IF s.evaluation_confirmed IS DISTINCT FROM false OR s.callup_confirmed IS DISTINCT FROM true
    OR s.attendance_confirmed IS DISTINCT FROM true OR p_records_only IS NULL
    OR jsonb_typeof(p_rows) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid evaluation state'; END IF;
  IF p_records_only AND NOT EXISTS(SELECT 1 FROM public.profiles WHERE id=p_actor AND role::text='admin') THEN
    RAISE EXCEPTION 'Admin only' USING ERRCODE='42501';
  END IF;
  IF EXISTS(SELECT 1 FROM public.evaluations WHERE session_id=p_session GROUP BY player_id HAVING count(*)<>1)
    OR EXISTS(SELECT 1 FROM public.callups WHERE session_id=p_session GROUP BY player_id HAVING count(*)<>1)
    OR EXISTS(SELECT 1 FROM public.attendance WHERE session_id=p_session GROUP BY player_id HAVING count(*)<>1) THEN
    RAISE EXCEPTION 'Duplicate workflow records';
  END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(v)),'[]'::jsonb) INTO stored FROM public.evaluations v WHERE session_id=p_session;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_rows) x WHERE jsonb_typeof(x)<>'object')
    OR (SELECT count(DISTINCT x->>'player_id') FROM jsonb_array_elements(p_rows) x)<>jsonb_array_length(p_rows) THEN
    RAISE EXCEPTION 'Invalid reviewed evaluations';
  END IF;
  SELECT coalesce(jsonb_agg(x),'[]'::jsonb) INTO reviewed_existing FROM jsonb_array_elements(p_rows) x WHERE x->>'id' IS NOT NULL;
  IF public.batch4_evaluation_snapshot(stored)<>public.batch4_evaluation_snapshot(reviewed_existing) THEN
    RAISE EXCEPTION 'Stale evaluation snapshot; reload';
  END IF;
  SELECT coalesce(array_agg(c.player_id ORDER BY c.player_id),ARRAY[]::uuid[]) INTO eligible
    FROM public.callups c JOIN public.attendance a ON a.session_id=c.session_id AND a.player_id=c.player_id
    WHERE c.session_id=p_session AND c.evaluable IS TRUE AND c.status::text IN ('called_up','trial')
      AND a.status::text IN ('present','late','justified_late');
  -- The user explicitly confirms the visible initial 3s. Opening/navigating the
  -- editor never inserts rows, and historical/confirmed/records-only gaps never
  -- receive defaults. Existing scores/N/A must match their reviewed snapshot.
  FOR default_row IN SELECT x FROM jsonb_array_elements(p_rows) x WHERE x->>'id' IS NULL LOOP
    pid:=(default_row->>'player_id')::uuid;
    IF p_records_only OR s.draft_defaults_version IS DISTINCT FROM 1 OR s.records_only_confirmed IS TRUE
      OR (to_jsonb(s)->>'is_test')='true'
      OR s.status::text NOT IN ('planned','completed')
      OR s.type::text NOT IN ('training','league_match','friendly_match','tryout','scrimmage')
      OR pid IS NULL OR NOT (pid=ANY(eligible)) THEN RAISE EXCEPTION 'Initial scores require a new eligible operational evaluation'; END IF;
    expected_default:=jsonb_build_object('id',NULL,'session_id',p_session,'player_id',pid,
      'evaluated',false,'not_applicable',false,'comment',NULL,
      'tactical_discipline',3,'effort_commitment',3,'decision_making',3,'mentality_attitude',3,'coachability',3,
      'na_fields',jsonb_build_object('tactical_discipline',false,'effort_commitment',false,'decision_making',false,'mentality_attitude',false,'coachability',true));
    IF public.batch4_evaluation_snapshot(jsonb_build_array(default_row))<>public.batch4_evaluation_snapshot(jsonb_build_array(expected_default)) THEN
      RAISE EXCEPTION 'Initial evaluation must contain the four reviewed 3s';
    END IF;
    INSERT INTO public.evaluations(session_id,player_id,tactical_discipline,effort_commitment,decision_making,mentality_attitude,coachability,na_fields,evaluated,not_applicable)
      VALUES(p_session,pid,3,3,3,3,3,expected_default->'na_fields',false,false);
  END LOOP;
  IF NOT p_records_only AND (cardinality(eligible)=0 OR EXISTS(
    SELECT 1 FROM unnest(eligible) AS required(player_id) WHERE NOT EXISTS(SELECT 1 FROM public.evaluations v WHERE v.session_id=p_session AND v.player_id=required.player_id)
  )) THEN RAISE EXCEPTION 'Missing eligible evaluation'; END IF;
  FOR e IN SELECT * FROM public.evaluations WHERE session_id=p_session ORDER BY player_id LOOP
    valid:=e.player_id=ANY(eligible); scored:=0;divisor:=0;
    IF jsonb_typeof(e.na_fields)<>'object' THEN RAISE EXCEPTION 'Invalid N/A flags'; END IF;
    FOREACH k IN ARRAY fields LOOP
      IF e.na_fields ? k AND jsonb_typeof(e.na_fields->k)<>'boolean' THEN RAISE EXCEPTION 'Invalid N/A flag'; END IF;
      IF NOT e.not_applicable AND NOT coalesce((e.na_fields->>k)::boolean,false) THEN
        n:=(to_jsonb(e)->>k)::integer;
        IF n IS NULL OR n<1 OR n>5 THEN RAISE EXCEPTION 'Invalid score'; END IF;
        IF p_records_only OR NOT valid THEN RAISE EXCEPTION 'Numeric score for non-sporting record'; END IF;
        scored:=scored+n;divisor:=divisor+1;
      END IF;
    END LOOP;
    -- Preserve all original scores, comments and retired fifth-quality values.
    UPDATE public.evaluations SET evaluated=(valid AND NOT p_records_only),
      submitted_by=p_actor,submitted_at=now(),total_score=CASE WHEN divisor>0 THEN round(scored/divisor,2) ELSE NULL END
      WHERE id=e.id;
  END LOOP;
  -- 003 is required before this release accepts evaluation confirmations.
  -- Legacy cards in this session are reconciled in the same transaction.
  FOR pid IN SELECT DISTINCT player_id FROM public.cards WHERE session_id=p_session ORDER BY player_id LOOP
    PERFORM public.batch4_reconcile_yellows(pid);
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.batch4_finalize_evaluation(uuid,uuid,jsonb,boolean) FROM PUBLIC,anon,authenticated;

-- Replace the live high-limit implementation with four-quality, N/A-aware
-- validation. Parent-row locking also serializes direct score writes.
CREATE OR REPLACE FUNCTION public.enforce_high_rating_limit() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE s public.sessions; k text; high_count integer;low_count integer;n integer;
BEGIN
  PERFORM public.batch4_assert_global_access(NEW.session_id,auth.uid());
  SELECT * INTO s FROM public.sessions WHERE id=NEW.session_id FOR UPDATE;
  IF NEW.not_applicable THEN RETURN NEW; END IF;
  FOREACH k IN ARRAY ARRAY['tactical_discipline','effort_commitment','decision_making','mentality_attitude'] LOOP
    IF NEW.na_fields ? k AND jsonb_typeof(NEW.na_fields->k)<>'boolean' THEN RAISE EXCEPTION 'Invalid N/A flag'; END IF;
    IF coalesce((NEW.na_fields->>k)::boolean,false) THEN CONTINUE; END IF;
    n:=(to_jsonb(NEW)->>k)::integer;
    IF n IS NULL OR n<1 OR n>5 THEN RAISE EXCEPTION 'Invalid score'; END IF;
    SELECT count(*) FILTER(WHERE (to_jsonb(e)->>k)::integer>=4),
      count(*) FILTER(WHERE (to_jsonb(e)->>k)::integer<=2)
      INTO high_count,low_count FROM public.evaluations e
      JOIN public.callups c ON c.session_id=e.session_id AND c.player_id=e.player_id
      JOIN public.attendance a ON a.session_id=e.session_id AND a.player_id=e.player_id
      WHERE e.session_id=NEW.session_id AND e.id<>NEW.id AND NOT e.not_applicable
        AND NOT coalesce((e.na_fields->>k)::boolean,false) AND c.evaluable IS TRUE
        AND c.status::text IN ('called_up','trial') AND a.status::text IN ('present','late','justified_late');
    IF n>=4 AND high_count>=coalesce(s.high_rating_limit,6) THEN RAISE EXCEPTION 'Maximum high ratings reached'; END IF;
    IF n<=2 AND low_count>=coalesce(s.low_rating_limit,3) THEN RAISE EXCEPTION 'Maximum low ratings reached'; END IF;
  END LOOP;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.enforce_high_rating_limit() FROM PUBLIC,anon,authenticated;
COMMIT;
