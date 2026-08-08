-- Add a monthly committee-meeting reminder. It shares the service-only
-- reminder tables but resolves the confirmed `committee` LINE route rather
-- than the `exchange` route. The rule starts disabled.

alter table public.line_reminder_rules
  drop constraint if exists line_reminder_rules_reminder_key_check;

alter table public.line_reminder_rules
  add constraint line_reminder_rules_reminder_key_check
  check (reminder_key in (
    'weekly_meeting_alarm',
    'monthly_data_entry',
    'monthly_committee_meeting'
  ));

alter table public.line_reminder_rules
  drop constraint if exists line_reminder_rules_check;

alter table public.line_reminder_rules
  drop constraint if exists line_reminder_rules_schedule_shape_check;

alter table public.line_reminder_rules
  add constraint line_reminder_rules_schedule_shape_check
  check (
    (reminder_key = 'weekly_meeting_alarm'
      and send_weekday is not null
      and meeting_weekday is null
      and days_before is null)
    or
    (reminder_key in ('monthly_data_entry', 'monthly_committee_meeting')
      and send_weekday is null
      and meeting_weekday is not null
      and days_before is not null)
  );

insert into public.line_reminder_rules (
  reminder_key,
  display_name,
  enabled,
  send_weekday,
  send_time,
  meeting_weekday,
  days_before,
  message_template
) values (
  'monthly_committee_meeting',
  '每月會員委員會會議提醒',
  false,
  null,
  '20:00',
  2,
  1,
  E'提醒各位會員委員：明天例會後將召開本月會員委員會會議，請預留時間並準時出席，謝謝。'
)
on conflict (reminder_key) do nothing;

comment on table public.line_reminder_rules is
  '副主席或 Admin 管理的 LINE 常態提醒；依 reminder_key 固定解析 exchange 或 committee 群組，初始一律停用。';

comment on table public.line_reminder_deliveries is
  'LINE 常態提醒的排程及測試發送稽核；delivery_key 與 LINE retry key 防止重複發送。';
