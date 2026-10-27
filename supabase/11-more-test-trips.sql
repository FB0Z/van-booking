insert into public.trips (route, departs_at, capacity, direction)
select t.route, t.departs_at + d.n * interval '1 day', t.capacity, t.direction
from public.trips t
cross join (values (1), (2)) as d(n);