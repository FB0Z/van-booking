create or replace function public.get_slots()
returns table (trip_id bigint, departs_at timestamptz, capacity int, booked int)
language sql
stable
security definer
set search_path = ''
as $$
  select t.id, t.departs_at, t.capacity, count(b.id)::int
  from public.trips t
  left join public.bookings b on b.trip_id = t.id
  where t.departs_at > now()
  group by t.id
  order by t.departs_at;
$$;

revoke all on function public.get_slots() from public;
grant execute on function public.get_slots() to anon, authenticated;

revoke all on table public.trips, public.bookings from anon, authenticated;