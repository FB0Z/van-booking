-- 12-driver-whoami.sql  (Stage 3, step 1: driver login)
-- A tiny test function: tells a logged-in driver who the database thinks they are.
-- Proves the login token reaches the database, which the privacy rules in step 3 rely on.
-- Not "security definer": it runs as the caller, so auth.uid() is the driver.

create or replace function public.driver_whoami()
returns json
language sql
stable
as $$
  select json_build_object(
    'user_id', auth.uid(),
    'email',   auth.jwt() ->> 'email'
  );
$$;

-- Only logged-in users may call it; the public (anon) key may not.
revoke execute on function public.driver_whoami() from public, anon;
grant  execute on function public.driver_whoami() to authenticated;