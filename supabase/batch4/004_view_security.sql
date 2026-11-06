-- LOCAL REVIEW DRAFT based on the follow-up diagnostic supplied by the user.
-- Preserve view definitions/data. Enforce caller RLS and remove view write paths.
BEGIN;
ALTER VIEW public.active_suspensions SET (security_invoker=true);
ALTER VIEW public.player_card_totals SET (security_invoker=true);
ALTER VIEW public.official_evaluations SET (security_invoker=true);
REVOKE ALL ON public.active_suspensions,public.player_card_totals,public.official_evaluations FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.active_suspensions,public.player_card_totals,public.official_evaluations TO authenticated;
COMMIT;
