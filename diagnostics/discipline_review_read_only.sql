-- MANUAL READ ONLY: schema, guards and ambiguous disciplinary records.
-- No RPC execution, account changes or sporting-record writes. Share privately.
SELECT jsonb_build_object(
  'columns',(SELECT jsonb_agg(jsonb_build_object('table',table_name,'column',column_name,'type',udt_name,
    'nullable',is_nullable,'default',column_default,'generated',is_generated,'expression',generation_expression)
    ORDER BY table_name,ordinal_position) FROM information_schema.columns WHERE table_schema='public'
    AND table_name IN ('cards','suspensions','batch4_discipline_cycles','batch4_card_suspensions','sessions')),
  'constraints',(SELECT jsonb_agg(jsonb_build_object('table',c.conrelid::regclass::text,'name',c.conname,'definition',pg_get_constraintdef(c.oid)) ORDER BY c.conname)
    FROM pg_constraint c WHERE c.conrelid IN ('public.cards'::regclass,'public.suspensions'::regclass)),
  'triggers',(SELECT jsonb_agg(jsonb_build_object('table',c.relname,'trigger',t.tgname,'enabled',t.tgenabled,'definition',pg_get_triggerdef(t.oid)) ORDER BY c.relname,t.tgname)
    FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname IN ('sessions','attendance','cards','suspensions') AND NOT t.tgisinternal),
  'legacy_advance',(SELECT jsonb_build_object('definition',pg_get_functiondef(p.oid),
    'authenticated_execute',has_function_privilege('authenticated',p.oid,'EXECUTE')) FROM pg_proc p
    WHERE p.oid=to_regprocedure('public.advance_suspensions_for_match(uuid)')),
  'views',(SELECT jsonb_agg(jsonb_build_object('name',c.relname,'definition',pg_get_viewdef(c.oid,true),'options',c.reloptions))
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname IN ('active_suspensions','player_card_totals') AND c.relkind='v'),
  'sanctions',coalesce((SELECT jsonb_agg(to_jsonb(q) ORDER BY q.player_id,q.created_at,q.id) FROM (
    SELECT s.id,s.player_id,p.display_name,s.source,s.status,s.matches_total,s.matches_served,s.created_from_session_id,
      s.created_at,s.served_at,(SELECT session_date FROM public.sessions WHERE id=s.created_from_session_id) AS originating_date,
      (SELECT count(*) FROM public.cards c WHERE c.player_id=s.player_id AND c.type::text='yellow') AS simple_yellow_history,
      (SELECT to_jsonb(b) FROM public.batch4_discipline_cycles b WHERE b.player_id=s.player_id) AS cycle
    FROM public.suspensions s JOIN public.players p ON p.id=s.player_id
  ) q),'[]'::jsonb),
  'duplicate_card_groups',coalesce((SELECT jsonb_agg(to_jsonb(q)) FROM (
    SELECT player_id,session_id,count(*) AS card_rows,array_agg(type::text ORDER BY created_at,id) AS types
    FROM public.cards GROUP BY player_id,session_id HAVING count(*)>1
  ) q),'[]'::jsonb)
) AS discipline_review;
