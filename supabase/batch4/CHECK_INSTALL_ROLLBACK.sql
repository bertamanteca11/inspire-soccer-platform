-- MANUAL COMPATIBILITY REHEARSAL. Does not install the release.
-- Briefly creates the same objects inside a transaction, then rolls back.
-- Run while users are not editing. This is not a backup or a role/login test.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
-- SOURCE: 001_draft_defaults_version.sql
-- LOCAL PREPARATION ONLY. No backfill, no default, no policy changes.

ALTER TABLE public.sessions
  ADD COLUMN draft_defaults_version smallint NULL
  CONSTRAINT sessions_draft_defaults_version_check
  CHECK (draft_defaults_version IS NULL OR draft_defaults_version = 1);


-- SOURCE: 001a_live_adapters.sql
-- REVIEWED LOCAL DRAFT based on the diagnostic supplied on 2026-11-06.
-- Run only on the isolated validation database first. No historical backfill.
-- Order: 001 marker -> this file -> 002 guards -> 003 discipline/standouts.


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


-- SOURCE: 002_workflow_security.sql
-- LOCAL RELEASE DRAFT: install the reviewed 001a adapters before this source.
-- See docs/RELEASE_REVIEW_2026_11_06.md. Validate the complete bundle in isolation.
-- Existing RLS/global trigger stay intact; 001a updates rating limits for four qualities.

DO $$ BEGIN
  IF to_regprocedure('public.batch4_workflow_action(uuid,text,text,jsonb,boolean)') IS NOT NULL
    OR to_regprocedure('public.batch4_workflow_action(uuid,text,text,jsonb,boolean,jsonb)') IS NOT NULL
    OR to_regprocedure('public.batch4_actor_role()') IS NOT NULL THEN
    RAISE EXCEPTION 'BLOCKED: existing Batch 4 installation requires a reviewed upgrade, not overlapping RPC overloads';
  END IF;
  IF to_regprocedure('public.batch4_assert_global_access(uuid,uuid)') IS NULL THEN
    RAISE EXCEPTION 'BLOCKED: reviewed batch4_assert_global_access(session,actor) adapter required';
  END IF;
  IF to_regprocedure('public.batch4_finalize_evaluation(uuid,uuid,jsonb,boolean)') IS NULL THEN
    RAISE EXCEPTION 'BLOCKED: reviewed evaluation finalization adapter required';
  END IF;
END $$;

CREATE FUNCTION public.batch4_actor_role() RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public
AS $$ SELECT role::text FROM public.profiles WHERE id = auth.uid() $$;
REVOKE ALL ON FUNCTION public.batch4_actor_role() FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.batch4_guard_records() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE sid uuid; s public.sessions; wf text := TG_ARGV[0]; actor_role text;
BEGIN
  sid := CASE WHEN TG_OP = 'DELETE' THEN OLD.session_id ELSE NEW.session_id END;
  IF TG_OP = 'UPDATE' AND (NEW.session_id IS DISTINCT FROM OLD.session_id OR NEW.player_id IS DISTINCT FROM OLD.player_id) THEN
    RAISE EXCEPTION 'Cannot move workflow records between sessions or players';
  END IF;
  SELECT * INTO s FROM public.sessions WHERE id = sid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Session not found'; END IF;
  actor_role := public.batch4_actor_role();
  IF auth.uid() IS NULL OR actor_role IS NULL OR actor_role NOT IN ('admin','coach')
    OR (wf = 'callup' AND actor_role <> 'admin') THEN
    RAISE EXCEPTION 'Workflow permission denied' USING ERRCODE = '42501';
  END IF;
  PERFORM public.batch4_assert_global_access(sid, auth.uid());
  IF (to_jsonb(s)->>(wf || '_confirmed'))::boolean IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'Workflow closed: Admin must reopen first' USING ERRCODE = '42501';
  END IF;
  IF wf IN ('attendance','evaluation') AND s.callup_confirmed IS DISTINCT FROM true
    OR wf = 'evaluation' AND s.attendance_confirmed IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Workflow prerequisites are not confirmed' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.batch4_guard_records() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER batch4_callup_guard BEFORE INSERT OR UPDATE OR DELETE ON public.callups
FOR EACH ROW EXECUTE FUNCTION public.batch4_guard_records('callup');
CREATE TRIGGER batch4_attendance_guard BEFORE INSERT OR UPDATE OR DELETE ON public.attendance
FOR EACH ROW EXECUTE FUNCTION public.batch4_guard_records('attendance');
CREATE TRIGGER batch4_evaluation_guard BEFORE INSERT OR UPDATE OR DELETE ON public.evaluations
FOR EACH ROW EXECUTE FUNCTION public.batch4_guard_records('evaluation');
-- Cards belong to the Evaluation editor. Existing global/card triggers remain.
CREATE TRIGGER batch4_card_guard BEFORE INSERT OR UPDATE OR DELETE ON public.cards
FOR EACH ROW EXECUTE FUNCTION public.batch4_guard_records('evaluation');

CREATE FUNCTION public.batch4_workflow_access(p_session uuid, p_workflow text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE s public.sessions; r text := public.batch4_actor_role();
BEGIN
  IF auth.uid() IS NULL OR r IS NULL OR r NOT IN ('admin','coach') OR p_workflow NOT IN ('callup','attendance','evaluation')
    OR (p_workflow = 'callup' AND r <> 'admin') THEN RETURN false; END IF;
  SELECT * INTO s FROM public.sessions WHERE id = p_session;
  IF NOT FOUND THEN RETURN false; END IF;
  PERFORM public.batch4_assert_global_access(p_session, auth.uid());
  IF p_workflow IN ('attendance','evaluation') AND s.callup_confirmed IS DISTINCT FROM true
    OR p_workflow = 'evaluation' AND s.attendance_confirmed IS DISTINCT FROM true THEN RETURN false; END IF;
  RETURN (to_jsonb(s)->>(p_workflow || '_confirmed'))::boolean = false;
EXCEPTION WHEN insufficient_privilege THEN RETURN false;
END $$;
REVOKE ALL ON FUNCTION public.batch4_workflow_access(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.batch4_workflow_access(uuid,text) TO authenticated;

CREATE FUNCTION public.batch4_workflow_action(
  p_session uuid, p_workflow text, p_action text,
  p_rows jsonb DEFAULT '[]', p_records_only boolean DEFAULT false,
  p_expected_rows jsonb DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE s public.sessions; r text := public.batch4_actor_role(); item jsonb; current_rows jsonb;
BEGIN
  IF auth.uid() IS NULL OR r IS NULL OR r NOT IN ('admin','coach')
    OR p_records_only IS NULL
    OR p_workflow IS NULL OR p_workflow NOT IN ('callup','attendance','evaluation')
    OR p_action IS NULL OR p_action NOT IN ('confirm','reopen')
    OR (p_workflow = 'callup' AND r <> 'admin') OR (p_action = 'reopen' AND r <> 'admin') THEN
    RAISE EXCEPTION 'Workflow permission denied' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO s FROM public.sessions WHERE id = p_session FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Session not found'; END IF;
  -- Same parent lock as every guarded write, including concurrent close/reopen.
  PERFORM public.batch4_assert_global_access(p_session, auth.uid());
  IF (to_jsonb(s)->>(p_workflow || '_confirmed'))::boolean IS DISTINCT FROM (p_action = 'reopen') THEN
    RAISE EXCEPTION 'Stale workflow state; reload';
  END IF;
  IF p_action = 'reopen' THEN
    IF p_workflow = 'callup' THEN
      UPDATE public.sessions SET callup_confirmed=false,callup_confirmed_at=NULL WHERE id=p_session;
    ELSIF p_workflow = 'attendance' THEN
      UPDATE public.sessions SET attendance_confirmed=false,attendance_confirmed_at=NULL WHERE id=p_session;
    ELSE
      UPDATE public.sessions SET evaluation_confirmed=false,evaluation_confirmed_at=NULL,records_only_confirmed=false WHERE id=p_session;
      UPDATE public.evaluations SET evaluated=false WHERE session_id=p_session;
    END IF;
  ELSE
    IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN RAISE EXCEPTION 'Reviewed rows required'; END IF;
    IF p_workflow = 'callup' THEN
      IF jsonb_array_length(p_rows)=0 OR EXISTS (
        SELECT 1 FROM jsonb_array_elements(p_rows) x
        WHERE (x->>'player_id') IS NULL OR (x->>'status') IS NULL
          OR (x->>'status') NOT IN ('called_up','trial','guest_not_evaluable','not_called')
          OR jsonb_typeof(x->'evaluable') IS DISTINCT FROM 'boolean'
          OR ((x->>'status') IN ('guest_not_evaluable','not_called') AND (x->>'evaluable')::boolean)
          OR (x->>'session_id')::uuid IS DISTINCT FROM p_session
      ) OR (SELECT count(DISTINCT x->>'player_id') FROM jsonb_array_elements(p_rows) x) <> jsonb_array_length(p_rows) THEN
        RAISE EXCEPTION 'Invalid reviewed callup roster';
      END IF;
      -- Compare the stored decisions reviewed by the Admin, before any upsert.
      -- A session row lock alone does not detect edits made since the page loaded.
      IF p_expected_rows IS NULL OR jsonb_typeof(p_expected_rows) <> 'array' THEN
        RAISE EXCEPTION 'Stored callup snapshot required; reload';
      END IF;
      SELECT coalesce(jsonb_agg(jsonb_build_object('session_id',session_id,'player_id',player_id,'status',status,'evaluable',evaluable) ORDER BY player_id),'[]')
        INTO current_rows FROM public.callups WHERE session_id=p_session;
      SELECT coalesce(jsonb_agg(jsonb_build_object('session_id',x->>'session_id','player_id',x->>'player_id','status',x->>'status','evaluable',x->'evaluable') ORDER BY x->>'player_id'),'[]')
        INTO p_expected_rows FROM jsonb_array_elements(p_expected_rows) x;
      IF current_rows <> p_expected_rows THEN RAISE EXCEPTION 'Stale callup snapshot; reload'; END IF;
      -- Require the entire current roster AND all historical participants.
      -- Never turn a filtered/partial client read into a confirmed partial roster.
      IF EXISTS (
        SELECT p.id FROM public.players p
        WHERE (p.status::text IN ('active','injured','trial','guest')
          OR EXISTS(SELECT 1 FROM public.callups c WHERE c.session_id=p_session AND c.player_id=p.id)
          OR EXISTS(SELECT 1 FROM public.attendance a WHERE a.session_id=p_session AND a.player_id=p.id)
          OR EXISTS(SELECT 1 FROM public.evaluations e WHERE e.session_id=p_session AND e.player_id=p.id))
          AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p_rows) x WHERE (x->>'player_id')::uuid=p.id)
      ) OR EXISTS (
        SELECT 1 FROM jsonb_array_elements(p_rows) x WHERE NOT EXISTS (
          SELECT 1 FROM public.players p WHERE p.id=(x->>'player_id')::uuid AND
            (p.status::text IN ('active','injured','trial','guest')
            OR EXISTS(SELECT 1 FROM public.callups c WHERE c.session_id=p_session AND c.player_id=p.id)
            OR EXISTS(SELECT 1 FROM public.attendance a WHERE a.session_id=p_session AND a.player_id=p.id)
            OR EXISTS(SELECT 1 FROM public.evaluations e WHERE e.session_id=p_session AND e.player_id=p.id))
        )
      ) THEN RAISE EXCEPTION 'Incomplete or changed callup roster; reload and review all players'; END IF;
      -- Populate native enum/column types; notes and unrelated rows are untouched.
      FOR item IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
        INSERT INTO public.callups(session_id,player_id,status,evaluable)
        SELECT c.session_id,c.player_id,c.status,c.evaluable
        FROM jsonb_populate_record(NULL::public.callups,item) c
        ON CONFLICT(session_id,player_id) DO UPDATE SET status=EXCLUDED.status,evaluable=EXCLUDED.evaluable;
      END LOOP;
      UPDATE public.sessions SET callup_confirmed=true,callup_confirmed_at=now() WHERE id=p_session;
    ELSIF p_workflow = 'attendance' THEN
      IF s.callup_confirmed IS DISTINCT FROM true THEN RAISE EXCEPTION 'Confirm callups first'; END IF;
      SELECT coalesce(jsonb_agg(jsonb_build_object('session_id',session_id,'player_id',player_id,'status',status,'notes',nullif(notes,'')) ORDER BY player_id),'[]')
      INTO current_rows FROM public.attendance WHERE session_id=p_session;
      SELECT coalesce(jsonb_agg(jsonb_build_object('session_id',x->>'session_id','player_id',x->>'player_id','status',x->>'status','notes',nullif(x->>'notes','')) ORDER BY x->>'player_id'),'[]')
      INTO p_rows FROM jsonb_array_elements(p_rows) x;
      IF jsonb_array_length(current_rows)=0 OR current_rows <> p_rows OR EXISTS (
        SELECT 1 FROM public.attendance WHERE session_id=p_session AND (status IS NULL OR status::text NOT IN
          ('present','late','justified_late','justified_absence','unjustified_absence','injured','injured_present','injured_justified_absence','injured_unjustified_absence'))
      ) OR EXISTS (
        SELECT 1 FROM public.callups c WHERE c.session_id=p_session
        AND c.status::text IN ('called_up','trial','guest_not_evaluable')
        AND NOT EXISTS (SELECT 1 FROM public.attendance a WHERE a.session_id=p_session AND a.player_id=c.player_id)
      ) THEN RAISE EXCEPTION 'Save and verify complete attendance before confirming'; END IF;
      -- No attendance writes here, ever.
      UPDATE public.sessions SET attendance_confirmed=true,attendance_confirmed_at=now() WHERE id=p_session;
    ELSE
      IF s.callup_confirmed IS DISTINCT FROM true OR s.attendance_confirmed IS DISTINCT FROM true THEN
        RAISE EXCEPTION 'Confirm callups and attendance first';
      END IF;
      IF p_records_only AND r <> 'admin' THEN RAISE EXCEPTION 'Admin only' USING ERRCODE='42501'; END IF;
      -- BLOCKED adapter must validate snapshots, explicit eligibility, scores/N/A,
      -- limits, records-only and existing disciplinary semantics before finalizing.
      -- Called inside this transaction while the session is locked.
      PERFORM public.batch4_finalize_evaluation(p_session,auth.uid(),p_rows,p_records_only);
      UPDATE public.sessions SET evaluation_confirmed=true,evaluation_confirmed_at=now(),records_only_confirmed=p_records_only WHERE id=p_session;
    END IF;
  END IF;
  SELECT * INTO s FROM public.sessions WHERE id=p_session;
  RETURN to_jsonb(s);
END $$;
REVOKE ALL ON FUNCTION public.batch4_workflow_action(uuid,text,text,jsonb,boolean,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.batch4_workflow_action(uuid,text,text,jsonb,boolean,jsonb) TO authenticated;

-- Keep existing session RLS. A direct Admin UPDATE must not bypass the reviewed
-- confirmation RPC by changing flags, timestamps or the prospective marker.
-- SECURITY INVOKER deliberately observes the effective database role: the narrow
-- definer RPC executes as its migration owner; ordinary PostgREST uses authenticated.
CREATE FUNCTION public.batch4_guard_session_flags() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF current_user IN ('authenticated','anon') AND (
      NEW.callup_confirmed IS DISTINCT FROM false OR NEW.callup_confirmed_at IS NOT NULL
      OR NEW.attendance_confirmed IS DISTINCT FROM false OR NEW.attendance_confirmed_at IS NOT NULL
      OR NEW.evaluation_confirmed IS DISTINCT FROM false OR NEW.evaluation_confirmed_at IS NOT NULL
      OR NEW.records_only_confirmed IS TRUE
      OR (NEW.draft_defaults_version=1 AND NEW.status::text IS DISTINCT FROM 'planned')
    ) THEN RAISE EXCEPTION 'Create an open session before confirming workflows' USING ERRCODE='42501'; END IF;
    RETURN NEW;
  END IF;
  IF current_user IN ('authenticated','anon') AND (
    NEW.callup_confirmed IS DISTINCT FROM OLD.callup_confirmed
    OR NEW.callup_confirmed_at IS DISTINCT FROM OLD.callup_confirmed_at
    OR NEW.attendance_confirmed IS DISTINCT FROM OLD.attendance_confirmed
    OR NEW.attendance_confirmed_at IS DISTINCT FROM OLD.attendance_confirmed_at
    OR NEW.evaluation_confirmed IS DISTINCT FROM OLD.evaluation_confirmed
    OR NEW.evaluation_confirmed_at IS DISTINCT FROM OLD.evaluation_confirmed_at
    OR NEW.records_only_confirmed IS DISTINCT FROM OLD.records_only_confirmed
    OR NEW.draft_defaults_version IS DISTINCT FROM OLD.draft_defaults_version
  ) THEN RAISE EXCEPTION 'Use the reviewed workflow RPC; session flags and draft origin are protected' USING ERRCODE='42501'; END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.batch4_guard_session_flags() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER batch4_session_flags_guard BEFORE INSERT OR UPDATE ON public.sessions
FOR EACH ROW EXECUTE FUNCTION public.batch4_guard_session_flags();

-- The existing statistics contract counts evaluated=true rows. Do not permit a
-- direct staff write to publish a sporting evaluation outside atomic finalization.
CREATE FUNCTION public.batch4_guard_evaluated_flag() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
BEGIN
  IF current_user IN ('authenticated','anon') THEN
    IF TG_OP = 'INSERT' THEN
      IF NEW.evaluated IS TRUE THEN RAISE EXCEPTION 'Use atomic evaluation finalization' USING ERRCODE='42501'; END IF;
    ELSIF NEW.evaluated IS DISTINCT FROM OLD.evaluated THEN
      RAISE EXCEPTION 'Use atomic evaluation finalization' USING ERRCODE='42501';
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.batch4_guard_evaluated_flag() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER batch4_evaluated_flag_guard BEFORE INSERT OR UPDATE ON public.evaluations
FOR EACH ROW EXECUTE FUNCTION public.batch4_guard_evaluated_flag();
-- Functions default to PUBLIC EXECUTE in PostgreSQL; explicitly restrict adapters too.
REVOKE ALL ON FUNCTION public.batch4_assert_global_access(uuid,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.batch4_finalize_evaluation(uuid,uuid,jsonb,boolean) FROM PUBLIC, anon, authenticated;


-- SOURCE: 003_discipline_and_standouts.sql
-- LOCAL RELEASE DRAFT. Validate in the isolated database before manual approval.
-- Requires 001, 001a and 002. No historical inserts, resets or deduplication.

CREATE TABLE public.batch4_discipline_cycles(
  player_id uuid PRIMARY KEY REFERENCES public.players(id),
  yellow_baseline bigint NOT NULL CHECK(yellow_baseline>=0),
  baseline_at timestamptz NOT NULL,
  completed_suspension_id uuid NOT NULL REFERENCES public.suspensions(id)
);
CREATE TABLE public.batch4_card_suspensions(
  card_id uuid PRIMARY KEY REFERENCES public.cards(id),
  suspension_id uuid NOT NULL UNIQUE REFERENCES public.suspensions(id)
);
ALTER TABLE public.batch4_discipline_cycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.batch4_card_suspensions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.batch4_discipline_cycles,public.batch4_card_suspensions FROM PUBLIC,anon,authenticated;

-- Only the private callers below may reconcile; every caller locks the player.
CREATE FUNCTION public.batch4_reconcile_yellows(p_player uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE total bigint;baseline bigint;
BEGIN
  PERFORM 1 FROM public.players WHERE id=p_player FOR UPDATE;
  SELECT count(*) INTO total FROM public.cards WHERE player_id=p_player AND type::text='yellow';
  SELECT yellow_baseline INTO baseline FROM public.batch4_discipline_cycles WHERE player_id=p_player;
  IF baseline IS NULL AND EXISTS(SELECT 1 FROM public.suspensions WHERE player_id=p_player AND source='yellow_accumulation' AND status='served') THEN
    RAISE EXCEPTION 'Review and initialize the legacy completed accumulation cycle before saving cards';
  END IF;
  IF total-coalesce(baseline,0)>=5 AND NOT EXISTS(
    SELECT 1 FROM public.suspensions WHERE player_id=p_player AND source='yellow_accumulation' AND status='active'
  ) THEN
    INSERT INTO public.suspensions(player_id,source,matches_total,matches_served,status,reason)
      VALUES(p_player,'yellow_accumulation',1,0,'active','Acumulación de 5 amarillas simples en la cuenta actual');
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.batch4_reconcile_yellows(uuid) FROM PUBLIC,anon,authenticated;

-- Remove the exported anonymous SECURITY DEFINER write path. The old frontend
-- is not write compatible with this coordinated release.
CREATE OR REPLACE FUNCTION public.create_yellow_accumulation_suspensions() RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
BEGIN RAISE EXCEPTION 'Use the atomic disciplinary workflow' USING ERRCODE='42501'; END $$;
REVOKE ALL ON FUNCTION public.create_yellow_accumulation_suspensions() FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.batch4_guard_discipline_rpc() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
BEGIN
  IF current_user IN ('authenticated','anon') THEN
    RAISE EXCEPTION 'Use the atomic disciplinary RPC' USING ERRCODE='42501';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.batch4_guard_discipline_rpc() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER batch4_card_rpc_only BEFORE INSERT OR UPDATE OR DELETE ON public.cards
FOR EACH ROW EXECUTE FUNCTION public.batch4_guard_discipline_rpc();
CREATE TRIGGER batch4_suspension_rpc_only BEFORE INSERT OR UPDATE OR DELETE ON public.suspensions
FOR EACH ROW EXECUTE FUNCTION public.batch4_guard_discipline_rpc();
CREATE TRIGGER batch4_standouts_rpc_only BEFORE INSERT OR UPDATE OR DELETE ON public.session_standouts
FOR EACH ROW EXECUTE FUNCTION public.batch4_guard_discipline_rpc();

CREATE FUNCTION public.batch4_save_card(p_session uuid,p_player uuid,p_type text,p_reason text,p_matches integer,p_expected jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE s public.sessions; old_card public.cards; saved_card public.cards; sanction uuid;baseline timestamptz;
BEGIN
  PERFORM public.batch4_assert_global_access(p_session,auth.uid());
  SELECT * INTO s FROM public.sessions WHERE id=p_session FOR UPDATE;
  IF s.evaluation_confirmed IS DISTINCT FROM false OR s.callup_confirmed IS DISTINCT FROM true OR s.attendance_confirmed IS DISTINCT FROM true
    OR s.type::text NOT IN ('league_match','friendly_match','tryout','scrimmage') THEN RAISE EXCEPTION 'Card workflow closed'; END IF;
  IF p_type IS NULL OR p_type NOT IN ('none','yellow','double_yellow','straight_red') OR p_matches IS NULL OR p_matches<1 OR p_matches>99 THEN
    RAISE EXCEPTION 'Invalid disciplinary selection'; END IF;
  IF p_type IN ('straight_red','double_yellow') AND nullif(btrim(p_reason),'') IS NULL THEN RAISE EXCEPTION 'Card reason required'; END IF;
  PERFORM 1 FROM public.players WHERE id=p_player FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Player not found'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.callups WHERE session_id=p_session AND player_id=p_player) THEN RAISE EXCEPTION 'Player not reviewed in callup'; END IF;
  IF (SELECT count(*) FROM public.cards WHERE session_id=p_session AND player_id=p_player)>1 THEN RAISE EXCEPTION 'Multiple historical cards need manual review'; END IF;
  SELECT * INTO old_card FROM public.cards WHERE session_id=p_session AND player_id=p_player;
  IF old_card.id IS NULL THEN
    IF p_expected IS NOT NULL AND p_expected<>'null'::jsonb THEN RAISE EXCEPTION 'Stale card snapshot; reload'; END IF;
  ELSIF jsonb_typeof(p_expected) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Stale card snapshot; reload';
  ELSIF (to_jsonb(old_card)-'created_at') IS DISTINCT FROM (p_expected-'created_at') THEN RAISE EXCEPTION 'Stale card snapshot; reload'; END IF;
  SELECT baseline_at INTO baseline FROM public.batch4_discipline_cycles WHERE player_id=p_player;
  IF old_card.id IS NOT NULL AND old_card.type::text='yellow' AND old_card.created_at<=baseline AND p_type<>'yellow' THEN
    RAISE EXCEPTION 'This historical card belongs to a completed accumulation cycle'; END IF;
  IF old_card.id IS NOT NULL AND old_card.type::text IN ('straight_red','double_yellow') AND old_card.type::text<>p_type THEN
    RAISE EXCEPTION 'Review the existing red-card sanction before changing its type'; END IF;
  IF p_type='none' THEN
    IF old_card.id IS NOT NULL THEN DELETE FROM public.cards WHERE id=old_card.id; END IF;
  ELSIF old_card.id IS NOT NULL THEN
    UPDATE public.cards SET type=p_type::public.card_type,reason=nullif(p_reason,'') WHERE id=old_card.id RETURNING * INTO saved_card;
  ELSE
    INSERT INTO public.cards(session_id,player_id,type,reason) VALUES(p_session,p_player,p_type::public.card_type,nullif(p_reason,'')) RETURNING * INTO saved_card;
  END IF;
  IF old_card.id IS NULL AND p_type IN ('straight_red','double_yellow') THEN
    INSERT INTO public.suspensions(player_id,source,matches_total,matches_served,status,reason,created_from_session_id)
      VALUES(p_player,p_type,p_matches,0,'active',p_reason,p_session) RETURNING id INTO sanction;
    INSERT INTO public.batch4_card_suspensions(card_id,suspension_id) VALUES(saved_card.id,sanction);
  END IF;
  -- Removing a card that already triggered accumulation needs an explicit review;
  -- never silently cancel a suspension or reset its historical basis.
  IF old_card.id IS NOT NULL AND old_card.type::text='yellow' AND p_type<>'yellow' AND EXISTS(
    SELECT 1 FROM public.suspensions WHERE player_id=p_player AND source='yellow_accumulation' AND status='active'
  ) THEN RAISE EXCEPTION 'Review the active accumulation sanction before removing this yellow card'; END IF;
  PERFORM public.batch4_reconcile_yellows(p_player);
  RETURN jsonb_build_object('session_id',p_session,'player_id',p_player,'saved',true,'card',to_jsonb(saved_card));
END $$;
REVOKE ALL ON FUNCTION public.batch4_save_card(uuid,uuid,text,text,integer,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.batch4_save_card(uuid,uuid,text,text,integer,jsonb) TO authenticated;

CREATE FUNCTION public.batch4_complete_suspension(p_suspension uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE row public.suspensions;pid uuid;total bigint;
BEGIN
  IF auth.uid() IS NULL OR public.batch4_actor_role() IS DISTINCT FROM 'admin' THEN RAISE EXCEPTION 'Admin only' USING ERRCODE='42501'; END IF;
  SELECT player_id INTO pid FROM public.suspensions WHERE id=p_suspension;
  IF pid IS NULL THEN RAISE EXCEPTION 'Suspension not found'; END IF;
  -- Same player lock as card saves; no reverse session/player lock order.
  PERFORM 1 FROM public.players WHERE id=pid FOR UPDATE;
  SELECT * INTO row FROM public.suspensions WHERE id=p_suspension FOR UPDATE;
  IF row.status='served' THEN RETURN to_jsonb(row); END IF;
  IF row.status<>'active' THEN RAISE EXCEPTION 'Suspension is not active'; END IF;
  IF row.source='yellow_accumulation' THEN
    IF (SELECT count(*) FROM public.suspensions WHERE player_id=pid AND source='yellow_accumulation' AND status='active')<>1 THEN
      RAISE EXCEPTION 'Multiple active accumulation sanctions need manual review'; END IF;
    SELECT count(*) INTO total FROM public.cards WHERE player_id=pid AND type::text='yellow';
    INSERT INTO public.batch4_discipline_cycles(player_id,yellow_baseline,baseline_at,completed_suspension_id)
      VALUES(pid,total,clock_timestamp(),row.id)
      ON CONFLICT(player_id) DO UPDATE SET yellow_baseline=EXCLUDED.yellow_baseline,baseline_at=EXCLUDED.baseline_at,completed_suspension_id=EXCLUDED.completed_suspension_id;
  END IF;
  UPDATE public.suspensions SET status='served',matches_served=matches_total,served_at=now() WHERE id=row.id RETURNING * INTO row;
  RETURN to_jsonb(row);
END $$;
REVOKE ALL ON FUNCTION public.batch4_complete_suspension(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.batch4_complete_suspension(uuid) TO authenticated;

-- Explicit Admin action for a pre-existing served sanction. No automatic baseline
-- is inferred from historical timestamps and the migration never calls this.
CREATE FUNCTION public.batch4_initialize_discipline_cycle(p_suspension uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE row public.suspensions;pid uuid;total bigint;
BEGIN
  IF auth.uid() IS NULL OR public.batch4_actor_role() IS DISTINCT FROM 'admin' THEN RAISE EXCEPTION 'Admin only' USING ERRCODE='42501'; END IF;
  SELECT player_id INTO pid FROM public.suspensions WHERE id=p_suspension;
  IF pid IS NULL THEN RAISE EXCEPTION 'Suspension not found'; END IF;
  PERFORM 1 FROM public.players WHERE id=pid FOR UPDATE;
  SELECT * INTO row FROM public.suspensions WHERE id=p_suspension FOR UPDATE;
  IF row.source<>'yellow_accumulation' OR row.status<>'served' THEN RAISE EXCEPTION 'Select a served accumulation sanction'; END IF;
  IF EXISTS(SELECT 1 FROM public.batch4_discipline_cycles WHERE player_id=pid) THEN RETURN to_jsonb(row)||jsonb_build_object('cycle_initialized',true); END IF;
  IF EXISTS(SELECT 1 FROM public.suspensions WHERE player_id=pid AND source='yellow_accumulation' AND status='active') THEN
    RAISE EXCEPTION 'Review the active accumulation sanction first'; END IF;
  SELECT count(*) INTO total FROM public.cards WHERE player_id=pid AND type::text='yellow';
  INSERT INTO public.batch4_discipline_cycles(player_id,yellow_baseline,baseline_at,completed_suspension_id)
    VALUES(pid,total,clock_timestamp(),p_suspension);
  RETURN to_jsonb(row)||jsonb_build_object('cycle_initialized',true);
END $$;
REVOKE ALL ON FUNCTION public.batch4_initialize_discipline_cycle(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.batch4_initialize_discipline_cycle(uuid) TO authenticated;

CREATE FUNCTION public.batch4_discipline_balances() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE result jsonb;
BEGIN
  IF auth.uid() IS NULL OR public.batch4_actor_role() IS NULL OR public.batch4_actor_role() NOT IN ('admin','coach') THEN
    RAISE EXCEPTION 'Staff only' USING ERRCODE='42501'; END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.display_name),'[]'::jsonb) INTO result FROM (
    SELECT p.id AS player_id,p.display_name,
      greatest(0,count(c.id) FILTER(WHERE c.type::text='yellow')-coalesce(cycle.yellow_baseline,0)) AS cycle_yellows,
      (cycle.player_id IS NULL AND EXISTS(SELECT 1 FROM public.suspensions s WHERE s.player_id=p.id AND s.source='yellow_accumulation' AND s.status='served')) AS needs_cycle_review,
      count(c.id) FILTER(WHERE c.type::text='yellow')+2*count(c.id) FILTER(WHERE c.type::text='double_yellow') AS historical_yellows,
      count(c.id) FILTER(WHERE c.type::text IN ('double_yellow','straight_red')) AS historical_reds
    FROM public.players p LEFT JOIN public.cards c ON c.player_id=p.id
      LEFT JOIN public.batch4_discipline_cycles cycle ON cycle.player_id=p.id
    GROUP BY p.id,p.display_name,cycle.player_id,cycle.yellow_baseline
  ) x;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.batch4_discipline_balances() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.batch4_discipline_balances() TO authenticated;

CREATE FUNCTION public.batch4_save_standouts(p_session uuid,p_rows jsonb,p_expected jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE s public.sessions;stored jsonb;item jsonb;
BEGIN
  IF auth.uid() IS NULL OR public.batch4_actor_role() IS DISTINCT FROM 'admin' THEN RAISE EXCEPTION 'Admin only' USING ERRCODE='42501'; END IF;
  PERFORM public.batch4_assert_global_access(p_session,auth.uid());
  SELECT * INTO s FROM public.sessions WHERE id=p_session FOR UPDATE;
  IF s.status::text<>'completed' OR s.records_only_confirmed IS TRUE OR s.type::text NOT IN ('training','league_match','friendly_match','tryout','scrimmage') THEN RAISE EXCEPTION 'Session does not admit standouts'; END IF;
  IF jsonb_typeof(p_rows) IS DISTINCT FROM 'array' OR jsonb_typeof(p_expected) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Reviewed standouts required'; END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(t)-'created_at'-'updated_at' ORDER BY t.id),'[]'::jsonb) INTO stored FROM public.session_standouts t WHERE session_id=p_session;
  SELECT coalesce(jsonb_agg(x-'created_at'-'updated_at' ORDER BY x->>'id'),'[]'::jsonb) INTO p_expected FROM jsonb_array_elements(p_expected) x;
  IF stored<>p_expected THEN RAISE EXCEPTION 'Stale standout snapshot; reload'; END IF;
  IF jsonb_array_length(p_rows)<>4 OR (SELECT count(DISTINCT x->>'player_id') FROM jsonb_array_elements(p_rows) x)<>4
    OR (SELECT count(DISTINCT (x->>'category',x->>'rank')) FROM jsonb_array_elements(p_rows) x)<>4
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_rows) x WHERE (x->>'session_id')::uuid IS DISTINCT FROM p_session
      OR (x->>'category') IS NULL OR x->>'category' NOT IN ('top','bottom') OR (x->>'rank') IS NULL OR (x->>'rank')::integer NOT IN (1,2)
      OR NOT EXISTS(SELECT 1 FROM public.callups c WHERE c.session_id=p_session AND c.player_id=(x->>'player_id')::uuid AND c.status::text<>'not_called')) THEN
    RAISE EXCEPTION 'Select four different reviewed players'; END IF;
  DELETE FROM public.session_standouts WHERE session_id=p_session;
  FOR item IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
    INSERT INTO public.session_standouts(session_id,player_id,category,rank,notes)
      VALUES(p_session,(item->>'player_id')::uuid,item->>'category',(item->>'rank')::smallint,item->>'notes');
  END LOOP;
  RETURN jsonb_build_object('session_id',p_session,'saved',true);
END $$;
REVOKE ALL ON FUNCTION public.batch4_save_standouts(uuid,jsonb,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.batch4_save_standouts(uuid,jsonb,jsonb) TO authenticated;


-- SOURCE: 004_view_security.sql
-- LOCAL REVIEW DRAFT based on the follow-up diagnostic supplied by the user.
-- Preserve view definitions/data. Enforce caller RLS and remove view write paths.

ALTER VIEW public.active_suspensions SET (security_invoker=true);
ALTER VIEW public.player_card_totals SET (security_invoker=true);
ALTER VIEW public.official_evaluations SET (security_invoker=true);
REVOKE ALL ON public.active_suspensions,public.player_card_totals,public.official_evaluations FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.active_suspensions,public.player_card_totals,public.official_evaluations TO authenticated;


ROLLBACK;
SELECT 'COMPATIBILITY_OK_ROLLED_BACK' AS result;
