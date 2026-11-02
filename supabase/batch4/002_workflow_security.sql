-- BLOCKED FOR RELEASE until the global-lock adapter described in docs/BATCH4_IMPLEMENTATION.md
-- is implemented from the verified live definition. Never substitute a guessed lock column.
-- Existing RLS, prevent_locked_session_edits and enforce_high_rating_limit stay intact.
BEGIN;
DO $$ BEGIN
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
  IF TG_OP = 'UPDATE' AND NEW.session_id IS DISTINCT FROM OLD.session_id THEN
    RAISE EXCEPTION 'Cannot move workflow records between sessions';
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
  p_rows jsonb DEFAULT '[]', p_records_only boolean DEFAULT false
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE s public.sessions; r text := public.batch4_actor_role(); item jsonb; current_rows jsonb;
BEGIN
  IF auth.uid() IS NULL OR r IS NULL OR r NOT IN ('admin','coach')
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
    END IF;
  ELSE
    IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN RAISE EXCEPTION 'Reviewed rows required'; END IF;
    IF p_workflow = 'callup' THEN
      IF jsonb_array_length(p_rows)=0 OR EXISTS (
        SELECT 1 FROM jsonb_array_elements(p_rows) x
        WHERE (x->>'player_id') IS NULL OR (x->>'status') IS NULL
          OR (x->>'status') NOT IN ('called_up','trial','guest_not_evaluable','not_called')
          OR jsonb_typeof(x->'evaluable') IS DISTINCT FROM 'boolean'
          OR (x->>'session_id')::uuid IS DISTINCT FROM p_session
      ) OR (SELECT count(DISTINCT x->>'player_id') FROM jsonb_array_elements(p_rows) x) <> jsonb_array_length(p_rows) THEN
        RAISE EXCEPTION 'Invalid reviewed callup roster';
      END IF;
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
        SELECT 1 FROM public.attendance WHERE session_id=p_session AND (status IS NULL OR status::text='')
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
REVOKE ALL ON FUNCTION public.batch4_workflow_action(uuid,text,text,jsonb,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.batch4_workflow_action(uuid,text,text,jsonb,boolean) TO authenticated;
-- Functions default to PUBLIC EXECUTE in PostgreSQL; explicitly restrict adapters too.
REVOKE ALL ON FUNCTION public.batch4_assert_global_access(uuid,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.batch4_finalize_evaluation(uuid,uuid,jsonb,boolean) FROM PUBLIC, anon, authenticated;
COMMIT;
