-- Manual diagnostics ONLY. No DDL, corrections, migrations or data writes.
-- Run in Supabase SQL Editor with authorized read access. Inspect every result.

-- 1. Verify the actual production enum before approving attendance classification.
SELECT unnest(enum_range(NULL::public.attendance_status))::text AS status;

-- 2. Verify the supplied official view and baseline (56 was the supplied snapshot,
-- not a hardcoded expected count for a database that continues to receive data).
SELECT pg_get_viewdef('public.official_evaluations'::regclass, true) AS definition;
SELECT s.id, s.session_date, s.name, count(*) AS evaluation_records
FROM public.official_evaluations e
JOIN public.sessions s ON s.id = e.session_id
GROUP BY s.id, s.session_date, s.name
ORDER BY s.session_date, s.id;

-- 3. Find exact player UUID(s). Name search is diagnostic, never an update key.
SELECT id, name, nickname, display_name, shirt_number, status
FROM public.players
WHERE name ILIKE '%Marcos%' OR display_name ILIKE '%Zamora%'
ORDER BY name, id;

-- 4. All stored attendance for matching player(s), WITHOUT a performance cutoff.
-- Correlated aggregates avoid multiplying attendance rows when callups duplicate.
-- Review the UUID from query 3 if more than one player matches.
SELECT p.id AS player_id, p.display_name, a.id AS attendance_id,
       a.session_id, s.session_date, s.name AS session_name,
       a.status::text AS attendance_status, a.notes,
       s.id IS NULL AS missing_session,
       (SELECT count(*) FROM public.attendance d
        WHERE d.player_id = a.player_id AND d.session_id = a.session_id)
         AS rows_for_player_session,
       (SELECT array_agg(c.status::text ORDER BY c.id) FROM public.callups c
        WHERE c.player_id = a.player_id AND c.session_id = a.session_id)
         AS callup_statuses
FROM public.attendance a
JOIN public.players p ON p.id = a.player_id
LEFT JOIN public.sessions s ON s.id = a.session_id
WHERE p.name ILIKE '%Marcos%' OR p.display_name ILIKE '%Zamora%'
ORDER BY p.id, s.session_date NULLS LAST, a.session_id, a.id;

-- 5. Raw counts vs distinct sessions, preserving each exact enum value.
SELECT p.id, p.display_name, a.status::text AS status,
       count(*) AS stored_rows, count(DISTINCT a.session_id) AS distinct_sessions
FROM public.attendance a
JOIN public.players p ON p.id = a.player_id
WHERE p.name ILIKE '%Marcos%' OR p.display_name ILIKE '%Zamora%'
GROUP BY p.id, p.display_name, a.status
ORDER BY p.id, status;

-- 6. The three reported dates, INCLUDING absent attendance/callup records.
SELECT p.id AS player_id, p.display_name, s.id AS session_id,
       s.session_date, s.name, a.id AS attendance_id,
       a.status::text AS attendance_status, a.notes,
       (SELECT array_agg(c.status::text ORDER BY c.id) FROM public.callups c
        WHERE c.player_id = p.id AND c.session_id = s.id) AS callup_statuses
FROM public.players p
CROSS JOIN public.sessions s
LEFT JOIN public.attendance a ON a.player_id = p.id AND a.session_id = s.id
WHERE (p.name ILIKE '%Marcos%' OR p.display_name ILIKE '%Zamora%')
  AND s.session_date IN (DATE '2026-10-18', DATE '2026-10-21', DATE '2026-10-23')
ORDER BY p.id, s.session_date, s.id, a.id;

-- 7. Duplicate and orphan diagnostics across the existing database.
SELECT player_id, session_id, count(*) AS rows,
       array_agg(id ORDER BY id) AS attendance_ids,
       array_agg(DISTINCT status::text) AS statuses
FROM public.attendance
GROUP BY player_id, session_id HAVING count(*) > 1;

SELECT a.id, a.player_id, a.session_id, a.status::text, a.notes
FROM public.attendance a
LEFT JOIN public.sessions s ON s.id = a.session_id
WHERE s.id IS NULL;

-- A physically deleted session cannot be reconstructed from current rows alone.
-- Identifying its former records requires its UUID or an existing audit/backup.
