-- READ ONLY. Actual rows for the user-confirmed 18/21/23 October review.
-- Share privately. Does not infer missing attendance or change any record.
WITH target_players AS (
  SELECT id,name,display_name,shirt_number FROM public.players
  WHERE lower(btrim(name))='marcos zamora' OR lower(btrim(display_name))='marcos zamora'
), reviewed_sessions AS (
  SELECT id,name,session_date,type,status,callup_confirmed,attendance_confirmed,
    evaluation_confirmed,records_only_confirmed
  FROM public.sessions WHERE session_date IN ('2026-10-18','2026-10-21','2026-10-23')
)
SELECT jsonb_build_object(
  'matching_players',coalesce((SELECT jsonb_agg(to_jsonb(p)) FROM target_players p),'[]'::jsonb),
  'sessions_on_review_dates',coalesce((SELECT jsonb_agg(to_jsonb(s) ORDER BY s.session_date,s.id) FROM reviewed_sessions s),'[]'::jsonb),
  'review_attendance',coalesce((SELECT jsonb_agg(to_jsonb(q) ORDER BY q.session_date,q.id) FROM (
    SELECT a.id,a.player_id,a.session_id,s.name AS session_name,s.session_date,
      a.status,a.notes FROM public.attendance a
    JOIN reviewed_sessions s ON s.id=a.session_id JOIN target_players p ON p.id=a.player_id
  ) q),'[]'::jsonb),
  'review_callups',coalesce((SELECT jsonb_agg(to_jsonb(q) ORDER BY q.session_date,q.id) FROM (
    SELECT c.id,c.player_id,c.session_id,s.session_date,c.status,c.evaluable
    FROM public.callups c JOIN reviewed_sessions s ON s.id=c.session_id
    JOIN target_players p ON p.id=c.player_id
  ) q),'[]'::jsonb),
  'earlier_unjustified_records',coalesce((SELECT jsonb_agg(to_jsonb(q) ORDER BY q.session_date,q.id) FROM (
    SELECT a.id,a.player_id,a.session_id,s.name AS session_name,s.session_date,a.status
    FROM public.attendance a JOIN public.sessions s ON s.id=a.session_id
    JOIN target_players p ON p.id=a.player_id
    WHERE s.session_date<'2026-10-18' AND a.status::text IN ('unjustified_absence','injured_unjustified_absence')
  ) q),'[]'::jsonb)
) AS diagnostic;
