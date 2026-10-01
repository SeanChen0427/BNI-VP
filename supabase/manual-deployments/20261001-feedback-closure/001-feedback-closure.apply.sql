-- Apply only this patch. Do not replay older migrations or run db push.
-- DDL only: preserve business rows, RPCs, RLS, grants and the chair boundary guard.
begin isolation level repeatable read;
set local lock_timeout='5s';
set local statement_timeout='30s';
select pg_advisory_xact_lock(hashtext('fulian-feedback-closure-20261001'));
do $guard$
begin
  if (select md5(prosrc) from pg_proc where oid='private.validate_feedback_write()'::regprocedure) is distinct from '0deba6c1f317d5b92309b09fc800e500' then raise exception 'FEEDBACK_FUNCTION_DRIFT'; end if;
  if (select md5(prosrc) from pg_proc where oid='private.current_app_role()'::regprocedure) is distinct from '872f499e43c34e17ad8f037e8e680c37' then raise exception 'DEPENDENCY_DRIFT: %', 'private.current_app_role()'; end if;
  if (select md5(prosrc) from pg_proc where oid='private.is_active_committee_person(uuid)'::regprocedure) is distinct from 'bd82b1b15d6d05317a69f2a036fe81b6' then raise exception 'DEPENDENCY_DRIFT: %', 'private.is_active_committee_person(uuid)'; end if;
  if (select md5(prosrc) from pg_proc where oid='private.protect_case_closure()'::regprocedure) is distinct from 'b3517bf3baee0857006f890b998426aa' then raise exception 'DEPENDENCY_DRIFT: %', 'private.protect_case_closure()'; end if;
  if (select md5(prosrc) from pg_proc where oid='edge_save_case_state(uuid,uuid,jsonb,jsonb,bigint,timestamp with time zone)'::regprocedure) is distinct from '75460ad8887fbe80bcf6cfff13e9d436' then raise exception 'DEPENDENCY_DRIFT: %', 'edge_save_case_state(uuid,uuid,jsonb,jsonb,bigint,timestamp with time zone)'; end if;
  if (select md5(prosrc) from pg_proc where oid='edge_save_case_state_as_user(uuid,uuid,uuid,jsonb,jsonb,bigint,timestamp with time zone)'::regprocedure) is distinct from '0c7625e7a790fdec6b9300b14b3bccd2' then raise exception 'DEPENDENCY_DRIFT: %', 'edge_save_case_state_as_user(uuid,uuid,uuid,jsonb,jsonb,bigint,timestamp with time zone)'; end if;
  if (select md5(prosrc) from pg_proc where oid='edge_apply_due_committee_handoffs()'::regprocedure) is distinct from 'a492d816864f38014f7e1be613034f50' then raise exception 'DEPENDENCY_DRIFT: %', 'edge_apply_due_committee_handoffs()'; end if;
end;
$guard$;
create temporary table feedback_closure_before on commit drop as
select jsonb_build_object('case_feedback',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text)::text,'[]')) from public.case_feedback r),'votes',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text)::text,'[]')) from public.votes r),'vote_snapshots',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text)::text,'[]')) from public.vote_snapshots r),'vote_snapshot_voters',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text)::text,'[]')) from public.vote_snapshot_voters r),'cases',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text)::text,'[]')) from public.cases r),'tasks',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text)::text,'[]')) from public.tasks r),'task_case_states',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text)::text,'[]')) from public.task_case_states r),'committee_terms',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text)::text,'[]')) from public.committee_terms r)) as rows_hash,
(select jsonb_build_object('owner',proowner,'acl',proacl::text,'config',proconfig,'definer',prosecdef) from pg_proc where oid='private.validate_feedback_write()'::regprocedure) as function_security;

-- Preserve historical authors when leadership locks unchanged feedback during closure.
-- No row updates, role grants, RLS changes, or handover function changes.

create or replace function private.validate_feedback_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_case public.cases%rowtype;
begin
  select * into target_case from public.cases where id = new.case_id;
  if target_case.id is null or target_case.type not in ('renewal', 'new', 'industry') then
    raise exception '此案件不適用委員回饋';
  end if;
  if target_case.stage = 'closed' then
    raise exception '結案或鎖定後不得修改回饋';
  end if;
  if tg_op = 'UPDATE' then
    if old.locked_at is not null then
      raise exception '結案或鎖定後不得修改回饋';
    end if;
    if new.case_id <> old.case_id or new.author_person_id <> old.author_person_id then
      raise exception '不得變更既有回饋的案件或作者';
    end if;
    -- Closing archives an existing submission; it is not a new submission.
    -- Ignore updated_at because the preceding timestamp trigger changes it.
    if new.locked_at is distinct from old.locked_at then
      if new.locked_at is not null
         and coalesce((select private.current_app_role()) in ('vp', 'admin'), false)
         and (to_jsonb(new) - 'locked_at' - 'updated_at')
             is not distinct from (to_jsonb(old) - 'locked_at' - 'updated_at') then
        return new;
      end if;
      raise exception '只有副主席或 Admin 可原樣鎖定既有回饋';
    end if;
  end if;
  if not (select private.is_active_committee_person(new.author_person_id)) then
    raise exception '回饋者不是當期有效投票成員';
  end if;
  if exists (
    select 1 from public.members m
    where m.id = target_case.member_id and m.person_id = new.author_person_id
  ) or exists (
    select 1 from public.people p
    where p.id = new.author_person_id
      and btrim(p.display_name) = btrim(target_case.applicant_name_snapshot)
  ) then
    raise exception '申請者本人必須迴避';
  end if;
  return new;
end;
$$;

do $verify$
begin
  if (select md5(prosrc) from pg_proc where oid='private.validate_feedback_write()'::regprocedure) is distinct from 'ed8b9f37de114b7eb8f2d7edab74385a' then raise exception 'PATCH_HASH_MISMATCH'; end if;
  if (select rows_hash from feedback_closure_before) is distinct from jsonb_build_object('case_feedback',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text)::text,'[]')) from public.case_feedback r),'votes',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text)::text,'[]')) from public.votes r),'vote_snapshots',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text)::text,'[]')) from public.vote_snapshots r),'vote_snapshot_voters',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text)::text,'[]')) from public.vote_snapshot_voters r),'cases',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text)::text,'[]')) from public.cases r),'tasks',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text)::text,'[]')) from public.tasks r),'task_case_states',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text)::text,'[]')) from public.task_case_states r),'committee_terms',(select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text)::text,'[]')) from public.committee_terms r)) then raise exception 'BUSINESS_ROWS_CHANGED'; end if;
  if (select function_security from feedback_closure_before) is distinct from (select jsonb_build_object('owner',proowner,'acl',proacl::text,'config',proconfig,'definer',prosecdef) from pg_proc where oid='private.validate_feedback_write()'::regprocedure) then raise exception 'FUNCTION_SECURITY_CHANGED'; end if;
  if (select md5(prosrc) from pg_proc where oid='private.current_app_role()'::regprocedure) is distinct from '872f499e43c34e17ad8f037e8e680c37' then raise exception 'DEPENDENCY_DRIFT: %', 'private.current_app_role()'; end if;
  if (select md5(prosrc) from pg_proc where oid='private.is_active_committee_person(uuid)'::regprocedure) is distinct from 'bd82b1b15d6d05317a69f2a036fe81b6' then raise exception 'DEPENDENCY_DRIFT: %', 'private.is_active_committee_person(uuid)'; end if;
  if (select md5(prosrc) from pg_proc where oid='private.protect_case_closure()'::regprocedure) is distinct from 'b3517bf3baee0857006f890b998426aa' then raise exception 'DEPENDENCY_DRIFT: %', 'private.protect_case_closure()'; end if;
  if (select md5(prosrc) from pg_proc where oid='edge_save_case_state(uuid,uuid,jsonb,jsonb,bigint,timestamp with time zone)'::regprocedure) is distinct from '75460ad8887fbe80bcf6cfff13e9d436' then raise exception 'DEPENDENCY_DRIFT: %', 'edge_save_case_state(uuid,uuid,jsonb,jsonb,bigint,timestamp with time zone)'; end if;
  if (select md5(prosrc) from pg_proc where oid='edge_save_case_state_as_user(uuid,uuid,uuid,jsonb,jsonb,bigint,timestamp with time zone)'::regprocedure) is distinct from '0c7625e7a790fdec6b9300b14b3bccd2' then raise exception 'DEPENDENCY_DRIFT: %', 'edge_save_case_state_as_user(uuid,uuid,uuid,jsonb,jsonb,bigint,timestamp with time zone)'; end if;
  if (select md5(prosrc) from pg_proc where oid='edge_apply_due_committee_handoffs()'::regprocedure) is distinct from 'a492d816864f38014f7e1be613034f50' then raise exception 'DEPENDENCY_DRIFT: %', 'edge_apply_due_committee_handoffs()'; end if;
end;
$verify$;
select 'ed8b9f37de114b7eb8f2d7edab74385a' as feedback_function_hash,true as business_rows_unchanged,true as dependencies_unchanged,true as function_security_unchanged;
commit;
