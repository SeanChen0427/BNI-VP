-- A single LINE Official Account may serve up to three confirmed group routes.
-- The browser only sees the display name and route; opaque LINE group IDs remain
-- service-role-only. Assigning a new group to a route replaces the old target.

alter table public.line_group_targets
  add column route_key text
    check (route_key in ('attendance', 'committee', 'leadership'));

update public.line_group_targets
set route_key = 'attendance'
where status = 'active' and route_key is null;

alter table public.line_group_targets
  add constraint line_group_targets_route_state_check check (
    (status = 'active' and route_key is not null)
    or (status = 'discovered' and route_key is null)
    or status = 'disabled'
  );

drop index if exists public.line_group_targets_one_active_test;
drop index if exists public.line_group_targets_one_active_production;

create unique index line_group_targets_one_active_route
  on public.line_group_targets (route_key)
  where status = 'active';

drop index if exists public.line_group_targets_status_idx;
create index line_group_targets_status_idx
  on public.line_group_targets (status, route_key, purpose, last_event_at desc);

comment on column public.line_group_targets.route_key is
  'Confirmed destination route: attendance, committee, or leadership. At most one active group per route.';
