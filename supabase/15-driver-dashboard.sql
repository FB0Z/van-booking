-- 15-driver-dashboard.sql  (Stage 3, steps 3 + 4: privacy rules + driver dashboard)
-- Run all of it in one go in the SQL Editor.
--
-- What it adds:
--  * Each trip belongs to a driver, and has a live status the driver sets:
--      scheduled (normal) / leaving (leaving now) / delayed (+ minutes) / full / cancelled
--  * Each booking can be ticked "boarded" by the driver.
--  * Privacy: only a VERIFIED driver sees passengers, and only on THEIR OWN trips.
--    Pending, rejected and suspended drivers, other drivers and the public key get nothing.
--  * Van drivers can add their own departures.
--  * The rider page sees each trip's status (never names), and can't book a trip
--    that is leaving, full or cancelled.

-- 1. New columns ------------------------------------------------------------

alter table public.trips
  add column driver_id uuid references public.drivers (user_id) on delete set null,
  add column status text not null default 'scheduled'
    check (status in ('scheduled', 'leaving', 'delayed', 'full', 'cancelled')),
  add column delay_minutes int check (delay_minutes between 5 and 180),
  add column status_at timestamptz;

create index trips_driver_departs on public.trips (driver_id, departs_at);

alter table public.bookings add column boarded_at timestamptz;

-- 2. Who is asking? ----------------------------------------------------------
-- The logged-in user's id, but ONLY if they are a verified driver; otherwise null.
-- Every driver function below starts here: this is the second lock.
create function public.my_verified_driver()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select d.user_id from public.drivers d
  where d.user_id = auth.uid() and d.status = 'verified';
$$;

revoke all on function public.my_verified_driver() from public, anon, authenticated;

-- Start of today in Lima, as a moment in time
create function public.lima_today_start()
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select (date_trunc('day', now() at time zone 'America/Lima')) at time zone 'America/Lima';
$$;

-- 3. The driver's own trips: today and the next 14 days ----------------------
create function public.get_my_trips()
returns table (
  trip_id bigint,
  departs_at timestamptz,
  direction text,
  capacity int,
  booked int,
  boarded int,
  status text,
  delay_minutes int
)
language sql
stable
security definer
set search_path = ''
as $$
  select t.id, t.departs_at, t.direction, t.capacity,
         count(b.id)::int,
         count(b.boarded_at)::int,
         t.status, t.delay_minutes
  from public.trips t
  left join public.bookings b on b.trip_id = t.id and b.cancelled_at is null
  where t.driver_id = public.my_verified_driver()
    and t.departs_at >= public.lima_today_start()
    and t.departs_at <  public.lima_today_start() + interval '15 days'
  group by t.id
  order by t.departs_at;
$$;

revoke all on function public.get_my_trips() from public, anon;
grant execute on function public.get_my_trips() to authenticated;

-- 4. Passengers on ONE of the driver's own trips, in the order the van meets them
create function public.get_trip_passengers(p_trip_id bigint)
returns table (
  booking_id bigint,
  first_name text,
  boarding_stop text,
  dropoff_stop text,
  booking_code text,
  boarded boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select b.id, b.first_name, b.boarding_stop, b.dropoff_stop, b.booking_code,
         b.boarded_at is not null
  from public.bookings b
  join public.trips t on t.id = b.trip_id
  join public.stops s on s.name = b.boarding_stop
  where b.trip_id = p_trip_id
    and b.cancelled_at is null
    and t.driver_id = public.my_verified_driver()
  order by case when t.direction = 'to_talara' then -s.km_from_talara else s.km_from_talara end,
           b.first_name, b.id;
$$;

revoke all on function public.get_trip_passengers(bigint) from public, anon;
grant execute on function public.get_trip_passengers(bigint) to authenticated;

-- 5. Tick / untick "boarded". Returns: ok, not_allowed
create function public.set_boarded(p_booking_id bigint, p_boarded boolean)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.bookings b
  set boarded_at = case when p_boarded then coalesce(b.boarded_at, now()) else null end
  from public.trips t
  where b.id = p_booking_id
    and t.id = b.trip_id
    and b.cancelled_at is null
    and t.driver_id = public.my_verified_driver();

  if not found then
    return 'not_allowed';
  end if;
  return 'ok';
end;
$$;

revoke all on function public.set_boarded(bigint, boolean) from public, anon;
grant execute on function public.set_boarded(bigint, boolean) to authenticated;

-- 6. Set a trip's status. Returns: ok, not_allowed, invalid
--    'delayed' needs minutes (5–180); any other status clears them.
create function public.set_trip_status(p_trip_id bigint, p_status text, p_delay_minutes int default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_status not in ('scheduled', 'leaving', 'delayed', 'full', 'cancelled')
     or (p_status = 'delayed' and (p_delay_minutes is null or p_delay_minutes not between 5 and 180)) then
    return 'invalid';
  end if;

  update public.trips t
  set status = p_status,
      delay_minutes = case when p_status = 'delayed' then p_delay_minutes end,
      status_at = now()
  where t.id = p_trip_id
    and t.driver_id = public.my_verified_driver();

  if not found then
    return 'not_allowed';
  end if;
  return 'ok';
end;
$$;

revoke all on function public.set_trip_status(bigint, text, int) from public, anon;
grant execute on function public.set_trip_status(bigint, text, int) to authenticated;

-- 7. A van driver adds their own departure.
--    Returns: added, not_allowed, not_van, in_past, too_far, invalid_direction,
--             invalid_seats, duplicate
create function public.add_my_trip(p_departs_at timestamptz, p_direction text, p_capacity int)
returns table (status text, trip_id bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_driver uuid := public.my_verified_driver();
  v_vehicle text;
  v_id bigint;
begin
  if v_driver is null then
    return query select 'not_allowed'::text, null::bigint; return;
  end if;

  select d.vehicle_type into v_vehicle from public.drivers d where d.user_id = v_driver;
  if v_vehicle <> 'van' then
    return query select 'not_van'::text, null::bigint; return;
  end if;

  if p_departs_at is null or p_departs_at <= now() then
    return query select 'in_past'::text, null::bigint; return;
  end if;
  if p_departs_at > now() + interval '30 days' then
    return query select 'too_far'::text, null::bigint; return;
  end if;
  if p_direction not in ('to_talara', 'to_lobitos') then
    return query select 'invalid_direction'::text, null::bigint; return;
  end if;
  if p_capacity is null or p_capacity not between 1 and 20 then
    return query select 'invalid_seats'::text, null::bigint; return;
  end if;
  if exists (select 1 from public.trips t
             where t.driver_id = v_driver and t.departs_at = p_departs_at) then
    return query select 'duplicate'::text, null::bigint; return;
  end if;

  insert into public.trips (route, departs_at, capacity, direction, vehicle_type, driver_id)
  values (case when p_direction = 'to_talara' then 'Lobitos → Talara' else 'Talara → Lobitos' end,
          p_departs_at, p_capacity, p_direction, 'van', v_driver)
  returning id into v_id;

  return query select 'added'::text, v_id;
end;
$$;

revoke all on function public.add_my_trip(timestamptz, text, int) from public, anon;
grant execute on function public.add_my_trip(timestamptz, text, int) to authenticated;

-- 8. Rider page: get_slots also sends each trip's status (still never names).
--    A delayed trip stays listed until its new, later time.
--    Changing what a function returns means drop + create, so the grants are repeated.
drop function public.get_slots();

create function public.get_slots()
returns table (
  trip_id bigint,
  departs_at timestamptz,
  capacity int,
  booked int,
  vehicle text,
  vehicle_es text,
  vehicle_en text,
  direction text,
  status text,
  delay_minutes int
)
language sql
stable
security definer
set search_path = ''
as $$
  select t.id, t.departs_at, t.capacity, count(b.id)::int,
         v.code, v.name_es, v.name_en, t.direction, t.status, t.delay_minutes
  from public.trips t
  join public.vehicle_types v on v.code = t.vehicle_type
  left join public.bookings b on b.trip_id = t.id and b.cancelled_at is null
  where t.departs_at + make_interval(mins => coalesce(t.delay_minutes, 0)) > now()
  group by t.id, v.code
  order by t.departs_at;
$$;

revoke all on function public.get_slots() from public;
grant execute on function public.get_slots() to anon, authenticated;

-- 9. book_seat: same as 09-cancel-booking.sql, plus the trip status check (marked NEW).
--    Leaving or cancelled trips answer not_found; a trip the driver marked full answers full.
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
  v_status text;  -- NEW
  v_delay int;    -- NEW
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

  select t.capacity, t.departs_at, t.direction, t.status, t.delay_minutes
  into v_capacity, v_departs, v_direction, v_status, v_delay
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
      where b.trip_id = p_trip_id and b.cancelled_at is null;
      return query select 'booked'::text, v_capacity - v_booked, v_code;
      return;
    end if;
  end if;

  -- NEW: a delayed trip can be booked until its new time; leaving/cancelled can't be booked
  if v_departs + make_interval(mins => coalesce(v_delay, 0)) <= now()
     or v_status in ('leaving', 'cancelled') then
    return query select 'not_found'::text, null::int, null::text;
    return;
  end if;

  if v_status = 'full' then  -- NEW
    return query select 'full'::text, 0, null::text;
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
  where b.trip_id = p_trip_id and b.cancelled_at is null;

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

-- 10. Give the existing test trips to your test driver.
--     Change the email if your test driver uses a different one.
update public.trips
set driver_id = (select u.id from auth.users u where u.email = 'gdb@uop.com')
where driver_id is null;