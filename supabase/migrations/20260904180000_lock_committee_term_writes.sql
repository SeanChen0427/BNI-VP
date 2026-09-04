-- Committee terms are readable by signed-in users, but all writes must go
-- through the Admin-only annual handover API and its service-role RPCs.

drop policy if exists committee_terms_write_leadership on public.committee_terms;
drop policy if exists committee_terms_update_leadership on public.committee_terms;

revoke insert, update, delete, truncate, references, trigger
  on table public.committee_terms
  from public, anon, authenticated;

grant select on table public.committee_terms to authenticated;
grant select, insert, update on table public.committee_terms to service_role;

do $$
begin
  if has_table_privilege('authenticated', 'public.committee_terms', 'INSERT')
    or has_table_privilege('authenticated', 'public.committee_terms', 'UPDATE')
    or has_table_privilege('authenticated', 'public.committee_terms', 'DELETE')
  then
    raise exception 'authenticated must not write committee_terms directly';
  end if;

  if not has_table_privilege('authenticated', 'public.committee_terms', 'SELECT')
    or not has_table_privilege('service_role', 'public.committee_terms', 'INSERT')
    or not has_table_privilege('service_role', 'public.committee_terms', 'UPDATE')
  then
    raise exception 'committee_terms read or service-role write privilege is missing';
  end if;
end
$$;

comment on table public.committee_terms is
  'Signed-in accounts may read terms for login and authorization. Inserts and updates are restricted to service-role operations behind the Admin-only annual handover workflow.';
