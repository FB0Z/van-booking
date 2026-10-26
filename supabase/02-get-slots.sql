drop function public.get_slots();

create function public.get_slots()
returns table (
  trip_id bigint,
  departs_at timestamptz,
  capacity int,
  booked int,
  vehicle text,
  vehicle_es text,
  vehicle_en text
)
language sql
stable
security definer
set search_path = ''
as $$
  select t.id, t.departs_at, t.capacity, count(b.id)::int,
         v.code, v.name_es, v.name_en
  from public.trips t
  join public.vehicle_types v on v.code = t.vehicle_type
  left join public.bookings b on b.trip_id = t.id
  where t.departs_at > now()
  group by t.id, v.code
  order by t.departs_at;
$$;

revoke all on function public.get_slots() from public;
grant execute on function public.get_slots() to anon, authenticated;