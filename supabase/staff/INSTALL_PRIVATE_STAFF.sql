-- MANUAL installation AFTER batch4/REVIEW_INSTALL.sql. One atomic transaction.
-- Admin profiles can see private staff; Coach cannot. No email/password required.
-- No account/password creation, no sporting-record repair, no automatic deployment.
BEGIN;
-- Leave NULL when there is only one Coach profile (the shared Coach login).
-- If several Coach profiles exist, enter ONLY Juli's verified profile UUID here.
CREATE TEMP TABLE staff_access_setup(coach_user_id uuid) ON COMMIT DROP;
INSERT INTO staff_access_setup VALUES (NULL);

DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE role::text='admin') THEN
    RAISE EXCEPTION 'No hay perfiles Admin existentes. Revisa el proyecto antes de continuar';
  END IF;
  IF (SELECT coach_user_id FROM staff_access_setup) IS NULL THEN
    IF (SELECT count(*) FROM public.profiles WHERE role::text='coach')<>1 THEN
      RAISE EXCEPTION 'Debe haber una única cuenta Coach. Si hay varias, consulta staff_access_accounts_read_only.sql e indica solo el UUID de Juli al principio de este archivo';
    END IF;
    UPDATE staff_access_setup SET coach_user_id=(SELECT id FROM public.profiles WHERE role::text='coach');
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.profiles p JOIN staff_access_setup s ON s.coach_user_id=p.id WHERE p.role::text='coach') THEN
    RAISE EXCEPTION 'El identificador elegido no corresponde a una cuenta Coach existente';
  END IF;
  IF to_regprocedure('public.batch4_actor_role()') IS NULL THEN
    RAISE EXCEPTION 'Instala primero REVIEW_INSTALL.sql de Batch 4';
  END IF;
END $$;

CREATE TABLE public.app_access_members(
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id)
);
INSERT INTO public.app_access_members
SELECT id FROM public.profiles WHERE role::text='admin' OR id=(SELECT coach_user_id FROM staff_access_setup);
ALTER TABLE public.app_access_members ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.app_access_members FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.app_has_access() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT EXISTS(SELECT 1 FROM public.app_access_members m JOIN public.profiles p ON p.id=m.user_id
    WHERE m.user_id=auth.uid() AND p.role::text IN ('admin','coach'))
$$;
CREATE FUNCTION public.app_private_staff_access() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT public.app_has_access() AND EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND role::text='admin')
$$;
CREATE FUNCTION public.app_access() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT jsonb_build_object('allowed',public.app_has_access(),
    'role',(SELECT p.role FROM public.profiles p WHERE p.id=auth.uid() AND public.app_has_access()),
    'private_staff',public.app_private_staff_access())
$$;
REVOKE ALL ON FUNCTION public.app_has_access(),public.app_private_staff_access(),public.app_access() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.app_has_access() TO anon,authenticated;
GRANT EXECUTE ON FUNCTION public.app_private_staff_access(),public.app_access() TO authenticated;

-- Existing permissive policies remain; this additional condition applies to ALL
-- ordinary public tables, including optional injuries/VEO tables already installed.
-- RLS alone does not protect TRUNCATE or schema/function creation.
REVOKE CREATE ON SCHEMA public FROM PUBLIC,anon,authenticated;
DO $$ DECLARE t record; BEGIN
  FOR t IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind IN ('r','p') AND c.relname<>'app_access_members'
      AND NOT EXISTS(SELECT 1 FROM pg_depend d WHERE d.classid='pg_class'::regclass AND d.objid=c.oid AND d.deptype='e')
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t.relname);
    EXECUTE format('CREATE POLICY app_members_only ON public.%I AS RESTRICTIVE FOR ALL TO PUBLIC USING ((SELECT public.app_has_access())) WITH CHECK ((SELECT public.app_has_access()))',t.relname);
    EXECUTE format('REVOKE TRUNCATE,TRIGGER,REFERENCES ON public.%I FROM PUBLIC,anon,authenticated',t.relname);
  END LOOP;
END $$;

-- Protect existing SECURITY DEFINER entry points, which bypass table RLS.
CREATE OR REPLACE FUNCTION public."current_role"() RETURNS public.user_role LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT p.role FROM public.profiles p WHERE p.id=auth.uid() AND public.app_has_access()
$$;
CREATE OR REPLACE FUNCTION public.batch4_actor_role() RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT public."current_role"()::text
$$;
CREATE OR REPLACE FUNCTION public.batch4_assert_global_access(p_session uuid,p_actor uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s public.sessions; r text:=public.batch4_actor_role(); BEGIN
  IF p_actor IS NULL OR p_actor IS DISTINCT FROM auth.uid() OR r IS NULL OR r NOT IN ('admin','coach') THEN
    RAISE EXCEPTION 'Workflow permission denied' USING ERRCODE='42501'; END IF;
  SELECT * INTO s FROM public.sessions WHERE id=p_session;
  IF NOT FOUND THEN RAISE EXCEPTION 'Session not found'; END IF;
  IF s.status::text IN ('cancelled','archived') OR s.status IS NULL THEN
    RAISE EXCEPTION 'Session is not operational' USING ERRCODE='42501'; END IF;
  IF (s.status::text='locked' OR s.locked_at IS NOT NULL) AND r<>'admin' THEN
    RAISE EXCEPTION 'Session globally locked' USING ERRCODE='42501'; END IF;
END $$;
DO $$ BEGIN
  IF to_regprocedure('public.veo_is_staff()') IS NOT NULL THEN
    EXECUTE $sql$CREATE OR REPLACE FUNCTION public.veo_is_staff() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS 'SELECT coalesce(public."current_role"()::text IN (''admin'',''coach''),false)'$sql$;
  END IF;
  IF to_regprocedure('public.veo_is_admin()') IS NOT NULL THEN
    EXECUTE $sql$CREATE OR REPLACE FUNCTION public.veo_is_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS 'SELECT coalesce(public."current_role"()::text=''admin'',false)'$sql$;
  END IF;
END $$;

-- Fail the complete installation if an unknown definer RPC or owner-bypassing
-- view would provide an unreviewed alternative to the membership checks.
DO $$ DECLARE unexpected text; BEGIN
  SELECT string_agg(p.oid::regprocedure::text,', ') INTO unexpected FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.prosecdef AND p.prokind='f' AND p.prorettype<>'trigger'::regtype
    AND (has_function_privilege('authenticated',p.oid,'EXECUTE') OR has_function_privilege('anon',p.oid,'EXECUTE'))
    AND p.oid::regprocedure::text NOT IN (
      '"current_role"()','app_has_access()','app_private_staff_access()','app_access()',
      'batch4_workflow_access(uuid,text)','batch4_workflow_action(uuid,text,text,jsonb,boolean,jsonb)',
      'batch4_save_card(uuid,uuid,text,text,integer,jsonb)','batch4_complete_suspension(uuid)',
      'batch4_initialize_discipline_cycle(uuid)','batch4_discipline_balances()','batch4_save_standouts(uuid,jsonb,jsonb)',
      'veo_is_admin()','veo_is_staff()','veo_status()','veo_publish_import(jsonb,jsonb,boolean)','veo_revert_import(uuid,boolean)');
  IF unexpected IS NOT NULL THEN RAISE EXCEPTION 'Revisar RPC adicionales antes de restringir accesos: %',unexpected; END IF;
  SELECT string_agg(c.relname,', ') INTO unexpected FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind IN ('v','m')
      AND (has_table_privilege('authenticated',c.oid,'SELECT') OR has_table_privilege('anon',c.oid,'SELECT'))
      AND (c.relkind='m' OR NOT coalesce('security_invoker=true'=ANY(c.reloptions),false));
  IF unexpected IS NOT NULL THEN RAISE EXCEPTION 'Revisar vistas adicionales antes de restringir accesos: %',unexpected; END IF;
END $$;

CREATE TABLE public.private_staff_control(singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),revision bigint NOT NULL DEFAULT 0);
INSERT INTO public.private_staff_control VALUES(true,0);
CREATE TABLE public.private_staff_members(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 120),
  job text NOT NULL DEFAULT '' CHECK(length(job)<=120),active boolean NOT NULL DEFAULT true,yellow_baseline bigint NOT NULL DEFAULT 0
);
CREATE TABLE public.private_staff_workflows(
  session_id uuid PRIMARY KEY REFERENCES public.sessions(id),callup_confirmed boolean NOT NULL DEFAULT false,
  attendance_confirmed boolean NOT NULL DEFAULT false
);
CREATE TABLE public.private_staff_callups(
  session_id uuid NOT NULL REFERENCES public.sessions(id),staff_id uuid NOT NULL REFERENCES public.private_staff_members(id),
  status text NOT NULL CHECK(status IN ('called_up','not_called','injured','doubt')),PRIMARY KEY(session_id,staff_id)
);
CREATE TABLE public.private_staff_attendance(
  session_id uuid NOT NULL REFERENCES public.sessions(id),staff_id uuid NOT NULL REFERENCES public.private_staff_members(id),
  status public.attendance_status NOT NULL,notes text CHECK(length(notes)<=4000),PRIMARY KEY(session_id,staff_id),
  CHECK(status::text='present' OR length(btrim(coalesce(notes,'')))>0)
);
CREATE TABLE public.private_staff_cards(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),session_id uuid NOT NULL REFERENCES public.sessions(id),
  staff_id uuid NOT NULL REFERENCES public.private_staff_members(id),type public.card_type NOT NULL,
  reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 1 AND 4000),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  created_by uuid NOT NULL DEFAULT auth.uid()
);
CREATE TABLE public.private_staff_suspensions(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),staff_id uuid NOT NULL REFERENCES public.private_staff_members(id),
  source text NOT NULL CHECK(source IN ('yellow_accumulation','card')),
  card_id uuid REFERENCES public.private_staff_cards(id),matches_total integer NOT NULL CHECK(matches_total BETWEEN 1 AND 20),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),served_at timestamptz,served_by uuid
);
CREATE UNIQUE INDEX private_staff_active_yellows ON public.private_staff_suspensions(staff_id) WHERE source='yellow_accumulation' AND served_at IS NULL;
CREATE INDEX private_staff_cards_member ON public.private_staff_cards(staff_id);
CREATE INDEX private_staff_suspensions_member ON public.private_staff_suspensions(staff_id);
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['private_staff_control','private_staff_members','private_staff_workflows','private_staff_callups','private_staff_attendance','private_staff_cards','private_staff_suspensions'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated',t);
    EXECUTE format('CREATE POLICY private_staff_read ON public.%I FOR SELECT TO authenticated USING ((SELECT public.app_private_staff_access()))',t);
  END LOOP;
END $$;

CREATE FUNCTION public.private_staff_workspace(p_session uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb; BEGIN
  IF NOT public.app_private_staff_access() THEN RAISE EXCEPTION 'Sección privada: acceso denegado' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.sessions WHERE id=p_session) THEN RAISE EXCEPTION 'Sesión no encontrada'; END IF;
  SELECT jsonb_build_object('session_id',p_session,'revision',(SELECT revision FROM public.private_staff_control),
    'workflow',coalesce((SELECT to_jsonb(w) FROM public.private_staff_workflows w WHERE session_id=p_session),'{"callup_confirmed":false,"attendance_confirmed":false}'::jsonb),
    'members',coalesce((SELECT jsonb_agg(to_jsonb(q) ORDER BY q.name,q.id) FROM (
      SELECT m.id,m.name,m.job,m.active,
        (SELECT count(*) FROM public.private_staff_cards c WHERE c.staff_id=m.id AND c.type::text='yellow')-m.yellow_baseline AS cycle_yellows,
        (SELECT coalesce(sum(CASE c.type::text WHEN 'yellow' THEN 1 WHEN 'double_yellow' THEN 2 ELSE 0 END),0) FROM public.private_staff_cards c WHERE c.staff_id=m.id) AS historical_yellows,
        (SELECT count(*) FROM public.private_staff_cards c WHERE c.staff_id=m.id AND c.type::text IN ('double_yellow','straight_red')) AS historical_reds
      FROM public.private_staff_members m
    ) q),'[]'::jsonb),
    'callups',coalesce((SELECT jsonb_agg(to_jsonb(c) ORDER BY c.staff_id) FROM public.private_staff_callups c WHERE session_id=p_session),'[]'::jsonb),
    'attendance',coalesce((SELECT jsonb_agg(to_jsonb(a) ORDER BY a.staff_id) FROM public.private_staff_attendance a WHERE session_id=p_session),'[]'::jsonb),
    'cards',coalesce((SELECT jsonb_agg(to_jsonb(c) ORDER BY c.created_at,c.id) FROM public.private_staff_cards c WHERE session_id=p_session),'[]'::jsonb),
    'suspensions',coalesce((SELECT jsonb_agg(to_jsonb(s) ORDER BY s.created_at,s.id) FROM public.private_staff_suspensions s),'[]'::jsonb)) INTO result;
  RETURN result;
END $$;

CREATE FUNCTION public.private_staff_action(p_session uuid,p_action text,p_payload jsonb,p_revision bigint) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE revision_now bigint;s public.sessions;w public.private_staff_workflows;item jsonb;pid uuid;cid uuid;sanction public.private_staff_suspensions;
  rows_count integer; total_yellows bigint; baseline bigint;active_ids uuid[]; called_ids uuid[];
BEGIN
  IF NOT public.app_private_staff_access() THEN RAISE EXCEPTION 'Sección privada: acceso denegado' USING ERRCODE='42501'; END IF;
  SELECT revision INTO revision_now FROM public.private_staff_control FOR UPDATE;
  IF p_revision IS DISTINCT FROM revision_now THEN RAISE EXCEPTION 'Los datos han cambiado. Actualiza el staff antes de guardar.' USING ERRCODE='40001'; END IF;
  IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Datos inválidos'; END IF;
  SELECT * INTO s FROM public.sessions WHERE id=p_session FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sesión no encontrada'; END IF;
  IF s.status::text NOT IN ('planned','completed') OR (s.locked_at IS NOT NULL AND public.batch4_actor_role()<>'admin') THEN
    RAISE EXCEPTION 'Esta sesión no admite cambios' USING ERRCODE='42501'; END IF;
  INSERT INTO public.private_staff_workflows(session_id) VALUES(p_session) ON CONFLICT DO NOTHING;
  SELECT * INTO w FROM public.private_staff_workflows WHERE session_id=p_session;
  SELECT coalesce(array_agg(m.id),ARRAY[]::uuid[]) INTO active_ids FROM public.private_staff_members m WHERE m.active
    OR EXISTS(SELECT 1 FROM public.private_staff_callups c WHERE c.staff_id=m.id AND c.session_id=p_session)
    OR EXISTS(SELECT 1 FROM public.private_staff_attendance a WHERE a.staff_id=m.id AND a.session_id=p_session);
  IF p_action='add_member' THEN
    INSERT INTO public.private_staff_members(name,job) VALUES(btrim(p_payload->>'name'),btrim(coalesce(p_payload->>'job','')));
  ELSIF p_action='member_active' THEN
    IF jsonb_typeof(p_payload->'active') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'Estado inválido'; END IF;
    UPDATE public.private_staff_members SET active=(p_payload->>'active')::boolean WHERE id=(p_payload->>'staff_id')::uuid;
    IF NOT FOUND THEN RAISE EXCEPTION 'Miembro no encontrado'; END IF;
  ELSIF p_action IN ('save_callup','confirm_callup') THEN
    IF w.callup_confirmed OR cardinality(active_ids)=0 THEN RAISE EXCEPTION 'Convocatoria cerrada o staff vacío'; END IF;
    IF jsonb_typeof(p_payload->'rows') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Revisa toda la convocatoria'; END IF;
    SELECT count(*),count(DISTINCT x->>'staff_id') INTO rows_count,total_yellows FROM jsonb_array_elements(p_payload->'rows') x;
    IF rows_count<>cardinality(active_ids) OR total_yellows<>rows_count OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_payload->'rows') x
      WHERE (x->>'staff_id') IS NULL OR NOT ((x->>'staff_id')::uuid=ANY(active_ids)) OR x->>'status' IS NULL
        OR x->>'status' NOT IN ('called_up','not_called','injured','doubt')) THEN RAISE EXCEPTION 'Revisa toda la convocatoria'; END IF;
    IF p_action='confirm_callup' AND s.type::text IN ('league_match','friendly_match','scrimmage')
      AND EXISTS(SELECT 1 FROM public.private_staff_suspensions sp JOIN jsonb_array_elements(p_payload->'rows') x ON (x->>'staff_id')::uuid=sp.staff_id WHERE sp.served_at IS NULL AND x->>'status'='called_up')
      AND coalesce((p_payload->>'acknowledge_sanctions')::boolean,false) IS DISTINCT FROM true THEN RAISE EXCEPTION 'Revisa los miembros convocados con sanción activa'; END IF;
    FOR item IN SELECT value FROM jsonb_array_elements(p_payload->'rows') LOOP
      INSERT INTO public.private_staff_callups VALUES(p_session,(item->>'staff_id')::uuid,item->>'status') ON CONFLICT(session_id,staff_id) DO UPDATE SET status=EXCLUDED.status;
    END LOOP;
    IF p_action='confirm_callup' THEN UPDATE public.private_staff_workflows SET callup_confirmed=true WHERE session_id=p_session; END IF;
  ELSIF p_action IN ('save_attendance','confirm_attendance') THEN
    IF NOT w.callup_confirmed OR w.attendance_confirmed THEN RAISE EXCEPTION 'Confirma convocatoria o reabre asistencia primero'; END IF;
    SELECT coalesce(array_agg(staff_id),ARRAY[]::uuid[]) INTO called_ids FROM public.private_staff_callups WHERE session_id=p_session AND status='called_up';
    IF jsonb_typeof(p_payload->'rows') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Revisa toda la asistencia'; END IF;
    SELECT count(*),count(DISTINCT x->>'staff_id') INTO rows_count,total_yellows FROM jsonb_array_elements(p_payload->'rows') x;
    IF rows_count=0 OR total_yellows<>rows_count OR EXISTS(SELECT 1 FROM unnest(called_ids) i WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p_payload->'rows') x WHERE (x->>'staff_id')::uuid=i))
      OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_payload->'rows') x WHERE x->>'staff_id' IS NULL OR NOT ((x->>'staff_id')::uuid=ANY(active_ids)) OR x->>'status' IS NULL) THEN RAISE EXCEPTION 'Selecciona la asistencia de todos los convocados'; END IF;
    FOR item IN SELECT value FROM jsonb_array_elements(p_payload->'rows') LOOP
      INSERT INTO public.private_staff_attendance VALUES(p_session,(item->>'staff_id')::uuid,(item->>'status')::public.attendance_status,nullif(btrim(item->>'notes'),''))
        ON CONFLICT(session_id,staff_id) DO UPDATE SET status=EXCLUDED.status,notes=EXCLUDED.notes;
    END LOOP;
    IF p_action='confirm_attendance' THEN UPDATE public.private_staff_workflows SET attendance_confirmed=true WHERE session_id=p_session; END IF;
  ELSIF p_action='reopen_callup' THEN
    IF w.attendance_confirmed THEN RAISE EXCEPTION 'Reabre primero la asistencia'; END IF;
    UPDATE public.private_staff_workflows SET callup_confirmed=false WHERE session_id=p_session;
  ELSIF p_action='reopen_attendance' THEN
    UPDATE public.private_staff_workflows SET attendance_confirmed=false WHERE session_id=p_session;
  ELSIF p_action='add_card' THEN
    pid:=(p_payload->>'staff_id')::uuid;
    IF NOT w.callup_confirmed OR NOT EXISTS(SELECT 1 FROM public.private_staff_callups WHERE session_id=p_session AND staff_id=pid AND status='called_up') THEN RAISE EXCEPTION 'Selecciona un miembro convocado'; END IF;
    INSERT INTO public.private_staff_cards(session_id,staff_id,type,reason) VALUES(p_session,pid,(p_payload->>'type')::public.card_type,btrim(p_payload->>'reason')) RETURNING id INTO cid;
    IF p_payload->>'type' IN ('double_yellow','straight_red') THEN
      INSERT INTO public.private_staff_suspensions(staff_id,source,card_id,matches_total) VALUES(pid,'card',cid,(p_payload->>'matches')::integer);
    ELSE
      SELECT count(*) INTO total_yellows FROM public.private_staff_cards WHERE staff_id=pid AND type::text='yellow';
      SELECT yellow_baseline INTO baseline FROM public.private_staff_members WHERE id=pid;
      IF total_yellows-baseline>=5 THEN INSERT INTO public.private_staff_suspensions(staff_id,source,card_id,matches_total) VALUES(pid,'yellow_accumulation',cid,1) ON CONFLICT DO NOTHING; END IF;
    END IF;
  ELSIF p_action='serve_suspension' THEN
    SELECT * INTO sanction FROM public.private_staff_suspensions WHERE id=(p_payload->>'suspension_id')::uuid;
    IF NOT FOUND OR sanction.served_at IS NOT NULL THEN RAISE EXCEPTION 'Sanción no encontrada o ya cumplida'; END IF;
    IF sanction.source='yellow_accumulation' THEN
      UPDATE public.private_staff_members SET yellow_baseline=(SELECT count(*) FROM public.private_staff_cards WHERE staff_id=sanction.staff_id AND type::text='yellow') WHERE id=sanction.staff_id;
    END IF;
    UPDATE public.private_staff_suspensions SET served_at=clock_timestamp(),served_by=auth.uid() WHERE id=sanction.id;
  ELSE RAISE EXCEPTION 'Acción desconocida'; END IF;
  UPDATE public.private_staff_control SET revision=revision+1;
  RETURN public.private_staff_workspace(p_session);
END $$;
REVOKE ALL ON FUNCTION public.private_staff_workspace(uuid),public.private_staff_action(uuid,text,jsonb,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.private_staff_workspace(uuid),public.private_staff_action(uuid,text,jsonb,bigint) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
