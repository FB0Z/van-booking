-- 19-health-check.sql  (read-only: safe to run any time, changes nothing)
-- Checks the database is set up and locked down the way the project needs.
-- In the SQL Editor, each "select" shows its own result: use the result tabs.

-- 1. Every table is locked. Expected: rls_on = true and verdict = 'locked' on every row.
--    (A table with row level security on and no policies gives the public key nothing,
--    even if it could ask. All reading goes through the functions in check 2.)
select c.relname as table_name,
       c.relrowsecurity as rls_on,
       (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname) as policies,
       has_table_privilege('anon', c.oid, 'select') as public_key_has_grant,
       case when c.relrowsecurity
             and (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname) = 0
            then 'locked' else 'CHECK THIS' end as verdict
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by verdict desc, table_name;

-- 2. Which functions the public key and logged-in drivers can call.
--    Expected for public_key_can_call = true: get_slots, get_stops, get_fares, book_seat,
--    cancel_booking, get_road_alerts (plus small helpers like lima_today_start).
--    Driver functions (get_my_trips, get_trip_passengers, set_boarded, set_trip_status,
--    add_my_trip, post_road_alert ...) must say false for the public key.
select p.proname as function_name,
       has_function_privilege('anon', p.oid, 'execute') as public_key_can_call,
       has_function_privilege('authenticated', p.oid, 'execute') as logged_in_can_call
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prokind = 'f'
  and p.prorettype <> 'trigger'::regtype
order by public_key_can_call desc, function_name;

-- 3. The proof-photo folder is private. Expected: public = false.
select id as storage_bucket, public from storage.buckets where id = 'driver-docs';

-- 4. What's in the database right now
select 'upcoming trips' as what, count(*)::text as how_many
  from public.trips where departs_at > now()
union all
select 'upcoming trips without a driver', count(*)::text
  from public.trips where departs_at > now() and driver_id is null
union all
select 'bookings (not cancelled)', count(*)::text
  from public.bookings where cancelled_at is null
union all
select 'drivers: ' || status, count(*)::text
  from public.drivers group by status
union all
select 'road alerts showing now', count(*)::text
  from public.road_alerts where ended_at is null and expires_at > now();