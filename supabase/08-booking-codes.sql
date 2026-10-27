-- 1. Two new columns on bookings
--    booking_code: what the rider shows the driver, like SIC-4821
--    request_id:   a hidden ID for each booking attempt, so a retry can't book twice
alter table public.bookings
  add column booking_code text unique,
  add column request_id uuid unique;

-- Give the existing (test) bookings a code too
update public.bookings
set booking_code = upper(left(boarding_stop, 3)) || '-' || (1000 + floor(random() * 9000))::int
where booking_code is null;

alter table public.bookings alter column booking_code set not null;

-- 2. book_seat makes the code, returns it, and remembers each attempt
drop function public.book_seat(bigint, text, text, text);

create function public.book_seat(
  p_trip_id bigint,
  p_first_name text,
  p_boarding_stop text,
  p_dropoff_stop text default null,
  p_request_id uuid default null
)
returns table (status text, seats_left int, code text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_capacity int;
  v_departs timestamptz;
  v_direction text;
  v_booked int;
  v_name text := btrim(p_first_name);
  v_dropoff text := p_dropoff_stop;
  v_board_km numeric;
  v_drop_km numeric;
  v_code text;
begin
  if v_name is null or char_length(v_name) not between 1 and 30 then
    return query select 'invalid_name'::text, null::int, null::text;
    return;
  end if;

  -- Lock this trip's row: two people booking at the same moment wait in line
  select t.capacity, t.departs_at, t.direction into v_capacity, v_departs, v_direction
  from public.trips t
  where t.id = p_trip_id
  for update;

  if not found then
    return query select 'not_found'::text, null::int, null::text;
    return;
  end if;

  -- Same attempt sent again (the first reply got lost): give back the same booking
  if p_request_id is not null then
    select b.booking_code into v_code
    from public.bookings b
    where b.request_id = p_request_id;

    if v_code is not null then
      select count(*)::int into v_booked from public.bookings b where b.trip_id = p_trip_id;
      return query select 'booked'::text, v_capacity - v_booked, v_code;
      return;
    end if;
  end if;

  if v_departs <= now() then
    return query select 'not_found'::text, null::int, null::text;
    return;
  end if;

  -- No drop-off sent: ride to the end of the line
  if v_dropoff is null then
    select s.name into v_dropoff
    from public.stops s
    where s.active
    order by case when v_direction = 'to_talara' then s.km_from_talara else -s.km_from_talara end
    limit 1;
  end if;

  -- Both stops must exist, be switched on, and be in the order this van drives past them
  select s.km_from_talara into v_board_km from public.stops s where s.name = p_boarding_stop and s.active;
  select s.km_from_talara into v_drop_km from public.stops s where s.name = v_dropoff and s.active;

  if v_board_km is null or v_drop_km is null
     or (v_direction = 'to_talara' and v_board_km <= v_drop_km)
     or (v_direction = 'to_lobitos' and v_board_km >= v_drop_km) then
    return query select 'invalid_stop'::text, null::int, null::text;
    return;
  end if;

  select count(*)::int into v_booked
  from public.bookings b
  where b.trip_id = p_trip_id;

  if v_booked >= v_capacity then
    return query select 'full'::text, 0, null::text;
    return;
  end if;

  -- Make a code no other booking has: first 3 letters of the boarding stop + 4 digits
  loop
    v_code := upper(left(p_boarding_stop, 3)) || '-' || (1000 + floor(random() * 9000))::int;
    exit when not exists (select 1 from public.bookings b where b.booking_code = v_code);
  end loop;

  insert into public.bookings (trip_id, first_name, boarding_stop, dropoff_stop, booking_code, request_id)
  values (p_trip_id, v_name, p_boarding_stop, v_dropoff, v_code, p_request_id);

  return query select 'booked'::text, v_capacity - v_booked - 1, v_code;
end;
$$;

revoke all on function public.book_seat(bigint, text, text, text, uuid) from public;
grant execute on function public.book_seat(bigint, text, text, text, uuid) to anon, authenticated;