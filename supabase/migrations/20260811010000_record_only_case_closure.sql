-- Midterm counseling and departure interviews are record-only workflows.
-- Their lead interviewer may close the task after the Word file is saved;
-- decision cases continue to require VP/Admin authority.
create or replace function public.edge_save_case_state_as_user(
  p_task_id uuid,
  p_actor uuid,
  p_actor_auth_user_id uuid,
  p_workflow jsonb,
  p_draft jsonb,
  p_expected_revision bigint,
  p_vote_deadline timestamptz default null
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_role public.app_role;
  target_task public.tasks%rowtype;
  taipei_today date := (now() at time zone 'Asia/Taipei')::date;
  closing boolean := coalesce(p_workflow->>'closed', 'false') = 'true';
begin
  select aa.role into actor_role
  from public.app_accounts aa
  where aa.auth_user_id = p_actor_auth_user_id
    and aa.enabled;
  if actor_role is null then
    raise exception '登入帳號未啟用或角色不存在';
  end if;

  if actor_role in ('vp', 'committee') and not exists (
    select 1
    from public.committee_terms ct
    join public.people p on p.id = ct.person_id
    where ct.person_id = p_actor
      and ct.role::text = actor_role::text
      and ct.status = 'active'
      and ct.starts_on <= taipei_today
      and (ct.ends_on is null or ct.ends_on >= taipei_today)
      and p.status = 'active'
  ) then
    raise exception '登入人員不具當期角色';
  end if;

  if actor_role = 'admin' and not exists (
    select 1 from public.people p
    where p.id = p_actor
      and p.display_name = '系統開發人員 Admin'
      and p.status = 'active'
  ) then
    raise exception 'Admin 操作人員不正確';
  end if;

  select * into target_task
  from public.tasks
  where id = p_task_id;
  if target_task.id is null then
    raise exception '找不到指定案件';
  end if;

  if closing then
    if target_task.category in ('renewal', 'new', 'industry') then
      if actor_role not in ('admin', 'vp') then
        raise exception '只有副主席或 Admin 可結案';
      end if;
    elsif target_task.category in ('midterm', 'departure') then
      if coalesce(p_workflow->>'wordSaved', 'false') <> 'true' then
        raise exception '訪談 Word 尚未成功保存，不能結案';
      end if;
      if actor_role not in ('admin', 'vp') and target_task.lead_person_id is distinct from p_actor then
        raise exception '只有副主席、Admin 或本案主要負責人可完成訪談紀錄';
      end if;
    else
      raise exception '此案件類型不能由案件流程結案';
    end if;
  end if;

  perform set_config('request.jwt.claim.sub', p_actor_auth_user_id::text, true);
  return public.edge_save_case_state(
    p_task_id,
    p_actor,
    p_workflow,
    p_draft,
    p_expected_revision,
    p_vote_deadline
  );
end;
$$;

revoke all on function public.edge_save_case_state_as_user(uuid, uuid, uuid, jsonb, jsonb, bigint, timestamptz)
  from public, anon, authenticated;
grant execute on function public.edge_save_case_state_as_user(uuid, uuid, uuid, jsonb, jsonb, bigint, timestamptz)
  to service_role;

comment on function public.edge_save_case_state_as_user(uuid, uuid, uuid, jsonb, jsonb, bigint, timestamptz) is
  '驗證正式登入身份；決議案件僅副主席／Admin 結案，期中及離會訪談由主要負責人保存 Word 後直接完成紀錄。';
