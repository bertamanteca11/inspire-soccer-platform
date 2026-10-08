-- Inspire Soccer · Phase 2 · Player Profile 2.0
-- Safe additive migration: does not delete or overwrite existing player data.

alter table public.players add column if not exists birth_date date;
alter table public.players add column if not exists career_notes text;
alter table public.players add column if not exists photo_url text;

-- Optional public bucket for player photos. Existing URLs can also be stored directly in photo_url.
insert into storage.buckets (id, name, public)
values ('player-photos', 'player-photos', true)
on conflict (id) do update set public = true;

-- Public read access to player photos. Uploads still follow your existing authenticated/storage policies.
drop policy if exists "Public player photos" on storage.objects;
create policy "Public player photos"
on storage.objects for select
using (bucket_id = 'player-photos');
