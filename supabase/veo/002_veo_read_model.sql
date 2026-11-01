-- REVIEW AND APPLY MANUALLY after 001. PostgreSQL 15+ (security_invoker).
BEGIN;
CREATE VIEW public.veo_calculated_stats WITH(security_invoker=true) AS
WITH raw AS (
 SELECT m.id AS match_id,m.namespace,m.season,m.round,m.session_id,m.revision,
  s.player_id,s.data,m.data AS match_data,
  CASE WHEN (s.data->>'calledUp')::boolean THEN coalesce((s.data->>'veoMinutes')::numeric,(s.data->>'fcfMinutes')::numeric,0) ELSE 0 END AS effective_minutes,
  (m.data->>'goalsFor')::numeric AS goals_for,(m.data->>'goalsAgainst')::numeric AS goals_against,
  s.data->'metrics' AS metrics
 FROM public.veo_matches m JOIN public.veo_player_match_stats s ON s.match_id=m.id WHERE m.active
), calculated AS (
 SELECT *,
 CASE WHEN effective_minutes>0 THEN round(
  coalesce((metrics->>'goals')::numeric,0)*10+coalesce((metrics->>'assists')::numeric,0)*6+
  coalesce((metrics->>'chances')::numeric,0)*3+coalesce((metrics->>'shots')::numeric,0)*2+
  coalesce((metrics->>'tackles')::numeric,0)*2+coalesce((metrics->>'interceptions')::numeric,0)*2+
  coalesce((metrics->>'recoveries')::numeric,0)*2+coalesce((metrics->>'saves')::numeric,0)*3+
  coalesce((metrics->>'dribbles')::numeric,0)+
  CASE WHEN metrics->>'successfulPasses' IS NULL THEN coalesce((metrics->>'passes')::numeric,0)*0.2
   ELSE (metrics->>'successfulPasses')::numeric*0.2-
    (coalesce((metrics->>'passes')::numeric,0)-(metrics->>'successfulPasses')::numeric)*0.1 END-
  coalesce((metrics->>'yellowCards')::numeric,0)*3-coalesce((metrics->>'redCards')::numeric,0)*8,1)
 ELSE NULL END AS performance_index,
 CASE WHEN (metrics->>'passes')::numeric>0 AND metrics->>'successfulPasses' IS NOT NULL
  THEN (metrics->>'successfulPasses')::numeric/(metrics->>'passes')::numeric ELSE NULL END AS passing_rate,
 CASE WHEN season='2026-2027' AND round>=5 AND (data->>'eligible')::boolean AND goals_against=0 AND effective_minutes>65 THEN 1 ELSE 0 END AS clean_occurrences,
 CASE WHEN season='2026-2027' AND round>=5 THEN coalesce((metrics->>'goals')::numeric,0) ELSE 0 END AS goal_occurrences,
 CASE WHEN season='2026-2027' AND round>=5 THEN coalesce((metrics->>'assists')::numeric,0) ELSE 0 END AS assist_occurrences,
 CASE WHEN season='2026-2027' AND round>=5 AND ((effective_minutes>0 AND
  (metrics->>'goals' IS NULL OR metrics->>'assists' IS NULL OR data->>'eligible' IS NULL)) OR (effective_minutes=0 AND
  (coalesce((metrics->>'goals')::numeric,0)>0 OR coalesce((metrics->>'assists')::numeric,0)>0))) THEN 1 ELSE 0 END AS incomplete
 FROM raw
), counters AS (
 SELECT *,
 coalesce(sum(clean_occurrences) OVER previous,0) AS previous_clean,
 coalesce(sum(goal_occurrences) OVER previous,0) AS previous_goals,
 coalesce(sum(assist_occurrences) OVER previous,0) AS previous_assists,
 sum(incomplete) OVER (PARTITION BY namespace,season,player_id ORDER BY round ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS incomplete_history
 FROM calculated
 WINDOW previous AS (PARTITION BY namespace,season,player_id ORDER BY round ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING)
), amounts AS (
 SELECT *,
 CASE WHEN season<>'2026-2027' OR incomplete_history>0 THEN NULL
  WHEN round<5 OR goals_for IS NULL OR goals_against IS NULL OR goals_for<goals_against THEN 0
  ELSE 1000*clean_occurrences+1000*(greatest(0,previous_clean+clean_occurrences-7)-greatest(0,previous_clean-7)) END AS clean_bonus_cents,
 CASE WHEN season<>'2026-2027' OR incomplete_history>0 THEN NULL
  WHEN round<5 OR goals_for IS NULL OR goals_against IS NULL OR goals_for<goals_against THEN 0
  ELSE 1000*goal_occurrences+1000*(greatest(0,previous_goals+goal_occurrences-7)-greatest(0,previous_goals-7)) END AS goal_bonus_cents,
 CASE WHEN season<>'2026-2027' OR incomplete_history>0 THEN NULL
  WHEN round<5 OR goals_for IS NULL OR goals_against IS NULL OR goals_for<goals_against THEN 0
  ELSE 1000*assist_occurrences+1000*(greatest(0,previous_assists+assist_occurrences-7)-greatest(0,previous_assists-7)) END AS assist_bonus_cents
 FROM counters
)
SELECT *,clean_bonus_cents+goal_bonus_cents+assist_bonus_cents AS total_bonus_cents FROM amounts;
-- Supabase default privileges can grant authenticated DML on newly created views.
-- Reset those privileges explicitly before granting the read-only contract.
REVOKE ALL ON public.veo_calculated_stats FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.veo_calculated_stats TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
