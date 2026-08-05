-- New members need to join the weekly attendance roster immediately after the
-- admission case is closed, while PALMS remains the only source that promotes
-- them into the official member master used by analysis.

create table public.provisional_members (
  id uuid primary key default gen_random_uuid(),
  source_task_id uuid not null references public.tasks(id) on delete restrict,
  display_name text not null check (length(btrim(display_name)) between 1 and 100),
  profession text not null check (length(btrim(profession)) between 1 and 200),
  joined_on date not null,
  status text not null default 'pending_palms'
    check (status in ('pending_palms', 'promoted', 'cancelled')),
  registered_by uuid not null references public.people(id) on delete restrict,
  registered_at timestamptz not null default now(),
  official_member_id uuid references public.members(id) on delete restrict,
  palms_report_import_id uuid references public.report_imports(id) on delete restrict,
  promoted_at timestamptz,
  cancelled_by uuid references public.people(id) on delete restrict,
  cancelled_at timestamptz,
  cancellation_note text not null default '' check (length(cancellation_note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (status = 'pending_palms' and official_member_id is null and palms_report_import_id is null and promoted_at is null and cancelled_by is null and cancelled_at is null)
    or (status = 'promoted' and official_member_id is not null and palms_report_import_id is not null and promoted_at is not null and cancelled_by is null and cancelled_at is null)
    or (status = 'cancelled' and official_member_id is null and palms_report_import_id is null and promoted_at is null and cancelled_by is not null and cancelled_at is not null)
  )
);

comment on table public.provisional_members is
  'Operational new-member roster after a closed admission case. Excluded from official analysis until a unique PALMS match promotes it.';

create unique index provisional_members_one_live_registration_per_task
  on public.provisional_members (source_task_id)
  where status <> 'cancelled';

create unique index provisional_members_unique_pending_identity
  on public.provisional_members (
    regexp_replace(lower(btrim(display_name)), '\s+', '', 'g'),
    regexp_replace(lower(btrim(profession)), '\s+', '', 'g')
  )
  where status = 'pending_palms';

create index provisional_members_pending_name_idx
  on public.provisional_members (display_name)
  where status = 'pending_palms';

alter table public.attendance_records
  alter column member_id drop not null,
  add column provisional_member_id uuid references public.provisional_members(id) on delete restrict,
  add constraint attendance_records_exactly_one_member
    check (num_nonnulls(member_id, provisional_member_id) = 1),
  add constraint attendance_records_session_provisional_member_key
    unique (session_id, provisional_member_id);

create index attendance_records_provisional_member_idx
  on public.attendance_records (provisional_member_id, session_id)
  where provisional_member_id is not null;

create or replace function public.edge_promote_provisional_member(
  p_provisional_member_id uuid,
  p_report_import_id uuid,
  p_actor uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target public.provisional_members%rowtype;
  created_person_id uuid;
  created_member_id uuid;
begin
  select * into target
  from public.provisional_members
  where id = p_provisional_member_id
  for update;

  if target.id is null then
    raise exception 'PROVISIONAL_MEMBER_NOT_FOUND';
  end if;
  if target.status <> 'pending_palms' then
    raise exception 'PROVISIONAL_MEMBER_NOT_PENDING';
  end if;
  if not exists (select 1 from public.report_imports where id = p_report_import_id) then
    raise exception 'PALMS_IMPORT_NOT_FOUND';
  end if;
  if not exists (select 1 from public.people where id = p_actor) then
    raise exception 'ACTOR_NOT_FOUND';
  end if;
  if exists (
    select 1
    from public.people p
    where regexp_replace(lower(btrim(p.display_name)), '\s+', '', 'g') =
          regexp_replace(lower(btrim(target.display_name)), '\s+', '', 'g')
  ) then
    raise exception 'DUPLICATE_OFFICIAL_MEMBER_NAME';
  end if;

  insert into public.people (display_name, status, notes)
  values (btrim(target.display_name), 'active', '由新會員登錄於 PALMS 唯一對帳後建立')
  returning id into created_person_id;

  insert into public.members (
    person_id,
    profession,
    membership_started_on,
    status
  ) values (
    created_person_id,
    btrim(target.profession),
    target.joined_on,
    'active'
  ) returning id into created_member_id;

  -- Keep every saved weekly row attached when the operational identity becomes
  -- an official member. The newly created member cannot already have a row in
  -- these sessions, so the existing official unique key remains conflict-free.
  update public.attendance_records
  set member_id = created_member_id,
      provisional_member_id = null,
      updated_at = now()
  where provisional_member_id = target.id;

  update public.provisional_members
  set status = 'promoted',
      official_member_id = created_member_id,
      palms_report_import_id = p_report_import_id,
      promoted_at = now(),
      updated_at = now()
  where id = target.id;

  return created_member_id;
end;
$$;

alter table public.provisional_members enable row level security;
revoke all on table public.provisional_members from public, anon, authenticated;
grant select, insert, update on table public.provisional_members to service_role;

revoke all on function public.edge_promote_provisional_member(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.edge_promote_provisional_member(uuid, uuid, uuid)
  to service_role;

grant select, insert, update on public.attendance_records to service_role;

create trigger provisional_members_set_updated_at
before update on public.provisional_members
for each row execute function private.set_updated_at();

create trigger provisional_members_audit
after insert or update or delete on public.provisional_members
for each row execute function private.audit_row_change();

comment on function public.edge_promote_provisional_member(uuid, uuid, uuid) is
  'Atomically promotes one uniquely matched provisional member into people/members after PALMS import; refuses every same-name ambiguity.';
