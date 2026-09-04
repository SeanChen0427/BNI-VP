-- Fulian business dates are calendar dates in Asia/Taipei.
-- Keep timestamptz values in UTC; only date-bound authorization uses this helper.

create or replace function private.taipei_today()
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select (now() at time zone 'Asia/Taipei')::date
$$;

revoke all on function private.taipei_today() from public, anon, authenticated;

create or replace function private.is_active_committee_person(target_person_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.committee_terms t
    where t.person_id = target_person_id
      and t.status = 'active'
      and t.has_voting_right
      and (select private.taipei_today()) >= t.starts_on
      and (t.ends_on is null or (select private.taipei_today()) <= t.ends_on)
  )
$$;

create or replace function private.is_case_assigned(target_case_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select private.has_role(array['admin'::public.app_role, 'vp'::public.app_role]))
    or (
      (select private.current_app_role()) = 'committee'::public.app_role
      and exists (
        select 1
        from public.case_assignments ca
        join public.committee_terms t on t.person_id = ca.person_id
        where ca.case_id = target_case_id
          and t.role = 'committee'
          and t.status = 'active'
          and (select private.taipei_today()) >= t.starts_on
          and (t.ends_on is null or (select private.taipei_today()) <= t.ends_on)
      )
    )
$$;

create or replace function private.is_task_assigned(target_task_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select private.has_role(array['admin'::public.app_role, 'vp'::public.app_role]))
    or (
      (select private.current_app_role()) = 'committee'::public.app_role
      and exists (
        select 1
        from public.task_assignments ta
        join public.committee_terms t on t.person_id = ta.person_id
        where ta.task_id = target_task_id
          and t.status = 'active'
          and (select private.taipei_today()) >= t.starts_on
          and (t.ends_on is null or (select private.taipei_today()) <= t.ends_on)
      )
    )
$$;

comment on function private.taipei_today() is
  'Fulian business-date source. Timestamps remain UTC; term, deadline and schedule dates use Asia/Taipei.';

comment on function private.is_active_committee_person(uuid) is
  'Checks voting committee activity using the Asia/Taipei business date.';

comment on function private.is_case_assigned(uuid) is
  'Checks case assignment and current committee term using the Asia/Taipei business date.';

comment on function private.is_task_assigned(uuid) is
  'Checks task assignment and current committee term using the Asia/Taipei business date.';
