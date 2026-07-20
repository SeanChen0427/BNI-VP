-- GitHub Pages 正式前台所需的 Supabase 應用狀態。
-- BNI 計分仍只在 apps/bni-analysis/engine 執行；資料庫只保存輸入與版本化輸出。

create table public.app_settings (
  key text primary key check (length(btrim(key)) between 1 and 100),
  value jsonb not null default '{}'::jsonb,
  updated_by uuid references public.people(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.app_settings (key, value)
values ('monthly_meeting', '{"chapterSizeTarget":51}'::jsonb)
on conflict (key) do nothing;

create table public.monthly_attendance_summaries (
  month date primary key check (extract(day from month) = 1),
  summary jsonb not null check (jsonb_typeof(summary) = 'object'),
  report_import_id uuid references public.report_imports(id) on delete set null,
  generated_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.ai_profiles (
  person_id uuid primary key references public.people(id) on delete cascade,
  default_provider text not null default 'openai'
    check (default_provider in ('openai', 'gemini', 'anthropic')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.app_settings enable row level security;
alter table public.monthly_attendance_summaries enable row level security;
alter table public.ai_profiles enable row level security;

revoke all on public.app_settings, public.monthly_attendance_summaries, public.ai_profiles
  from anon, authenticated;

grant select on public.app_settings, public.monthly_attendance_summaries to authenticated;
grant select, insert, update on public.app_settings, public.monthly_attendance_summaries to authenticated;

create policy app_settings_read_authenticated
on public.app_settings for select to authenticated
using ((select private.current_app_role()) is not null);
create policy app_settings_insert_leadership
on public.app_settings for insert to authenticated
with check ((select private.has_role(array['admin'::public.app_role, 'vp'::public.app_role])));
create policy app_settings_update_leadership
on public.app_settings for update to authenticated
using ((select private.has_role(array['admin'::public.app_role, 'vp'::public.app_role])))
with check ((select private.has_role(array['admin'::public.app_role, 'vp'::public.app_role])));

create policy monthly_attendance_read_authenticated
on public.monthly_attendance_summaries for select to authenticated
using ((select private.current_app_role()) is not null);
create policy monthly_attendance_insert_leadership
on public.monthly_attendance_summaries for insert to authenticated
with check ((select private.has_role(array['admin'::public.app_role, 'vp'::public.app_role])));
create policy monthly_attendance_update_leadership
on public.monthly_attendance_summaries for update to authenticated
using ((select private.has_role(array['admin'::public.app_role, 'vp'::public.app_role])))
with check ((select private.has_role(array['admin'::public.app_role, 'vp'::public.app_role])));

-- 個人 AI 設定與密文一樣只由 Edge Function/service_role 存取。
-- authenticated 不授權 ai_profiles，也沒有 RLS policy。

drop policy if exists committee_meetings_insert_committee on public.committee_meetings;
drop policy if exists committee_meetings_update_committee on public.committee_meetings;
create policy committee_meetings_insert_leadership
on public.committee_meetings for insert to authenticated
with check ((select private.has_role(array['admin'::public.app_role, 'vp'::public.app_role])));
create policy committee_meetings_update_leadership
on public.committee_meetings for update to authenticated
using ((select private.has_role(array['admin'::public.app_role, 'vp'::public.app_role])))
with check ((select private.has_role(array['admin'::public.app_role, 'vp'::public.app_role])));

create trigger app_settings_updated_at
before update on public.app_settings
for each row execute function private.set_updated_at();
create trigger monthly_attendance_summaries_updated_at
before update on public.monthly_attendance_summaries
for each row execute function private.set_updated_at();
create trigger ai_profiles_updated_at
before update on public.ai_profiles
for each row execute function private.set_updated_at();

grant all on public.app_settings, public.monthly_attendance_summaries, public.ai_profiles to service_role;
grant select, insert, update on public.people, public.committee_terms, public.members to service_role;
grant select, insert, update, delete on public.analysis_snapshots to service_role;
grant select, insert, update on public.report_imports to service_role;
grant select, insert, update, delete on public.committee_meetings to service_role;
grant select, insert, update, delete on public.ai_credentials to service_role;

-- Edge Function 已先驗證使用者 JWT 與 app_accounts；以 service_role 寫入後，
-- 最終狀態 trigger 必須接受該受信任的伺服器寫入。
create or replace function private.protect_finalized_records()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_table_name = 'attendance_sessions' then
    if new.status = 'confirmed'
       and auth.role() <> 'service_role'
       and not (select private.has_role(array['admin'::public.app_role, 'vp'::public.app_role])) then
      raise exception '只有副主席或 Admin 可最終確認點名';
    end if;
    if tg_op = 'UPDATE' then
      if old.status = 'confirmed'
         and auth.role() <> 'service_role'
         and not (select private.has_role(array['admin'::public.app_role, 'vp'::public.app_role])) then
        raise exception '已確認點名只有副主席或 Admin 可修改';
      end if;
    end if;
  end if;
  if tg_table_name = 'committee_meetings' then
    if new.status = 'final'
       and auth.role() <> 'service_role'
       and not (select private.has_role(array['admin'::public.app_role, 'vp'::public.app_role])) then
      raise exception '只有副主席或 Admin 可完成月會結案';
    end if;
    if tg_op = 'UPDATE' then
      if old.status = 'final'
         and auth.role() <> 'service_role'
         and not (select private.has_role(array['admin'::public.app_role, 'vp'::public.app_role])) then
        raise exception '已結案月會只有副主席或 Admin 可修改';
      end if;
    end if;
  end if;
  return new;
end;
$$;

comment on table public.monthly_attendance_summaries is
  '由 Private Storage 的單月 PALMS 產生；月會只讀此版本化衍生摘要，不讀 GitHub 或瀏覽器本機檔案。';
comment on table public.ai_profiles is
  '個人預設 AI 平台；完整 API Key 只存在 ai_credentials.encrypted_payload。';
