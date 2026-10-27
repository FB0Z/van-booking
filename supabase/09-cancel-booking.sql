-- 1. A cancelled booking is marked, not deleted (keeps history for stats)
alter table public.bookings add column cancelled_at timestamptz;

-- 2. Cancel: needs the code AND the hidden attempt ID that only the booking phone has
create function public.cancel_booking(p_code text, p_request_id uuid)
returns table (status text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_trip bigint;
  v_cancelled timestamptz;
  v_departs timestamptz;
begin
  select b.trip_id, b.cancelled_at into v_trip, v_cancelled
  from public.bookings b
  where b.booking_code = upper(btrim(p_code)) and b.request_id = p_request_id;

  if not found then
    return query select 'not_found'::text;
    return;
  end if;

  -- Already cancelled (the first reply got lost): same answer, nothing changes
  if v_cancelled is not null then
    return query select 'cancelled'::text;
    return;
  end if;

  -- Lock the trip, like book_seat, so a cancel and a booking can't cross
  select t.departs_at into v_departs from public.trips t where t.id = v_trip for update;

  if v_departs - interval '30 minutes' <= now() then
    return query select 'too_late'::text;
    return;
  end if;

  update public.bookings b set cancelled_at = now()
  where b.booking_code = upper(btrim(p_code)) and b.request_id = p_request_id;

  return query select 'cancelled'::text;
end;
$$;

revoke all on function public.cancel_booking(text, uuid) from public;
grant execute on function public.cancel_booking(text, uuid) to anon, authenticated;

-- 3. get_slots: cancelled seats don't count
create or replace function public.get_slots()
returns table (
  trip_id bigint,
  departs_at timestamptz,
  capacity int,
  booked int,
  vehicle text,
  vehicle_es text,
  vehicle_en text,
  direction text
)
language sql
stable
security definer
set search_path = ''
as $$
  select t.id, t.departs_at, t.capacity, count(b.id)::int,
         v.code, v.name_es, v.name_en, t.direction
  from public.trips t
  join public.vehicle_types v on v.code = t.vehicle_type
  left join public.bookings b on b.trip_id = t.id and b.cancelled_at is null
  where t.departs_at > now()
  group by t.id, v.code
  order by t.departs_at;
$$;

-- 4. book_seat: cancelled seats don't count (two places, marked NEW)
create or replace function public.book_seat(
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

  select t.capacity, t.departs_at, t.direction into v_capacity, v_departs, v_direction
  from public.trips t
  where t.id = p_trip_id
  for update;

  if not found then
    return query select 'not_found'::text, null::int, null::text;
    return;
  end if;

  if p_request_id is not null then
    select b.booking_code into v_code
    from public.bookings b
    where b.request_id = p_request_id;

    if v_code is not null then
      select count(*)::int into v_booked from public.bookings b
      where b.trip_id = p_trip_id and b.cancelled_at is null;  -- NEW
      return query select 'booked'::text, v_capacity - v_booked, v_code;
      return;
    end if;
  end if;

  if v_departs <= now() then
    return query select 'not_found'::text, null::int, null::text;
    return;
  end if;

  if v_dropoff is null then
    select s.name into v_dropoff
    from public.stops s
    where s.active
    order by case when v_direction = 'to_talara' then s.km_from_talara else -s.km_from_talara end
    limit 1;
  end if;

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
  where b.trip_id = p_trip_id and b.cancelled_at is null;  -- NEW

  if v_booked >= v_capacity then
    return query select 'full'::text, 0, null::text;
    return;
  end if;

  loop
    v_code := upper(left(p_boarding_stop, 3)) || '-' || (1000 + floor(random() * 9000))::int;
    exit when not exists (select 1 from public.bookings b where b.booking_code = v_code);
  end loop;

  insert into public.bookings (trip_id, first_name, boarding_stop, dropoff_stop, booking_code, request_id)
  values (p_trip_id, v_name, p_boarding_stop, v_dropoff, v_code, p_request_id);

  return query select 'booked'::text, v_capacity - v_booked - 1, v_code;
end;
$$;