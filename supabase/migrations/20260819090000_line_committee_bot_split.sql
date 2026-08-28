-- Give the closed membership-committee group its own LINE Official Account,
-- credentials and monthly quota. Existing delivery history remains attached to
-- the original target rows; only the active committee route is cleared so an
-- administrator must explicitly verify the new bot in the correct group.

alter table public.line_group_targets
  add column oa_channel text not null default 'vice_chair'
    check (oa_channel in ('vice_chair', 'committee'));

alter table public.line_group_targets
  drop constraint if exists line_group_targets_line_group_id_key;

create unique index line_group_targets_channel_group_unique
  on public.line_group_targets (oa_channel, line_group_id);

update public.line_group_targets
set status = 'disabled',
    purpose = null,
    route_key = null,
    verified_by = null,
    verified_at = null
where status = 'active'
  and route_key = 'committee'
  and oa_channel = 'vice_chair';

alter table public.line_group_targets
  add constraint line_group_targets_route_channel_check check (
    route_key is null
    or (route_key = 'committee' and oa_channel = 'committee')
    or (route_key in ('attendance', 'leadership', 'exchange') and oa_channel = 'vice_chair')
  );

drop index if exists public.line_group_targets_status_idx;
create index line_group_targets_status_idx
  on public.line_group_targets (oa_channel, status, route_key, purpose, last_event_at desc);

comment on column public.line_group_targets.oa_channel is
  'LINE OA identity that discovered and owns this target: vice_chair or committee. Secrets remain in Edge Function Secrets.';

comment on table public.line_group_targets is
  'LINE webhook 發現的群組目標；保存所屬 OA 身分，必須由副主席或 Admin 明確核對後才可啟用發送。';
