-- Schema-only test fixture derived from the user-supplied 2026-11-06 diagnostic.
-- No production records. PGlite adaptations: UUID defaults use gen_random_uuid;
-- auth.users/auth.uid are synthetic. current_role matches the supplied follow-up.
DO $$ BEGIN CREATE ROLE anon; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role BYPASSRLS; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
CREATE TYPE public."attendance_status" AS ENUM ('present','late','justified_late','justified_absence','unjustified_absence','injured','injured_present','injured_justified_absence','injured_unjustified_absence');
CREATE TYPE public."callup_status" AS ENUM ('called_up','trial','guest_not_evaluable','injured','doubt','not_called');
CREATE TYPE public."card_type" AS ENUM ('yellow','double_yellow','straight_red');
CREATE TYPE public."injury_status" AS ENUM ('active','recovered','pending_review','minor_discomfort');
CREATE TYPE public."player_position" AS ENUM ('goalkeeper','defender','midfielder','winger','forward');
CREATE TYPE public."player_status" AS ENUM ('active','injured','inactive','trial','guest');
CREATE TYPE public."session_status" AS ENUM ('planned','completed','cancelled','locked','archived');
CREATE TYPE public."session_type" AS ENUM ('training','league_match','friendly_match','tryout','scrimmage');
CREATE TYPE public."user_role" AS ENUM ('admin','coach','viewer');
CREATE TABLE public."attendance"(
  "id" "pg_catalog"."uuid" DEFAULT gen_random_uuid() NOT NULL,
  "session_id" "pg_catalog"."uuid" NOT NULL,
  "player_id" "pg_catalog"."uuid" NOT NULL,
  "status" "public"."attendance_status" DEFAULT 'present'::attendance_status NOT NULL,
  "notes" "pg_catalog"."text",
  "submitted_by" "pg_catalog"."uuid",
  "submitted_at" "pg_catalog"."timestamptz" DEFAULT now() NOT NULL
);
CREATE TABLE public."callups"(
  "id" "pg_catalog"."uuid" DEFAULT gen_random_uuid() NOT NULL,
  "session_id" "pg_catalog"."uuid" NOT NULL,
  "player_id" "pg_catalog"."uuid" NOT NULL,
  "status" "public"."callup_status" DEFAULT 'called_up'::callup_status NOT NULL,
  "evaluable" "pg_catalog"."bool" DEFAULT true NOT NULL,
  "notes" "pg_catalog"."text",
  "created_at" "pg_catalog"."timestamptz" DEFAULT now() NOT NULL
);
CREATE TABLE public."cards"(
  "id" "pg_catalog"."uuid" DEFAULT gen_random_uuid() NOT NULL,
  "session_id" "pg_catalog"."uuid" NOT NULL,
  "player_id" "pg_catalog"."uuid" NOT NULL,
  "type" "public"."card_type" NOT NULL,
  "minute" "pg_catalog"."text",
  "reason" "pg_catalog"."text",
  "notes" "pg_catalog"."text",
  "created_at" "pg_catalog"."timestamptz" DEFAULT now() NOT NULL
);
CREATE TABLE public."evaluations"(
  "id" "pg_catalog"."uuid" DEFAULT gen_random_uuid() NOT NULL,
  "session_id" "pg_catalog"."uuid" NOT NULL,
  "player_id" "pg_catalog"."uuid" NOT NULL,
  "tactical_discipline" "pg_catalog"."int4" DEFAULT 3 NOT NULL,
  "effort_commitment" "pg_catalog"."int4" DEFAULT 3 NOT NULL,
  "decision_making" "pg_catalog"."int4" DEFAULT 3 NOT NULL,
  "mentality_attitude" "pg_catalog"."int4" DEFAULT 3 NOT NULL,
  "coachability" "pg_catalog"."int4" DEFAULT 3 NOT NULL,
  "comment" "pg_catalog"."text",
  "evaluated" "pg_catalog"."bool" DEFAULT false NOT NULL,
  "submitted_by" "pg_catalog"."uuid",
  "submitted_at" "pg_catalog"."timestamptz" DEFAULT now() NOT NULL,
  "total_score" "pg_catalog"."numeric",
  "not_applicable" "pg_catalog"."bool" DEFAULT false NOT NULL,
  "na_fields" "pg_catalog"."jsonb" DEFAULT '{}'::jsonb NOT NULL
);
CREATE TABLE public."must_win_reviews"(
  "id" "pg_catalog"."uuid" DEFAULT gen_random_uuid() NOT NULL,
  "player_id" "pg_catalog"."uuid" NOT NULL,
  "month_start" "pg_catalog"."date" NOT NULL,
  "trusted" "pg_catalog"."bool" NOT NULL,
  "notes" "pg_catalog"."text",
  "created_by" "pg_catalog"."uuid" DEFAULT auth.uid(),
  "updated_at" "pg_catalog"."timestamptz" DEFAULT now() NOT NULL
);
CREATE TABLE public."players"(
  "id" "pg_catalog"."uuid" DEFAULT gen_random_uuid() NOT NULL,
  "name" "pg_catalog"."text" NOT NULL,
  "nickname" "pg_catalog"."text",
  "display_name" "pg_catalog"."text",
  "position" "public"."player_position",
  "shirt_number" "pg_catalog"."int4",
  "status" "public"."player_status" DEFAULT 'active'::player_status NOT NULL,
  "notes" "pg_catalog"."text",
  "created_at" "pg_catalog"."timestamptz" DEFAULT now() NOT NULL,
  "minutes_played_total" "pg_catalog"."int4" DEFAULT 0 NOT NULL,
  "suspended_matches" "pg_catalog"."int4" DEFAULT 0,
  "birth_date" "pg_catalog"."date",
  "career_notes" "pg_catalog"."text",
  "photo_url" "pg_catalog"."text"
);
CREATE TABLE public."profiles"(
  "id" "pg_catalog"."uuid" NOT NULL,
  "email" "pg_catalog"."text" NOT NULL,
  "full_name" "pg_catalog"."text",
  "role" "public"."user_role" DEFAULT 'viewer'::user_role NOT NULL,
  "created_at" "pg_catalog"."timestamptz" DEFAULT now() NOT NULL
);
CREATE TABLE public."session_standouts"(
  "id" "pg_catalog"."uuid" DEFAULT gen_random_uuid() NOT NULL,
  "session_id" "pg_catalog"."uuid" NOT NULL,
  "player_id" "pg_catalog"."uuid" NOT NULL,
  "category" "pg_catalog"."text" NOT NULL,
  "rank" "pg_catalog"."int2" NOT NULL,
  "notes" "pg_catalog"."text",
  "created_at" "pg_catalog"."timestamptz" DEFAULT now() NOT NULL,
  "updated_at" "pg_catalog"."timestamptz" DEFAULT now() NOT NULL
);
CREATE TABLE public."sessions"(
  "id" "pg_catalog"."uuid" DEFAULT gen_random_uuid() NOT NULL,
  "name" "pg_catalog"."text" NOT NULL,
  "session_date" "pg_catalog"."date" NOT NULL,
  "start_time" "pg_catalog"."time",
  "type" "public"."session_type" NOT NULL,
  "responsible" "pg_catalog"."text",
  "status" "public"."session_status" DEFAULT 'planned'::session_status NOT NULL,
  "opponent" "pg_catalog"."text",
  "home_away" "pg_catalog"."text",
  "result" "pg_catalog"."text",
  "high_rating_limit" "pg_catalog"."int4" DEFAULT 6 NOT NULL,
  "locked_at" "pg_catalog"."timestamptz",
  "notes" "pg_catalog"."text",
  "created_at" "pg_catalog"."timestamptz" DEFAULT now() NOT NULL,
  "callup_confirmed" "pg_catalog"."bool" DEFAULT false NOT NULL,
  "callup_confirmed_at" "pg_catalog"."timestamptz",
  "attendance_confirmed" "pg_catalog"."bool" DEFAULT false NOT NULL,
  "attendance_confirmed_at" "pg_catalog"."timestamptz",
  "evaluation_confirmed" "pg_catalog"."bool" DEFAULT false NOT NULL,
  "evaluation_confirmed_at" "pg_catalog"."timestamptz",
  "low_rating_limit" "pg_catalog"."int4" DEFAULT 3 NOT NULL,
  "records_only_confirmed" "pg_catalog"."bool" DEFAULT false NOT NULL
);
CREATE TABLE public."staff_flags"(
  "id" "pg_catalog"."uuid" DEFAULT gen_random_uuid() NOT NULL,
  "player_id" "pg_catalog"."uuid" NOT NULL,
  "week_start" "pg_catalog"."date" NOT NULL,
  "category" "pg_catalog"."text" NOT NULL,
  "detail" "pg_catalog"."text" NOT NULL,
  "created_by" "pg_catalog"."uuid" DEFAULT auth.uid() NOT NULL,
  "created_at" "pg_catalog"."timestamptz" DEFAULT now() NOT NULL
);
CREATE TABLE public."suspensions"(
  "id" "pg_catalog"."uuid" DEFAULT gen_random_uuid() NOT NULL,
  "player_id" "pg_catalog"."uuid" NOT NULL,
  "source" "pg_catalog"."text" NOT NULL,
  "matches_total" "pg_catalog"."int4" DEFAULT 1 NOT NULL,
  "matches_served" "pg_catalog"."int4" DEFAULT 0 NOT NULL,
  "status" "pg_catalog"."text" DEFAULT 'active'::text NOT NULL,
  "reason" "pg_catalog"."text",
  "created_from_session_id" "pg_catalog"."uuid",
  "created_at" "pg_catalog"."timestamptz" DEFAULT now() NOT NULL,
  "served_at" "pg_catalog"."timestamptz"
);
ALTER TABLE public."attendance" ADD CONSTRAINT "attendance_pkey" PRIMARY KEY (id);
ALTER TABLE public."callups" ADD CONSTRAINT "callups_pkey" PRIMARY KEY (id);
ALTER TABLE public."cards" ADD CONSTRAINT "cards_pkey" PRIMARY KEY (id);
ALTER TABLE public."evaluations" ADD CONSTRAINT "evaluations_pkey" PRIMARY KEY (id);
ALTER TABLE public."must_win_reviews" ADD CONSTRAINT "must_win_reviews_pkey" PRIMARY KEY (id);
ALTER TABLE public."players" ADD CONSTRAINT "players_pkey" PRIMARY KEY (id);
ALTER TABLE public."profiles" ADD CONSTRAINT "profiles_pkey" PRIMARY KEY (id);
ALTER TABLE public."session_standouts" ADD CONSTRAINT "session_standouts_pkey" PRIMARY KEY (id);
ALTER TABLE public."sessions" ADD CONSTRAINT "sessions_pkey" PRIMARY KEY (id);
ALTER TABLE public."staff_flags" ADD CONSTRAINT "staff_flags_pkey" PRIMARY KEY (id);
ALTER TABLE public."suspensions" ADD CONSTRAINT "suspensions_pkey" PRIMARY KEY (id);
ALTER TABLE public."attendance" ADD CONSTRAINT "attendance_session_id_player_id_key" UNIQUE (session_id, player_id);
ALTER TABLE public."callups" ADD CONSTRAINT "callups_session_id_player_id_key" UNIQUE (session_id, player_id);
ALTER TABLE public."evaluations" ADD CONSTRAINT "evaluations_session_id_player_id_key" UNIQUE (session_id, player_id);
ALTER TABLE public."must_win_reviews" ADD CONSTRAINT "must_win_reviews_player_id_month_start_key" UNIQUE (player_id, month_start);
ALTER TABLE public."session_standouts" ADD CONSTRAINT "session_standouts_session_id_category_rank_key" UNIQUE (session_id, category, rank);
ALTER TABLE public."session_standouts" ADD CONSTRAINT "session_standouts_session_id_player_id_key" UNIQUE (session_id, player_id);
ALTER TABLE public."evaluations" ADD CONSTRAINT "evaluations_coachability_check" CHECK (coachability >= 1 AND coachability <= 5);
ALTER TABLE public."evaluations" ADD CONSTRAINT "evaluations_decision_making_check" CHECK (decision_making >= 1 AND decision_making <= 5);
ALTER TABLE public."evaluations" ADD CONSTRAINT "evaluations_effort_commitment_check" CHECK (effort_commitment >= 1 AND effort_commitment <= 5);
ALTER TABLE public."evaluations" ADD CONSTRAINT "evaluations_mentality_attitude_check" CHECK (mentality_attitude >= 1 AND mentality_attitude <= 5);
ALTER TABLE public."evaluations" ADD CONSTRAINT "evaluations_tactical_discipline_check" CHECK (tactical_discipline >= 1 AND tactical_discipline <= 5);
ALTER TABLE public."session_standouts" ADD CONSTRAINT "session_standouts_category_check" CHECK (category = ANY (ARRAY['top'::text, 'bottom'::text]));
ALTER TABLE public."session_standouts" ADD CONSTRAINT "session_standouts_rank_check" CHECK (rank = ANY (ARRAY[1, 2]));
ALTER TABLE public."sessions" ADD CONSTRAINT "sessions_home_away_check" CHECK ((home_away = ANY (ARRAY['home'::text, 'away'::text, 'neutral'::text])) OR home_away IS NULL);
ALTER TABLE public."staff_flags" ADD CONSTRAINT "staff_flags_category_check" CHECK (category = ANY (ARRAY['attitude'::text, 'on_field'::text, 'off_field'::text, 'positive'::text]));
ALTER TABLE public."staff_flags" ADD CONSTRAINT "staff_flags_detail_check" CHECK (length(TRIM(BOTH FROM detail)) > 0);
ALTER TABLE public."suspensions" ADD CONSTRAINT "suspensions_matches_served_check" CHECK (matches_served >= 0);
ALTER TABLE public."suspensions" ADD CONSTRAINT "suspensions_matches_total_check" CHECK (matches_total > 0);
ALTER TABLE public."suspensions" ADD CONSTRAINT "suspensions_source_check" CHECK (source = ANY (ARRAY['yellow_accumulation'::text, 'straight_red'::text, 'double_yellow'::text, 'manual'::text]));
ALTER TABLE public."suspensions" ADD CONSTRAINT "suspensions_status_check" CHECK (status = ANY (ARRAY['active'::text, 'served'::text, 'cancelled'::text]));
ALTER TABLE public."attendance" ADD CONSTRAINT "attendance_player_id_fkey" FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE;
ALTER TABLE public."attendance" ADD CONSTRAINT "attendance_session_id_fkey" FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE;
ALTER TABLE public."attendance" ADD CONSTRAINT "attendance_submitted_by_fkey" FOREIGN KEY (submitted_by) REFERENCES profiles(id);
ALTER TABLE public."callups" ADD CONSTRAINT "callups_player_id_fkey" FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE;
ALTER TABLE public."callups" ADD CONSTRAINT "callups_session_id_fkey" FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE;
ALTER TABLE public."cards" ADD CONSTRAINT "cards_player_id_fkey" FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE;
ALTER TABLE public."cards" ADD CONSTRAINT "cards_session_id_fkey" FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE;
ALTER TABLE public."evaluations" ADD CONSTRAINT "evaluations_player_id_fkey" FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE;
ALTER TABLE public."evaluations" ADD CONSTRAINT "evaluations_session_id_fkey" FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE;
ALTER TABLE public."evaluations" ADD CONSTRAINT "evaluations_submitted_by_fkey" FOREIGN KEY (submitted_by) REFERENCES profiles(id);
ALTER TABLE public."must_win_reviews" ADD CONSTRAINT "must_win_reviews_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id);
ALTER TABLE public."must_win_reviews" ADD CONSTRAINT "must_win_reviews_player_id_fkey" FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE;
ALTER TABLE public."profiles" ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public."session_standouts" ADD CONSTRAINT "session_standouts_player_id_fkey" FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE;
ALTER TABLE public."session_standouts" ADD CONSTRAINT "session_standouts_session_id_fkey" FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE;
ALTER TABLE public."staff_flags" ADD CONSTRAINT "staff_flags_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id);
ALTER TABLE public."staff_flags" ADD CONSTRAINT "staff_flags_player_id_fkey" FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE;
ALTER TABLE public."suspensions" ADD CONSTRAINT "suspensions_created_from_session_id_fkey" FOREIGN KEY (created_from_session_id) REFERENCES sessions(id) ON DELETE SET NULL;
ALTER TABLE public."suspensions" ADD CONSTRAINT "suspensions_player_id_fkey" FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE;
CREATE FUNCTION public."current_role"() RETURNS public.user_role LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO '' AS $$ SELECT role FROM public.profiles WHERE id=(SELECT auth.uid()) $$;
CREATE OR REPLACE FUNCTION public.create_yellow_accumulation_suspensions()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
  rec record;
begin
  for rec in
    select
      c.player_id,
      count(*) as yellow_count
    from cards c
    where c.type = 'yellow'
    group by c.player_id
    having count(*) >= 5
  loop
    if not exists (
      select 1
      from suspensions s
      where s.player_id = rec.player_id
        and s.source = 'yellow_accumulation'
        and s.status = 'active'
    ) then
      insert into suspensions(player_id, source, matches_total, matches_served, status, reason)
      values (
        rec.player_id,
        'yellow_accumulation',
        1,
        0,
        'active',
        'Suspensión automática por acumulación de 5 amarillas'
      );
    end if;
  end loop;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.enforce_high_rating_limit()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$ declare lim int; cnt int; begin select high_rating_limit into lim from sessions where id=new.session_id; if new.tactical_discipline>=4 then select count(*) into cnt from evaluations where session_id=new.session_id and tactical_discipline>=4 and id<>coalesce(new.id,'00000000-0000-0000-0000-000000000000'::uuid); if cnt>=lim then raise exception 'Maximum high ratings reached for Tactical Discipline.'; end if; end if; if new.effort_commitment>=4 then select count(*) into cnt from evaluations where session_id=new.session_id and effort_commitment>=4 and id<>coalesce(new.id,'00000000-0000-0000-0000-000000000000'::uuid); if cnt>=lim then raise exception 'Maximum high ratings reached for Effort / Commitment.'; end if; end if; if new.decision_making>=4 then select count(*) into cnt from evaluations where session_id=new.session_id and decision_making>=4 and id<>coalesce(new.id,'00000000-0000-0000-0000-000000000000'::uuid); if cnt>=lim then raise exception 'Maximum high ratings reached for Decision Making.'; end if; end if; if new.mentality_attitude>=4 then select count(*) into cnt from evaluations where session_id=new.session_id and mentality_attitude>=4 and id<>coalesce(new.id,'00000000-0000-0000-0000-000000000000'::uuid); if cnt>=lim then raise exception 'Maximum high ratings reached for Mentality / Attitude.'; end if; end if; if new.coachability>=4 then select count(*) into cnt from evaluations where session_id=new.session_id and coachability>=4 and id<>coalesce(new.id,'00000000-0000-0000-0000-000000000000'::uuid); if cnt>=lim then raise exception 'Maximum high ratings reached for Coachability.'; end if; end if; return new; end; $function$
;
CREATE OR REPLACE FUNCTION public.prevent_locked_session_edits()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
    locked boolean;
    target_session_id uuid;
BEGIN
    IF TG_OP = 'DELETE' THEN
        target_session_id := OLD.session_id;
    ELSE
        target_session_id := NEW.session_id;
    END IF;

    SELECT (status = 'locked' OR locked_at IS NOT NULL)
    INTO locked
    FROM public.sessions
    WHERE id = target_session_id;

    IF locked AND public.current_role() <> 'admin' THEN
        RAISE EXCEPTION
            'This session is locked and can only be edited by an admin.';
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;

    RETURN NEW;
END;
$function$
;
CREATE TRIGGER trg_attendance_locked BEFORE INSERT OR DELETE OR UPDATE ON attendance FOR EACH ROW EXECUTE FUNCTION prevent_locked_session_edits();
CREATE TRIGGER trg_cards_locked BEFORE INSERT OR DELETE OR UPDATE ON cards FOR EACH ROW EXECUTE FUNCTION prevent_locked_session_edits();
CREATE TRIGGER trg_evaluations_high_limit BEFORE INSERT OR UPDATE ON evaluations FOR EACH ROW EXECUTE FUNCTION enforce_high_rating_limit();
CREATE TRIGGER trg_evaluations_locked BEFORE INSERT OR DELETE OR UPDATE ON evaluations FOR EACH ROW EXECUTE FUNCTION prevent_locked_session_edits();
CREATE VIEW public."active_suspensions" AS  SELECT s.id,
    s.player_id,
    p.display_name,
    s.source,
    s.matches_total,
    s.matches_served,
    GREATEST((s.matches_total - s.matches_served), 0) AS matches_remaining,
    s.status,
    s.reason,
    s.created_from_session_id,
    s.created_at
   FROM (suspensions s
     JOIN players p ON ((p.id = s.player_id)))
  WHERE ((s.status = 'active'::text) AND (s.matches_served < s.matches_total));
CREATE VIEW public."official_evaluations" WITH (security_invoker=true) AS  SELECT e.id,
    e.session_id,
    e.player_id,
    e.tactical_discipline,
    e.effort_commitment,
    e.decision_making,
    e.mentality_attitude,
    e.coachability,
    e.comment,
    e.evaluated,
    e.submitted_by,
    e.submitted_at,
    e.total_score,
    e.not_applicable,
    e.na_fields
   FROM (evaluations e
     JOIN sessions s ON ((s.id = e.session_id)))
  WHERE ((s.session_date >= '2026-10-14'::date) AND (s.records_only_confirmed IS DISTINCT FROM true));
CREATE VIEW public."player_card_totals" AS  SELECT p.id AS player_id,
    p.display_name,
    (COALESCE(count(c.id) FILTER (WHERE (c.type = 'yellow'::card_type)), (0)::bigint) + (COALESCE(count(c.id) FILTER (WHERE (c.type = 'double_yellow'::card_type)), (0)::bigint) * 2)) AS yellow_cards,
    COALESCE(count(c.id) FILTER (WHERE (c.type = ANY (ARRAY['straight_red'::card_type, 'double_yellow'::card_type]))), (0)::bigint) AS red_cards,
    COALESCE(count(c.id), (0)::bigint) AS total_cards
   FROM (players p
     LEFT JOIN cards c ON ((c.player_id = p.id)))
  GROUP BY p.id, p.display_name;
ALTER TABLE public."attendance" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."callups" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."cards" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."evaluations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."must_win_reviews" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."players" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."session_standouts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."staff_flags" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."suspensions" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "coach admin manage attendance" ON public."attendance" AS PERMISSIVE FOR ALL TO "public" USING (("current_role"() = ANY (ARRAY['admin'::user_role, 'coach'::user_role]))) WITH CHECK (("current_role"() = ANY (ARRAY['admin'::user_role, 'coach'::user_role])));
CREATE POLICY "read attendance" ON public."attendance" AS PERMISSIVE FOR SELECT TO "public" USING ((auth.uid() IS NOT NULL));
CREATE POLICY "admin manage callups" ON public."callups" AS PERMISSIVE FOR ALL TO "public" USING (("current_role"() = 'admin'::user_role)) WITH CHECK (("current_role"() = 'admin'::user_role));
CREATE POLICY "read callups" ON public."callups" AS PERMISSIVE FOR SELECT TO "public" USING ((auth.uid() IS NOT NULL));
CREATE POLICY "coach admin manage cards" ON public."cards" AS PERMISSIVE FOR ALL TO "public" USING (("current_role"() = ANY (ARRAY['admin'::user_role, 'coach'::user_role]))) WITH CHECK (("current_role"() = ANY (ARRAY['admin'::user_role, 'coach'::user_role])));
CREATE POLICY "read cards" ON public."cards" AS PERMISSIVE FOR SELECT TO "public" USING ((auth.uid() IS NOT NULL));
CREATE POLICY "coach admin manage evaluations" ON public."evaluations" AS PERMISSIVE FOR ALL TO "public" USING (("current_role"() = ANY (ARRAY['admin'::user_role, 'coach'::user_role]))) WITH CHECK (("current_role"() = ANY (ARRAY['admin'::user_role, 'coach'::user_role])));
CREATE POLICY "read evaluations" ON public."evaluations" AS PERMISSIVE FOR SELECT TO "public" USING ((auth.uid() IS NOT NULL));
CREATE POLICY "admins manage must win" ON public."must_win_reviews" AS PERMISSIVE FOR ALL TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::user_role))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::user_role)))));
CREATE POLICY "admin manage players" ON public."players" AS PERMISSIVE FOR ALL TO "public" USING (("current_role"() = 'admin'::user_role)) WITH CHECK (("current_role"() = 'admin'::user_role));
CREATE POLICY "read players" ON public."players" AS PERMISSIVE FOR SELECT TO "public" USING ((auth.uid() IS NOT NULL));
CREATE POLICY "profiles admin update" ON public."profiles" AS PERMISSIVE FOR UPDATE TO "public" USING (("current_role"() = 'admin'::user_role));
CREATE POLICY "profiles read own or admin" ON public."profiles" AS PERMISSIVE FOR SELECT TO "public" USING (((id = auth.uid()) OR ("current_role"() = 'admin'::user_role)));
CREATE POLICY "Admins can delete standouts" ON public."session_standouts" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::user_role)))));
CREATE POLICY "Admins can insert standouts" ON public."session_standouts" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::user_role)))));
CREATE POLICY "Admins can update standouts" ON public."session_standouts" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::user_role))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::user_role)))));
CREATE POLICY "Authenticated can read standouts" ON public."session_standouts" AS PERMISSIVE FOR SELECT TO "authenticated" USING (true);
CREATE POLICY "coach admin delete standouts" ON public."session_standouts" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::user_role, 'coach'::user_role]))))));
CREATE POLICY "coach admin insert standouts" ON public."session_standouts" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::user_role, 'coach'::user_role]))))));
CREATE POLICY "coach admin update standouts" ON public."session_standouts" AS PERMISSIVE FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::user_role, 'coach'::user_role])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::user_role, 'coach'::user_role]))))));
CREATE POLICY "admin manage sessions" ON public."sessions" AS PERMISSIVE FOR ALL TO "public" USING (("current_role"() = 'admin'::user_role)) WITH CHECK (("current_role"() = 'admin'::user_role));
CREATE POLICY "read sessions" ON public."sessions" AS PERMISSIVE FOR SELECT TO "public" USING ((auth.uid() IS NOT NULL));
CREATE POLICY "admin_delete_staff_flags" ON public."staff_flags" AS PERMISSIVE FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::user_role)))));
CREATE POLICY "admin_insert_staff_flags" ON public."staff_flags" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (((created_by = auth.uid()) AND (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::user_role))))));
CREATE POLICY "admin_read_staff_flags" ON public."staff_flags" AS PERMISSIVE FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::user_role)))));
CREATE POLICY "coach admin manage suspensions" ON public."suspensions" AS PERMISSIVE FOR ALL TO "public" USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::user_role, 'coach'::user_role])))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::user_role, 'coach'::user_role]))))));
CREATE POLICY "read suspensions" ON public."suspensions" AS PERMISSIVE FOR SELECT TO "public" USING ((auth.uid() IS NOT NULL));
GRANT USAGE ON SCHEMA public,auth TO anon,authenticated,service_role;
GRANT DELETE ON public."active_suspensions" TO "anon";
GRANT INSERT ON public."active_suspensions" TO "anon";
GRANT REFERENCES ON public."active_suspensions" TO "anon";
GRANT SELECT ON public."active_suspensions" TO "anon";
GRANT TRIGGER ON public."active_suspensions" TO "anon";
GRANT TRUNCATE ON public."active_suspensions" TO "anon";
GRANT UPDATE ON public."active_suspensions" TO "anon";
GRANT DELETE ON public."active_suspensions" TO "authenticated";
GRANT INSERT ON public."active_suspensions" TO "authenticated";
GRANT REFERENCES ON public."active_suspensions" TO "authenticated";
GRANT SELECT ON public."active_suspensions" TO "authenticated";
GRANT TRIGGER ON public."active_suspensions" TO "authenticated";
GRANT TRUNCATE ON public."active_suspensions" TO "authenticated";
GRANT UPDATE ON public."active_suspensions" TO "authenticated";
GRANT DELETE ON public."active_suspensions" TO "service_role";
GRANT INSERT ON public."active_suspensions" TO "service_role";
GRANT REFERENCES ON public."active_suspensions" TO "service_role";
GRANT SELECT ON public."active_suspensions" TO "service_role";
GRANT TRIGGER ON public."active_suspensions" TO "service_role";
GRANT TRUNCATE ON public."active_suspensions" TO "service_role";
GRANT UPDATE ON public."active_suspensions" TO "service_role";
GRANT DELETE ON public."attendance" TO "anon";
GRANT INSERT ON public."attendance" TO "anon";
GRANT REFERENCES ON public."attendance" TO "anon";
GRANT SELECT ON public."attendance" TO "anon";
GRANT TRIGGER ON public."attendance" TO "anon";
GRANT TRUNCATE ON public."attendance" TO "anon";
GRANT UPDATE ON public."attendance" TO "anon";
GRANT DELETE ON public."attendance" TO "authenticated";
GRANT INSERT ON public."attendance" TO "authenticated";
GRANT REFERENCES ON public."attendance" TO "authenticated";
GRANT SELECT ON public."attendance" TO "authenticated";
GRANT TRIGGER ON public."attendance" TO "authenticated";
GRANT TRUNCATE ON public."attendance" TO "authenticated";
GRANT UPDATE ON public."attendance" TO "authenticated";
GRANT DELETE ON public."attendance" TO "service_role";
GRANT INSERT ON public."attendance" TO "service_role";
GRANT REFERENCES ON public."attendance" TO "service_role";
GRANT SELECT ON public."attendance" TO "service_role";
GRANT TRIGGER ON public."attendance" TO "service_role";
GRANT TRUNCATE ON public."attendance" TO "service_role";
GRANT UPDATE ON public."attendance" TO "service_role";
GRANT DELETE ON public."callups" TO "anon";
GRANT INSERT ON public."callups" TO "anon";
GRANT REFERENCES ON public."callups" TO "anon";
GRANT SELECT ON public."callups" TO "anon";
GRANT TRIGGER ON public."callups" TO "anon";
GRANT TRUNCATE ON public."callups" TO "anon";
GRANT UPDATE ON public."callups" TO "anon";
GRANT DELETE ON public."callups" TO "authenticated";
GRANT INSERT ON public."callups" TO "authenticated";
GRANT REFERENCES ON public."callups" TO "authenticated";
GRANT SELECT ON public."callups" TO "authenticated";
GRANT TRIGGER ON public."callups" TO "authenticated";
GRANT TRUNCATE ON public."callups" TO "authenticated";
GRANT UPDATE ON public."callups" TO "authenticated";
GRANT DELETE ON public."callups" TO "service_role";
GRANT INSERT ON public."callups" TO "service_role";
GRANT REFERENCES ON public."callups" TO "service_role";
GRANT SELECT ON public."callups" TO "service_role";
GRANT TRIGGER ON public."callups" TO "service_role";
GRANT TRUNCATE ON public."callups" TO "service_role";
GRANT UPDATE ON public."callups" TO "service_role";
GRANT DELETE ON public."cards" TO "anon";
GRANT INSERT ON public."cards" TO "anon";
GRANT REFERENCES ON public."cards" TO "anon";
GRANT SELECT ON public."cards" TO "anon";
GRANT TRIGGER ON public."cards" TO "anon";
GRANT TRUNCATE ON public."cards" TO "anon";
GRANT UPDATE ON public."cards" TO "anon";
GRANT DELETE ON public."cards" TO "authenticated";
GRANT INSERT ON public."cards" TO "authenticated";
GRANT REFERENCES ON public."cards" TO "authenticated";
GRANT SELECT ON public."cards" TO "authenticated";
GRANT TRIGGER ON public."cards" TO "authenticated";
GRANT TRUNCATE ON public."cards" TO "authenticated";
GRANT UPDATE ON public."cards" TO "authenticated";
GRANT DELETE ON public."cards" TO "service_role";
GRANT INSERT ON public."cards" TO "service_role";
GRANT REFERENCES ON public."cards" TO "service_role";
GRANT SELECT ON public."cards" TO "service_role";
GRANT TRIGGER ON public."cards" TO "service_role";
GRANT TRUNCATE ON public."cards" TO "service_role";
GRANT UPDATE ON public."cards" TO "service_role";
GRANT DELETE ON public."evaluations" TO "anon";
GRANT INSERT ON public."evaluations" TO "anon";
GRANT REFERENCES ON public."evaluations" TO "anon";
GRANT SELECT ON public."evaluations" TO "anon";
GRANT TRIGGER ON public."evaluations" TO "anon";
GRANT TRUNCATE ON public."evaluations" TO "anon";
GRANT UPDATE ON public."evaluations" TO "anon";
GRANT DELETE ON public."evaluations" TO "authenticated";
GRANT INSERT ON public."evaluations" TO "authenticated";
GRANT REFERENCES ON public."evaluations" TO "authenticated";
GRANT SELECT ON public."evaluations" TO "authenticated";
GRANT TRIGGER ON public."evaluations" TO "authenticated";
GRANT TRUNCATE ON public."evaluations" TO "authenticated";
GRANT UPDATE ON public."evaluations" TO "authenticated";
GRANT DELETE ON public."evaluations" TO "service_role";
GRANT INSERT ON public."evaluations" TO "service_role";
GRANT REFERENCES ON public."evaluations" TO "service_role";
GRANT SELECT ON public."evaluations" TO "service_role";
GRANT TRIGGER ON public."evaluations" TO "service_role";
GRANT TRUNCATE ON public."evaluations" TO "service_role";
GRANT UPDATE ON public."evaluations" TO "service_role";
GRANT DELETE ON public."must_win_reviews" TO "anon";
GRANT INSERT ON public."must_win_reviews" TO "anon";
GRANT REFERENCES ON public."must_win_reviews" TO "anon";
GRANT SELECT ON public."must_win_reviews" TO "anon";
GRANT TRIGGER ON public."must_win_reviews" TO "anon";
GRANT TRUNCATE ON public."must_win_reviews" TO "anon";
GRANT UPDATE ON public."must_win_reviews" TO "anon";
GRANT DELETE ON public."must_win_reviews" TO "authenticated";
GRANT INSERT ON public."must_win_reviews" TO "authenticated";
GRANT REFERENCES ON public."must_win_reviews" TO "authenticated";
GRANT SELECT ON public."must_win_reviews" TO "authenticated";
GRANT TRIGGER ON public."must_win_reviews" TO "authenticated";
GRANT TRUNCATE ON public."must_win_reviews" TO "authenticated";
GRANT UPDATE ON public."must_win_reviews" TO "authenticated";
GRANT DELETE ON public."must_win_reviews" TO "service_role";
GRANT INSERT ON public."must_win_reviews" TO "service_role";
GRANT REFERENCES ON public."must_win_reviews" TO "service_role";
GRANT SELECT ON public."must_win_reviews" TO "service_role";
GRANT TRIGGER ON public."must_win_reviews" TO "service_role";
GRANT TRUNCATE ON public."must_win_reviews" TO "service_role";
GRANT UPDATE ON public."must_win_reviews" TO "service_role";
GRANT DELETE ON public."official_evaluations" TO "anon";
GRANT INSERT ON public."official_evaluations" TO "anon";
GRANT REFERENCES ON public."official_evaluations" TO "anon";
GRANT SELECT ON public."official_evaluations" TO "anon";
GRANT TRIGGER ON public."official_evaluations" TO "anon";
GRANT TRUNCATE ON public."official_evaluations" TO "anon";
GRANT UPDATE ON public."official_evaluations" TO "anon";
GRANT DELETE ON public."official_evaluations" TO "authenticated";
GRANT INSERT ON public."official_evaluations" TO "authenticated";
GRANT REFERENCES ON public."official_evaluations" TO "authenticated";
GRANT SELECT ON public."official_evaluations" TO "authenticated";
GRANT TRIGGER ON public."official_evaluations" TO "authenticated";
GRANT TRUNCATE ON public."official_evaluations" TO "authenticated";
GRANT UPDATE ON public."official_evaluations" TO "authenticated";
GRANT DELETE ON public."official_evaluations" TO "service_role";
GRANT INSERT ON public."official_evaluations" TO "service_role";
GRANT REFERENCES ON public."official_evaluations" TO "service_role";
GRANT SELECT ON public."official_evaluations" TO "service_role";
GRANT TRIGGER ON public."official_evaluations" TO "service_role";
GRANT TRUNCATE ON public."official_evaluations" TO "service_role";
GRANT UPDATE ON public."official_evaluations" TO "service_role";
GRANT DELETE ON public."player_card_totals" TO "anon";
GRANT INSERT ON public."player_card_totals" TO "anon";
GRANT REFERENCES ON public."player_card_totals" TO "anon";
GRANT SELECT ON public."player_card_totals" TO "anon";
GRANT TRIGGER ON public."player_card_totals" TO "anon";
GRANT TRUNCATE ON public."player_card_totals" TO "anon";
GRANT UPDATE ON public."player_card_totals" TO "anon";
GRANT DELETE ON public."player_card_totals" TO "authenticated";
GRANT INSERT ON public."player_card_totals" TO "authenticated";
GRANT REFERENCES ON public."player_card_totals" TO "authenticated";
GRANT SELECT ON public."player_card_totals" TO "authenticated";
GRANT TRIGGER ON public."player_card_totals" TO "authenticated";
GRANT TRUNCATE ON public."player_card_totals" TO "authenticated";
GRANT UPDATE ON public."player_card_totals" TO "authenticated";
GRANT DELETE ON public."player_card_totals" TO "service_role";
GRANT INSERT ON public."player_card_totals" TO "service_role";
GRANT REFERENCES ON public."player_card_totals" TO "service_role";
GRANT SELECT ON public."player_card_totals" TO "service_role";
GRANT TRIGGER ON public."player_card_totals" TO "service_role";
GRANT TRUNCATE ON public."player_card_totals" TO "service_role";
GRANT UPDATE ON public."player_card_totals" TO "service_role";
GRANT DELETE ON public."players" TO "anon";
GRANT INSERT ON public."players" TO "anon";
GRANT REFERENCES ON public."players" TO "anon";
GRANT SELECT ON public."players" TO "anon";
GRANT TRIGGER ON public."players" TO "anon";
GRANT TRUNCATE ON public."players" TO "anon";
GRANT UPDATE ON public."players" TO "anon";
GRANT DELETE ON public."players" TO "authenticated";
GRANT INSERT ON public."players" TO "authenticated";
GRANT REFERENCES ON public."players" TO "authenticated";
GRANT SELECT ON public."players" TO "authenticated";
GRANT TRIGGER ON public."players" TO "authenticated";
GRANT TRUNCATE ON public."players" TO "authenticated";
GRANT UPDATE ON public."players" TO "authenticated";
GRANT DELETE ON public."players" TO "service_role";
GRANT INSERT ON public."players" TO "service_role";
GRANT REFERENCES ON public."players" TO "service_role";
GRANT SELECT ON public."players" TO "service_role";
GRANT TRIGGER ON public."players" TO "service_role";
GRANT TRUNCATE ON public."players" TO "service_role";
GRANT UPDATE ON public."players" TO "service_role";
GRANT DELETE ON public."profiles" TO "anon";
GRANT INSERT ON public."profiles" TO "anon";
GRANT REFERENCES ON public."profiles" TO "anon";
GRANT SELECT ON public."profiles" TO "anon";
GRANT TRIGGER ON public."profiles" TO "anon";
GRANT TRUNCATE ON public."profiles" TO "anon";
GRANT UPDATE ON public."profiles" TO "anon";
GRANT DELETE ON public."profiles" TO "authenticated";
GRANT INSERT ON public."profiles" TO "authenticated";
GRANT REFERENCES ON public."profiles" TO "authenticated";
GRANT SELECT ON public."profiles" TO "authenticated";
GRANT TRIGGER ON public."profiles" TO "authenticated";
GRANT TRUNCATE ON public."profiles" TO "authenticated";
GRANT UPDATE ON public."profiles" TO "authenticated";
GRANT DELETE ON public."profiles" TO "service_role";
GRANT INSERT ON public."profiles" TO "service_role";
GRANT REFERENCES ON public."profiles" TO "service_role";
GRANT SELECT ON public."profiles" TO "service_role";
GRANT TRIGGER ON public."profiles" TO "service_role";
GRANT TRUNCATE ON public."profiles" TO "service_role";
GRANT UPDATE ON public."profiles" TO "service_role";
GRANT DELETE ON public."session_standouts" TO "anon";
GRANT INSERT ON public."session_standouts" TO "anon";
GRANT REFERENCES ON public."session_standouts" TO "anon";
GRANT SELECT ON public."session_standouts" TO "anon";
GRANT TRIGGER ON public."session_standouts" TO "anon";
GRANT TRUNCATE ON public."session_standouts" TO "anon";
GRANT UPDATE ON public."session_standouts" TO "anon";
GRANT DELETE ON public."session_standouts" TO "authenticated";
GRANT INSERT ON public."session_standouts" TO "authenticated";
GRANT REFERENCES ON public."session_standouts" TO "authenticated";
GRANT SELECT ON public."session_standouts" TO "authenticated";
GRANT TRIGGER ON public."session_standouts" TO "authenticated";
GRANT TRUNCATE ON public."session_standouts" TO "authenticated";
GRANT UPDATE ON public."session_standouts" TO "authenticated";
GRANT DELETE ON public."session_standouts" TO "service_role";
GRANT INSERT ON public."session_standouts" TO "service_role";
GRANT REFERENCES ON public."session_standouts" TO "service_role";
GRANT SELECT ON public."session_standouts" TO "service_role";
GRANT TRIGGER ON public."session_standouts" TO "service_role";
GRANT TRUNCATE ON public."session_standouts" TO "service_role";
GRANT UPDATE ON public."session_standouts" TO "service_role";
GRANT DELETE ON public."sessions" TO "anon";
GRANT INSERT ON public."sessions" TO "anon";
GRANT REFERENCES ON public."sessions" TO "anon";
GRANT SELECT ON public."sessions" TO "anon";
GRANT TRIGGER ON public."sessions" TO "anon";
GRANT TRUNCATE ON public."sessions" TO "anon";
GRANT UPDATE ON public."sessions" TO "anon";
GRANT DELETE ON public."sessions" TO "authenticated";
GRANT INSERT ON public."sessions" TO "authenticated";
GRANT REFERENCES ON public."sessions" TO "authenticated";
GRANT SELECT ON public."sessions" TO "authenticated";
GRANT TRIGGER ON public."sessions" TO "authenticated";
GRANT TRUNCATE ON public."sessions" TO "authenticated";
GRANT UPDATE ON public."sessions" TO "authenticated";
GRANT DELETE ON public."sessions" TO "service_role";
GRANT INSERT ON public."sessions" TO "service_role";
GRANT REFERENCES ON public."sessions" TO "service_role";
GRANT SELECT ON public."sessions" TO "service_role";
GRANT TRIGGER ON public."sessions" TO "service_role";
GRANT TRUNCATE ON public."sessions" TO "service_role";
GRANT UPDATE ON public."sessions" TO "service_role";
GRANT DELETE ON public."staff_flags" TO "anon";
GRANT INSERT ON public."staff_flags" TO "anon";
GRANT REFERENCES ON public."staff_flags" TO "anon";
GRANT SELECT ON public."staff_flags" TO "anon";
GRANT TRIGGER ON public."staff_flags" TO "anon";
GRANT TRUNCATE ON public."staff_flags" TO "anon";
GRANT UPDATE ON public."staff_flags" TO "anon";
GRANT DELETE ON public."staff_flags" TO "authenticated";
GRANT INSERT ON public."staff_flags" TO "authenticated";
GRANT REFERENCES ON public."staff_flags" TO "authenticated";
GRANT SELECT ON public."staff_flags" TO "authenticated";
GRANT TRIGGER ON public."staff_flags" TO "authenticated";
GRANT TRUNCATE ON public."staff_flags" TO "authenticated";
GRANT UPDATE ON public."staff_flags" TO "authenticated";
GRANT DELETE ON public."staff_flags" TO "service_role";
GRANT INSERT ON public."staff_flags" TO "service_role";
GRANT REFERENCES ON public."staff_flags" TO "service_role";
GRANT SELECT ON public."staff_flags" TO "service_role";
GRANT TRIGGER ON public."staff_flags" TO "service_role";
GRANT TRUNCATE ON public."staff_flags" TO "service_role";
GRANT UPDATE ON public."staff_flags" TO "service_role";
GRANT DELETE ON public."suspensions" TO "anon";
GRANT INSERT ON public."suspensions" TO "anon";
GRANT REFERENCES ON public."suspensions" TO "anon";
GRANT SELECT ON public."suspensions" TO "anon";
GRANT TRIGGER ON public."suspensions" TO "anon";
GRANT TRUNCATE ON public."suspensions" TO "anon";
GRANT UPDATE ON public."suspensions" TO "anon";
GRANT DELETE ON public."suspensions" TO "authenticated";
GRANT INSERT ON public."suspensions" TO "authenticated";
GRANT REFERENCES ON public."suspensions" TO "authenticated";
GRANT SELECT ON public."suspensions" TO "authenticated";
GRANT TRIGGER ON public."suspensions" TO "authenticated";
GRANT TRUNCATE ON public."suspensions" TO "authenticated";
GRANT UPDATE ON public."suspensions" TO "authenticated";
GRANT DELETE ON public."suspensions" TO "service_role";
GRANT INSERT ON public."suspensions" TO "service_role";
GRANT REFERENCES ON public."suspensions" TO "service_role";
GRANT SELECT ON public."suspensions" TO "service_role";
GRANT TRIGGER ON public."suspensions" TO "service_role";
GRANT TRUNCATE ON public."suspensions" TO "service_role";
GRANT UPDATE ON public."suspensions" TO "service_role";
