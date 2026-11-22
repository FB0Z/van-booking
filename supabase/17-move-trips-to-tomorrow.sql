-- 17-move-trips-to-tomorrow.sql  (for demos and tests)
-- Moves ALL trips by whole days, so the first trip day becomes tomorrow (Lima time).
-- The times of day stay the same, and bookings move with their trips.
-- Safe to run again before any demo. Only for test data: don't run once real riders book.

update public.trips
set departs_at = departs_at + make_interval(days =>
  ((now() at time zone 'America/Lima')::date + 1)
  - (select min(t.departs_at at time zone 'America/Lima')::date from public.trips t)
);

-- Check: the first day should be tomorrow
select min(departs_at at time zone 'America/Lima') as first_trip_lima,
       max(departs_at at time zone 'America/Lima') as last_trip_lima
from public.trips;