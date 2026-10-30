-- Private per-transaction import context cannot be set by workspace users.
create table if not exists crm_private.import_context (backend_pid integer not null, transaction_id bigint not null, products_with_history jsonb not null, primary key(backend_pid,transaction_id));
alter table crm_private.import_context enable row level security;
revoke all on crm_private.import_context from public,anon,authenticated;

create or replace function public.crm_validate_record()
returns trigger
language plpgsql
set search_path=''
as $$
declare parent_kind text; is_import boolean := false;
begin
 if current_user='postgres' then select exists(select 1 from crm_private.import_context where backend_pid=pg_backend_pid() and transaction_id=txid_current()) into is_import; end if;
 if TG_OP='UPDATE' then
  if NEW.org_id is distinct from OLD.org_id or NEW.kind is distinct from OLD.kind or NEW.id is distinct from OLD.id then raise exception 'immutable_identity'; end if;
  if NEW.kind='stock_movements' then raise exception 'immutable_stock_document'; end if;
  if NEW.kind='products' and NEW.data->'stock' is distinct from OLD.data->'stock' and current_user<>'postgres' then raise exception 'use_inventory_action'; end if;
  NEW.version=OLD.version+1; NEW.created_at=OLD.created_at;
 else
  if NEW.kind='stock_movements' and current_user<>'postgres' then raise exception 'use_inventory_action'; end if;
  if not is_import then NEW.version=1; NEW.created_at=now(); end if;
 end if;
 if not is_import then NEW.updated_at=now(); end if;

 if NEW.kind in ('companies','products','automations') and NEW.parent_id is not null then raise exception 'invalid_parent'; end if;
 if NEW.parent_id is not null then
  select kind into parent_kind from public.crm_records where id=NEW.parent_id and org_id=NEW.org_id;
  if parent_kind is null or parent_kind='notes' then raise exception 'invalid_parent'; end if;
  if NEW.kind='stock_movements' and parent_kind<>'products' then raise exception 'invalid_parent'; end if;
  if NEW.kind='activities' and parent_kind not in ('companies','contacts','deals') then raise exception 'invalid_parent'; end if;
  if NEW.kind not in ('notes','stock_movements','activities') and parent_kind<>'companies' then raise exception 'invalid_parent'; end if;
 end if;

 if NEW.kind='proformas' and NEW.parent_id is null then raise exception 'customer_required'; end if;
 if NEW.kind in ('tasks','activities') and coalesce(NEW.data->>'status','') not in ('open','done') then raise exception 'invalid_status'; end if;
 if NEW.kind in ('companies','contacts') and coalesce(NEW.data->>'status','') not in ('active','lead','inactive') then raise exception 'invalid_status'; end if;
 if NEW.kind in ('products','automations') and coalesce(NEW.data->>'status','') not in ('active','inactive') then raise exception 'invalid_status'; end if;
 if NEW.kind='products' and (coalesce((NEW.data->>'stock')::numeric,-1)<0 or (NEW.data->>'stock')::numeric>1e12) then raise exception 'invalid_stock'; end if;
 if nullif(NEW.data->>'assignee','') is not null and not exists(select 1 from public.crm_members where org_id=NEW.org_id and user_id=(NEW.data->>'assignee')::uuid) then raise exception 'invalid_assignee'; end if;
 return NEW;
end $$;

create or replace function public.crm_opening_stock() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if NEW.kind='products' and (NEW.data->>'stock')::numeric>0 and not exists(select 1 from crm_private.import_context c where c.backend_pid=pg_backend_pid() and c.transaction_id=txid_current() and c.products_with_history ? NEW.id::text) then
  insert into public.crm_records(org_id,kind,parent_id,data) values(NEW.org_id,'stock_movements',NEW.id,jsonb_build_object('name',NEW.data->>'name','unit',NEW.data->>'unit','movement_type','opening','movement_quantity',(NEW.data->>'stock')::numeric,'stock_after',(NEW.data->>'stock')::numeric,'description','موجودی ابتدای دوره'));
 end if;
 return NEW;
end $$;

create or replace function public.crm_import_backup(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
 target_org uuid;
 imported integer := 0;
 inserted_now integer := 0;
begin
 if auth.uid() is null then raise exception 'unauthenticated'; end if;
 select m.org_id into target_org
 from public.crm_members m
 where m.user_id=(select auth.uid()) and m.role in ('admin','sales')
 limit 1;
 if target_org is null then raise exception 'forbidden'; end if;
 if jsonb_typeof(payload)<>'object'
    or payload->>'format' not in ('peyvand-desktop','peyvand-online')
    or payload->>'schemaVersion' <> '1'
    or jsonb_typeof(payload->'records')<>'array' then
   raise exception 'invalid_import_format';
 end if;
 if jsonb_array_length(payload->'records')>100000 then raise exception 'import_too_large'; end if;

 insert into crm_private.import_context(backend_pid,transaction_id,products_with_history)
 select pg_backend_pid(),txid_current(),coalesce(jsonb_agg(to_jsonb(r->>'parent_id')),'[]'::jsonb)
 from jsonb_array_elements(payload->'records') r where r->>'kind'='stock_movements' and nullif(r->>'parent_id','') is not null;

 create temporary table crm_import_rows(
   id uuid primary key,
   kind text not null,
   parent_id uuid,
   data jsonb not null,
   created_at timestamptz,
   updated_at timestamptz,
   version integer not null default 1,
   inserted boolean not null default false
 ) on commit drop;

 insert into pg_temp.crm_import_rows(id,kind,parent_id,data,created_at,updated_at,version)
 select (r->>'id')::uuid,
        r->>'kind',
        nullif(r->>'parent_id','')::uuid,
        case
          when nullif(r->'data'->>'assignee','') is not null
            and not exists (
              select 1 from public.crm_members m
              where m.org_id=target_org and m.user_id=(r->'data'->>'assignee')::uuid
            )
          then jsonb_set(r->'data','{assignee}','""'::jsonb)
          else r->'data'
        end,
        nullif(r->>'created_at','')::timestamptz,
        nullif(r->>'updated_at','')::timestamptz,
        greatest(coalesce(nullif(r->>'version','')::integer,1),1)
 from jsonb_array_elements(payload->'records') r;

 if exists(select 1 from pg_temp.crm_import_rows group by id having count(*)>1)
   then raise exception 'duplicate_import_ids'; end if;
 -- Existing rows in this workspace are kept as-is and treated as already available
 -- parents. A UUID collision with another workspace is still rejected.
 if exists(
   select 1 from public.crm_records e
   join pg_temp.crm_import_rows i on i.id=e.id
   where e.org_id<>target_org
 ) then raise exception 'import_id_conflict'; end if;
 update pg_temp.crm_import_rows i set inserted=true
 where exists(
   select 1 from public.crm_records e
   where e.id=i.id and e.org_id=target_org
 );
 if exists(select 1 from pg_temp.crm_import_rows where id=parent_id)
   then raise exception 'invalid_parent'; end if;

 -- Insert parents before children so the composite foreign key remains valid.
 loop
   insert into public.crm_records(id,org_id,kind,parent_id,data,created_at,updated_at,version)
   select i.id,target_org,i.kind,i.parent_id,i.data,
          coalesce(i.created_at,now()),coalesce(i.updated_at,now()),i.version
   from pg_temp.crm_import_rows i
   where not i.inserted
     and (i.parent_id is null or exists(
       select 1 from public.crm_records p
       where p.id=i.parent_id and p.org_id=target_org
     ) or exists(
       select 1 from pg_temp.crm_import_rows p
       where p.id=i.parent_id and p.inserted
     ));
   get diagnostics inserted_now = row_count;
   if inserted_now > 0 then
     update pg_temp.crm_import_rows i set inserted=true
     where not i.inserted and exists(
       select 1 from public.crm_records r
       where r.id=i.id and r.org_id=target_org
     );
     imported := imported + inserted_now;
   end if;
   exit when not exists(select 1 from pg_temp.crm_import_rows where not inserted)
          or inserted_now=0;
 end loop;

 if exists(select 1 from pg_temp.crm_import_rows where not inserted)
   then raise exception 'invalid_parent'; end if;
 delete from crm_private.import_context where backend_pid=pg_backend_pid() and transaction_id=txid_current();
 return jsonb_build_object('imported',imported);
end $$;


revoke all on function public.crm_import_backup(jsonb) from public,anon,authenticated;
