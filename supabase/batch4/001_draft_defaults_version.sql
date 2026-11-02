-- LOCAL PREPARATION ONLY. No backfill, no default, no policy changes.
BEGIN;
ALTER TABLE public.sessions
  ADD COLUMN draft_defaults_version smallint NULL
  CONSTRAINT sessions_draft_defaults_version_check
  CHECK (draft_defaults_version IS NULL OR draft_defaults_version = 1);
COMMIT;
