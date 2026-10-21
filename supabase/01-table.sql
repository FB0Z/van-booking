-- One row per van departure
create table public.trips (
  id bigint generated always as identity primary key,
  route text not null default 'Lobitos → Talara',
  departs_at timestamptz not null,
  capacity int not null default 8 check (capacity > 0)
);

-- One row per booked seat
create table public.bookings (
  id bigint generated always as identity primary key,
  type text not null default 'van' check (type in ('van', 'mototaxi')),
  trip_id bigint not null references public.trips (id) on delete cascade,
  first_name text not null check (char_length(first_name) between 1 and 30),
  boarding_stop text not null check (boarding_stop in ('Lobitos', 'Sichez', 'Piedritas')),
  created_at timestamptz not null default now()
);

-- Lock both tables: nobody can read them through the API yet
alter table public.trips enable row level security;
alter table public.bookings enable row level security;

-- Fake departures for tomorrow (-05 is Lima's offset from UTC)
insert into public.trips (departs_at) values
  ('2026-10-21 07:00:00-05'),
  ('2026-10-21 09:00:00-05'),
  ('2026-10-21 11:00:00-05');

-- Fake bookings, matching your old page: 3 seats taken, 8 (full), 1
insert into public.bookings (trip_id, first_name, boarding_stop)
select 1, 'Prueba ' || n, 'Lobitos'   from generate_series(1, 3) as n
union all
select 2, 'Prueba ' || n, 'Sichez'    from generate_series(1, 8) as n
union all
select 3, 'Prueba ' || n, 'Piedritas' from generate_series(1, 1) as n;