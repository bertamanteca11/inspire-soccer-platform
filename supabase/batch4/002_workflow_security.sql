-- LOCAL RELEASE DRAFT: install the reviewed 001a adapters before this source.
-- See docs/RELEASE_REVIEW_2026_11_06.md. Validate the complete bundle in isolation.
-- Existing RLS/global trigger stay intact; 001a updates rating limits for four qualities.
BEGIN;
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
COMMIT;
