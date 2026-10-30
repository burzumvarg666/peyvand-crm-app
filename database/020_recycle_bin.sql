-- Retain deleted items; no public direct access to the stored originals.
create table if not exists crm_private.trash (
 id uuid primary key default gen_random_uuid(), org_id uuid not null, object_id uuid not null,
 kind text not null check(kind in ('record','return','sample','sample_round','product_archive')),
 payload jsonb not null, label text not null, deleted_by uuid, deleted_at timestamptz not null default now(),
 restored_by uuid, restored_at timestamptz
);
alter table crm_private.trash enable row level security;
revoke all on crm_private.trash from public,anon,authenticated;
create index if not exists crm_trash_org_open on crm_private.trash(org_id,deleted_at desc) where restored_at is null;

create or replace function public.crm_capture_deleted_item() returns trigger language plpgsql security definer set search_path='' as $$
declare saved_kind text; saved_label text;
begin
 if tg_table_name='crm_records' then
  if old.kind='stock_movements' then return old;end if;
  saved_kind='record';saved_label=coalesce(old.data->>'name','رکورد');
 elsif tg_table_name='crm_returns' then saved_kind='return';saved_label=coalesce(nullif(old.reference,''),'پرونده برگشتی');
 else saved_kind='sample';saved_label=coalesce(nullif(old.data#>>'{details,title,en}',''),nullif(old.data#>>'{details,title,fa}',''),'پرونده نمونه');end if;
 insert into crm_private.trash(org_id,object_id,kind,payload,label,deleted_by) values(old.org_id,old.id,saved_kind,to_jsonb(old),left(saved_label,160),auth.uid());
 return old;
end $$;
revoke all on function public.crm_capture_deleted_item() from public,anon,authenticated;
create trigger crm_trash_records after delete on public.crm_records for each row execute function public.crm_capture_deleted_item();
create trigger crm_trash_returns after delete on public.crm_returns for each row execute function public.crm_capture_deleted_item();
create trigger crm_trash_samples after delete on public.crm_samples for each row execute function public.crm_capture_deleted_item();

create or replace function public.crm_capture_archived_product() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if old.kind='products' and coalesce(old.data->>'archived','false')<>'true' and coalesce(new.data->>'archived','false')='true' then
  insert into crm_private.trash(org_id,object_id,kind,payload,label,deleted_by) values(old.org_id,old.id,'product_archive',to_jsonb(old)||jsonb_build_object('archive_version',new.version),left(old.data->>'name',160),auth.uid());
 end if;return new;
end $$;
revoke all on function public.crm_capture_archived_product() from public,anon,authenticated;
create trigger crm_trash_archived_products after update on public.crm_records for each row execute function public.crm_capture_archived_product();

create or replace function public.crm_capture_sample_rounds() returns trigger language plpgsql security definer set search_path='' as $$
declare round jsonb;
begin
 for round in select jsonb_build_object('round',old_round.value,'position',old_round.ordinality-1) from jsonb_array_elements(coalesce(old.data->'rounds','[]'::jsonb)) with ordinality old_round where not exists(select 1 from jsonb_array_elements(coalesce(new.data->'rounds','[]'::jsonb)) new_round where new_round->>'id'=old_round.value->>'id') loop
  insert into crm_private.trash(org_id,object_id,kind,payload,label,deleted_by) values(old.org_id,old.id,'sample_round',round,left(coalesce(nullif(round#>>'{round,customer_name}',''),'ارسال نمونه'),160),auth.uid());
 end loop;return new;
end $$;
revoke all on function public.crm_capture_sample_rounds() from public,anon,authenticated;
create trigger crm_trash_sample_rounds after update on public.crm_samples for each row execute function public.crm_capture_sample_rounds();

create or replace function public.crm_trash_list() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare target uuid;
begin
 select org_id into target from public.crm_members where user_id=auth.uid();
 if target is null or coalesce(public.crm_role(target),'')<>'admin' then raise insufficient_privilege;end if;
 return (select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'object_id',t.object_id,'kind',t.kind,'label',t.label,'deleted_by',t.deleted_by,'deleted_at',t.deleted_at) order by t.deleted_at desc),'[]'::jsonb) from crm_private.trash t where t.org_id=target and t.restored_at is null
 and (t.kind<>'record' or not exists(select 1 from public.crm_records r where r.id=t.object_id and r.org_id=target))
 and (t.kind<>'return' or not exists(select 1 from public.crm_returns r where r.id=t.object_id and r.org_id=target))
 and (t.kind<>'sample' or not exists(select 1 from public.crm_samples r where r.id=t.object_id and r.org_id=target))
 and (t.kind<>'product_archive' or exists(select 1 from public.crm_records r where r.id=t.object_id and r.org_id=target and coalesce(r.data->>'archived','false')='true' and r.version=(t.payload->>'archive_version')::integer))
 and (t.kind<>'sample_round' or not exists(select 1 from public.crm_samples r cross join lateral jsonb_array_elements(r.data->'rounds') round where r.id=t.object_id and r.org_id=target and round->>'id'=t.payload#>>'{round,id}')));
end $$;
revoke all on function public.crm_trash_list() from public,anon;
grant execute on function public.crm_trash_list() to authenticated;

create or replace function public.crm_trash_restore(trash_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare t crm_private.trash; target uuid; item public.crm_samples; new_id uuid; result jsonb;
begin
 select org_id into target from public.crm_members where user_id=auth.uid();
 if target is null or coalesce(public.crm_role(target),'')<>'admin' then raise insufficient_privilege;end if;
 select * into t from crm_private.trash where id=trash_id for update;
 if t.id is null or t.org_id<>target or t.restored_at is not null then raise insufficient_privilege;end if;
 if t.kind='record' then
  if exists(select 1 from public.crm_records where id=t.object_id) then raise exception 'trash_item_exists';end if;
  result=public.crm_import_with_samples(jsonb_build_object('format','peyvand-online','schemaVersion',1,'records',jsonb_build_array(t.payload),'returns','[]'::jsonb,'samples','[]'::jsonb));
  if (result->>'imported')::integer<>1 then raise exception 'trash_restore_failed';end if;
 elsif t.kind='product_archive' then
  update public.crm_records set data=jsonb_set(data,'{archived}','false'::jsonb) where id=t.object_id and org_id=target and kind='products' and coalesce(data->>'archived','false')='true' and version=(t.payload->>'archive_version')::integer;
  if not found then raise exception 'trash_item_exists';end if;
 elsif t.kind='return' then
  if exists(select 1 from public.crm_returns where id=t.object_id) then raise exception 'trash_item_exists';end if;
  result=public.crm_import_with_samples(jsonb_build_object('format','peyvand-online','schemaVersion',1,'records','[]'::jsonb,'returns',jsonb_build_array(t.payload),'samples','[]'::jsonb));
  if (result->>'returns_imported')::integer<>1 then raise exception 'trash_restore_failed';end if;
  update public.crm_returns set created_by=(t.payload->>'created_by')::uuid,resolved_by=nullif(t.payload->>'resolved_by','')::uuid,version=(t.payload->>'version')::integer where id=t.object_id and org_id=target;
 elsif t.kind='sample' then
  if exists(select 1 from public.crm_samples where id=t.object_id) then raise exception 'trash_item_exists';end if;
  new_id=public.crm_sample_save(null,0,t.payload->'data');
  update public.crm_samples set id=t.object_id,created_at=(t.payload->>'created_at')::timestamptz,updated_at=(t.payload->>'updated_at')::timestamptz,version=(t.payload->>'version')::integer where id=new_id and org_id=target;
 else
  select * into item from public.crm_samples where id=t.object_id and org_id=target for update;
  if item.id is null then raise exception 'trash_parent_missing';end if;
  if exists(select 1 from jsonb_array_elements(item.data->'rounds') x where x->>'id'=t.payload#>>'{round,id}') then raise exception 'trash_item_exists';end if;
  perform public.crm_sample_save(item.id,item.version,jsonb_set(item.data,'{rounds}',jsonb_insert(item.data->'rounds',array[(t.payload->>'position')::integer::text],t.payload->'round',false)));
 end if;
 update crm_private.trash set restored_at=now(),restored_by=auth.uid() where id=t.id;
end $$;
revoke all on function public.crm_trash_restore(uuid) from public,anon;
grant execute on function public.crm_trash_restore(uuid) to authenticated;

-- Include un-restored recycle-bin items in newly downloaded archives.
-- A consistent application-data snapshot, not a database/Auth credential backup.
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
  'membershipAudit',(select coalesce(jsonb_agg(to_jsonb(a) order by a.id),'[]'::jsonb) from crm_private.membership_audit a where a.org_id=target),
  'limitations',jsonb_build_array('auth_credentials_excluded','storage_objects_excluded','platform_configuration_excluded')
 ) into result;
 if octet_length(result::text)>18000000 then raise exception 'snapshot_too_large'; end if;
 return result;
end $$;
revoke all on function public.crm_workspace_snapshot() from public,anon;
grant execute on function public.crm_workspace_snapshot() to authenticated;
