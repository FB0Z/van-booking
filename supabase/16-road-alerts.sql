-- 16-road-alerts.sql  (Stage 3, steps 5 + 6: road alerts + driver on the rider's ticket)
-- Run all of it in one go in the SQL Editor, AFTER 15-driver-dashboard.sql.
--
-- What it adds:
--  * Verified drivers (van, mototaxi or motorbike) post road alerts:
--      info / warning / closed, a short message, shown for 3–24 hours.
--    Riders see them as a banner at the top of the booking page.
--    The public page never sees which driver posted an alert.
--  * The rider's ticket shows their driver's first name and number plate,
--    so they get into the right van. Only for verified drivers; never surname or phone.

-- 1. Road alerts -------------------------------------------------------------
create table public.road_alerts (
  id bigint generated always as identity primary key,
  driver_id uuid not null references public.drivers (user_id) on delete cascade,
  level text not null check (level in ('info', 'warning', 'closed')),
  message text not null check (char_length(message) between 3 and 200),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  ended_at timestamptz            -- set when the driver removes it early
);

alter table public.road_alerts enable row level security;
revoke all on table public.road_alerts from anon, authenticated;

-- What the rider page may see: alerts still showing, most serious first. No driver.
create function public.get_road_alerts()
returns table (alert_id bigint, level text, message text, created_at timestamptz, expires_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select a.id, a.level, a.message, a.created_at, a.expires_at
  from public.road_alerts a
  where a.ended_at is null and a.expires_at > now()
  order by case a.level when 'closed' then 0 when 'warning' then 1 else 2 end, a.created_at desc
  limit 5;
$$;

revoke all on function public.get_road_alerts() from public;
grant execute on function public.get_road_alerts() to anon, authenticated;

-- A verified driver posts an alert.
-- Returns: posted, not_allowed, invalid_level, invalid_message, invalid_hours, too_many
create function public.post_road_alert(p_level text, p_message text, p_hours int)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_driver uuid := public.my_verified_driver();
  v_message text := btrim(regexp_replace(coalesce(p_message, ''), '\s+', ' ', 'g'));
begin
  if v_driver is null then
    return 'not_allowed';
  end if;
  if p_level not in ('info', 'warning', 'closed') then
    return 'invalid_level';
  end if;
  if char_length(v_message) not between 3 and 200 then
    return 'invalid_message';
  end if;
  if p_hours is null or p_hours not between 1 and 24 then
    return 'invalid_hours';
  end if;
  -- At most 3 at a time per driver, so the banner can't be flooded
  if (select count(*) from public.road_alerts a
      where a.driver_id = v_driver and a.ended_at is null and a.expires_at > now()) >= 3 then
    return 'too_many';
  end if;

  insert into public.road_alerts (driver_id, level, message, expires_at)
  values (v_driver, p_level, v_message, now() + make_interval(hours => p_hours));
  return 'posted';
end;
$$;

revoke all on function public.post_road_alert(text, text, int) from public, anon;
grant execute on function public.post_road_alert(text, text, int) to authenticated;

-- The driver's own alerts that are still showing
create function public.get_my_road_alerts()
returns table (alert_id bigint, level text, message text, created_at timestamptz, expires_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select a.id, a.level, a.message, a.created_at, a.expires_at
  from public.road_alerts a
  where a.driver_id = public.my_verified_driver()
    and a.ended_at is null and a.expires_at > now()
  order by a.created_at desc;
$$;

revoke all on function public.get_my_road_alerts() from public, anon;
grant execute on function public.get_my_road_alerts() to authenticated;

-- Remove one of your own alerts early. Returns: ok, not_allowed
create function public.end_road_alert(p_alert_id bigint)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.road_alerts a
  set ended_at = now()
  where a.id = p_alert_id
    and a.ended_at is null
    and a.driver_id = public.my_verified_driver();
  if not found then
    return 'not_allowed';
  end if;
  return 'ok';
end;
$$;

revoke all on function public.end_road_alert(bigint) from public, anon;
grant execute on function public.end_road_alert(bigint) to authenticated;

-- 2. Driver on the rider's ticket ---------------------------------------------
-- get_slots also sends the driver's FIRST name and plate (verified drivers only).
-- Same as 15-driver-dashboard.sql otherwise. Drop + create, so the grants are repeated.
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
  delay_minutes int,
  driver_name text,
  driver_plate text
)
language sql
stable
security definer
set search_path = ''
as $$
  select t.id, t.departs_at, t.capacity, count(b.id)::int,
         v.code, v.name_es, v.name_en, t.direction, t.status, t.delay_minutes,
         split_part(btrim(d.full_name), ' ', 1),
         d.plate
  from public.trips t
  join public.vehicle_types v on v.code = t.vehicle_type
  left join public.drivers d on d.user_id = t.driver_id and d.status = 'verified'
  left join public.bookings b on b.trip_id = t.id and b.cancelled_at is null
  where t.departs_at + make_interval(mins => coalesce(t.delay_minutes, 0)) > now()
  group by t.id, v.code, d.user_id
  order by t.departs_at;
$$;

revoke all on function public.get_slots() from public;
grant execute on function public.get_slots() to anon, authenticated;