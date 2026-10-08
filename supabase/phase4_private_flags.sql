-- Run AFTER existing base schema and phase 2 and phase 3 migrations.
create table if not exists public.staff_flags (
 id uuid primary key default gen_random_uuid(),
 player_id uuid not null references public.players(id) on delete cascade,
 week_start date not null,
 category text not null check(category in ('attitude','on_field','off_field','positive')),
 detail text not null check(length(trim(detail))>0),
 created_by uuid not null default auth.uid() references auth.users(id),
 created_at timestamptz not null default now()
);
create index if not exists staff_flags_week_idx on public.staff_flags(week_start);
alter table public.staff_flags enable row level security;
drop policy if exists "admin_read_staff_flags" on public.staff_flags;
create policy "admin_read_staff_flags" on public.staff_flags for select to authenticated using (exists(select 1 from public.profiles where id=auth.uid() and role='admin'));
drop policy if exists "admin_insert_staff_flags" on public.staff_flags;
create policy "admin_insert_staff_flags" on public.staff_flags for insert to authenticated with check (created_by=auth.uid() and exists(select 1 from public.profiles where id=auth.uid() and role='admin'));
drop policy if exists "admin_delete_staff_flags" on public.staff_flags;
create policy "admin_delete_staff_flags" on public.staff_flags for delete to authenticated using (exists(select 1 from public.profiles where id=auth.uid() and role='admin'));
