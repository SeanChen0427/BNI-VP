-- Public official events only. Member bookings/completion and PALMS remain separate.
create table public.training_events (
  id bigint primary key check(id > 0),
  title text not null check(length(title) between 1 and 500),
  start_at timestamptz not null,
  end_at timestamptz not null check(end_at >= start_at),
  description text not null default '',
  source_url text not null check(source_url like 'https://bnikaohsiung.com.tw/zh-TW/eventdetails?%'),
  category text not null check(category in ('msp_up','msp_down','exchange','workshop','leadership','other')),
  source_status text not null default 'published' check(source_status in ('published','missing')),
  revision integer not null default 1,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index training_events_date_idx on public.training_events(start_at);
create table public.training_event_changes (
  id bigint generated always as identity primary key,
  event_id bigint not null references public.training_events(id),
  change_kind text not null check(change_kind in ('new','changed','missing','restored')),
  before_event jsonb,
  after_event jsonb not null,
  changed_at timestamptz not null default now()
);
create table public.training_sync_state (
  id integer primary key check(id=1),
  last_success_at timestamptz,
  last_attempt_at timestamptz,
  last_error text,
  synced_years integer[] not null default '{}',
  last_counts jsonb not null default '{}',
  lease_token uuid,
  lease_until timestamptz,
  trigger_source text check(trigger_source in ('manual','scheduled'))
);
insert into public.training_sync_state(id) values(1);
alter table public.training_events enable row level security;
alter table public.training_event_changes enable row level security;
alter table public.training_sync_state enable row level security;
revoke all on public.training_events,public.training_event_changes,public.training_sync_state from public,anon,authenticated;
grant select,insert,update on public.training_events,public.training_event_changes,public.training_sync_state to service_role;
grant usage,select on sequence public.training_event_changes_id_seq to service_role;

create function public.edge_claim_training_sync(p_trigger text) returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_token uuid:=gen_random_uuid(); v_state public.training_sync_state;
begin
  if p_trigger not in ('manual','scheduled') then raise exception 'Invalid sync trigger'; end if;
  select * into v_state from public.training_sync_state where id=1 for update;
  if v_state.lease_until>now() or v_state.last_attempt_at>now()-interval '5 minutes' then return null; end if;
  update public.training_sync_state set lease_token=v_token,lease_until=now()+interval '3 minutes',
    last_attempt_at=now(),last_error=null,trigger_source=p_trigger where id=1;
  return v_token;
end $$;

create function public.edge_fail_training_sync(p_token uuid,p_message text) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  update public.training_sync_state set lease_token=null,lease_until=null,last_error=left(p_message,300)
    where id=1 and lease_token=p_token;
end $$;

create function public.edge_complete_training_sync(p_token uuid,p_years integer[],p_records jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_state public.training_sync_state; v_old public.training_events; v_after public.training_events;
  v_item record; v_kind text; v_before jsonb; v_year integer; v_previous integer; v_current integer;
  v_new integer:=0; v_changed integer:=0; v_missing integer:=0; v_restored integer:=0; v_result jsonb;
begin
  select * into v_state from public.training_sync_state where id=1 for update;
  if v_state.lease_token is distinct from p_token or p_token is null or v_state.lease_until<now() then raise exception 'Stale sync lease'; end if;
  if p_years is distinct from array[extract(year from now() at time zone 'Asia/Taipei')::integer,extract(year from now() at time zone 'Asia/Taipei')::integer+1]
    or jsonb_typeof(p_records) is distinct from 'array' then raise exception 'Invalid sync scope'; end if;
  if (select count(*)<>count(distinct x->>'id') from jsonb_array_elements(p_records) x) then raise exception 'Duplicate official event ID'; end if;
  if exists(select 1 from jsonb_array_elements(p_records) x where not (extract(year from (x->>'start_at')::timestamptz at time zone 'Asia/Taipei')::integer=any(p_years))) then raise exception 'Event outside sync scope'; end if;
  -- An unexpectedly empty/halved feed cannot silently mark the entire calendar missing.
  foreach v_year in array p_years loop
    select count(*) into v_previous from public.training_events where source_status='published' and extract(year from start_at at time zone 'Asia/Taipei')=v_year;
    select count(*) into v_current from jsonb_array_elements(p_records) x where extract(year from (x->>'start_at')::timestamptz at time zone 'Asia/Taipei')=v_year;
    if v_previous>0 and (v_current=0 or v_current<v_previous*0.5) then raise exception 'Unexpected drop in official events for %',v_year; end if;
  end loop;
  for v_item in select * from jsonb_to_recordset(p_records) as x(id bigint,title text,start_at timestamptz,end_at timestamptz,description text,source_url text,category text) loop
    select * into v_old from public.training_events where id=v_item.id;
    v_before:=case when found then to_jsonb(v_old) else null end;
    v_kind:=case when v_before is null then 'new' when v_old.source_status='missing' then 'restored'
      when row(v_old.title,v_old.start_at,v_old.end_at,v_old.description,v_old.source_url,v_old.category)
        is distinct from row(v_item.title,v_item.start_at,v_item.end_at,v_item.description,v_item.source_url,v_item.category) then 'changed' else null end;
    insert into public.training_events(id,title,start_at,end_at,description,source_url,category)
      values(v_item.id,v_item.title,v_item.start_at,v_item.end_at,v_item.description,v_item.source_url,v_item.category)
      on conflict(id) do update set title=excluded.title,start_at=excluded.start_at,end_at=excluded.end_at,
      description=excluded.description,source_url=excluded.source_url,category=excluded.category,source_status='published',last_seen_at=now(),
      updated_at=case when v_kind is not null then now() else training_events.updated_at end,
      revision=training_events.revision+case when v_kind is not null then 1 else 0 end
      returning * into v_after;
    if v_kind is not null then
      insert into public.training_event_changes(event_id,change_kind,before_event,after_event) values(v_item.id,v_kind,v_before,to_jsonb(v_after));
      if v_kind='new' then v_new:=v_new+1; elsif v_kind='restored' then v_restored:=v_restored+1; else v_changed:=v_changed+1; end if;
    end if;
  end loop;
  for v_old in select * from public.training_events e where source_status='published'
    and extract(year from start_at at time zone 'Asia/Taipei')::integer=any(p_years)
    and not exists(select 1 from jsonb_array_elements(p_records) x where (x->>'id')::bigint=e.id) loop
    update public.training_events set source_status='missing',updated_at=now(),revision=revision+1 where id=v_old.id returning * into v_after;
    insert into public.training_event_changes(event_id,change_kind,before_event,after_event) values(v_old.id,'missing',to_jsonb(v_old),to_jsonb(v_after));
    v_missing:=v_missing+1;
  end loop;
  v_result:=jsonb_build_object('received',jsonb_array_length(p_records),'new',v_new,'changed',v_changed,'missing',v_missing,'restored',v_restored);
  update public.training_sync_state set last_success_at=now(),last_error=null,synced_years=p_years,last_counts=v_result,lease_token=null,lease_until=null where id=1;
  return v_result;
end $$;

revoke all on function public.edge_claim_training_sync(text),public.edge_fail_training_sync(uuid,text),public.edge_complete_training_sync(uuid,integer[],jsonb) from public,anon,authenticated;
grant execute on function public.edge_claim_training_sync(text),public.edge_fail_training_sync(uuid,text),public.edge_complete_training_sync(uuid,integer[],jsonb) to service_role;

-- Deployment configures this dedicated secret in Vault and the Edge Function.
-- Do not reuse LINE credentials or invoke a messaging function.
create function private.invoke_training_catalog_sync() returns bigint
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_url text; v_secret text; v_id bigint;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name='training_catalog_cron_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name='training_catalog_cron_secret';
  if v_url is null or v_secret is null then raise exception 'Training catalog schedule not configured'; end if;
  select net.http_post(url:=v_url,headers:=jsonb_build_object('Content-Type','application/json','x-cron-secret',v_secret),body:='{}'::jsonb,timeout_milliseconds:=60000) into v_id;
  return v_id;
end $$;
revoke all on function private.invoke_training_catalog_sync() from public,anon,authenticated;
-- Once configured, schedule at UTC 22:00 = Asia/Taipei 06:00:
-- select cron.schedule('training-catalog-daily','0 22 * * *','select private.invoke_training_catalog_sync()');
