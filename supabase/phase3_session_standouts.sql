-- Inspire Soccer · Phase 3 · Session Standouts
-- Additive migration. Does not delete or modify existing session/evaluation data.

create table if not exists public.session_standouts (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  category text not null check (category in ('top','bottom')),
  rank smallint not null check (rank in (1,2)),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, category, rank),
  unique (session_id, player_id)
);

create index if not exists session_standouts_session_idx on public.session_standouts(session_id);
create index if not exists session_standouts_player_idx on public.session_standouts(player_id);

alter table public.session_standouts enable row level security;

-- Authenticated staff can read standouts. Editing is intentionally restricted to admins.
drop policy if exists "Authenticated can read standouts" on public.session_standouts;
create policy "Authenticated can read standouts" on public.session_standouts
for select to authenticated using (true);

drop policy if exists "Admins can insert standouts" on public.session_standouts;
create policy "Admins can insert standouts" on public.session_standouts
for insert to authenticated with check (
  exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
);

drop policy if exists "Admins can update standouts" on public.session_standouts;
create policy "Admins can update standouts" on public.session_standouts
for update to authenticated using (
  exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
) with check (
  exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
);

drop policy if exists "Admins can delete standouts" on public.session_standouts;
create policy "Admins can delete standouts" on public.session_standouts
for delete to authenticated using (
  exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
);
