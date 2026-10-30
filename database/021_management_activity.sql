-- Track return and sample changes for the workspace manager.
create index if not exists crm_membership_audit_org_time on crm_private.membership_audit(org_id,created_at desc,id desc);
create table if not exists crm_private.entity_audit (
 id bigint generated always as identity primary key, org_id uuid not null, entity_id uuid not null,
 entity_kind text not null check(entity_kind in ('return','sample')),
 action text not null check(action in ('INSERT','UPDATE','DELETE')),
 label text not null, actor_id uuid, created_at timestamptz not null default now(),
 transaction_id bigint not null default txid_current()
);
alter table crm_private.entity_audit enable row level security;
revoke all on crm_private.entity_audit from public,anon,authenticated;
create index if not exists crm_entity_audit_org_time on crm_private.entity_audit(org_id,created_at desc,id desc);
create or replace function public.crm_log_business_entity() returns trigger language plpgsql security definer set search_path='' as $$
declare target_org uuid; target_id uuid; target_kind text; item_label text;
begin
 if tg_op='DELETE' then target_org=old.org_id;target_id=old.id;else target_org=new.org_id;target_id=new.id;end if;
 target_kind=case when tg_table_name='crm_returns' then 'return' else 'sample' end;
 if tg_op='UPDATE' and tg_table_name='crm_samples' then
  if old.id is distinct from new.id then update crm_private.entity_audit set entity_id=new.id where org_id=new.org_id and entity_id=old.id and transaction_id=txid_current();end if;
  if old.data is not distinct from new.data then return new;end if;
 end if;
 if target_kind='return' then
  if tg_op='DELETE' then item_label=coalesce(nullif(old.reference,''),'پرونده برگشتی');else item_label=coalesce(nullif(new.reference,''),'پرونده برگشتی');end if;
 else
  if tg_op='DELETE' then item_label=coalesce(nullif(old.data#>>'{details,title,en}',''),nullif(old.data#>>'{details,title,fa}',''),'پرونده نمونه');else item_label=coalesce(nullif(new.data#>>'{details,title,en}',''),nullif(new.data#>>'{details,title,fa}',''),'پرونده نمونه');end if;
 end if;
 insert into crm_private.entity_audit(org_id,entity_id,entity_kind,action,label,actor_id) values(target_org,target_id,target_kind,tg_op,left(item_label,160),auth.uid());
 if tg_op='DELETE' then return old;end if;return new;
end $$;
revoke all on function public.crm_log_business_entity() from public,anon,authenticated;
create trigger crm_audit_returns after insert or update or delete on public.crm_returns for each row execute function public.crm_log_business_entity();
create trigger crm_audit_samples after insert or update or delete on public.crm_samples for each row execute function public.crm_log_business_entity();
create or replace function public.crm_management_activity(max_rows integer default 200) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare target uuid;
begin
 select org_id into target from public.crm_members where user_id=auth.uid();
 if target is null or coalesce(public.crm_role(target),'')<>'admin' then raise insufficient_privilege;end if;
 if max_rows is null or max_rows<1 or max_rows>1000 then raise exception 'invalid_limit';end if;
 return (with events as (
  select 'record:'||a.id::text as event_id,'record'::text as category,a.action,a.label,a.actor_id,a.created_at,a.restored_from_backup, null::jsonb as detail
  from public.crm_audit a where a.org_id=target
  union all
  select 'member:'||a.id::text,'member','UPDATE','تغییر دسترسی عضو',a.actor_id,a.created_at,false,jsonb_build_object('target_id',a.target_id,'old_role',a.old_role,'new_role',a.new_role,'old_active',a.old_active,'new_active',a.new_active,'old_can_delete',a.old_can_delete,'new_can_delete',a.new_can_delete)
  from crm_private.membership_audit a where a.org_id=target
  union all
  select 'entity:'||a.id::text,a.entity_kind,a.action,a.label,a.actor_id,a.created_at,false,null::jsonb from crm_private.entity_audit a where a.org_id=target
 ), latest as (select * from events order by created_at desc,event_id desc limit max_rows)
 select coalesce(jsonb_agg(jsonb_build_object('id',e.event_id,'category',e.category,'action',e.action,'label',e.label,'actor_name',case when e.actor_id is null then 'سیستم' else coalesce(nullif(trim(u.raw_user_meta_data->>'full_name'),''),nullif(trim(u.raw_user_meta_data->>'name'),''),'نام ثبت نشده') end,'target_name',case when tm.user_id is null then null else coalesce(nullif(trim(tu.raw_user_meta_data->>'full_name'),''),nullif(trim(tu.raw_user_meta_data->>'name'),''),'نام ثبت نشده') end,'created_at',e.created_at,'restored_from_backup',e.restored_from_backup,'detail',e.detail) order by e.created_at desc,e.event_id desc),'[]'::jsonb)
 from latest e left join public.crm_members m on m.org_id=target and m.user_id=e.actor_id left join auth.users u on u.id=m.user_id left join public.crm_members tm on tm.org_id=target and tm.user_id=nullif(e.detail->>'target_id','')::uuid left join auth.users tu on tu.id=tm.user_id);
end $$;
revoke all on function public.crm_management_activity(integer) from public,anon;
grant execute on function public.crm_management_activity(integer) to authenticated;

-- Preserve captured business activity in manual archives.
create or replace function public.crm_workspace_snapshot() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare target uuid; result jsonb;
begin
 select org_id into target from public.crm_members where user_id=auth.uid();
 if target is null or coalesce(public.crm_role(target),'')<>'admin' then raise insufficient_privilege; end if;
 select jsonb_build_object(
  'format','peyvand-workspace-snapshot', 'schemaVersion',2, 'exportedAt',statement_timestamp(),
  'workspace',(select to_jsonb(o) from public.crm_orgs o where o.id=target),
  'members',(select coalesce(jsonb_agg(to_jsonb(m) order by m.user_id),'[]'::jsonb) from public.crm_members m where m.org_id=target),
  'invites',(select coalesce(jsonb_agg(to_jsonb(i) order by i.id),'[]'::jsonb) from public.crm_invites i where i.org_id=target),
  'records',(select coalesce(jsonb_agg(to_jsonb(r) order by r.id),'[]'::jsonb) from public.crm_records r where r.org_id=target),
  'returns',(select coalesce(jsonb_agg(to_jsonb(r) order by r.id),'[]'::jsonb) from public.crm_returns r where r.org_id=target),
  'samples',(select coalesce(jsonb_agg(to_jsonb(s) order by s.id),'[]'::jsonb) from public.crm_samples s where s.org_id=target),
  'audit',(select coalesce(jsonb_agg(to_jsonb(a) order by a.created_at,a.id),'[]'::jsonb) from public.crm_audit a where a.org_id=target),
  'trash',(select coalesce(jsonb_agg(to_jsonb(t) order by t.id),'[]'::jsonb) from crm_private.trash t where t.org_id=target and t.restored_at is null),
  'entityAudit',(select coalesce(jsonb_agg(to_jsonb(a) order by a.id),'[]'::jsonb) from crm_private.entity_audit a where a.org_id=target),
  'membershipAudit',(select coalesce(jsonb_agg(to_jsonb(a) order by a.id),'[]'::jsonb) from crm_private.membership_audit a where a.org_id=target),
  'limitations',jsonb_build_array('auth_credentials_excluded','storage_objects_excluded','platform_configuration_excluded')
 ) into result;
 if octet_length(result::text)>18000000 then raise exception 'snapshot_too_large'; end if;
 return result;
end $$;
revoke all on function public.crm_workspace_snapshot() from public,anon;
grant execute on function public.crm_workspace_snapshot() to authenticated;
