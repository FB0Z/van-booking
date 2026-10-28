-- 13-drivers.sql  (Stage 3, step 2a: driver profiles and verification status)
-- Run all of it in one go in the SQL Editor.

-- 1. More vehicle types, so motorbike and mototaxi drivers can sign up too.
--    The rider page still only lists vans (trips are all 'van').
insert into public.vehicle_types (code, name_es, name_en) values
  ('mototaxi', 'Mototaxi', 'Mototaxi'),
  ('moto', 'Moto lineal', 'Motorbike')
on conflict (code) do nothing;

-- 2. One row per driver, linked to their login.
create table public.drivers (
  user_id        uuid primary key references auth.users (id) on delete cascade,
  full_name      text not null,
  phone          text not null,
  vehicle_type   text not null references public.vehicle_types (code),
  plate          text not null,
  seats          int  not null check (seats between 1 and 20),
  licence_number text not null,
  soat_expires   date not null,
  status         text not null default 'pending'
                 check (status in ('pending', 'verified', 'rejected', 'suspended')),
  status_note    text,              -- my note to the driver, e.g. why they were rejected
  submitted_at   timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  verified_at    timestamptz
);

-- Locked like the other tables: the page only uses the functions below.
alter table public.drivers enable row level security;
revoke all on table public.drivers from anon, authenticated;

-- 3. Keep the dates right when I change a status in the Table Editor.
create function public.drivers_touch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  if new.status = 'verified' and old.status is distinct from 'verified' then
    new.verified_at := now();
  elsif new.status <> 'verified' then
    new.verified_at := null;
  end if;
  return new;
end;
$$;

create trigger drivers_touch
before update on public.drivers
for each row execute function public.drivers_touch();

-- 4. The vehicle list for the driver form (van first).
create function public.get_vehicle_types()
returns table (code text, name_es text, name_en text)
language sql
stable
security definer
set search_path = ''
as $$
  select v.code, v.name_es, v.name_en
  from public.vehicle_types v
  order by (v.code <> 'van'), v.code;
$$;

revoke all on function public.get_vehicle_types() from public, anon;
grant execute on function public.get_vehicle_types() to authenticated;

-- 5. A driver reads their OWN profile. Never anyone else's.
create function public.get_my_driver()
returns table (
  full_name text,
  phone text,
  vehicle_type text,
  plate text,
  seats int,
  licence_number text,
  soat_expires date,
  status text,
  status_note text
)
language sql
stable
security definer
set search_path = ''
as $$
  select d.full_name, d.phone, d.vehicle_type, d.plate, d.seats,
         d.licence_number, d.soat_expires, d.status, d.status_note
  from public.drivers d
  where d.user_id = auth.uid();
$$;

revoke all on function public.get_my_driver() from public, anon;
grant execute on function public.get_my_driver() to authenticated;

-- 6. A driver saves their OWN profile. Every save goes back to 'pending',
--    because changed details need checking again. Suspended drivers can't edit.
--    Returns: saved, suspended, not_logged_in, invalid_name, invalid_phone,
--    invalid_vehicle, invalid_plate, invalid_seats, invalid_licence, soat_expired
create function public.save_my_driver(
  p_full_name text,
  p_phone text,
  p_vehicle_type text,
  p_plate text,
  p_seats int,
  p_licence_number text,
  p_soat_expires date
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_name    text := btrim(p_full_name);
  v_phone   text := regexp_replace(coalesce(p_phone, ''), '[^0-9+]', '', 'g');
  v_plate   text := upper(regexp_replace(coalesce(p_plate, ''), '\s', '', 'g'));
  v_licence text := upper(btrim(p_licence_number));
  v_today   date := (now() at time zone 'America/Lima')::date;
  v_status  text;
begin
  if v_uid is null then
    return 'not_logged_in';
  end if;

  select d.status into v_status from public.drivers d where d.user_id = v_uid;
  if v_status = 'suspended' then
    return 'suspended';
  end if;

  if v_name is null or char_length(v_name) not between 2 and 80 then
    return 'invalid_name';
  end if;
  if v_phone !~ '^\+?[0-9]{9,15}$' then
    return 'invalid_phone';
  end if;
  if not exists (select 1 from public.vehicle_types v where v.code = p_vehicle_type) then
    return 'invalid_vehicle';
  end if;
  if char_length(v_plate) not between 4 and 10 then
    return 'invalid_plate';
  end if;
  if p_seats is null or p_seats not between 1 and 20 then
    return 'invalid_seats';
  end if;
  if v_licence is null or char_length(v_licence) not between 5 and 15 then
    return 'invalid_licence';
  end if;
  if p_soat_expires is null or p_soat_expires < v_today then
    return 'soat_expired';
  end if;

  insert into public.drivers
    (user_id, full_name, phone, vehicle_type, plate, seats, licence_number, soat_expires)
  values
    (v_uid, v_name, v_phone, p_vehicle_type, v_plate, p_seats, v_licence, p_soat_expires)
  on conflict (user_id) do update set
    full_name      = excluded.full_name,
    phone          = excluded.phone,
    vehicle_type   = excluded.vehicle_type,
    plate          = excluded.plate,
    seats          = excluded.seats,
    licence_number = excluded.licence_number,
    soat_expires   = excluded.soat_expires,
    status         = 'pending',
    status_note    = null,
    submitted_at   = now();

  return 'saved';
end;
$$;

revoke all on function public.save_my_driver(text, text, text, text, int, text, date) from public, anon;
grant execute on function public.save_my_driver(text, text, text, text, int, text, date) to authenticated;