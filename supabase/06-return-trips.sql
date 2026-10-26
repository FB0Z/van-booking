insert into public.trips (route, departs_at, capacity, direction)
select 'Talara → Lobitos', departs_at + interval '5 hours', capacity, 'to_lobitos'
from public.trips
where direction = 'to_talara';