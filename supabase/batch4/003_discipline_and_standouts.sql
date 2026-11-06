-- LOCAL RELEASE DRAFT. Validate in the isolated database before manual approval.
-- Requires 001, 001a and 002. No historical inserts, resets or deduplication.
BEGIN;
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
COMMIT;
