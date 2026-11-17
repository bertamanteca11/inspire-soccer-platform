-- MANUAL coordinated upgrade after the installed Batch 4 and private-access fixes.
-- One transaction. No historical sporting-row UPDATE/DELETE or automatic completion.
-- Existing card/suspension values are preserved; old cases require explicit review.
BEGIN;
SET LOCAL lock_timeout='5s';
DO $$ BEGIN
  IF current_user<>'postgres' THEN RAISE EXCEPTION 'Ejecuta la migración completa como postgres.'; END IF;
  IF to_regprocedure('public.batch4_actor_role()') IS NULL
    OR to_regprocedure('public.app_has_access()') IS NULL
    OR to_regclass('public.batch4_discipline_cycles') IS NULL
    OR to_regprocedure('public.batch4_save_card(uuid,uuid,text,text,integer,jsonb)') IS NULL THEN
    RAISE EXCEPTION 'Instalación Batch 4 requerida. No repitas su instalador.';
  END IF;
  IF to_regclass('public.discipline_rules') IS NOT NULL THEN
    RAISE EXCEPTION 'Esta migración ya está instalada. Ejecuta solo el diagnóstico posterior.';
  END IF;
END $$;

CREATE TABLE public.discipline_rules(
  singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
  revision integer NOT NULL DEFAULT 0,
  competition_name text NOT NULL DEFAULT 'Liga FCF' CHECK(length(btrim(competition_name)) BETWEEN 1 AND 120),
  season_start date NOT NULL,
  yellow_threshold integer NOT NULL DEFAULT 5 CHECK(yellow_threshold BETWEEN 1 AND 99),
  double_yellow_units integer CHECK(double_yellow_units BETWEEN 0 AND 2),
  yellow_red_units integer CHECK(yellow_red_units BETWEEN 0 AND 1)
);
INSERT INTO public.discipline_rules(singleton,season_start)
SELECT true,make_date(extract(year FROM d)::integer-CASE WHEN extract(month FROM d)<7 THEN 1 ELSE 0 END,7,1)
FROM (SELECT (statement_timestamp() AT TIME ZONE 'Europe/Copenhagen')::date d) x;

ALTER TABLE public.cards
  ADD COLUMN discipline_kind text CHECK(discipline_kind IN ('yellow','double_yellow','straight_red','yellow_red')),
  ADD COLUMN voided_at timestamptz,
  ADD COLUMN revision integer NOT NULL DEFAULT 0;
ALTER TABLE public.suspensions
  ALTER COLUMN matches_total DROP NOT NULL,
  ALTER COLUMN matches_total DROP DEFAULT,
  ADD COLUMN origin_card_id uuid REFERENCES public.cards(id),
  ADD COLUMN applicable_from date,
  ADD COLUMN decision_date date,
  ADD COLUMN decision_notes text CHECK(length(decision_notes)<=4000),
  ADD COLUMN accumulation_threshold integer CHECK(accumulation_threshold BETWEEN 1 AND 99),
  ADD COLUMN accumulation_offset bigint,
  ADD COLUMN discipline_season_start date,
  ADD COLUMN request_key uuid UNIQUE,
  ADD COLUMN needs_review boolean NOT NULL DEFAULT true,
  ADD COLUMN revision integer NOT NULL DEFAULT 0;
-- Known constraint definitions were inspected in the production read-only export.
ALTER TABLE public.suspensions DROP CONSTRAINT suspensions_source_check;
ALTER TABLE public.suspensions ADD CONSTRAINT suspensions_source_check
  CHECK(source IN ('yellow_accumulation','straight_red','double_yellow','yellow_red','manual'));
ALTER TABLE public.suspensions DROP CONSTRAINT suspensions_status_check;
ALTER TABLE public.suspensions ADD CONSTRAINT suspensions_status_check
  CHECK(status IN ('awaiting_decision','active','partially_served','served','cancelled'));
CREATE UNIQUE INDEX discipline_one_case_per_card ON public.suspensions(origin_card_id)
  WHERE origin_card_id IS NOT NULL AND source<>'yellow_accumulation';
CREATE UNIQUE INDEX discipline_one_case_per_cycle ON public.suspensions(player_id,discipline_season_start,accumulation_offset)
  WHERE source='yellow_accumulation' AND accumulation_offset IS NOT NULL;

CREATE TABLE public.discipline_service_matches(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  suspension_id uuid NOT NULL REFERENCES public.suspensions(id),
  player_id uuid NOT NULL REFERENCES public.players(id),
  session_id uuid NOT NULL REFERENCES public.sessions(id),
  verified_by uuid NOT NULL REFERENCES public.profiles(id),
  verified_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  notes text NOT NULL CHECK(length(btrim(notes)) BETWEEN 1 AND 4000),
  revoked_at timestamptz,revoked_by uuid REFERENCES public.profiles(id),revoke_reason text
);
-- Conservative default: one missed match can satisfy only ONE case per player.
CREATE UNIQUE INDEX discipline_one_case_per_served_match ON public.discipline_service_matches(player_id,session_id)
  WHERE revoked_at IS NULL;
-- Reopened attendance/callups must not contradict an already verified service.
-- Existing Batch 4 guards acquire the session lock before this additional check.
CREATE FUNCTION public.discipline_guard_participation() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE participates boolean; BEGIN
  IF TG_TABLE_NAME='attendance' THEN
    participates:=NEW.status::text IN ('present','late','justified_late') AND EXISTS(
      SELECT 1 FROM public.callups c WHERE c.session_id=NEW.session_id AND c.player_id=NEW.player_id
        AND c.status::text IN ('called_up','trial','guest_not_evaluable'));
  ELSE
    participates:=NEW.status::text IN ('called_up','trial','guest_not_evaluable') AND EXISTS(
      SELECT 1 FROM public.attendance a WHERE a.session_id=NEW.session_id AND a.player_id=NEW.player_id
        AND a.status::text IN ('present','late','justified_late'));
  END IF;
  IF participates AND EXISTS(SELECT 1 FROM public.discipline_service_matches v
    WHERE v.session_id=NEW.session_id AND v.player_id=NEW.player_id AND v.revoked_at IS NULL) THEN
    RAISE EXCEPTION 'Este partido figura como cumplimiento de una sanción. Revisa y corrige ese cumplimiento antes de registrar participación.' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.discipline_guard_participation() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER discipline_attendance_service_guard BEFORE INSERT OR UPDATE ON public.attendance
  FOR EACH ROW EXECUTE FUNCTION public.discipline_guard_participation();
CREATE TRIGGER discipline_callup_service_guard BEFORE INSERT OR UPDATE ON public.callups
  FOR EACH ROW EXECUTE FUNCTION public.discipline_guard_participation();
CREATE TABLE public.discipline_cycle_credits(
  suspension_id uuid PRIMARY KEY REFERENCES public.suspensions(id),
  player_id uuid NOT NULL REFERENCES public.players(id),
  units integer NOT NULL CHECK(units>0),
  season_start date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE public.discipline_audit(
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor uuid NOT NULL REFERENCES public.profiles(id),action text NOT NULL,
  entity_id uuid NOT NULL,before_data jsonb,after_data jsonb,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['discipline_rules','discipline_service_matches','discipline_cycle_credits','discipline_audit'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated',t);
    EXECUTE format('CREATE POLICY discipline_staff_read ON public.%I FOR SELECT TO authenticated USING ((SELECT public."current_role"()::text) IN (''admin'',''coach''))',t);
    EXECUTE format('CREATE POLICY app_members_only ON public.%I AS RESTRICTIVE FOR ALL TO PUBLIC USING ((SELECT public.app_has_access())) WITH CHECK ((SELECT public.app_has_access()))',t);
  END LOOP;
END $$;

CREATE FUNCTION public.discipline_yellow_count(p_kind text) RETURNS integer
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
  SELECT CASE p_kind WHEN 'yellow' THEN 1 WHEN 'double_yellow' THEN 2 WHEN 'yellow_red' THEN 1 ELSE 0 END
$$;
REVOKE ALL ON FUNCTION public.discipline_yellow_count(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.discipline_yellow_count(text) TO authenticated;

CREATE FUNCTION public.discipline_balance_rows() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
  WITH facts AS (
    SELECT p.id AS player_id,p.display_name,r.yellow_threshold,
      coalesce(sum(public.discipline_yellow_count(coalesce(c.discipline_kind,c.type::text))),0)::bigint AS historical_yellows,
      count(c.id) FILTER(WHERE coalesce(c.discipline_kind,c.type::text) IN ('straight_red','double_yellow','yellow_red')) AS historical_reds,
      count(c.id) FILTER(WHERE coalesce(c.discipline_kind,c.type::text)='double_yellow') AS second_yellow_dismissals,
      count(c.id) FILTER(WHERE coalesce(c.discipline_kind,c.type::text)='straight_red') AS direct_reds,
      count(c.id) FILTER(WHERE c.discipline_kind='yellow_red') AS yellow_red_dismissals,
      coalesce(sum(CASE WHEN s.type::text='league_match' AND s.session_date>=r.season_start
        AND s.session_date<(r.season_start+interval '1 year')::date THEN
        CASE coalesce(c.discipline_kind,c.type::text) WHEN 'yellow' THEN 1 WHEN 'double_yellow' THEN r.double_yellow_units
          WHEN 'yellow_red' THEN r.yellow_red_units ELSE 0 END ELSE 0 END),0)::bigint AS counted_yellows,
      count(c.id) FILTER(WHERE s.type::text='league_match' AND s.session_date>=r.season_start AND s.session_date<(r.season_start+interval '1 year')::date
        AND ((coalesce(c.discipline_kind,c.type::text)='double_yellow' AND r.double_yellow_units IS NULL)
          OR (c.discipline_kind='yellow_red' AND r.yellow_red_units IS NULL))) AS undecided_yellow_events
    FROM public.players p CROSS JOIN public.discipline_rules r
    LEFT JOIN public.cards c ON c.player_id=p.id AND c.voided_at IS NULL
    LEFT JOIN public.sessions s ON s.id=c.session_id
    GROUP BY p.id,p.display_name,r.yellow_threshold
  ), totals AS (
    SELECT f.*,coalesce(CASE WHEN b.baseline_at::date>=r.season_start AND b.baseline_at::date<(r.season_start+interval '1 year')::date THEN b.yellow_baseline ELSE 0 END,0)
      +coalesce((SELECT sum(k.units) FROM public.discipline_cycle_credits k WHERE k.player_id=f.player_id AND k.season_start=r.season_start),0) AS consumed_yellows,
      ((b.player_id IS NULL OR b.baseline_at::date<r.season_start OR b.baseline_at::date>=(r.season_start+interval '1 year')::date)
        AND EXISTS(SELECT 1 FROM public.suspensions s WHERE s.player_id=f.player_id AND s.source='yellow_accumulation' AND s.status='served'
        AND s.served_at::date>=r.season_start AND s.served_at::date<(r.season_start+interval '1 year')::date
        AND NOT EXISTS(SELECT 1 FROM public.discipline_cycle_credits k WHERE k.suspension_id=s.id))) AS missing_legacy_cycle
    FROM facts f CROSS JOIN public.discipline_rules r LEFT JOIN public.batch4_discipline_cycles b ON b.player_id=f.player_id
  ) SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.display_name,x.player_id),'[]'::jsonb) FROM (
    SELECT t.*,greatest(0,counted_yellows-consumed_yellows) AS cycle_yellows,
      (missing_legacy_cycle OR consumed_yellows>counted_yellows OR undecided_yellow_events>0) AS needs_cycle_review
    FROM totals t
  ) x
$$;
REVOKE ALL ON FUNCTION public.discipline_balance_rows() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.batch4_discipline_balances() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$ BEGIN
  IF auth.uid() IS NULL OR public.batch4_actor_role() IS NULL OR public.batch4_actor_role() NOT IN ('admin','coach') THEN
    RAISE EXCEPTION 'Staff only' USING ERRCODE='42501'; END IF;
  RETURN public.discipline_balance_rows();
END $$;

CREATE OR REPLACE VIEW public.player_card_totals WITH (security_invoker=true) AS
SELECT p.id AS player_id,p.display_name,
  coalesce(sum(public.discipline_yellow_count(coalesce(c.discipline_kind,c.type::text))),0)::bigint AS yellow_cards,
  count(c.id) FILTER(WHERE coalesce(c.discipline_kind,c.type::text) IN ('straight_red','double_yellow','yellow_red')) AS red_cards,
  count(c.id) AS total_cards
FROM public.players p LEFT JOIN public.cards c ON c.player_id=p.id AND c.voided_at IS NULL GROUP BY p.id,p.display_name;
CREATE OR REPLACE VIEW public.active_suspensions WITH (security_invoker=true) AS
SELECT s.id,s.player_id,p.display_name,s.source,s.matches_total,s.matches_served,
  CASE WHEN s.matches_total IS NULL THEN NULL ELSE greatest(s.matches_total-s.matches_served,0) END AS matches_remaining,
  s.status,s.reason,s.created_from_session_id,s.created_at,s.needs_review,s.applicable_from,s.origin_card_id,s.revision
FROM public.suspensions s JOIN public.players p ON p.id=s.player_id
WHERE s.status IN ('awaiting_decision','active','partially_served');

CREATE FUNCTION public.discipline_workspace(p_player uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE result jsonb; BEGIN
  IF auth.uid() IS NULL OR public.batch4_actor_role() IS NULL OR public.batch4_actor_role() NOT IN ('admin','coach') THEN
    RAISE EXCEPTION 'Staff only' USING ERRCODE='42501'; END IF;
  SELECT jsonb_build_object('version',2,'rules',(SELECT to_jsonb(r) FROM public.discipline_rules r),
    'balances',(SELECT coalesce(jsonb_agg(b),'[]'::jsonb) FROM jsonb_array_elements(public.discipline_balance_rows()) b WHERE p_player IS NULL OR (b->>'player_id')::uuid=p_player),
    'cases',coalesce((SELECT jsonb_agg(to_jsonb(q) ORDER BY q.created_at DESC,q.id) FROM (
      SELECT s.*,p.display_name,ss.name AS origin_match_name,ss.session_date AS origin_match_date,
        coalesce(s.origin_card_id,(SELECT m.card_id FROM public.batch4_card_suspensions m WHERE m.suspension_id=s.id)) AS linked_card_id,
        (SELECT count(*) FROM public.discipline_service_matches m WHERE m.suspension_id=s.id AND m.revoked_at IS NULL) AS verified_matches_served,
        CASE WHEN s.matches_total IS NULL THEN NULL ELSE greatest(s.matches_total-s.matches_served,0) END AS matches_remaining
      FROM public.suspensions s JOIN public.players p ON p.id=s.player_id LEFT JOIN public.sessions ss ON ss.id=s.created_from_session_id
      WHERE p_player IS NULL OR s.player_id=p_player
    ) q),'[]'::jsonb),
    'service_matches',coalesce((SELECT jsonb_agg(to_jsonb(m)||jsonb_build_object('session_name',s.name,'session_date',s.session_date) ORDER BY s.session_date,m.id)
      FROM public.discipline_service_matches m JOIN public.sessions s ON s.id=m.session_id WHERE p_player IS NULL OR m.player_id=p_player),'[]'::jsonb),
    'matches',coalesce((SELECT jsonb_agg(to_jsonb(q) ORDER BY q.session_date DESC,q.id) FROM (
      SELECT s.id,s.name,s.session_date,s.type,s.status,
        (SELECT a.status::text FROM public.attendance a WHERE a.session_id=s.id AND a.player_id=p_player) AS attendance_status,
        (SELECT c.status::text FROM public.callups c WHERE c.session_id=s.id AND c.player_id=p_player) AS callup_status
      FROM public.sessions s WHERE s.type::text='league_match' AND s.status::text='completed'
        AND s.session_date<=(statement_timestamp() AT TIME ZONE 'Europe/Copenhagen')::date
    ) q),'[]'::jsonb)) INTO result;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.discipline_workspace(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.discipline_workspace(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.batch4_reconcile_yellows(p_player uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE balance jsonb;r public.discipline_rules;origin public.cards;new_case public.suspensions; BEGIN
  PERFORM 1 FROM public.players WHERE id=p_player FOR UPDATE;
  SELECT * INTO r FROM public.discipline_rules;
  SELECT b INTO balance FROM jsonb_array_elements(public.discipline_balance_rows()) b WHERE (b->>'player_id')::uuid=p_player;
  IF (balance->>'needs_cycle_review')::boolean THEN RETURN; END IF;
  IF (balance->>'cycle_yellows')::bigint>=r.yellow_threshold AND NOT EXISTS(
    SELECT 1 FROM public.suspensions WHERE player_id=p_player AND source='yellow_accumulation'
      AND (status IN ('awaiting_decision','active','partially_served') OR (discipline_season_start=r.season_start AND accumulation_offset=(balance->>'consumed_yellows')::bigint))) THEN
    SELECT c.* INTO origin FROM public.cards c JOIN (
      SELECT q.id,sum(q.units) OVER(ORDER BY q.session_date,q.created_at,q.id) AS running_units FROM (
        SELECT c.id,c.created_at,s.session_date,CASE coalesce(c.discipline_kind,c.type::text)
          WHEN 'yellow' THEN 1 WHEN 'double_yellow' THEN coalesce(r.double_yellow_units,0)
          WHEN 'yellow_red' THEN coalesce(r.yellow_red_units,0) ELSE 0 END AS units
        FROM public.cards c JOIN public.sessions s ON s.id=c.session_id
      WHERE c.player_id=p_player AND c.voided_at IS NULL AND s.type::text='league_match'
        AND s.session_date>=r.season_start AND s.session_date<(r.season_start+interval '1 year')::date
      ) q
    ) counted ON counted.id=c.id WHERE counted.running_units>=(balance->>'consumed_yellows')::bigint+r.yellow_threshold
      AND (CASE coalesce(c.discipline_kind,c.type::text) WHEN 'yellow' THEN 1 WHEN 'double_yellow' THEN coalesce(r.double_yellow_units,0)
        WHEN 'yellow_red' THEN coalesce(r.yellow_red_units,0) ELSE 0 END)>0
      ORDER BY counted.running_units,c.created_at,c.id LIMIT 1;
    INSERT INTO public.suspensions(player_id,source,matches_total,matches_served,status,reason,created_from_session_id,origin_card_id,accumulation_threshold,accumulation_offset,discipline_season_start,needs_review)
      VALUES(p_player,'yellow_accumulation',NULL,0,'awaiting_decision','Acumulación de '||r.yellow_threshold||' amarillas de liga: confirmar resolución y aplicación',origin.session_id,origin.id,r.yellow_threshold,(balance->>'consumed_yellows')::bigint,r.season_start,false)
      RETURNING * INTO new_case;
    PERFORM public.discipline_log('accumulation_case',new_case.id,NULL,to_jsonb(new_case));
  END IF;
END $$;

-- Unsafe old clients must reload; no blind all-matches completion remains exposed.
CREATE OR REPLACE FUNCTION public.batch4_complete_suspension(p_suspension uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$ BEGIN
  RAISE EXCEPTION 'Selecciona y verifica los partidos cumplidos desde la nueva gestión de sanciones.' USING ERRCODE='42501';
END $$;
CREATE OR REPLACE FUNCTION public.batch4_initialize_discipline_cycle(p_suspension uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$ BEGIN
  RAISE EXCEPTION 'La cuenta histórica necesita revisión; no se reinicia desde el total actual.' USING ERRCODE='42501';
END $$;
CREATE OR REPLACE FUNCTION public.batch4_save_card(p_session uuid,p_player uuid,p_type text,p_reason text,p_matches integer,p_expected jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$ BEGIN
  RAISE EXCEPTION 'Actualiza la aplicación para guardar tarjetas con sanciones independientes.' USING ERRCODE='42501';
END $$;
DO $$ BEGIN
  IF to_regprocedure('public.advance_suspensions_for_match(uuid)') IS NOT NULL THEN
    EXECUTE $def$CREATE OR REPLACE FUNCTION public.advance_suspensions_for_match(match_session_id uuid) RETURNS void
      LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $body$ BEGIN
        RAISE EXCEPTION 'El cumplimiento debe verificarse por sanción y partido.' USING ERRCODE='42501';
      END $body$ $def$;
    REVOKE ALL ON FUNCTION public.advance_suspensions_for_match(uuid) FROM PUBLIC,anon,authenticated;
  END IF;
END $$;

CREATE FUNCTION public.discipline_log(p_action text,p_id uuid,p_before jsonb,p_after jsonb) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
  INSERT INTO public.discipline_audit(actor,action,entity_id,before_data,after_data) VALUES(auth.uid(),p_action,p_id,p_before,p_after)
$$;
REVOKE ALL ON FUNCTION public.discipline_log(text,uuid,jsonb,jsonb) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.discipline_refresh_case(p_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE s public.suspensions;n integer;credit integer;balance jsonb;current_season date; BEGIN
  SELECT * INTO s FROM public.suspensions WHERE id=p_id FOR UPDATE;
  IF s.needs_review OR s.status='cancelled' THEN RETURN; END IF;
  SELECT count(*) INTO n FROM public.discipline_service_matches WHERE suspension_id=s.id AND revoked_at IS NULL;
  IF s.matches_total IS NOT NULL AND n>s.matches_total THEN RAISE EXCEPTION 'La duración no puede ser inferior a los partidos verificados.'; END IF;
  UPDATE public.suspensions SET matches_served=n,
    status=CASE WHEN matches_total IS NULL THEN 'awaiting_decision' WHEN n=matches_total THEN 'served' WHEN n>0 THEN 'partially_served' ELSE 'active' END,
    served_at=CASE WHEN matches_total IS NOT NULL AND n=matches_total THEN coalesce(served_at,clock_timestamp()) ELSE NULL END,
    revision=revision+1 WHERE id=s.id RETURNING * INTO s;
  IF s.status='served' AND s.source='yellow_accumulation'
    AND NOT EXISTS(SELECT 1 FROM public.batch4_discipline_cycles b WHERE b.completed_suspension_id=s.id)
    AND NOT EXISTS(SELECT 1 FROM public.discipline_cycle_credits c WHERE c.suspension_id=s.id) THEN
    credit:=s.accumulation_threshold;
    IF credit IS NULL THEN RAISE EXCEPTION 'Revisa cuántas amarillas consume este ciclo histórico.'; END IF;
    SELECT season_start INTO current_season FROM public.discipline_rules;
    IF s.discipline_season_start IS DISTINCT FROM current_season OR NOT EXISTS(
      SELECT 1 FROM public.sessions origin WHERE origin.id=s.created_from_session_id
        AND origin.session_date>=s.discipline_season_start AND origin.session_date<(s.discipline_season_start+interval '1 year')::date) THEN
      RAISE EXCEPTION 'Revisa el origen y la temporada de este ciclo antes de consumir amarillas.'; END IF;
    SELECT b INTO balance FROM jsonb_array_elements(public.discipline_balance_rows()) b WHERE (b->>'player_id')::uuid=s.player_id;
    -- The case being completed is served at this point, but its credit is inserted
    -- below. Do not mistake this transaction's own case for an unreviewed legacy cycle.
    IF (balance->>'undecided_yellow_events')::bigint>0
      OR (balance->>'consumed_yellows')::bigint>(balance->>'counted_yellows')::bigint
      OR (balance->>'cycle_yellows')::bigint<credit
      OR ((balance->>'missing_legacy_cycle')::boolean AND EXISTS(
        SELECT 1 FROM public.suspensions older WHERE older.player_id=s.player_id AND older.id<>s.id
          AND older.source='yellow_accumulation' AND older.status='served'
          AND older.served_at::date>=current_season AND older.served_at::date<(current_season+interval '1 year')::date
          AND NOT EXISTS(SELECT 1 FROM public.discipline_cycle_credits c WHERE c.suspension_id=older.id))) THEN
      RAISE EXCEPTION 'El ciclo de amarillas necesita revisión antes de completarlo.'; END IF;
    INSERT INTO public.discipline_cycle_credits(suspension_id,player_id,units,season_start) VALUES(s.id,s.player_id,credit,s.discipline_season_start);
  END IF;
  IF s.status='served' AND s.source='yellow_accumulation' THEN PERFORM public.batch4_reconcile_yellows(s.player_id); END IF;
END $$;
REVOKE ALL ON FUNCTION public.discipline_refresh_case(uuid) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.discipline_save_card(p_session uuid,p_player uuid,p_type text,p_reason text,p_matches integer,p_expected jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE session_row public.sessions;old public.cards;saved public.cards;case_row public.suspensions;
  r public.discipline_rules;kind text;old_kind text;before_card jsonb;before_case jsonb;cutoff timestamptz;balance jsonb; BEGIN
  SELECT * INTO r FROM public.discipline_rules FOR SHARE;
  PERFORM public.batch4_assert_global_access(p_session,auth.uid());
  SELECT * INTO session_row FROM public.sessions WHERE id=p_session FOR UPDATE;
  IF session_row.evaluation_confirmed IS DISTINCT FROM false OR session_row.callup_confirmed IS DISTINCT FROM true
    OR session_row.attendance_confirmed IS DISTINCT FROM true OR session_row.type::text NOT IN ('league_match','friendly_match','tryout','scrimmage') THEN
    RAISE EXCEPTION 'Card workflow closed'; END IF;
  IF p_type IS NULL OR p_type NOT IN ('none','yellow','double_yellow','straight_red','yellow_red')
    OR (p_matches IS NOT NULL AND (p_matches<1 OR p_matches>99)) OR length(coalesce(p_reason,''))>4000 THEN
    RAISE EXCEPTION 'Invalid disciplinary selection'; END IF;
  IF p_type IN ('double_yellow','straight_red','yellow_red') AND nullif(btrim(p_reason),'') IS NULL THEN RAISE EXCEPTION 'Card reason required'; END IF;
  PERFORM 1 FROM public.players WHERE id=p_player FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Player not found'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.callups WHERE session_id=p_session AND player_id=p_player) THEN RAISE EXCEPTION 'Player not reviewed in callup'; END IF;
  IF (SELECT count(*) FROM public.cards WHERE session_id=p_session AND player_id=p_player AND voided_at IS NULL)>1 THEN
    RAISE EXCEPTION 'Multiple historical cards need manual review'; END IF;
  SELECT * INTO old FROM public.cards WHERE session_id=p_session AND player_id=p_player AND voided_at IS NULL;
  before_card:=to_jsonb(old);old_kind:=coalesce(old.discipline_kind,old.type::text);
  IF old.id IS NULL THEN
    IF p_expected IS NOT NULL AND p_expected<>'null'::jsonb THEN RAISE EXCEPTION 'Stale card snapshot; reload'; END IF;
  ELSIF jsonb_typeof(p_expected) IS DISTINCT FROM 'object' OR (before_card-'created_at') IS DISTINCT FROM (p_expected-'created_at'-'_case_revision') THEN
    RAISE EXCEPTION 'Stale card snapshot; reload'; END IF;
  SELECT greatest((SELECT baseline_at FROM public.batch4_discipline_cycles WHERE player_id=p_player),
    (SELECT max(created_at) FROM public.discipline_cycle_credits WHERE player_id=p_player)) INTO cutoff;
  IF old.id IS NOT NULL AND old.created_at<=cutoff AND old_kind<>p_type
    AND (public.discipline_yellow_count(old_kind)>0 OR public.discipline_yellow_count(p_type)>0) THEN
    RAISE EXCEPTION 'This historical card belongs to a completed accumulation cycle'; END IF;
  SELECT s.* INTO case_row FROM public.suspensions s WHERE s.source<>'yellow_accumulation' AND (
    s.origin_card_id=old.id OR s.id=(SELECT m.suspension_id FROM public.batch4_card_suspensions m WHERE m.card_id=old.id)) FOR UPDATE;
  before_case:=to_jsonb(case_row);
  IF case_row.id IS NOT NULL AND (p_expected->>'_case_revision')::integer IS DISTINCT FROM case_row.revision THEN
    RAISE EXCEPTION 'La decisión de sanción ha cambiado. Actualiza antes de modificar la tarjeta.' USING ERRCODE='40001'; END IF;
  IF case_row.id IS NOT NULL AND (case_row.matches_served>0 OR EXISTS(SELECT 1 FROM public.discipline_service_matches WHERE suspension_id=case_row.id AND revoked_at IS NULL))
    AND old_kind<>p_type THEN RAISE EXCEPTION 'Revisa el servicio de esta sanción antes de cambiar la tarjeta.'; END IF;
  IF p_type='none' THEN
    IF old.id IS NOT NULL THEN UPDATE public.cards SET voided_at=clock_timestamp(),revision=revision+1 WHERE id=old.id RETURNING * INTO saved; END IF;
  ELSE
    kind:=CASE WHEN p_type='yellow_red' THEN 'straight_red' ELSE p_type END;
    IF old.id IS NULL THEN
      INSERT INTO public.cards(session_id,player_id,type,discipline_kind,reason)
        VALUES(p_session,p_player,kind::public.card_type,p_type,nullif(btrim(p_reason),'')) RETURNING * INTO saved;
    ELSE
      UPDATE public.cards SET type=kind::public.card_type,discipline_kind=p_type,reason=nullif(btrim(p_reason),''),revision=revision+1
        WHERE id=old.id RETURNING * INTO saved;
    END IF;
  END IF;
  IF p_type IN ('double_yellow','straight_red','yellow_red') THEN
    IF case_row.id IS NULL THEN
      INSERT INTO public.suspensions(player_id,source,matches_total,matches_served,status,reason,created_from_session_id,origin_card_id,needs_review)
        VALUES(p_player,p_type,p_matches,0,CASE WHEN p_matches IS NULL THEN 'awaiting_decision' ELSE 'active' END,
          nullif(btrim(p_reason),''),p_session,saved.id,session_row.type::text<>'league_match') RETURNING * INTO case_row;
      INSERT INTO public.batch4_card_suspensions(card_id,suspension_id) VALUES(saved.id,case_row.id);
    ELSE
      IF case_row.needs_review THEN RAISE EXCEPTION 'Revisa la sanción histórica desde el botón Sanción antes de modificarla.'; END IF;
      UPDATE public.suspensions SET source=p_type,matches_total=p_matches,reason=nullif(btrim(p_reason),''),revision=revision+1
        WHERE id=case_row.id;
      PERFORM public.discipline_refresh_case(case_row.id);
      SELECT * INTO case_row FROM public.suspensions WHERE id=case_row.id;
    END IF;
  ELSIF case_row.id IS NOT NULL THEN
    UPDATE public.suspensions SET status='cancelled',decision_notes='Tarjeta corregida en la evaluación',revision=revision+1 WHERE id=case_row.id RETURNING * INTO case_row;
  END IF;
  IF old.id IS NOT NULL AND old_kind<>p_type THEN
    SELECT b INTO balance FROM jsonb_array_elements(public.discipline_balance_rows()) b WHERE (b->>'player_id')::uuid=p_player;
    IF EXISTS(SELECT 1 FROM public.suspensions a WHERE a.player_id=p_player AND a.source='yellow_accumulation'
      AND a.status IN ('awaiting_decision','active','partially_served')
      AND coalesce(a.accumulation_threshold,5)>(balance->>'cycle_yellows')::bigint) THEN
      RAISE EXCEPTION 'La corrección invalidaría una sanción por acumulación pendiente. Revisa y cancela esa decisión desde Sanción antes de corregir la tarjeta.';
    END IF;
  END IF;
  IF saved.id IS NOT NULL THEN PERFORM public.discipline_log('save_card',saved.id,before_card,to_jsonb(saved)); END IF;
  IF case_row.id IS NOT NULL THEN PERFORM public.discipline_log('card_case',case_row.id,before_case,to_jsonb(case_row)); END IF;
  PERFORM public.batch4_reconcile_yellows(p_player);
  RETURN jsonb_build_object('session_id',p_session,'player_id',p_player,'saved',true,'card',CASE WHEN p_type='none' THEN NULL ELSE to_jsonb(saved) END);
END $$;
REVOKE ALL ON FUNCTION public.discipline_save_card(uuid,uuid,text,text,integer,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.discipline_save_card(uuid,uuid,text,text,integer,jsonb) TO authenticated;

CREATE FUNCTION public.discipline_action(p_action text,p_payload jsonb,p_expected_revision integer DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE r public.discipline_rules;s public.suspensions;before_case jsonb;pid uuid;sid uuid;m public.sessions;origin public.sessions;
  service public.discipline_service_matches;n integer;duration integer;applicable date;decision date;notes text;review boolean;source text;request_id uuid; BEGIN
  IF auth.uid() IS NULL OR public.batch4_actor_role() IS NULL OR public.batch4_actor_role() NOT IN ('admin','coach') THEN
    RAISE EXCEPTION 'Staff only' USING ERRCODE='42501'; END IF;
  IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Datos de sanción inválidos.'; END IF;
  IF p_action='rules' THEN
    IF public.batch4_actor_role()<>'admin' THEN RAISE EXCEPTION 'Admin only' USING ERRCODE='42501'; END IF;
    SELECT * INTO r FROM public.discipline_rules FOR UPDATE;
    IF p_expected_revision IS DISTINCT FROM r.revision THEN RAISE EXCEPTION 'Las reglas han cambiado. Recarga antes de guardar.' USING ERRCODE='40001'; END IF;
    -- Once a known rule has been used, do not rewrite it across completed cycles.
    IF (p_payload->>'season_start')::date=r.season_start AND EXISTS(SELECT 1 FROM public.discipline_cycle_credits WHERE season_start=r.season_start) AND (
      (r.double_yellow_units IS NOT NULL AND (p_payload->>'double_yellow_units')::integer IS DISTINCT FROM r.double_yellow_units)
      OR (r.yellow_red_units IS NOT NULL AND (p_payload->>'yellow_red_units')::integer IS DISTINCT FROM r.yellow_red_units)) THEN
      RAISE EXCEPTION 'No se reescriben reglas de ciclos ya cumplidos. Revisión de temporada/competición necesaria.'; END IF;
    UPDATE public.discipline_rules SET yellow_threshold=(p_payload->>'yellow_threshold')::integer,
      double_yellow_units=(p_payload->>'double_yellow_units')::integer,yellow_red_units=(p_payload->>'yellow_red_units')::integer,
      competition_name=btrim(p_payload->>'competition_name'),season_start=(p_payload->>'season_start')::date,revision=revision+1 WHERE singleton=true;
    PERFORM public.discipline_log('rules',auth.uid(),to_jsonb(r),(SELECT to_jsonb(x) FROM public.discipline_rules x));
    FOR pid IN SELECT id FROM public.players ORDER BY id LOOP PERFORM public.batch4_reconcile_yellows(pid); END LOOP;
    RETURN public.discipline_workspace(NULL);
  END IF;
  SELECT * INTO r FROM public.discipline_rules FOR SHARE;
  sid:=nullif(p_payload->>'id','')::uuid;
  IF sid IS NOT NULL THEN SELECT * INTO s FROM public.suspensions WHERE id=sid;pid:=s.player_id;
  ELSE pid:=nullif(p_payload->>'player_id','')::uuid; END IF;
  IF pid IS NULL THEN RAISE EXCEPTION 'Jugador o sanción no encontrado.'; END IF;
  -- Match lock precedes player/case locks, matching the evaluation write order.
  IF p_action='serve_match' THEN
    SELECT * INTO m FROM public.sessions WHERE id=(p_payload->>'session_id')::uuid FOR UPDATE;
  END IF;
  PERFORM 1 FROM public.players WHERE id=pid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Player not found'; END IF;
  IF sid IS NOT NULL THEN
    SELECT * INTO s FROM public.suspensions WHERE id=sid FOR UPDATE;
    IF p_expected_revision IS DISTINCT FROM s.revision THEN RAISE EXCEPTION 'La sanción ha cambiado. Recarga antes de guardar.' USING ERRCODE='40001'; END IF;
    before_case:=to_jsonb(s);
  END IF;
  IF p_action='save_case' THEN
    duration:=nullif(p_payload->>'matches_total','')::integer;
    applicable:=nullif(p_payload->>'applicable_from','')::date;decision:=nullif(p_payload->>'decision_date','')::date;
    notes:=nullif(btrim(p_payload->>'decision_notes'),'');
    review:=coalesce((p_payload->>'review_history')::boolean,false);
    source:=coalesce(s.source,p_payload->>'source');
    SELECT * INTO origin FROM public.sessions WHERE id=coalesce(nullif(p_payload->>'origin_session_id','')::uuid,s.created_from_session_id);
    IF s.origin_card_id IS NOT NULL AND origin.id IS DISTINCT FROM s.created_from_session_id THEN
      RAISE EXCEPTION 'El origen de una sanción ligada a una tarjeta se conserva; corrige la tarjeta mediante su evaluación.'; END IF;
    IF applicable IS NOT NULL AND origin.id IS NOT NULL AND applicable<=origin.session_date THEN RAISE EXCEPTION 'La sanción solo puede aplicarse después del partido de origen.'; END IF;
    IF duration IS NOT NULL AND (duration<1 OR duration>99) THEN RAISE EXCEPTION 'La duración debe ser entre 1 y 99 partidos o quedar pendiente.'; END IF;
    IF s.id IS NULL THEN
      IF source<>'manual' THEN RAISE EXCEPTION 'Los casos nuevos sin tarjeta deben registrarse como manuales.'; END IF;
      request_id:=(p_payload->>'request_key')::uuid;
      IF request_id IS NULL OR notes IS NULL OR applicable IS NULL THEN RAISE EXCEPTION 'Indica motivo, fecha de aplicación y referencia de la sanción manual.'; END IF;
      IF EXISTS(SELECT 1 FROM public.suspensions WHERE request_key=request_id) THEN RETURN public.discipline_workspace(pid); END IF;
      INSERT INTO public.suspensions(player_id,source,matches_total,matches_served,status,reason,created_from_session_id,applicable_from,decision_date,decision_notes,needs_review,request_key)
        VALUES(pid,'manual',duration,0,CASE WHEN duration IS NULL THEN 'awaiting_decision' ELSE 'active' END,notes,
          nullif(p_payload->>'origin_session_id','')::uuid,applicable,decision,notes,false,request_id) RETURNING * INTO s;
    ELSE
      IF s.needs_review AND review AND notes IS NULL THEN RAISE EXCEPTION 'Explica la revisión de los registros históricos.'; END IF;
      SELECT count(*) INTO n FROM public.discipline_service_matches WHERE suspension_id=s.id AND revoked_at IS NULL;
      IF s.needs_review AND review AND s.source='yellow_accumulation' AND s.status='served'
        AND EXISTS(SELECT 1 FROM public.batch4_discipline_cycles b WHERE b.completed_suspension_id=s.id) AND n IS DISTINCT FROM duration THEN
        RAISE EXCEPTION 'El ciclo anterior ya está contabilizado. Verifica primero sus partidos cumplidos; no se vuelve a consumir la cuenta.'; END IF;
      IF s.needs_review AND NOT review AND (duration IS DISTINCT FROM s.matches_total OR coalesce((p_payload->>'cancelled')::boolean,false)) THEN
        RAISE EXCEPTION 'Confirma la revisión histórica antes de cambiar la decisión anterior.'; END IF;
      IF coalesce((p_payload->>'cancelled')::boolean,false) AND n>0 THEN RAISE EXCEPTION 'Revoca primero los partidos verificados antes de cancelar la sanción.'; END IF;
      IF EXISTS(SELECT 1 FROM public.discipline_service_matches v JOIN public.sessions played ON played.id=v.session_id
        WHERE v.suspension_id=s.id AND v.revoked_at IS NULL AND (applicable IS NULL OR played.session_date<applicable
          OR (origin.id IS NOT NULL AND played.session_date<=origin.session_date))) THEN
        RAISE EXCEPTION 'La nueva fecha u origen dejaría un partido verificado fuera de la sanción.'; END IF;
      IF EXISTS(SELECT 1 FROM public.discipline_cycle_credits c WHERE c.suspension_id=s.id) AND (
        duration IS DISTINCT FROM s.matches_total OR coalesce((p_payload->>'cancelled')::boolean,false)) THEN
        RAISE EXCEPTION 'Este ciclo ya consumió amarillas. No se modifica sin revisión del contador.'; END IF;
      UPDATE public.suspensions SET matches_total=duration,applicable_from=applicable,decision_date=decision,decision_notes=notes,
        created_from_session_id=coalesce(origin.id,created_from_session_id),
        -- The inspected legacy engine used a fixed five-yellow threshold.
        accumulation_threshold=CASE WHEN s.source='yellow_accumulation' THEN coalesce(accumulation_threshold,5) ELSE NULL END,
        discipline_season_start=CASE WHEN s.source='yellow_accumulation' THEN coalesce(discipline_season_start,r.season_start) ELSE discipline_season_start END,
        needs_review=CASE WHEN review THEN false ELSE needs_review END,
        matches_served=CASE WHEN review THEN n ELSE matches_served END,
        status=CASE WHEN coalesce((p_payload->>'cancelled')::boolean,false) THEN 'cancelled'
          WHEN status='cancelled' THEN CASE WHEN duration IS NULL THEN 'awaiting_decision' ELSE 'active' END ELSE status END,
        revision=revision+1 WHERE id=s.id RETURNING * INTO s;
    END IF;
    PERFORM public.discipline_refresh_case(s.id);
  ELSIF p_action='serve_match' THEN
    IF s.id IS NULL OR s.status='cancelled' OR (s.status='served' AND NOT s.needs_review) THEN RAISE EXCEPTION 'La sanción no admite partidos adicionales.'; END IF;
    SELECT * INTO origin FROM public.sessions WHERE id=s.created_from_session_id;
    notes:=nullif(btrim(p_payload->>'notes'),'');
    IF m.id IS NULL OR m.type::text<>'league_match' OR m.status::text<>'completed'
      OR m.session_date>(statement_timestamp() AT TIME ZONE 'Europe/Copenhagen')::date
      OR s.applicable_from IS NULL OR m.session_date<s.applicable_from
      OR (origin.id IS NOT NULL AND m.session_date<=origin.session_date)
      OR coalesce((p_payload->>'verified_not_played')::boolean,false) IS DISTINCT FROM true OR notes IS NULL THEN
      RAISE EXCEPTION 'Selecciona un partido de liga completado posterior al origen y aplicable a esta sanción; verifica que no jugó y explica el cumplimiento.'; END IF;
    IF EXISTS(SELECT 1 FROM public.attendance a JOIN public.callups c ON c.session_id=a.session_id AND c.player_id=a.player_id
      WHERE a.session_id=m.id AND a.player_id=pid AND a.status::text IN ('present','late','justified_late')
        AND c.status::text IN ('called_up','trial','guest_not_evaluable')) THEN
      RAISE EXCEPTION 'El jugador figura como participante en ese partido. Revisa los datos antes de registrar un cumplimiento.'; END IF;
    INSERT INTO public.discipline_service_matches(suspension_id,player_id,session_id,verified_by,notes)
      VALUES(s.id,pid,m.id,auth.uid(),notes);
    PERFORM public.discipline_refresh_case(s.id);
    -- Legacy service counters remain untouched until explicit historical review.
    IF s.needs_review THEN UPDATE public.suspensions SET revision=revision+1 WHERE id=s.id; END IF;
  ELSIF p_action='revoke_match' THEN
    IF EXISTS(SELECT 1 FROM public.discipline_cycle_credits c WHERE c.suspension_id=s.id) THEN
      RAISE EXCEPTION 'El ciclo completado ya consumió amarillas. Revisión del contador necesaria.'; END IF;
    notes:=nullif(btrim(p_payload->>'notes'),'');
    IF notes IS NULL THEN RAISE EXCEPTION 'Indica el motivo de la corrección.'; END IF;
    UPDATE public.discipline_service_matches SET revoked_at=clock_timestamp(),revoked_by=auth.uid(),revoke_reason=notes
      WHERE id=(p_payload->>'service_id')::uuid AND suspension_id=s.id AND revoked_at IS NULL RETURNING * INTO service;
    IF NOT FOUND THEN RAISE EXCEPTION 'Partido cumplido no encontrado o ya corregido.'; END IF;
    PERFORM public.discipline_refresh_case(s.id);
    IF s.needs_review THEN UPDATE public.suspensions SET revision=revision+1 WHERE id=s.id; END IF;
  ELSE RAISE EXCEPTION 'Acción de sanción no válida.'; END IF;
  SELECT * INTO s FROM public.suspensions WHERE id=s.id;
  PERFORM public.discipline_log(p_action,s.id,before_case,to_jsonb(s));
  RETURN public.discipline_workspace(pid);
END $$;
REVOKE ALL ON FUNCTION public.discipline_action(text,jsonb,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.discipline_action(text,jsonb,integer) TO authenticated;
REVOKE ALL ON FUNCTION public.batch4_reconcile_yellows(uuid) FROM PUBLIC,anon,authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
