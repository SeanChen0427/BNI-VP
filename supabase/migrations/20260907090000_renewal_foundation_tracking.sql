-- Independent follow-up records survive closure of the source renewal interview.
create table public.renewal_foundations (
  id uuid primary key,
  source_task_id uuid references public.tasks(id) on delete restrict,
  member_id uuid not null references public.members(id) on delete restrict,
  status text not null check (status in ('tracking', 'reported', 'achieved', 'unmet', 'cancelled')),
  due_on date not null,
  next_check_on date not null,
  revision integer not null default 1 check (revision > 0),
  data jsonb not null check (jsonb_typeof(data) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint renewal_foundations_origin_check check (
    (source_task_id is not null and coalesce(data->>'origin', 'renewal') = 'renewal') or
    (source_task_id is null and coalesce(data->>'origin', '') = 'legacy')
  )
);
create index renewal_foundations_followup_idx on public.renewal_foundations (status, next_check_on, due_on);
create index renewal_foundations_source_idx on public.renewal_foundations (source_task_id);

create table public.renewal_foundation_events (
  id uuid primary key default gen_random_uuid(),
  foundation_id uuid not null references public.renewal_foundations(id) on delete restrict,
  event_type text not null check (event_type in ('create', 'amend', 'note', 'reminder', 'progress', 'resolve', 'reopen', 'confirm-quarter')),
  actor_id uuid not null references public.people(id) on delete restrict,
  actor_name text not null,
  detail jsonb not null,
  previous_data jsonb,
  next_data jsonb not null,
  created_at timestamptz not null default now()
);
create index renewal_foundation_events_history_idx on public.renewal_foundation_events (foundation_id, created_at);
alter table public.renewal_foundations enable row level security;
alter table public.renewal_foundation_events enable row level security;
revoke all on table public.renewal_foundations, public.renewal_foundation_events from public, anon, authenticated;
grant select on table public.renewal_foundations, public.renewal_foundation_events to service_role;

-- CAS and audit append are a single transaction. No browser role may invoke it.
create function public.edge_save_renewal_foundation(
  p_id uuid, p_revision integer, p_source_task_id uuid, p_member_id uuid,
  p_data jsonb, p_action text, p_actor_id uuid, p_actor_name text, p_detail jsonb
) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_previous public.renewal_foundations%rowtype;
  v_revision integer;
begin
  if p_revision = 0 then
    if p_action <> 'create' then raise exception 'Invalid create action'; end if;
    insert into public.renewal_foundations (id, source_task_id, member_id, status, due_on, next_check_on, data)
    values (p_id, p_source_task_id, p_member_id, p_data->>'status', (p_data->>'dueOn')::date, (p_data->>'nextCheckOn')::date, p_data)
    on conflict (id) do nothing;
    if not found then raise exception '追蹤已建立，請重新整理' using errcode = '40001'; end if;
    v_revision := 1;
  else
    select * into v_previous from public.renewal_foundations where id = p_id for update;
    if not found or v_previous.revision <> p_revision then
      raise exception '追蹤已由其他人更新，請重新整理後再試' using errcode = '40001';
    end if;
    if v_previous.source_task_id is distinct from p_source_task_id or v_previous.member_id is distinct from p_member_id or p_action = 'create' then
      raise exception '不得變更原續約案件或會員';
    end if;
    v_revision := p_revision + 1;
    update public.renewal_foundations
    set status = p_data->>'status', due_on = (p_data->>'dueOn')::date,
        next_check_on = (p_data->>'nextCheckOn')::date, data = p_data,
        revision = v_revision, updated_at = now()
    where id = p_id;
  end if;
  insert into public.renewal_foundation_events (foundation_id, event_type, actor_id, actor_name, detail, previous_data, next_data)
  values (p_id, p_action, p_actor_id, p_actor_name, p_detail, v_previous.data, p_data);
  return v_revision;
end;
$$;
revoke all on function public.edge_save_renewal_foundation(uuid, integer, uuid, uuid, jsonb, text, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.edge_save_renewal_foundation(uuid, integer, uuid, uuid, jsonb, text, uuid, text, jsonb) to service_role;
comment on table public.renewal_foundations is 'Manual renewal-condition follow-up only; no automatic membership or professional-category disposition.';
