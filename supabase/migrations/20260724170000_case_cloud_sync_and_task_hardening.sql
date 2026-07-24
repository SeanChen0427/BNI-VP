-- 案件跨裝置同步、任務並行保護與 Edge-only 敏感資料存取。

alter table public.tasks
  add column if not exists revision bigint not null default 1;

create table if not exists public.task_case_states (
  task_id uuid primary key references public.tasks(id) on delete cascade,
  workflow jsonb not null default '{}'::jsonb,
  draft jsonb not null default '{}'::jsonb,
  revision bigint not null default 1,
  updated_by uuid references public.people(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.task_case_files (
  task_id uuid primary key references public.tasks(id) on delete cascade,
  bucket_id text not null default 'case-files' check (bucket_id = 'case-files'),
  object_path text not null unique,
  original_filename text not null,
  content_type text not null,
  size_bytes bigint not null check (size_bytes >= 0 and size_bytes <= 26214400),
  uploaded_by uuid references public.people(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.task_case_states enable row level security;
alter table public.task_case_files enable row level security;

revoke all on public.tasks, public.task_assignments, public.task_private_details,
  public.task_case_states, public.task_case_files from anon, authenticated;
grant select, insert, update, delete on public.tasks, public.task_assignments,
  public.task_private_details, public.task_case_states, public.task_case_files to service_role;

drop policy if exists storage_case_objects_read on storage.objects;
drop policy if exists storage_case_objects_insert on storage.objects;
drop policy if exists storage_case_objects_update_leadership on storage.objects;

drop trigger if exists task_case_states_updated_at on public.task_case_states;
create trigger task_case_states_updated_at
before update on public.task_case_states
for each row execute function private.set_updated_at();

drop trigger if exists task_case_files_updated_at on public.task_case_files;
create trigger task_case_files_updated_at
before update on public.task_case_files
for each row execute function private.set_updated_at();

create or replace function public.edge_save_task(
  p_task jsonb,
  p_actor uuid,
  p_lead uuid,
  p_companions uuid[],
  p_member uuid,
  p_expected_revision bigint default null,
  p_import boolean default false
)
returns table(task_id uuid, revision bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing public.tasks%rowtype;
  saved_id uuid;
  saved_revision bigint;
  task_status public.task_status;
  completed_at timestamptz;
  due_at timestamptz;
  companion_id uuid;
begin
  select * into existing
  from public.tasks
  where source = 'vice-chair-work-plan'
    and source_reference = p_task->>'id'
  for update;

  task_status := case when coalesce((p_task->>'completed')::boolean, false)
    then 'completed'::public.task_status else 'pending'::public.task_status end;
  completed_at := case when task_status = 'completed'
    then coalesce(nullif(p_task->>'completedAt', '')::timestamptz, now()) else null end;
  due_at := nullif(p_task->>'dueAt', '')::timestamptz;

  if existing.id is not null then
    if not p_import and (p_expected_revision is null or p_expected_revision <> existing.revision) then
      raise exception using message = 'TASK_CONFLICT';
    end if;
    if p_import then
      return query select existing.id, existing.revision;
      return;
    end if;
    update public.tasks set
      member_id = p_member,
      title = p_task->>'member',
      category = p_task->>'type',
      status = task_status,
      lead_person_id = p_lead,
      due_at = due_at,
      completed_at = completed_at,
      result_summary = p_task->>'meta',
      completed_by = case when task_status = 'completed' then p_actor else null end,
      revision = existing.revision + 1
    where id = existing.id
    returning id, public.tasks.revision into saved_id, saved_revision;
  else
    insert into public.tasks (
      member_id, title, category, status, lead_person_id, due_at, completed_at,
      result_summary, source, source_reference, created_by, completed_by, revision
    ) values (
      p_member, p_task->>'member', p_task->>'type', task_status, p_lead, due_at,
      completed_at, p_task->>'meta', 'vice-chair-work-plan', p_task->>'id',
      p_actor, case when task_status = 'completed' then p_actor else null end, 1
    ) returning id, public.tasks.revision into saved_id, saved_revision;
  end if;

  delete from public.task_assignments where public.task_assignments.task_id = saved_id;
  insert into public.task_assignments(task_id, person_id, role)
  values (saved_id, p_lead, 'lead');
  foreach companion_id in array coalesce(p_companions, array[]::uuid[]) loop
    insert into public.task_assignments(task_id, person_id, role)
    values (saved_id, companion_id, 'companion');
  end loop;

  insert into public.task_private_details(task_id, details, updated_by)
  values (saved_id, jsonb_build_object('notes', coalesce(p_task->>'notes', ''))::text, p_actor)
  on conflict (task_id) do update set
    details = excluded.details,
    updated_by = excluded.updated_by;

  return query select saved_id, saved_revision;
end;
$$;

create or replace function public.edge_delete_task(
  p_source_reference text,
  p_expected_revision bigint
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing public.tasks%rowtype;
begin
  select * into existing
  from public.tasks
  where source = 'vice-chair-work-plan'
    and source_reference = p_source_reference
  for update;
  if existing.id is null then return null; end if;
  if p_expected_revision is null or p_expected_revision <> existing.revision then
    raise exception using message = 'TASK_CONFLICT';
  end if;
  delete from public.tasks where id = existing.id;
  return existing.id;
end;
$$;

revoke all on function public.edge_save_task(jsonb, uuid, uuid, uuid[], uuid, bigint, boolean)
  from public, anon, authenticated;
revoke all on function public.edge_delete_task(text, bigint)
  from public, anon, authenticated;
grant execute on function public.edge_save_task(jsonb, uuid, uuid, uuid[], uuid, bigint, boolean)
  to service_role;
grant execute on function public.edge_delete_task(text, bigint)
  to service_role;

comment on table public.task_case_states is
  '既有工作台案件流程與訪談草稿的跨裝置過渡儲存；只經由 Edge API 存取。';
comment on table public.task_case_files is
  '工作台訪談 Word 的 Private Storage 索引；只經由 Edge API 存取。';
