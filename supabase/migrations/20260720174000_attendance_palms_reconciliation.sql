-- 每週點名是 LINE 公告的作業增量，不是 PALMS 的替代資料源。
-- 每個週次保存當時採用的 PALMS 基準；顯示累計時仍一律重新使用最新
-- PALMS，再加上其 period_end 之後已確認的點名週次，避免下月重複累加。

alter table public.attendance_sessions
  add column palms_report_import_id uuid references public.report_imports(id) on delete set null,
  add column palms_period_start date,
  add column palms_period_end date,
  add column announcement_snapshot text;

alter table public.attendance_sessions
  add constraint attendance_sessions_palms_period_check
  check (
    palms_period_end is null
    or palms_period_start is null
    or palms_period_end >= palms_period_start
  );

create index attendance_sessions_reconciliation_idx
  on public.attendance_sessions (status, meeting_date, palms_period_end);

grant select, insert, update on public.attendance_sessions, public.attendance_records
  to service_role;
grant delete on public.attendance_records to service_role;

comment on column public.attendance_sessions.palms_period_end is
  '此週公告當時使用的 PALMS 截止日；最新公告仍以目前最新 PALMS 動態重算。';
comment on column public.attendance_sessions.announcement_snapshot is
  '副主席確認當下的 LINE 公告文字快照；不是正式 PALMS 數據來源。';
