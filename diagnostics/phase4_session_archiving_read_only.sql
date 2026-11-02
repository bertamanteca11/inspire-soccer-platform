-- READ-ONLY PREFLIGHT. Run manually with authorized access if requested.
-- This file contains no migration, policy changes, data corrections or writes.
-- Owner/SQL Editor results alone do not prove a real authenticated user's RLS.

-- 1. Discover the actual status type and required session columns.
SELECT column_name, data_type, udt_schema, udt_name, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema='public' AND table_name='sessions'
ORDER BY ordinal_position;

-- Enum status must admit planned, completed and archived. Text/check-based
-- statuses are inspected in the next query rayther than assumed to be enums.
SELECT n.nspname AS type_schema, t.typname, e.enumlabel, e.enumsortorder
FROM pg_attribute a
JOIN pg_type t ON t.oid=a.atttypid
JOIN pg_namespace n ON n.oid=t.typnamespace
JOIN pg_enum e ON e.enumtypid=t.oid
WHERE a.attrelid='public.sessions'::regclass AND a.attname='status'
ORDER BY e.enumsortorder;

SELECT conname, contype, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid='public.sessions'::regclass;

-- 2. Inspect grants, RLS, and policies, including SELECT of archived sessions.
SELECT relrowsecurity, relforcerowsecurity
FROM pg_class WHERE oid='public.sessions'::regclass;

SELECT has_table_privilege('authenticated','public.sessions','SELECT') AS table_select,
       has_column_privilege('authenticated','public.sessions','status','UPDATE') AS status_update;

SELECT grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema='public' AND table_name='sessions';

SELECT policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname='public' AND tablename IN ('sessions','profiles')
ORDER BY tablename, policyname;

-- 3. Inspect triggers before certifying that a status update has no side effects.
SELECT tgname, pg_get_triggerdef(oid) AS trigger_definition,
       pg_get_functiondef(tgfoid) AS function_definition
FROM pg_trigger
WHERE tgrelid='public.sessions'::regclass AND NOT tgisinternal;

-- 4. Current states and explicit rating limits; do not change values to make
-- a UI check pass. Historical rows must remain readable after archive.
SELECT status::text, count(*) FROM public.sessions GROUP BY status;
SELECT id, name, session_date, status::text, high_rating_limit,
       to_jsonb(s)->>'low_rating_limit' AS low_rating_limit
FROM public.sessions s
ORDER BY session_date DESC, id;

-- 5. List related FKs. The application does not issue DELETE or alter children.
SELECT conrelid::regclass AS referencing_table, conname,
       pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE contype='f' AND confrelid='public.sessions'::regclass;
