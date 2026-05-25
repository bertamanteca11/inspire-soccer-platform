alter table sessions
add column if not exists evaluation_confirmed boolean not null default false,
add column if not exists evaluation_confirmed_at timestamptz,
add column if not exists low_rating_limit int not null default 3,
add column if not exists callup_confirmed boolean not null default false,
add column if not exists callup_confirmed_at timestamptz,
add column if not exists attendance_confirmed boolean not null default false,
add column if not exists attendance_confirmed_at timestamptz;

create or replace view player_card_totals as
select
  p.id as player_id,
  p.display_name,
  coalesce(count(c.id) filter (where c.type = 'yellow'), 0)
    + coalesce(count(c.id) filter (where c.type = 'double_yellow'), 0) * 2
    as yellow_cards,
  coalesce(count(c.id) filter (where c.type in ('straight_red','double_yellow')), 0) as red_cards,
  coalesce(count(c.id),0) as total_cards
from players p
left join cards c on c.player_id = p.id
group by p.id, p.display_name;
