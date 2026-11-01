-- REVIEW AND APPLY MANUALLY. Never run automatically at application startup.
-- Additive migration: no writes or policy changes to existing operational tables.
BEGIN;

CREATE FUNCTION public.veo_is_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
 SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id=auth.uid() AND role::text='admin')
$$;
CREATE FUNCTION public.veo_is_staff() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
 SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id=auth.uid() AND role::text IN ('admin','coach'))
$$;
REVOKE ALL ON FUNCTION public.veo_is_admin(),public.veo_is_staff() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.veo_is_admin(),public.veo_is_staff() TO authenticated;

CREATE TABLE public.veo_import_batches (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), namespace text NOT NULL, season text NOT NULL,
 content_hash text NOT NULL, file_hash text NOT NULL CHECK(file_hash ~ '^[a-fA-F0-9]{64}$'), filename text NOT NULL,
 status text NOT NULL DEFAULT 'published' CHECK(status IN ('published','reverted')),
 schema_version integer NOT NULL DEFAULT 1 CHECK(schema_version=1), rule_version text NOT NULL DEFAULT '2026-j5-v1',
 source_payload jsonb NOT NULL, before_state jsonb NOT NULL, after_versions jsonb NOT NULL,
 validation jsonb NOT NULL DEFAULT '{}', created_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 reverted_by uuid, reverted_at timestamptz,
 CHECK(season ~ '^20[0-9]{2}-20[0-9]{2}$'), CHECK(namespace ~ '^[a-z0-9][a-z0-9_-]{1,59}$')
);
CREATE INDEX veo_batches_history ON public.veo_import_batches(namespace,season,created_at DESC);
CREATE INDEX veo_batches_content ON public.veo_import_batches(namespace,season,content_hash);

CREATE TABLE public.veo_player_links (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), namespace text NOT NULL, source_key text NOT NULL,
 player_id uuid NOT NULL REFERENCES public.players(id) ON DELETE RESTRICT,
 source_name text NOT NULL, created_by uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(namespace,source_key,player_id)
);
-- Immutable reviewed links. More than one approved UUID for the same source key
-- remains ambiguous; UI must explicitly select one. Historical facts never remap.
CREATE INDEX veo_links_source ON public.veo_player_links(namespace,source_key);

CREATE TABLE public.veo_matches (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), namespace text NOT NULL, season text NOT NULL,
 round integer NOT NULL CHECK(round>0 AND round<=1000),
 session_id uuid NOT NULL UNIQUE REFERENCES public.sessions(id) ON DELETE RESTRICT,
 data jsonb NOT NULL, revision integer NOT NULL CHECK(revision>0), active boolean NOT NULL DEFAULT true,
 batch_id uuid NOT NULL REFERENCES public.veo_import_batches(id) ON DELETE RESTRICT,
 UNIQUE(namespace,season,round)
);
CREATE INDEX veo_matches_season ON public.veo_matches(season,namespace,round) WHERE active;
CREATE TABLE public.veo_player_match_stats (
 match_id uuid NOT NULL REFERENCES public.veo_matches(id) ON DELETE RESTRICT,
 player_id uuid NOT NULL REFERENCES public.players(id) ON DELETE RESTRICT,
 player_link_id uuid NOT NULL REFERENCES public.veo_player_links(id) ON DELETE RESTRICT,
 data jsonb NOT NULL, batch_id uuid NOT NULL REFERENCES public.veo_import_batches(id) ON DELETE RESTRICT,
 PRIMARY KEY(match_id,player_id)
);
CREATE INDEX veo_stats_player ON public.veo_player_match_stats(player_id,match_id);

ALTER TABLE public.veo_import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.veo_player_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.veo_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.veo_player_match_stats ENABLE ROW LEVEL SECURITY;
CREATE POLICY veo_batches_admin_read ON public.veo_import_batches FOR SELECT TO authenticated USING(public.veo_is_admin());
CREATE POLICY veo_links_admin_read ON public.veo_player_links FOR SELECT TO authenticated USING(public.veo_is_admin());
CREATE POLICY veo_matches_staff_read ON public.veo_matches FOR SELECT TO authenticated
 USING(public.veo_is_admin() OR (active AND public.veo_is_staff()));
CREATE POLICY veo_stats_staff_read ON public.veo_player_match_stats FOR SELECT TO authenticated
 USING(public.veo_is_admin() OR (public.veo_is_staff() AND EXISTS(SELECT 1 FROM public.veo_matches m WHERE m.id=match_id AND m.active)));
REVOKE ALL ON public.veo_import_batches,public.veo_player_links,public.veo_matches,public.veo_player_match_stats FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.veo_import_batches,public.veo_player_links,public.veo_matches,public.veo_player_match_stats TO authenticated;

CREATE FUNCTION public.veo_status() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
 IF NOT public.veo_is_staff() THEN RAISE EXCEPTION 'VEO: acceso reservado al staff' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('version',1,'ruleVersion','2026-j5-v1');
END $$;

-- Strict validation of raw inputs. Client-side calculated indices or money are
-- never authoritative; the database stores raw facts only.
CREATE FUNCTION public.veo_validate_fact(p jsonb) RETURNS void LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE k text; n numeric; keys text[] := ARRAY['goals','assists','yellowCards','redCards','distanceKm',
 'averageSpeedKmh','maxSpeedKmh','sprints','highIntensityRuns','totalEvents','shots','chances','tackles',
 'corners','freeKicks','throwIns','fouls','penalties','goalKicks','passes','successfulPasses','dribbles',
 'interceptions','recoveries','duels','saves'];
BEGIN
 IF EXISTS (SELECT 1 FROM jsonb_object_keys(p) AS field(key) WHERE key NOT IN
  ('playerKey','playerId','sourceKey','jersey','name','fullName','position','group',
   'eligible','profile','calledUp','starter','fcfMinutes','veoMinutes','metrics','notes'))
 THEN RAISE EXCEPTION 'VEO: campo de jugador desconocido' USING ERRCODE='22023'; END IF;
 IF jsonb_typeof(p) IS DISTINCT FROM 'object' OR jsonb_typeof(p->'metrics') IS DISTINCT FROM 'object' OR NOT coalesce((p->'metrics') ?& keys,false)
 OR jsonb_typeof(p->'playerId') IS DISTINCT FROM 'string'
 OR (p->>'playerId') IS DISTINCT FROM ((p->>'playerId')::uuid)::text
 OR (p->>'playerKey') IS DISTINCT FROM (p->>'playerId')
 OR NOT EXISTS(SELECT 1 FROM public.players WHERE id=(p->>'playerId')::uuid)
 OR jsonb_typeof(p->'fullName') IS DISTINCT FROM 'string' OR jsonb_typeof(p->'name') IS DISTINCT FROM 'string'
 OR jsonb_typeof(p->'sourceKey') IS DISTINCT FROM 'string'
 OR coalesce(length(btrim(p->>'fullName')),0) NOT BETWEEN 1 AND 240
 OR coalesce(length(btrim(p->>'name')),0) NOT BETWEEN 1 AND 240
 OR coalesce(p->>'sourceKey','') !~ '^[a-z0-9][a-z0-9 ]{0,239}$'
 OR jsonb_typeof(p->'calledUp') IS DISTINCT FROM 'boolean'
 OR jsonb_typeof(p->'starter') IS DISTINCT FROM 'boolean'
 OR NOT(p ? 'eligible') OR jsonb_typeof(p->'eligible') NOT IN ('boolean','null')
 THEN RAISE EXCEPTION 'VEO: identidad o estructura de jugador inválida' USING ERRCODE='22023'; END IF;
 IF NOT(p ? 'jersey') OR (p->'jersey'<>'null'::jsonb AND
  (jsonb_typeof(p->'jersey')<>'number' OR (p->>'jersey')::numeric NOT BETWEEN 0 AND 1000
   OR (p->>'jersey')::numeric<>trunc((p->>'jersey')::numeric)))
 THEN RAISE EXCEPTION 'VEO: dorsal invalido' USING ERRCODE='22023'; END IF;
 FOREACH k IN ARRAY ARRAY['position','group','profile','notes'] LOOP
  IF p ? k AND jsonb_typeof(p->k) NOT IN('string','null') THEN RAISE EXCEPTION 'VEO: texto de jugador inválido'; END IF;
 END LOOP;
 FOR k IN SELECT jsonb_object_keys(p->'metrics') LOOP
  IF NOT(k=ANY(keys)) THEN RAISE EXCEPTION 'VEO: métrica desconocida %',k USING ERRCODE='22023'; END IF;
  IF (p->'metrics'->k)<>'null'::jsonb THEN
   IF jsonb_typeof(p->'metrics'->k)<>'number' THEN RAISE EXCEPTION 'VEO: métrica no numérica %',k USING ERRCODE='22023'; END IF;
   n:=(p->'metrics'->>k)::numeric;
   IF n<0 OR n>1000000000 OR (k NOT IN('distanceKm','averageSpeedKmh','maxSpeedKmh') AND n<>trunc(n))
   THEN RAISE EXCEPTION 'VEO: métrica fuera de rango %',k USING ERRCODE='22023'; END IF;
  END IF;
 END LOOP;
 FOREACH k IN ARRAY ARRAY['fcfMinutes','veoMinutes'] LOOP
  IF NOT(p ? k) OR ((p->k)<>'null'::jsonb AND (jsonb_typeof(p->k)<>'number' OR (p->>k)::numeric<0 OR (p->>k)::numeric>10000))
  THEN RAISE EXCEPTION 'VEO: minutos inválidos' USING ERRCODE='22023'; END IF;
 END LOOP;
 IF (p->'metrics'->>'successfulPasses')::numeric > (p->'metrics'->>'passes')::numeric
 OR ((p->'metrics'->>'successfulPasses') IS NOT NULL AND (p->'metrics'->>'passes') IS NULL)
 OR ((p->>'starter')::boolean AND NOT(p->>'calledUp')::boolean)
 THEN RAISE EXCEPTION 'VEO: participación o pases incoherentes' USING ERRCODE='22023'; END IF;
END $$;

CREATE FUNCTION public.veo_publish_import(p_payload jsonb,p_expected_versions jsonb,p_approved boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE ns text; se text; item jsonb; fact jsonb; old public.veo_matches%ROWTYPE;
 batch uuid:=gen_random_uuid(); mid uuid; link uuid; before_rows jsonb:='[]'; after_rows jsonb:='{}';
 data jsonb; before_stats jsonb; same boolean:=true; item_same boolean; changed_rounds integer[]:='{}'; canonical jsonb; round_no integer; ids uuid[]:='{}';
 session_date date; session_type text; expected integer; cnt integer:=0; side jsonb; metric record;
BEGIN
 IF NOT public.veo_is_admin() OR auth.uid() IS NULL THEN RAISE EXCEPTION 'VEO: solo administradores pueden publicar' USING ERRCODE='42501'; END IF;
 IF p_approved IS DISTINCT FROM true THEN RAISE EXCEPTION 'VEO: falta aprobación explícita' USING ERRCODE='22023'; END IF;
 ns:=p_payload->>'namespace'; se:=p_payload->>'season';
 IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object'
 OR p_payload->'version' IS DISTINCT FROM '1'::jsonb OR ns IS NULL OR ns !~ '^[a-z0-9][a-z0-9_-]{1,59}$'
 OR se IS NULL OR se !~ '^20[0-9]{2}-20[0-9]{2}$' OR substring(se,6,4)::integer<>substring(se,1,4)::integer+1
 OR coalesce(p_payload->>'fileHash','') !~ '^[a-fA-F0-9]{64}$'
 OR jsonb_typeof(p_payload->'filename') IS DISTINCT FROM 'string'
 OR coalesce(length(btrim(p_payload->>'filename')),0) NOT BETWEEN 1 AND 255
 OR jsonb_typeof(p_payload->'matches') IS DISTINCT FROM 'array'
 OR jsonb_typeof(p_expected_versions) IS DISTINCT FROM 'object' OR octet_length(p_payload::text)>10000000
 THEN RAISE EXCEPTION 'VEO: lote o temporada inválidos' USING ERRCODE='22023'; END IF;
 IF jsonb_array_length(p_payload->'matches') NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'VEO: número de partidos inválido'; END IF;
 IF (SELECT count(*)<>count(DISTINCT value->>'round') FROM jsonb_array_elements(p_payload->'matches'))
 THEN RAISE EXCEPTION 'VEO: jornadas duplicadas' USING ERRCODE='23505'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('veo:'||ns||':'||se));
 -- Validate EVERYTHING before mutating any VEO table.
 FOR item IN SELECT value FROM jsonb_array_elements(p_payload->'matches') LOOP
  IF EXISTS (SELECT 1 FROM jsonb_object_keys(item) AS field(key) WHERE key NOT IN
   ('id','namespace','season','round','date','opponent','venue','goalsFor','goalsAgainst',
    'manualMvp','manualMvpReason','notes','field','fcfReference','coach','sessionId',
    'revision','batchId','active','teams','players'))
  THEN RAISE EXCEPTION 'VEO: campo de partido desconocido' USING ERRCODE='22023'; END IF;
  IF jsonb_typeof(item) IS DISTINCT FROM 'object'
   OR jsonb_typeof(item->'round') IS DISTINCT FROM 'number'
   OR (item->>'round')::numeric NOT BETWEEN 1 AND 1000
   OR (item->>'round')::numeric<>trunc((item->>'round')::numeric)
   OR jsonb_typeof(item->'sessionId') IS DISTINCT FROM 'string'
   OR coalesce(item->>'date','') !~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}$'
  THEN RAISE EXCEPTION 'VEO: jornada, fecha o sesion invalida' USING ERRCODE='22023'; END IF;
  round_no:=(item->>'round')::numeric::integer;
  IF round_no NOT BETWEEN 1 AND 1000 OR item->>'namespace' IS DISTINCT FROM ns OR item->>'season' IS DISTINCT FROM se
   OR jsonb_typeof(item->'players') IS DISTINCT FROM 'array' OR jsonb_array_length(item->'players') NOT BETWEEN 1 AND 500
   OR jsonb_typeof(item->'teams') IS DISTINCT FROM 'array' OR jsonb_array_length(item->'teams')>1
 OR jsonb_typeof(item->'opponent') IS DISTINCT FROM 'string' OR jsonb_typeof(item->'date') IS DISTINCT FROM 'string'
 OR jsonb_typeof(item->'round') IS DISTINCT FROM 'number'
 OR coalesce(length(item->>'opponent'),0) NOT BETWEEN 1 AND 240
  THEN RAISE EXCEPTION 'VEO: partido inválido' USING ERRCODE='22023'; END IF;
  SELECT s.session_date,s.type::text INTO session_date,session_type FROM public.sessions s WHERE s.id=(item->>'sessionId')::uuid FOR SHARE;
  IF session_date IS NULL OR session_date IS DISTINCT FROM (item->>'date')::date
    OR session_type NOT IN('league_match','friendly_match','scrimmage','tryout')
  THEN RAISE EXCEPTION 'VEO: confirma una sesión de partido con la misma fecha' USING ERRCODE='22023'; END IF;
  IF extract(year FROM session_date)::integer NOT IN(substring(se,1,4)::integer,substring(se,6,4)::integer) THEN RAISE EXCEPTION 'VEO: fecha fuera de la temporada'; END IF;
  FOR metric IN SELECT key,value FROM jsonb_each(item) WHERE key IN('venue','manualMvp','manualMvpReason','notes','field','fcfReference','coach') LOOP
   IF jsonb_typeof(metric.value) NOT IN('string','null') THEN RAISE EXCEPTION 'VEO: texto de partido inválido'; END IF;
  END LOOP;
  IF (item->>'sessionId')::uuid=ANY(ids) THEN RAISE EXCEPTION 'VEO: sesión repetida' USING ERRCODE='23505'; END IF;
  ids:=array_append(ids,(item->>'sessionId')::uuid);
  FOR metric IN SELECT key,value FROM jsonb_each(item) WHERE key IN('goalsFor','goalsAgainst') LOOP
   IF metric.value<>'null'::jsonb AND (jsonb_typeof(metric.value)<>'number' OR metric.value::text::numeric<0 OR metric.value::text::numeric>1000 OR metric.value::text::numeric<>trunc(metric.value::text::numeric))
   THEN RAISE EXCEPTION 'VEO: marcador inválido'; END IF;
  END LOOP;
  IF NOT(item ?& ARRAY['goalsFor','goalsAgainst']) THEN RAISE EXCEPTION 'VEO: falta marcador (puede ser null)'; END IF;
  FOR side IN SELECT value FROM jsonb_array_elements(item->'teams') LOOP
   IF jsonb_typeof(side->'inspire') IS DISTINCT FROM 'object' OR jsonb_typeof(side->'opponent') IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'VEO: equipo/rival inválido'; END IF;
   FOR metric IN SELECT value FROM jsonb_each(side->'inspire') UNION ALL SELECT value FROM jsonb_each(side->'opponent') LOOP
    IF metric.value<>'null'::jsonb AND (jsonb_typeof(metric.value)<>'number' OR metric.value::text::numeric<0 OR metric.value::text::numeric>1000000000) THEN RAISE EXCEPTION 'VEO: estadística de equipo inválida'; END IF;
   END LOOP;
  END LOOP;
  IF (SELECT count(*)<>count(DISTINCT value->>'playerId') FROM jsonb_array_elements(item->'players')) THEN RAISE EXCEPTION 'VEO: jugador duplicado en partido' USING ERRCODE='23505'; END IF;
  FOR fact IN SELECT value FROM jsonb_array_elements(item->'players') LOOP PERFORM public.veo_validate_fact(fact); END LOOP;
  SELECT * INTO old FROM public.veo_matches WHERE namespace=ns AND season=se AND round=round_no FOR UPDATE;
  data:=item-'id'-'players'-'revision'-'batchId'-'active';
  item_same:=NOT(old.id IS NULL OR NOT old.active OR old.data IS DISTINCT FROM data
   OR (SELECT coalesce(jsonb_agg(s.data ORDER BY s.player_id),'[]') FROM public.veo_player_match_stats s WHERE s.match_id=old.id)
      IS DISTINCT FROM (SELECT jsonb_agg(value ORDER BY (value->>'playerId')::uuid) FROM jsonb_array_elements(item->'players')));
  IF jsonb_typeof(p_expected_versions->round_no::text) IS DISTINCT FROM 'number'
   OR (p_expected_versions->>round_no::text)::numeric NOT BETWEEN 0 AND 2147483647
   OR (p_expected_versions->>round_no::text)::numeric<>trunc((p_expected_versions->>round_no::text)::numeric)
  THEN RAISE EXCEPTION 'VEO: revision esperada invalida' USING ERRCODE='22023'; END IF;
  expected:=(p_expected_versions->>round_no::text)::numeric::integer;
  IF expected IS NULL OR (expected<>coalesce(old.revision,0) AND NOT item_same) THEN RAISE EXCEPTION 'VEO: el partido cambió desde la previsualización; recarga y revisa' USING ERRCODE='40001'; END IF;
  IF NOT item_same THEN same:=false; changed_rounds:=array_append(changed_rounds,round_no); END IF;
 END LOOP;
 IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_payload->'matches') m,
  LATERAL jsonb_array_elements(m->'players') f GROUP BY f->>'sourceKey'
  HAVING count(DISTINCT f->>'playerId')>1)
 THEN RAISE EXCEPTION 'VEO: correspondencias inconsistentes' USING ERRCODE='22023'; END IF;
 IF same THEN RETURN jsonb_build_object('noOp',true,'batchId',NULL,'message','Datos idénticos; no se crea otro lote'); END IF;
 SELECT jsonb_agg((m-'players'-'id'-'revision'-'batchId'-'active') ||
  jsonb_build_object('players',(SELECT jsonb_agg(f ORDER BY (f->>'playerId')::uuid)
   FROM jsonb_array_elements(m->'players') f)) ORDER BY (m->>'round')::numeric)
 INTO canonical FROM jsonb_array_elements(p_payload->'matches') m;
 INSERT INTO public.veo_import_batches(id,namespace,season,content_hash,file_hash,filename,source_payload,before_state,after_versions,validation,created_by)
 VALUES(batch,ns,se,md5(canonical::text),p_payload->>'fileHash',p_payload->>'filename',p_payload,'[]','{}',jsonb_build_object('approved',true,'serverValidated',true),auth.uid());
 FOR item IN SELECT value FROM jsonb_array_elements(p_payload->'matches') LOOP
  round_no:=(item->>'round')::numeric::integer;
  IF NOT(round_no=ANY(changed_rounds)) THEN CONTINUE; END IF;
  SELECT * INTO old FROM public.veo_matches WHERE namespace=ns AND season=se AND round=round_no;
  SELECT coalesce(jsonb_agg(to_jsonb(s)),'[]') INTO before_stats FROM public.veo_player_match_stats s WHERE s.match_id=old.id;
  before_rows:=before_rows||jsonb_build_array(jsonb_build_object('round',round_no,'match',CASE WHEN old.id IS NULL THEN NULL ELSE to_jsonb(old) END,'stats',before_stats));
  mid:=coalesce(old.id,gen_random_uuid()); data:=item-'id'-'players'-'revision'-'batchId'-'active';
  INSERT INTO public.veo_matches(id,namespace,season,round,session_id,data,revision,active,batch_id)
   VALUES(mid,ns,se,round_no,(item->>'sessionId')::uuid,data,coalesce(old.revision,0)+1,true,batch)
   ON CONFLICT(namespace,season,round) DO UPDATE SET session_id=excluded.session_id,data=excluded.data,
    revision=excluded.revision,active=true,batch_id=batch;
  DELETE FROM public.veo_player_match_stats WHERE match_id=mid;
  FOR fact IN SELECT value FROM jsonb_array_elements(item->'players') LOOP
   INSERT INTO public.veo_player_links(namespace,source_key,player_id,source_name,created_by)
    VALUES(ns,fact->>'sourceKey',(fact->>'playerId')::uuid,fact->>'fullName',auth.uid()) ON CONFLICT(namespace,source_key,player_id) DO NOTHING;
   SELECT id INTO link FROM public.veo_player_links WHERE namespace=ns AND source_key=fact->>'sourceKey' AND player_id=(fact->>'playerId')::uuid;
   INSERT INTO public.veo_player_match_stats(match_id,player_id,player_link_id,data,batch_id) VALUES(mid,(fact->>'playerId')::uuid,link,fact,batch);
  END LOOP;
  after_rows:=after_rows||jsonb_build_object(mid::text,coalesce(old.revision,0)+1); cnt:=cnt+1;
 END LOOP;
 UPDATE public.veo_import_batches SET before_state=before_rows,after_versions=after_rows WHERE id=batch;
 RETURN jsonb_build_object('noOp',false,'batchId',batch,'matches',cnt);
END $$;

CREATE FUNCTION public.veo_revert_import(p_batch_id uuid,p_approved boolean DEFAULT false) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE b public.veo_import_batches%ROWTYPE; item jsonb; previous jsonb; fact jsonb; current_row public.veo_matches%ROWTYPE; expected record;
BEGIN
 IF NOT public.veo_is_admin() OR auth.uid() IS NULL THEN RAISE EXCEPTION 'VEO: solo administradores pueden retirar lotes' USING ERRCODE='42501'; END IF;
 IF p_approved IS DISTINCT FROM true THEN RAISE EXCEPTION 'VEO: falta aprobación explícita'; END IF;
 SELECT * INTO b FROM public.veo_import_batches WHERE id=p_batch_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'VEO: lote no encontrado'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('veo:'||b.namespace||':'||b.season));
 SELECT * INTO b FROM public.veo_import_batches WHERE id=p_batch_id FOR UPDATE;
 IF b.status='reverted' THEN RETURN jsonb_build_object('noOp',true); END IF;
 FOR expected IN SELECT key,value FROM jsonb_each_text(b.after_versions) LOOP
  IF NOT EXISTS(SELECT 1 FROM public.veo_matches WHERE id=expected.key::uuid AND revision>=expected.value::integer AND batch_id=b.id)
  THEN RAISE EXCEPTION 'VEO: existen revisiones posteriores; no se retira un lote antiguo' USING ERRCODE='40001'; END IF;
 END LOOP;
 FOR item IN SELECT value FROM jsonb_array_elements(b.before_state) LOOP
  SELECT * INTO current_row FROM public.veo_matches WHERE namespace=b.namespace AND season=b.season AND round=(item->>'round')::integer;
  previous:=item->'match';
  DELETE FROM public.veo_player_match_stats WHERE match_id=current_row.id;
  IF previous='null'::jsonb THEN
   UPDATE public.veo_matches SET active=false,revision=revision+1 WHERE id=current_row.id;
  ELSE
   UPDATE public.veo_matches SET session_id=(previous->>'session_id')::uuid,data=previous->'data',
    active=(previous->>'active')::boolean,batch_id=(previous->>'batch_id')::uuid,revision=current_row.revision+1 WHERE id=current_row.id;
   FOR fact IN SELECT value FROM jsonb_array_elements(item->'stats') LOOP
    INSERT INTO public.veo_player_match_stats(match_id,player_id,player_link_id,data,batch_id)
    VALUES(current_row.id,(fact->>'player_id')::uuid,(fact->>'player_link_id')::uuid,fact->'data',(fact->>'batch_id')::uuid);
   END LOOP;
  END IF;
 END LOOP;
 UPDATE public.veo_import_batches SET status='reverted',reverted_at=now(),reverted_by=auth.uid() WHERE id=b.id;
 RETURN jsonb_build_object('noOp',false,'batchId',b.id,'reverted',true);
END $$;

REVOKE ALL ON FUNCTION public.veo_validate_fact(jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.veo_status(),public.veo_publish_import(jsonb,jsonb,boolean),public.veo_revert_import(uuid,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.veo_status(),public.veo_publish_import(jsonb,jsonb,boolean),public.veo_revert_import(uuid,boolean) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
