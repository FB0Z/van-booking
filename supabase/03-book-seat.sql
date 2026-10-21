create or replace function public.book_seat(
  p_trip_id bigint,
  p_first_name text,
  p_boarding_stop text
)
returns table (status text, seats_left int)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_capacity int;
  v_departs timestamptz;
  v_booked int;
  v_name text := btrim(p_first_name);
begin
  if v_name is null or char_length(v_name) not between 1 and 30 then
    return query select 'invalid_name'::text, null::int;
    return;
  end if;

  if p_boarding_stop is null or p_boarding_stop not in ('Lobitos', 'Sichez', 'Piedritas') then
    return query select 'invalid_stop'::text, null::int;
    return;
  end if;

  -- Lock this trip's row: two people booking at the same moment wait in line
  select capacity, departs_at into v_capacity, v_departs
  from public.trips
  where id = p_trip_id
  for update;

  if not found or v_departs <= now() then
    return query select 'not_found'::text, null::int;
    return;
  end if;

  select count(*)::int into v_booked
  from public.bookings
  where trip_id = p_trip_id;

  if v_booked >= v_capacity then
    return query select 'full'::text, 0;
    return;
  end if;

  insert into public.bookings (trip_id, first_name, boarding_stop)
  values (p_trip_id, v_name, p_boarding_stop);

  return query select 'booked'::text, v_capacity - v_booked - 1;
end;
$$;

revoke all on function public.book_seat(bigint, text, text) from public;
grant execute on function public.book_seat(bigint, text, text) to anon, authenticated;