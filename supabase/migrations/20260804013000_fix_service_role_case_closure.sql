-- app-api 使用 service_role 執行交易，但案件關閉 trigger 必須辨識真正登入者。
-- 本 migration 不放寬 trigger；只新增 service_role 專用包裝函式，於每次交易前
-- 重新驗證 Auth 帳號、角色、人員與任期，再把該登入者 sub 限定於本交易帶入。

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
  taipei_today date := (now() at time zone 'Asia/Taipei')::date;
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

  if coalesce(p_workflow->>'closed', 'false') = 'true'
     and actor_role not in ('admin', 'vp') then
    raise exception '只有副主席或 Admin 可結案';
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

create or replace function public.edge_reset_task_case_as_user(
  p_task_id uuid,
  p_actor uuid,
  p_actor_auth_user_id uuid,
  p_expected_revision bigint
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_role public.app_role;
  taipei_today date := (now() at time zone 'Asia/Taipei')::date;
begin
  select aa.role into actor_role
  from public.app_accounts aa
  where aa.auth_user_id = p_actor_auth_user_id
    and aa.enabled;
  if actor_role not in ('admin', 'vp') then
    raise exception '只有副主席或 Admin 可重設案件';
  end if;

  if actor_role = 'vp' and not exists (
    select 1
    from public.committee_terms ct
    join public.people p on p.id = ct.person_id
    where ct.person_id = p_actor
      and ct.role = 'vp'
      and ct.status = 'active'
      and ct.starts_on <= taipei_today
      and (ct.ends_on is null or ct.ends_on >= taipei_today)
      and p.status = 'active'
  ) then
    raise exception '登入人員不具當期副主席角色';
  end if;

  if actor_role = 'admin' and not exists (
    select 1 from public.people p
    where p.id = p_actor
      and p.display_name = '系統開發人員 Admin'
      and p.status = 'active'
  ) then
    raise exception 'Admin 操作人員不正確';
  end if;

  perform set_config('request.jwt.claim.sub', p_actor_auth_user_id::text, true);
  return public.edge_reset_task_case(p_task_id, p_actor, p_expected_revision);
end;
$$;

revoke all on function public.edge_save_case_state_as_user(uuid, uuid, uuid, jsonb, jsonb, bigint, timestamptz)
  from public, anon, authenticated;
revoke all on function public.edge_reset_task_case_as_user(uuid, uuid, uuid, bigint)
  from public, anon, authenticated;
grant execute on function public.edge_save_case_state_as_user(uuid, uuid, uuid, jsonb, jsonb, bigint, timestamptz)
  to service_role;
grant execute on function public.edge_reset_task_case_as_user(uuid, uuid, uuid, bigint)
  to service_role;

comment on function public.edge_save_case_state_as_user(uuid, uuid, uuid, jsonb, jsonb, bigint, timestamptz) is
  '驗證正式登入帳號與人員角色後，以該使用者身分執行案件狀態交易；不放寬案件關閉 trigger。';
comment on function public.edge_reset_task_case_as_user(uuid, uuid, uuid, bigint) is
  '驗證副主席／Admin 登入帳號與實際人員後，以該使用者身分重設案件。';
