-- Forecasts are CRM records: customer RLS, audit, recycle bin and snapshots remain shared.
alter table public.crm_records drop constraint crm_records_kind_check;
alter table public.crm_records add constraint crm_records_kind_check check(kind=any(array['companies','contacts','deals','tasks','activities','notes','products','proformas','automations','stock_movements','forecasts']));
create unique index crm_forecast_customer_product on public.crm_records(org_id,parent_id,(data->>'forecast_product_id')) where kind='forecasts';

create function public.crm_validate_forecast() returns trigger language plpgsql set search_path='' as $$
declare item jsonb; product uuid; has_value boolean:=false;
begin
 if new.kind<>'forecasts' then return new;end if;
 if new.parent_id is null or not exists(select 1 from public.crm_records where id=new.parent_id and org_id=new.org_id and kind='companies') then raise exception 'invalid_forecast_customer';end if;
 begin product=(new.data->>'forecast_product_id')::uuid;exception when invalid_text_representation then raise exception 'invalid_forecast_product';end;
 if product is null or not exists(select 1 from public.crm_records where id=product and org_id=new.org_id and kind='products') then raise exception 'invalid_forecast_product';end if;
 new.data=jsonb_set(new.data,'{forecast_product_id}',to_jsonb(product::text));
 if tg_op='UPDATE' and (new.parent_id is distinct from old.parent_id or new.data->>'forecast_product_id' is distinct from old.data->>'forecast_product_id') then raise exception 'immutable_forecast_pair';end if;
 if coalesce(jsonb_typeof(new.data->'forecast_months'),'')<>'array' then raise exception 'invalid_forecast_months';end if;
 if jsonb_array_length(new.data->'forecast_months') not between 1 and 240 then raise exception 'invalid_forecast_months';end if;
 for item in select value from jsonb_array_elements(new.data->'forecast_months') loop
  if jsonb_typeof(item)<>'object' then raise exception 'invalid_forecast_months';end if;
  if not (item ?& array['month','quantity','amount']) or (select count(*) from jsonb_object_keys(item))<>3 or jsonb_typeof(item->'month')<>'string' or item->>'month'!~'^(20[0-9]{2}|21[0-9]{2})-(0[1-9]|1[0-2])$' then raise exception 'invalid_forecast_months';end if;
  if jsonb_typeof(item->'quantity') not in ('number','null') or jsonb_typeof(item->'amount') not in ('number','null') then raise exception 'invalid_forecast_values';end if;
  if jsonb_typeof(item->'quantity')='number' then
   if (item->>'quantity')::numeric<0 or (item->>'quantity')::numeric>1e12 then raise exception 'invalid_forecast_values';end if;has_value=true;
  end if;
  if jsonb_typeof(item->'amount')='number' then
   if (item->>'amount')::numeric<0 or (item->>'amount')::numeric>1e15 then raise exception 'invalid_forecast_values';end if;has_value=true;
  end if;
 end loop;
 if not has_value or exists(select 1 from jsonb_array_elements(new.data->'forecast_months') m group by m->>'month' having count(*)>1) then raise exception 'invalid_forecast_months';end if;
 return new;
end $$;
revoke all on function public.crm_validate_forecast() from public,anon,authenticated;
create trigger crm_forecast_validate before insert or update on public.crm_records for each row execute function public.crm_validate_forecast();

-- A referenced product must remain available for the forecast's history.
create or replace function public.crm_preserve_history() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.crm_records where parent_id=old.id) or (old.kind='products' and exists(select 1 from public.crm_records where org_id=old.org_id and kind='forecasts' and data->>'forecast_product_id'=old.id::text)) then raise exception 'record_has_history';end if;
 return old;
end $$;
revoke all on function public.crm_preserve_history() from public,anon,authenticated;

-- Import the referenced product before forecasts, regardless of archive row order.
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
     and (i.kind<>'forecasts' or exists(select 1 from public.crm_records fp where fp.id=nullif(i.data->>'forecast_product_id','')::uuid and fp.org_id=target_org and fp.kind='products'))
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
