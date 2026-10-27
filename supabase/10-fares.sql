-- Prices live here, not in the code (estimates, brief p.51)
create table public.fares (
  day_type text primary key check (day_type in ('weekday', 'weekend')),
  full_route numeric(5,2) not null,   -- price for the whole line, Lobitos ↔ Talara
  minimum numeric(5,2) not null,      -- shortest trips never cost less than this
  round_up_to numeric(4,2) not null   -- round up to coins people have, e.g. 0.50
);

alter table public.fares enable row level security;
revoke all on table public.fares from anon, authenticated;

insert into public.fares (day_type, full_route, minimum, round_up_to) values
  ('weekday', 4, 2, 0.5),
  ('weekend', 5, 2.5, 0.5);

-- What the page may see: the price rules
create function public.get_fares()
returns table (day_type text, full_route numeric, minimum numeric, round_up_to numeric)
language sql
stable
security definer
set search_path = ''
as $$
  select f.day_type, f.full_route, f.minimum, f.round_up_to from public.fares f;
$$;

revoke all on function public.get_fares() from public;
grant execute on function public.get_fares() to anon, authenticated;