-- Boarding stops live here instead of in the code
create table public.stops (
  name text primary key,
  km_from_talara numeric(4,1) not null,
  landmark text,
  active boolean not null default true
);

-- Locked, like trips and bookings: the page can't read it directly
alter table public.stops enable row level security;

insert into public.stops (name, km_from_talara) values
  ('Lobitos', 17.7),
  ('Sichez', 13),
  ('Piedritas', 8);

-- What the page may see: active stops, furthest from Talara first
create or replace function public.get_stops()
returns table (name text, km_from_talara numeric, landmark text)
language sql
stable
security definer
set search_path = public
as $$
  select s.name, s.km_from_talara, s.landmark
  from public.stops s
  where s.active
  order by s.km_from_talara desc;
$$;

grant execute on function public.get_stops() to anon;