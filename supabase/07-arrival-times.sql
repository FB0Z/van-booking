-- Minutes from Talara for each stop (estimates for now)
alter table public.stops add column minutes_from_talara int;

update public.stops set minutes_from_talara = case name
  when 'Lobitos' then 30
  when 'Sichez' then 22
  when 'Piedritas' then 14
  when 'Talara' then 0
end;

alter table public.stops alter column minutes_from_talara set not null;

-- get_stops also sends the minutes
drop function public.get_stops();

create function public.get_stops()
returns table (name text, km_from_talara numeric, minutes_from_talara int, landmark text)
language sql
stable
security definer
set search_path = ''
as $$
  select s.name, s.km_from_talara, s.minutes_from_talara, s.landmark
  from public.stops s
  where s.active
  order by s.km_from_talara desc;
$$;

revoke all on function public.get_stops() from public;
grant execute on function public.get_stops() to anon, authenticated;