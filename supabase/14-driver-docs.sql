-- 14-driver-docs.sql  (Stage 3, step 2b: proof photos)
-- A private storage folder for photos of each driver's licence, SOAT and vehicle.
-- Run all of it in one go in the SQL Editor.
--
-- Rules:
--  * Each driver has their own folder, named after their login id:
--      driver-docs/<user id>/licence.jpg, soat.jpg, vehicle.jpg
--  * Drivers can see and upload ONLY their own photos, never anyone else's.
--  * Drivers can only add or change photos while their status is 'pending'
--    (so nobody can swap a photo after I've verified them).
--  * Drivers can't delete photos. Only I can, in the dashboard.
--  * The public key can't see anything in this folder.
--  * I can't set a driver to 'verified' unless all 3 photos are there
--    and their SOAT hasn't expired.

-- 1. The private folder ("bucket"). JPEG only, max 2 MB per photo
--    (the page shrinks photos to about 0.3 MB before sending them).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('driver-docs', 'driver-docs', false, 2097152, array['image/jpeg'])
on conflict (id) do nothing;

-- 2. Helper: is the logged-in driver allowed to upload right now?
--    (The drivers table is locked, so the storage rules ask through this function.)
create function public.driver_can_upload()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.drivers d
    where d.user_id = auth.uid() and d.status = 'pending'
  );
$$;

revoke all on function public.driver_can_upload() from public, anon;
grant execute on function public.driver_can_upload() to authenticated;

-- 3. Storage rules (policies). Only these 3 exist for this folder, so
--    anything not allowed here (deleting, other folders, anon) is refused.

-- See own photos (needed to show which ones are uploaded)
create policy "driver-docs: drivers see own photos"
on storage.objects for select
to authenticated
using (
  bucket_id = 'driver-docs'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

-- Upload own photos, only the 3 allowed names, only while pending
create policy "driver-docs: drivers upload own photos while pending"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'driver-docs'
  and array_length(storage.foldername(name), 1) = 1
  and (storage.foldername(name))[1] = (select auth.uid()::text)
  and storage.filename(name) in ('licence.jpg', 'soat.jpg', 'vehicle.jpg')
  and public.driver_can_upload()
);

-- Replace own photos (same rules)
create policy "driver-docs: drivers replace own photos while pending"
on storage.objects for update
to authenticated
using (
  bucket_id = 'driver-docs'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
  and public.driver_can_upload()
)
with check (
  bucket_id = 'driver-docs'
  and array_length(storage.foldername(name), 1) = 1
  and (storage.foldername(name))[1] = (select auth.uid()::text)
  and storage.filename(name) in ('licence.jpg', 'soat.jpg', 'vehicle.jpg')
  and public.driver_can_upload()
);

-- 4. Safety check for me: refuse 'verified' without all 3 photos or with an expired SOAT.
--    If I try in the Table Editor, it shows an error saying what's missing.
create function public.drivers_check_before_verify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_missing text[];
begin
  if new.status = 'verified' and old.status is distinct from 'verified' then
    select array_agg(f) into v_missing
    from unnest(array['licence.jpg', 'soat.jpg', 'vehicle.jpg']) as f
    where not exists (
      select 1 from storage.objects o
      where o.bucket_id = 'driver-docs'
        and o.name = new.user_id::text || '/' || f
    );

    if v_missing is not null then
      raise exception 'Cannot verify: missing photos: %', array_to_string(v_missing, ', ');
    end if;

    if new.soat_expires < (now() at time zone 'America/Lima')::date then
      raise exception 'Cannot verify: SOAT expired on %', new.soat_expires;
    end if;
  end if;
  return new;
end;
$$;

create trigger drivers_check_before_verify
before update on public.drivers
for each row execute function public.drivers_check_before_verify();