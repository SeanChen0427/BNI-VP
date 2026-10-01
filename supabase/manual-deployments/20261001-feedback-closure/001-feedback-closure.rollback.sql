-- Emergency code rollback only; no business data writes.
begin;
do $guard$ begin if (select md5(prosrc) from pg_proc where oid='private.validate_feedback_write()'::regprocedure) is distinct from 'ed8b9f37de114b7eb8f2d7edab74385a' then raise exception 'ROLLBACK_FUNCTION_DRIFT'; end if; end; $guard$;
CREATE OR REPLACE FUNCTION private.validate_feedback_write()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$
;
commit;
