-- Bring the online database in line with Peyvand CRM 0.5.4.
begin;

alter table public.crm_records drop constraint if exists crm_records_kind_check;
alter table public.crm_records add constraint crm_records_kind_check
check (kind = any (array['companies','contacts','deals','tasks','activities','notes','products','proformas','automations','stock_movements']));

create or replace function public.crm_validate_record()
returns trigger
language plpgsql
set search_path=''
as $$
declare parent_kind text;
begin
 if TG_OP='UPDATE' then
  if NEW.org_id is distinct from OLD.org_id or NEW.kind is distinct from OLD.kind or NEW.id is distinct from OLD.id then raise exception 'immutable_identity'; end if;
  if NEW.kind='stock_movements' then raise exception 'immutable_stock_document'; end if;
  if NEW.kind='products' and NEW.data->'stock' is distinct from OLD.data->'stock' and current_user<>'postgres' then raise exception 'use_inventory_action'; end if;
  NEW.version=OLD.version+1; NEW.created_at=OLD.created_at;
 else
  if NEW.kind='stock_movements' and current_user<>'postgres' then raise exception 'use_inventory_action'; end if;
  NEW.version=1; NEW.created_at=now();
 end if;
 NEW.updated_at=now();

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

create or replace function public.crm_inventory(product_id uuid, expected_version integer, movement_type text, quantity numeric, reference text default '', description text default '')
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare p public.crm_records; after_stock numeric; delta numeric; movement_id uuid;
begin
 if auth.uid() is null then raise exception 'unauthenticated'; end if;
 select * into p from public.crm_records where id=product_id and kind='products' for update;
 if p.id is null or coalesce(public.crm_role(p.org_id),'') not in ('admin','sales') then raise exception 'forbidden'; end if;
 if p.version<>expected_version then raise exception 'version_conflict'; end if;
 if movement_type not in ('in','out','adjustment') or quantity is null or quantity<0 or quantity>1e12 or round(quantity,2)<>quantity or (movement_type<>'adjustment' and quantity=0) then raise exception 'invalid_quantity'; end if;
 after_stock=case movement_type when 'adjustment' then quantity when 'in' then (p.data->>'stock')::numeric+quantity else (p.data->>'stock')::numeric-quantity end;
 if p.data->>'status'<>'active' and not (movement_type='adjustment' and after_stock=0) then raise exception 'inactive_product'; end if;
 if length(reference)>160 or length(description)>10000 or (movement_type='adjustment' and trim(description)='') then raise exception 'invalid_description'; end if;
 delta=after_stock-(p.data->>'stock')::numeric;
 if after_stock<0 or after_stock>1e12 or delta=0 then raise exception 'invalid_stock'; end if;
 update public.crm_records set data=jsonb_set(data,'{stock}',to_jsonb(after_stock)) where id=p.id;
 insert into public.crm_records(org_id,kind,parent_id,data)
 values(p.org_id,'stock_movements',p.id,jsonb_build_object('name',p.data->>'name','unit',p.data->>'unit','movement_type',movement_type,'movement_quantity',delta,'stock_after',after_stock,'movement_reference',reference,'description',description))
 returning id into movement_id;
 return movement_id;
end $$;

create or replace function public.crm_protect_stock_delete()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
 if OLD.kind='stock_movements' then
  if pg_trigger_depth()>1 then return OLD; end if;
  raise exception 'stock_history_protected';
 end if;
 if OLD.kind='products' then
  if coalesce((OLD.data->>'stock')::numeric,0)<>0 then raise exception 'product_stock_not_zero'; end if;
  if coalesce(OLD.data->>'status','')<>'inactive' then raise exception 'product_not_inactive'; end if;
  delete from public.crm_records where parent_id=OLD.id and kind='stock_movements';
 end if;
 return OLD;
end $$;

-- The trigger above owns stock-document cleanup. Direct user deletion stays forbidden.
drop policy if exists records_delete on public.crm_records;
create policy records_delete on public.crm_records for delete to authenticated
using(public.crm_role(org_id) in ('admin','sales') and kind<>'stock_movements');

revoke all on function public.crm_inventory(uuid,integer,text,numeric,text,text) from public,anon;
grant execute on function public.crm_inventory(uuid,integer,text,numeric,text,text) to authenticated;

commit;
