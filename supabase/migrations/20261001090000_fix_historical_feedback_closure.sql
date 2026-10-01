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
