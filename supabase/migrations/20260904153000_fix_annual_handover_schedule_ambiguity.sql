-- 修正年度換屆排程 RPC 的輸出欄位 plan_id 與名單表欄位同名歧義。
-- 只重建函式定義，不讀寫任何名單、案件、任務或排程資料。

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
    delete from public.committee_handover_members handover_member
    where handover_member.plan_id = v_plan.id;
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

revoke all on function public.edge_schedule_committee_handover(date, jsonb, uuid, bigint)
  from public, anon, authenticated;
grant execute on function public.edge_schedule_committee_handover(date, jsonb, uuid, bigint)
  to service_role;
