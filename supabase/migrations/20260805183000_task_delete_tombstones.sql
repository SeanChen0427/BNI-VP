-- Prevent an explicitly deleted work-plan task from being recreated by an old
-- browser's one-time localStorage import. Tombstones contain identifiers only;
-- no member, interview, feedback, vote, or attachment data is copied here.

create table if not exists public.deleted_task_references (
  source text not null,
  source_reference text not null,
  deleted_task_id uuid,
  deleted_at timestamptz not null default now(),
  primary key (source, source_reference)
);

alter table public.deleted_task_references enable row level security;
revoke all on public.deleted_task_references from public, anon, authenticated;
grant select, insert, update, delete on public.deleted_task_references to service_role;

comment on table public.deleted_task_references is
  'Explicitly deleted task identifiers. Blocks stale browser imports from resurrecting deleted work-plan tasks.';

create or replace function private.prevent_deleted_task_resurrection()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.deleted_task_references deleted
    where deleted.source = new.source
      and deleted.source_reference = new.source_reference
  ) then
    raise exception using message = 'TASK_DELETED';
  end if;
  return new;
end;
$$;

revoke all on function private.prevent_deleted_task_resurrection()
  from public, anon, authenticated;

drop trigger if exists prevent_deleted_task_resurrection on public.tasks;
create trigger prevent_deleted_task_resurrection
before insert on public.tasks
for each row execute function private.prevent_deleted_task_resurrection();

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
  snapshot_id_value uuid;
begin
  select * into existing
  from public.tasks
  where source = 'vice-chair-work-plan'
    and source_reference = p_source_reference
  for update;

  -- A repeated delete still writes the tombstone. This makes deletion
  -- idempotent and prevents a stale device from importing the same identifier.
  if existing.id is null then
    insert into public.deleted_task_references(source, source_reference)
    values ('vice-chair-work-plan', p_source_reference)
    on conflict (source, source_reference)
    do update set deleted_at = excluded.deleted_at;
    return null;
  end if;

  if p_expected_revision is null or p_expected_revision <> existing.revision then
    raise exception using message = 'TASK_CONFLICT';
  end if;

  insert into public.deleted_task_references(
    source, source_reference, deleted_task_id
  ) values (
    existing.source, existing.source_reference, existing.id
  )
  on conflict (source, source_reference)
  do update set
    deleted_task_id = excluded.deleted_task_id,
    deleted_at = excluded.deleted_at;

  if existing.case_id is not null then
    for snapshot_id_value in
      select id from public.vote_snapshots where case_id = existing.case_id
    loop
      delete from public.votes where snapshot_id = snapshot_id_value;
      delete from public.vote_snapshot_voters where snapshot_id = snapshot_id_value;
      delete from public.vote_snapshots where id = snapshot_id_value;
    end loop;
    delete from public.advisor_confirmations where case_id = existing.case_id;
    delete from public.cases where id = existing.case_id;
  else
    delete from public.tasks where id = existing.id;
  end if;
  return existing.id;
end;
$$;

revoke all on function public.edge_delete_task(text, bigint)
  from public, anon, authenticated;
grant execute on function public.edge_delete_task(text, bigint)
  to service_role;
