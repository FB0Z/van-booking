-- 18-demo-reset.sql  (run before every demo or test session)
-- Puts the database back to a clean demo state in one go:
--   * all trips start tomorrow (Lima time), same times of day, all back to normal
--     (no delays, nothing full / leaving / cancelled)
--   * every trip belongs to the test driver
--   * only the permanent "Prueba" bookings remain, none cancelled, none ticked "boarded"
--   * no road alerts showing
-- ONLY for test data: never run this once real riders book.
-- The test driver is test1@gmail.com. To use another, change it in step 2 below.

-- 1. Bookings: keep only the permanent test bookings, untouched
delete from public.bookings where first_name not like 'Prueba %';
update public.bookings set cancelled_at = null, boarded_at = null;

-- 2. Trips: back to normal, all with the test driver
--    (only once that driver has saved their details on the driver page;
--     before that, trips just stay without a driver)
update public.trips
set status = 'scheduled', delay_minutes = null, status_at = null,
    driver_id = coalesce(driver_id, (select d.user_id
                                     from public.drivers d
                                     join auth.users u on u.id = d.user_id
                                     where lower(u.email) = lower('test1@gmail.com')));

-- 3. Trips start tomorrow (same as 17-move-trips-to-tomorrow.sql)
update public.trips
set departs_at = departs_at + make_interval(days =>
  ((now() at time zone 'America/Lima')::date + 1)
  - (select min(t.departs_at at time zone 'America/Lima')::date from public.trips t)
);

-- 4. Road alerts: end all of them
update public.road_alerts set ended_at = now() where ended_at is null;

-- 5. Check: what the rider page will show
select to_char(departs_at at time zone 'America/Lima', 'Dy DD Mon HH24:MI') as lima_time,
       direction, booked, capacity, status, driver_name
from public.get_slots();