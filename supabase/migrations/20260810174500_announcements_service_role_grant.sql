-- app-api accesses the committee board with the Supabase service-role JWT.
-- RLS bypass does not replace PostgreSQL table privileges, so grant only the
-- operations used by the Edge Function. Browser roles remain revoked.
grant select, insert, update
  on table public.announcements
  to service_role;

revoke all
  on table public.announcements
  from public, anon, authenticated;
