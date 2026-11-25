-- MANUAL, READ ONLY. Run as postgres; no decisions or service are changed.
-- Identifies the actual league matches and any saved decisions for the two
-- reported cases. No credentials, emails or unrelated players are included.
WITH players_in_review AS (
  SELECT id,display_name FROM public.players
  WHERE id='9eaa7bdf-2b90-42a4-9ee0-8685b33f233b'::uuid
    OR lower(translate(display_name,'ÁÉÍÓÚáéíóú','AEIOUaeiou')) LIKE '%victor%'
), cases AS (
  SELECT s.*,p.display_name,origin.name AS origin_match_name,
    origin.session_date AS origin_match_date,
    (SELECT count(*) FROM public.discipline_service_matches v
      WHERE v.suspension_id=s.id AND v.revoked_at IS NULL) AS verified_matches
  FROM public.suspensions s JOIN players_in_review p ON p.id=s.player_id
    LEFT JOIN public.sessions origin ON origin.id=s.created_from_session_id
), matches AS (
  SELECT m.id,m.name,m.session_date,m.type,m.status,m.locked_at,
    m.callup_confirmed,m.attendance_confirmed,m.evaluation_confirmed,
    to_char(m.session_date,'FMDay') AS weekday,
    (SELECT jsonb_agg(jsonb_build_object('player_id',p.id,'display_name',p.display_name,
      'callup',c.status,'attendance',a.status,
      'service_case_id',v.suspension_id) ORDER BY p.display_name,p.id)
     FROM players_in_review p
       LEFT JOIN public.callups c ON c.player_id=p.id AND c.session_id=m.id
       LEFT JOIN public.attendance a ON a.player_id=p.id AND a.session_id=m.id
       LEFT JOIN public.discipline_service_matches v ON v.player_id=p.id AND v.session_id=m.id AND v.revoked_at IS NULL
    ) AS player_records
  FROM public.sessions m WHERE m.type::text='league_match'
    AND m.session_date BETWEEN DATE '2026-11-14' AND DATE '2026-11-30'
), audit AS (
  SELECT a.action,a.entity_id,a.recorded_at,
    a.after_data->'matches_total' AS matches_total,
    a.after_data->'matches_served' AS matches_served,
    a.after_data->'applicable_from' AS applicable_from,
    a.after_data->'status' AS status
  FROM public.discipline_audit a JOIN cases c ON c.id=a.entity_id
  ORDER BY a.recorded_at DESC,a.id DESC LIMIT 20
)
SELECT jsonb_build_object(
  'players',coalesce((SELECT jsonb_agg(to_jsonb(p) ORDER BY display_name,id) FROM players_in_review p),'[]'::jsonb),
  'cases',coalesce((SELECT jsonb_agg(to_jsonb(c) ORDER BY created_at,id) FROM cases c),'[]'::jsonb),
  'matches',coalesce((SELECT jsonb_agg(to_jsonb(m) ORDER BY session_date,id) FROM matches m),'[]'::jsonb),
  'service_matches',coalesce((SELECT jsonb_agg(to_jsonb(v) ORDER BY verified_at,v.id)
    FROM public.discipline_service_matches v JOIN players_in_review p ON p.id=v.player_id),'[]'::jsonb),
  'recent_saved_changes',coalesce((SELECT jsonb_agg(to_jsonb(a) ORDER BY recorded_at DESC) FROM audit a),'[]'::jsonb)
) AS izan_victor_sanctions_review;
