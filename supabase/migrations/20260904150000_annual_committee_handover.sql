-- 年度換屆排程、未完成工作交接與歷史任務不可變保護。
-- 本 migration 只建立結構與未來寫入規則，不改動既有名單、案件或附件內容。

create type public.committee_handover_status as enum ('scheduled', 'executed', 'cancelled');

create or replace function private.annual_term_ends_on(p_effective_on date)
returns date
language sql
immutable
set search_path = ''
as $$
  select (
    pg_catalog.date_trunc('month', p_effective_on::timestamp)
    + interval '1 year'
    + ((extract(day from p_effective_on)::integer - 1) * interval '1 day')
  )::date - 1;
$$;

create table public.committee_handover_plans (
  id uuid primary key default gen_random_uuid(),
  effective_on date not null,
  term_ends_on date not null,
  status public.committee_handover_status not null default 'scheduled',
  source_roster_snapshot jsonb not null default '[]'::jsonb
    check (jsonb_typeof(source_roster_snapshot) = 'array'),
  executed_from_roster_snapshot jsonb
    check (executed_from_roster_snapshot is null or jsonb_typeof(executed_from_roster_snapshot) = 'array'),
  created_by uuid not null references public.people(id) on delete restrict,
  updated_by uuid not null references public.people(id) on delete restrict,
  executed_at timestamptz,
  cancelled_at timestamptz,
  revision bigint not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (term_ends_on = private.annual_term_ends_on(effective_on)),
  check (
    (status = 'scheduled' and executed_at is null and cancelled_at is null)
    or (status = 'executed' and executed_at is not null and cancelled_at is null)
    or (status = 'cancelled' and executed_at is null and cancelled_at is not null)
  )
);

create unique index committee_handover_one_scheduled
  on public.committee_handover_plans ((status))
  where status = 'scheduled';
create index committee_handover_effective_lookup
  on public.committee_handover_plans (status, effective_on);

create table public.committee_handover_members (
  plan_id uuid not null references public.committee_handover_plans(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete restrict,
  role public.committee_role not null,
  has_voting_right boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (plan_id, person_id)
);

create unique index committee_handover_one_vp_per_plan
  on public.committee_handover_members (plan_id)
  where role = 'vp';

create table public.committee_handover_events (
  id bigint generated always as identity primary key,
  plan_id uuid not null references public.committee_handover_plans(id) on delete restrict,
  event_type text not null check (event_type in ('scheduled', 'rescheduled', 'cancelled', 'executed')),
  actor_person_id uuid references public.people(id) on delete restrict,
  actor_name_snapshot text not null check (length(btrim(actor_name_snapshot)) between 1 and 100),
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  occurred_at timestamptz not null default now()
);

create index committee_handover_events_plan_lookup
  on public.committee_handover_events (plan_id, occurred_at);

alter table public.tasks
  add column if not exists handover_pending boolean not null default false,
  add column if not exists handover_plan_id uuid references public.committee_handover_plans(id) on delete restrict,
  add column if not exists handover_pending_since timestamptz,
  add column if not exists handover_original_assignments jsonb not null default '[]'::jsonb
    check (jsonb_typeof(handover_original_assignments) = 'array'),
  add constraint tasks_handover_pending_consistency check (
    (handover_pending and handover_plan_id is not null and handover_pending_since is not null)
    or (not handover_pending and handover_plan_id is null and handover_pending_since is null)
  );

create index tasks_handover_pending_lookup
  on public.tasks (handover_pending, status, due_at)
  where handover_pending;

create table public.task_assignment_history (
  id bigint generated always as identity primary key,
  task_id uuid references public.tasks(id) on delete set null,
  task_source_reference text not null check (length(btrim(task_source_reference)) between 1 and 160),
  event_type text not null check (event_type in ('created', 'reassigned', 'handover_pending', 'handover_reassigned')),
  previous_assignments jsonb not null default '[]'::jsonb check (jsonb_typeof(previous_assignments) = 'array'),
  new_assignments jsonb not null default '[]'::jsonb check (jsonb_typeof(new_assignments) = 'array'),
  reason text not null check (length(btrim(reason)) between 1 and 500),
  actor_person_id uuid references public.people(id) on delete restrict,
  actor_name_snapshot text not null check (length(btrim(actor_name_snapshot)) between 1 and 100),
  handover_plan_id uuid references public.committee_handover_plans(id) on delete restrict,
  occurred_at timestamptz not null default now()
);

create index task_assignment_history_task_lookup
  on public.task_assignment_history (task_id, occurred_at);
create index task_assignment_history_reference_lookup
  on public.task_assignment_history (task_source_reference, occurred_at);

alter table public.committee_handover_plans enable row level security;
alter table public.committee_handover_members enable row level security;
alter table public.committee_handover_events enable row level security;
alter table public.task_assignment_history enable row level security;

revoke all on public.committee_handover_plans, public.committee_handover_members,
  public.committee_handover_events, public.task_assignment_history
  from public, anon, authenticated;
grant select, insert, update, delete on public.committee_handover_plans,
  public.committee_handover_members, public.committee_handover_events,
  public.task_assignment_history to service_role;
revoke all on sequence public.committee_handover_events_id_seq,
  public.task_assignment_history_id_seq from public, anon, authenticated;
grant usage, select on sequence public.committee_handover_events_id_seq,
  public.task_assignment_history_id_seq to service_role;

drop trigger if exists committee_handover_plans_updated_at on public.committee_handover_plans;
create trigger committee_handover_plans_updated_at
before update on public.committee_handover_plans
for each row execute function private.set_updated_at();

create or replace function private.task_assignment_snapshot(p_task_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when exists (select 1 from public.task_assignments where task_id = p_task_id)
      then coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'personId', assignment.person_id,
            'name', person.display_name,
            'role', assignment.role
          ) order by case when assignment.role = 'lead' then 0 else 1 end, person.display_name
        )
        from public.task_assignments assignment
        join public.people person on person.id = assignment.person_id
        where assignment.task_id = p_task_id
      ), '[]'::jsonb)
    else coalesce((
      select jsonb_build_array(jsonb_build_object(
        'personId', task.lead_person_id,
        'name', person.display_name,
        'role', 'lead'
      ))
      from public.tasks task
      join public.people person on person.id = task.lead_person_id
      where task.id = p_task_id
    ), '[]'::jsonb)
  end;
$$;

create or replace function private.requested_assignment_snapshot(p_lead uuid, p_companions uuid[])
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(
    jsonb_build_object('personId', requested.person_id, 'name', person.display_name, 'role', requested.role)
    order by requested.sort_order, person.display_name
  ), '[]'::jsonb)
  from (
    select p_lead as person_id, 'lead'::text as role, 0 as sort_order
    union all
    select companion_id, 'companion'::text, 1
    from unnest(coalesce(p_companions, array[]::uuid[])) companion_id
  ) requested
  join public.people person on person.id = requested.person_id;
$$;

revoke all on function private.task_assignment_snapshot(uuid),
  private.requested_assignment_snapshot(uuid, uuid[])
  from public, anon, authenticated;

create or replace function public.edge_schedule_committee_handover(
  p_effective_on date,
  p_roster jsonb,
  p_actor uuid,
  p_expected_revision bigint default null
)
returns table(plan_id uuid, revision bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'Asia/Taipei')::date;
  v_plan public.committee_handover_plans%rowtype;
  v_item jsonb;
  v_person_id uuid;
  v_role public.committee_role;
  v_seen uuid[] := array[]::uuid[];
  v_vp_count integer := 0;
  v_committee_count integer := 0;
  v_snapshot jsonb;
  v_actor_name text;
  v_event_type text;
begin
  if p_effective_on is null or p_effective_on <= v_today then
    raise exception using message = 'HANDOVER_DATE_NOT_FUTURE';
  end if;
  if jsonb_typeof(p_roster) <> 'array' or jsonb_array_length(p_roster) < 2 or jsonb_array_length(p_roster) > 30 then
    raise exception using message = 'HANDOVER_ROSTER_INVALID';
  end if;
  select display_name into v_actor_name from public.people where id = p_actor;
  if v_actor_name is null then raise exception using message = 'HANDOVER_ACTOR_INVALID'; end if;

  -- Serialize create/update so two Admin requests cannot race past the one-scheduled-plan rule.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('fulian-committee-handover-schedule', 0)
  );

  for v_item in select value from jsonb_array_elements(p_roster)
  loop
    begin
      v_person_id := nullif(v_item->>'personId', '')::uuid;
      v_role := (v_item->>'role')::public.committee_role;
    exception when others then
      raise exception using message = 'HANDOVER_ROSTER_INVALID';
    end;
    if v_person_id is null or v_person_id = any(v_seen) then
      raise exception using message = 'HANDOVER_ROSTER_DUPLICATE';
    end if;
    if not exists (
      select 1
      from public.people person
      join public.members member on member.person_id = person.id
      where person.id = v_person_id and person.status = 'active' and member.status = 'active'
    ) then
      raise exception using message = 'HANDOVER_MEMBER_INACTIVE';
    end if;
    v_seen := array_append(v_seen, v_person_id);
    if v_role = 'vp' then v_vp_count := v_vp_count + 1;
    else v_committee_count := v_committee_count + 1;
    end if;
  end loop;
  if v_vp_count <> 1 or v_committee_count < 1 then
    raise exception using message = 'HANDOVER_ROSTER_INVALID';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'termId', term.id,
    'personId', term.person_id,
    'name', person.display_name,
    'role', term.role,
    'startsOn', term.starts_on,
    'endsOn', term.ends_on
  ) order by case when term.role = 'vp' then 0 else 1 end, person.display_name), '[]'::jsonb)
  into v_snapshot
  from public.committee_terms term
  join public.people person on person.id = term.person_id
  where term.status = 'active'
    and term.starts_on <= v_today
    and (term.ends_on is null or term.ends_on >= v_today)
    and person.status = 'active';

  select * into v_plan
  from public.committee_handover_plans
  where status = 'scheduled'
  for update;

  if v_plan.id is null then
    if p_expected_revision is not null then raise exception using message = 'HANDOVER_CONFLICT'; end if;
    insert into public.committee_handover_plans (
      effective_on, term_ends_on, source_roster_snapshot, created_by, updated_by
    ) values (
      p_effective_on, private.annual_term_ends_on(p_effective_on), v_snapshot, p_actor, p_actor
    ) returning * into v_plan;
    v_event_type := 'scheduled';
  else
    if p_expected_revision is null or p_expected_revision <> v_plan.revision then
      raise exception using message = 'HANDOVER_CONFLICT';
    end if;
    update public.committee_handover_plans set
      effective_on = p_effective_on,
      term_ends_on = private.annual_term_ends_on(p_effective_on),
      source_roster_snapshot = v_snapshot,
      updated_by = p_actor,
      revision = v_plan.revision + 1
    where id = v_plan.id
    returning * into v_plan;
    delete from public.committee_handover_members where plan_id = v_plan.id;
    v_event_type := 'rescheduled';
  end if;

  for v_item in select value from jsonb_array_elements(p_roster)
  loop
    v_person_id := (v_item->>'personId')::uuid;
    v_role := (v_item->>'role')::public.committee_role;
    insert into public.committee_handover_members(plan_id, person_id, role)
    values (v_plan.id, v_person_id, v_role);
  end loop;

  insert into public.committee_handover_events(
    plan_id, event_type, actor_person_id, actor_name_snapshot, details
  ) values (
    v_plan.id, v_event_type, p_actor, v_actor_name,
    jsonb_build_object('effectiveOn', v_plan.effective_on, 'termEndsOn', v_plan.term_ends_on, 'roster', p_roster)
  );

  return query select v_plan.id, v_plan.revision;
end;
$$;

create or replace function public.edge_cancel_committee_handover(
  p_plan_id uuid,
  p_actor uuid,
  p_expected_revision bigint
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan public.committee_handover_plans%rowtype;
  v_actor_name text;
  v_revision bigint;
begin
  select * into v_plan from public.committee_handover_plans where id = p_plan_id for update;
  if v_plan.id is null then raise exception using message = 'HANDOVER_NOT_FOUND'; end if;
  if v_plan.status <> 'scheduled' or p_expected_revision is null or p_expected_revision <> v_plan.revision then
    raise exception using message = 'HANDOVER_CONFLICT';
  end if;
  select display_name into v_actor_name from public.people where id = p_actor;
  if v_actor_name is null then raise exception using message = 'HANDOVER_ACTOR_INVALID'; end if;
  update public.committee_handover_plans set
    status = 'cancelled',
    cancelled_at = now(),
    updated_by = p_actor,
    revision = revision + 1
  where id = v_plan.id
  returning revision into v_revision;
  insert into public.committee_handover_events(
    plan_id, event_type, actor_person_id, actor_name_snapshot, details
  ) values (
    v_plan.id, 'cancelled', p_actor, v_actor_name,
    jsonb_build_object('effectiveOn', v_plan.effective_on)
  );
  return v_revision;
end;
$$;

create or replace function public.edge_apply_due_committee_handoffs()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'Asia/Taipei')::date;
  v_plan public.committee_handover_plans%rowtype;
  v_previous_roster jsonb;
  v_outgoing uuid[];
  v_task public.tasks%rowtype;
  v_assignments jsonb;
  v_impacted integer;
  v_executed integer := 0;
begin
  for v_plan in
    select * from public.committee_handover_plans
    where status = 'scheduled' and effective_on <= v_today
    order by effective_on, created_at
    for update skip locked
  loop
    if (select count(*) from public.committee_handover_members where plan_id = v_plan.id and role = 'vp') <> 1
      or (select count(*) from public.committee_handover_members where plan_id = v_plan.id and role = 'committee') < 1
    then
      raise exception using message = 'HANDOVER_ROSTER_INVALID';
    end if;
    if exists (
      select 1
      from public.committee_handover_members target
      left join public.people person on person.id = target.person_id and person.status = 'active'
      left join public.members member on member.person_id = target.person_id and member.status = 'active'
      where target.plan_id = v_plan.id and (person.id is null or member.id is null)
    ) then
      raise exception using message = 'HANDOVER_MEMBER_INACTIVE';
    end if;

    select coalesce(jsonb_agg(jsonb_build_object(
      'termId', term.id,
      'personId', term.person_id,
      'name', person.display_name,
      'role', term.role,
      'startsOn', term.starts_on,
      'endsOn', term.ends_on
    ) order by case when term.role = 'vp' then 0 else 1 end, person.display_name), '[]'::jsonb)
    into v_previous_roster
    from public.committee_terms term
    join public.people person on person.id = term.person_id
    where term.status = 'active'
      and term.starts_on < v_plan.effective_on
      and (term.ends_on is null or term.ends_on >= v_plan.effective_on - 1);

    select array(
      select term.person_id
      from public.committee_terms term
      where term.status = 'active'
        and term.starts_on < v_plan.effective_on
        and (term.ends_on is null or term.ends_on >= v_plan.effective_on - 1)
        and not exists (
          select 1 from public.committee_handover_members target
          where target.plan_id = v_plan.id
            and target.person_id = term.person_id
            and target.role = term.role
        )
    ) into v_outgoing;

    update public.committee_terms set
      ends_on = least(coalesce(ends_on, v_plan.effective_on - 1), v_plan.effective_on - 1),
      status = 'ended',
      status_changed_at = now(),
      status_reason = '年度換屆：新任名單自 ' || v_plan.effective_on::text || ' 生效',
      updated_at = now()
    where status = 'active'
      and starts_on < v_plan.effective_on;

    insert into public.committee_terms(
      person_id, role, starts_on, ends_on, has_voting_right, status, status_reason
    )
    select member.person_id, member.role, v_plan.effective_on, v_plan.term_ends_on,
      member.has_voting_right, 'active', '年度換屆排程自動生效'
    from public.committee_handover_members member
    where member.plan_id = v_plan.id
    on conflict (person_id, role, starts_on) do update set
      ends_on = excluded.ends_on,
      has_voting_right = excluded.has_voting_right,
      status = 'active',
      status_changed_at = now(),
      status_reason = excluded.status_reason,
      updated_at = now();

    v_impacted := 0;
    for v_task in
      select task.*
      from public.tasks task
      where task.source = 'vice-chair-work-plan'
        and task.status in ('pending', 'in_progress')
        and not task.handover_pending
        and (
          task.lead_person_id = any(coalesce(v_outgoing, array[]::uuid[]))
          or exists (
            select 1 from public.task_assignments assignment
            where assignment.task_id = task.id
              and assignment.person_id = any(coalesce(v_outgoing, array[]::uuid[]))
          )
        )
      for update
    loop
      v_assignments := private.task_assignment_snapshot(v_task.id);
      update public.tasks set
        handover_pending = true,
        handover_plan_id = v_plan.id,
        handover_pending_since = now(),
        handover_original_assignments = v_assignments,
        revision = revision + 1
      where id = v_task.id;
      insert into public.task_assignment_history(
        task_id, task_source_reference, event_type, previous_assignments,
        new_assignments, reason, actor_name_snapshot, handover_plan_id
      ) values (
        v_task.id, v_task.source_reference, 'handover_pending', v_assignments,
        v_assignments, '年度換屆：卸任或轉任人員的未完成工作待新任名單重新指派', '系統排程', v_plan.id
      );
      v_impacted := v_impacted + 1;
    end loop;

    update public.committee_handover_plans set
      status = 'executed',
      executed_at = now(),
      executed_from_roster_snapshot = v_previous_roster,
      revision = revision + 1
    where id = v_plan.id;
    insert into public.committee_handover_events(
      plan_id, event_type, actor_name_snapshot, details
    ) values (
      v_plan.id, 'executed', '系統排程',
      jsonb_build_object('effectiveOn', v_plan.effective_on, 'impactedOpenTasks', v_impacted)
    );
    v_executed := v_executed + 1;
  end loop;
  return v_executed;
end;
$$;

create or replace function public.edge_reassign_handover_tasks(
  p_assignments jsonb,
  p_actor uuid
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'Asia/Taipei')::date;
  v_item jsonb;
  v_task public.tasks%rowtype;
  v_task_id uuid;
  v_seen_task_ids uuid[] := array[]::uuid[];
  v_lead uuid;
  v_companions uuid[];
  v_expected_revision bigint;
  v_person_id uuid;
  v_previous jsonb;
  v_next jsonb;
  v_actor_name text;
  v_count integer := 0;
begin
  if jsonb_typeof(p_assignments) <> 'array' or jsonb_array_length(p_assignments) < 1 or jsonb_array_length(p_assignments) > 250 then
    raise exception using message = 'HANDOVER_ASSIGNMENTS_INVALID';
  end if;
  if jsonb_array_length(p_assignments) <> (
    select count(*) from public.tasks
    where source = 'vice-chair-work-plan'
      and handover_pending
      and status in ('pending', 'in_progress')
  ) then
    raise exception using message = 'HANDOVER_ASSIGNMENTS_CHANGED';
  end if;
  select display_name into v_actor_name from public.people where id = p_actor;
  if v_actor_name is null then raise exception using message = 'HANDOVER_ACTOR_INVALID'; end if;

  for v_item in select value from jsonb_array_elements(p_assignments)
  loop
    begin
      v_task_id := nullif(v_item->>'taskId', '')::uuid;
      v_lead := nullif(v_item->>'leadPersonId', '')::uuid;
      v_expected_revision := (v_item->>'expectedRevision')::bigint;
      select coalesce(array_agg(value::uuid), array[]::uuid[])
      into v_companions
      from jsonb_array_elements_text(coalesce(v_item->'companionPersonIds', '[]'::jsonb));
    exception when others then
      raise exception using message = 'HANDOVER_ASSIGNMENTS_INVALID';
    end;
    if v_task_id is null or v_task_id = any(v_seen_task_ids) or v_lead is null
      or cardinality(v_companions) > 2 or v_lead = any(v_companions)
      or cardinality(v_companions) <> (select count(distinct person_id) from unnest(v_companions) person_id)
    then
      raise exception using message = 'HANDOVER_ASSIGNMENTS_INVALID';
    end if;
    v_seen_task_ids := array_append(v_seen_task_ids, v_task_id);

    foreach v_person_id in array array_prepend(v_lead, v_companions)
    loop
      if not exists (
        select 1
        from public.committee_terms term
        join public.people person on person.id = term.person_id
        where term.person_id = v_person_id
          and term.status = 'active'
          and term.starts_on <= v_today
          and (term.ends_on is null or term.ends_on >= v_today)
          and person.status = 'active'
      ) then
        raise exception using message = 'HANDOVER_ASSIGNEE_INACTIVE';
      end if;
    end loop;

    select * into v_task from public.tasks where id = v_task_id for update;
    if v_task.id is null or v_task.source <> 'vice-chair-work-plan'
      or not v_task.handover_pending or v_task.status not in ('pending', 'in_progress') then
      raise exception using message = 'HANDOVER_TASK_NOT_PENDING';
    end if;
    if v_expected_revision is null or v_expected_revision <> v_task.revision then
      raise exception using message = 'TASK_CONFLICT';
    end if;
    if v_task.case_id is not null and exists (
      select 1 from public.cases where id = v_task.case_id and stage = 'closed'
    ) then
      raise exception using message = 'TASK_HISTORY_IMMUTABLE';
    end if;

    v_previous := private.task_assignment_snapshot(v_task.id);
    delete from public.task_assignments where task_id = v_task.id;
    insert into public.task_assignments(task_id, person_id, role)
    values (v_task.id, v_lead, 'lead');
    foreach v_person_id in array v_companions
    loop
      insert into public.task_assignments(task_id, person_id, role)
      values (v_task.id, v_person_id, 'companion');
    end loop;

    update public.tasks set
      lead_person_id = v_lead,
      handover_pending = false,
      handover_plan_id = null,
      handover_pending_since = null,
      revision = revision + 1
    where id = v_task.id;

    if v_task.case_id is not null then
      update public.cases set lead_person_id = v_lead, updated_by = p_actor where id = v_task.case_id;
      delete from public.case_assignments where case_id = v_task.case_id;
      insert into public.case_assignments(case_id, person_id, role, assigned_by)
      values (v_task.case_id, v_lead, 'lead', p_actor);
      foreach v_person_id in array v_companions
      loop
        insert into public.case_assignments(case_id, person_id, role, assigned_by)
        values (v_task.case_id, v_person_id, 'companion', p_actor);
      end loop;
    end if;

    v_next := private.task_assignment_snapshot(v_task.id);
    insert into public.task_assignment_history(
      task_id, task_source_reference, event_type, previous_assignments, new_assignments,
      reason, actor_person_id, actor_name_snapshot, handover_plan_id
    ) values (
      v_task.id, v_task.source_reference, 'handover_reassigned', v_previous, v_next,
      '年度換屆：由新任名單完成未結工作指派', p_actor, v_actor_name, v_task.handover_plan_id
    );
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- 保留既有 RPC 介面，新增指派沿革與換屆待指派清除。
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
  v_existing public.tasks%rowtype;
  v_saved_id uuid;
  v_saved_revision bigint;
  v_task_status public.task_status;
  v_completed_at timestamptz;
  v_due_at timestamptz;
  v_companion_id uuid;
  v_previous_assignments jsonb := '[]'::jsonb;
  v_requested_assignments jsonb;
  v_assignments_changed boolean := false;
  v_actor_name text;
begin
  select * into v_existing
  from public.tasks
  where source = 'vice-chair-work-plan'
    and source_reference = p_task->>'id'
  for update;

  v_task_status := case when coalesce((p_task->>'completed')::boolean, false)
    then 'completed'::public.task_status else 'pending'::public.task_status end;
  v_completed_at := case when v_task_status = 'completed'
    then coalesce(nullif(p_task->>'completedAt', '')::timestamptz, now()) else null end;
  v_due_at := nullif(p_task->>'dueAt', '')::timestamptz;
  v_requested_assignments := private.requested_assignment_snapshot(p_lead, p_companions);
  select display_name into v_actor_name from public.people where id = p_actor;
  if v_actor_name is null then raise exception using message = 'TASK_ACTOR_INVALID'; end if;

  if v_existing.id is not null then
    if not p_import and (p_expected_revision is null or p_expected_revision <> v_existing.revision) then
      raise exception using message = 'TASK_CONFLICT';
    end if;
    if p_import then
      return query select v_existing.id, v_existing.revision;
      return;
    end if;
    if v_existing.status = 'completed' then
      raise exception using message = 'TASK_HISTORY_IMMUTABLE';
    end if;
    if v_existing.handover_pending then
      raise exception using message = 'HANDOVER_TASK_PENDING';
    end if;
    v_previous_assignments := private.task_assignment_snapshot(v_existing.id);
    v_assignments_changed := v_previous_assignments is distinct from v_requested_assignments;
    update public.tasks set
      member_id = p_member,
      title = p_task->>'member',
      category = p_task->>'type',
      -- Keep the row open until assignments and final notes are saved. Once
      -- completed, the protection triggers intentionally reject child edits.
      status = case when v_task_status = 'completed' then v_existing.status else v_task_status end,
      lead_person_id = p_lead,
      due_at = v_due_at,
      completed_at = case when v_task_status = 'completed' then null else v_completed_at end,
      result_summary = p_task->>'meta',
      completed_by = null,
      handover_pending = case when v_assignments_changed then false else v_existing.handover_pending end,
      handover_plan_id = case when v_assignments_changed then null else v_existing.handover_plan_id end,
      handover_pending_since = case when v_assignments_changed then null else v_existing.handover_pending_since end,
      revision = v_existing.revision + 1
    where public.tasks.id = v_existing.id
    returning public.tasks.id, public.tasks.revision into v_saved_id, v_saved_revision;
  else
    insert into public.tasks (
      member_id, title, category, status, lead_person_id, due_at, completed_at,
      result_summary, source, source_reference, created_by, completed_by, revision
    ) values (
      p_member, p_task->>'member', p_task->>'type',
      case when v_task_status = 'completed' then 'pending'::public.task_status else v_task_status end,
      p_lead, v_due_at, case when v_task_status = 'completed' then null else v_completed_at end,
      p_task->>'meta', 'vice-chair-work-plan', p_task->>'id',
      p_actor, null, 1
    ) returning public.tasks.id, public.tasks.revision into v_saved_id, v_saved_revision;
    v_assignments_changed := true;
  end if;

  if v_assignments_changed then
    delete from public.task_assignments where public.task_assignments.task_id = v_saved_id;
    insert into public.task_assignments(task_id, person_id, role)
    values (v_saved_id, p_lead, 'lead');
    foreach v_companion_id in array coalesce(p_companions, array[]::uuid[]) loop
      insert into public.task_assignments(task_id, person_id, role)
      values (v_saved_id, v_companion_id, 'companion');
    end loop;

    if v_existing.case_id is not null then
      update public.cases set lead_person_id = p_lead, updated_by = p_actor
      where id = v_existing.case_id and stage <> 'closed';
      delete from public.case_assignments where case_id = v_existing.case_id;
      insert into public.case_assignments(case_id, person_id, role, assigned_by)
      values (v_existing.case_id, p_lead, 'lead', p_actor);
      foreach v_companion_id in array coalesce(p_companions, array[]::uuid[]) loop
        insert into public.case_assignments(case_id, person_id, role, assigned_by)
        values (v_existing.case_id, v_companion_id, 'companion', p_actor);
      end loop;
    end if;

    insert into public.task_assignment_history(
      task_id, task_source_reference, event_type, previous_assignments, new_assignments,
      reason, actor_person_id, actor_name_snapshot, handover_plan_id
    ) values (
      v_saved_id,
      p_task->>'id',
      case when v_existing.id is null then 'created'
        when v_existing.handover_pending then 'handover_reassigned'
        else 'reassigned' end,
      v_previous_assignments,
      private.task_assignment_snapshot(v_saved_id),
      case when v_existing.id is null then '建立工作排定'
        when v_existing.handover_pending then '年度換屆：完成待交接工作指派'
        else '更新工作負責人' end,
      p_actor,
      v_actor_name,
      case when v_existing.handover_pending then v_existing.handover_plan_id else null end
    );
  end if;

  insert into public.task_private_details(task_id, details, updated_by)
  values (v_saved_id, jsonb_build_object('notes', coalesce(p_task->>'notes', ''))::text, p_actor)
  on conflict on constraint task_private_details_pkey do update set
    details = excluded.details,
    updated_by = excluded.updated_by;

  if v_task_status = 'completed' then
    update public.tasks set
      status = 'completed',
      completed_at = v_completed_at,
      completed_by = p_actor
    where id = v_saved_id;
  end if;

  return query select v_saved_id, v_saved_revision;
end;
$$;

create or replace function private.protect_completed_task_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status = 'completed' then raise exception using message = 'TASK_HISTORY_IMMUTABLE'; end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create or replace function private.protect_completed_task_child()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old_task_id uuid := case when tg_op = 'INSERT' then null else old.task_id end;
  v_new_task_id uuid := case when tg_op = 'DELETE' then null else new.task_id end;
begin
  if exists (
    select 1 from public.tasks
    where id in (v_old_task_id, v_new_task_id) and status = 'completed'
  ) then
    raise exception using message = 'TASK_HISTORY_IMMUTABLE';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create or replace function private.protect_closed_case_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.stage = 'closed' then raise exception using message = 'TASK_HISTORY_IMMUTABLE'; end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create or replace function private.protect_closed_case_assignment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old_case_id uuid := case when tg_op = 'INSERT' then null else old.case_id end;
  v_new_case_id uuid := case when tg_op = 'DELETE' then null else new.case_id end;
begin
  if exists (
    select 1 from public.cases
    where id in (v_old_case_id, v_new_case_id) and stage = 'closed'
  ) then
    raise exception using message = 'TASK_HISTORY_IMMUTABLE';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create or replace function private.prevent_history_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception using message = 'AUDIT_HISTORY_IMMUTABLE';
  return old;
end;
$$;

drop trigger if exists protect_completed_task_update on public.tasks;
create trigger protect_completed_task_update
before update or delete on public.tasks
for each row execute function private.protect_completed_task_row();

drop trigger if exists protect_completed_task_assignments on public.task_assignments;
create trigger protect_completed_task_assignments
before insert or update or delete on public.task_assignments
for each row execute function private.protect_completed_task_child();

drop trigger if exists protect_completed_task_details on public.task_private_details;
create trigger protect_completed_task_details
before insert or update or delete on public.task_private_details
for each row execute function private.protect_completed_task_child();

drop trigger if exists protect_completed_task_state on public.task_case_states;
create trigger protect_completed_task_state
before insert or update or delete on public.task_case_states
for each row execute function private.protect_completed_task_child();

drop trigger if exists protect_completed_task_file on public.task_case_files;
create trigger protect_completed_task_file
before insert or update or delete on public.task_case_files
for each row execute function private.protect_completed_task_child();

drop trigger if exists protect_closed_case_update on public.cases;
create trigger protect_closed_case_update
before update or delete on public.cases
for each row execute function private.protect_closed_case_row();

drop trigger if exists protect_closed_case_assignments on public.case_assignments;
create trigger protect_closed_case_assignments
before insert or update or delete on public.case_assignments
for each row execute function private.protect_closed_case_assignment();

drop trigger if exists task_assignment_history_immutable on public.task_assignment_history;
create trigger task_assignment_history_immutable
before update or delete on public.task_assignment_history
for each row execute function private.prevent_history_mutation();

drop trigger if exists committee_handover_events_immutable on public.committee_handover_events;
create trigger committee_handover_events_immutable
before update or delete on public.committee_handover_events
for each row execute function private.prevent_history_mutation();

revoke all on function public.edge_schedule_committee_handover(date, jsonb, uuid, bigint),
  public.edge_cancel_committee_handover(uuid, uuid, bigint),
  public.edge_apply_due_committee_handoffs(),
  public.edge_reassign_handover_tasks(jsonb, uuid),
  public.edge_save_task(jsonb, uuid, uuid, uuid[], uuid, bigint, boolean)
  from public, anon, authenticated;
grant execute on function public.edge_schedule_committee_handover(date, jsonb, uuid, bigint),
  public.edge_cancel_committee_handover(uuid, uuid, bigint),
  public.edge_reassign_handover_tasks(jsonb, uuid),
  public.edge_save_task(jsonb, uuid, uuid, uuid[], uuid, bigint, boolean)
  to service_role;
grant execute on function public.edge_apply_due_committee_handoffs()
  to authenticated, service_role;

revoke all on function private.protect_completed_task_row(),
  private.protect_completed_task_child(),
  private.protect_closed_case_row(),
  private.protect_closed_case_assignment(),
  private.prevent_history_mutation(),
  private.annual_term_ends_on(date)
  from public, anon, authenticated;

comment on table public.committee_handover_plans is
  'Admin 預先排定的年度完整名單；到生效日由固定 RPC 原子切換任期。';
comment on table public.task_assignment_history is
  '工作指派的追加式沿革，保存換屆前後姓名快照；不以覆寫目前指派取代歷史。';
comment on column public.tasks.handover_pending is
  '換屆生效時，若未完成工作含卸任或轉任人員即標記待新任名單集中指派；原指派保持不動直到完成交接。';
