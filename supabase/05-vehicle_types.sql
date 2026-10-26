-- The kinds of vehicle a trip can use. Names live here, like stop names.
create table public.vehicle_types (
  code text primary key,
  name_es text not null,
  name_en text not null
);

alter table public.vehicle_types enable row level security;

insert into public.vehicle_types (code, name_es, name_en) values
  ('van', 'Van', 'Van');

-- Every trip gets a vehicle type. Existing trips become 'van' automatically.
alter table public.trips
  add column vehicle_type text not null default 'van'
  references public.vehicle_types (code);
-- Lock the new tables the same way as trips and bookings
revoke all on table public.stops, public.vehicle_types from anon, authenticated;