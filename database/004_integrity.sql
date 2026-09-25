-- Preserve business history; complete append-only backups with return documents.
create or replace function public.crm_preserve_history() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.crm_records where parent_id=old.id) then raise exception 'record_has_history';end if;
 return old;
end $$;
create trigger crm_aaa_preserve_history before delete on public.crm_records for each row execute function public.crm_preserve_history();
revoke all on function public.crm_preserve_history() from public,anon,authenticated;
create or replace function public.crm_import_complete(payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare target uuid; result jsonb; r jsonb; restored integer:=0;
begin
 select org_id into target from public.crm_members where user_id=auth.uid();
 if target is null or coalesce(public.crm_role(target),'') not in ('admin','sales') then raise insufficient_privilege;end if;
 if payload ? 'returns' and (jsonb_typeof(payload->'returns')<>'array' or jsonb_array_length(payload->'returns')>100000) then raise exception 'invalid_returns';end if;
 result=public.crm_import_backup(payload);
 for r in select value from jsonb_array_elements(coalesce(payload->'returns','[]'::jsonb)) loop
  if not exists(select 1 from public.crm_records where id=(r->>'customer_id')::uuid and org_id=target and kind='companies')
   or not exists(select 1 from public.crm_records where id=(r->>'product_id')::uuid and org_id=target and kind='products') then raise exception 'invalid_return_relation';end if;
  if nullif(r->>'movement_id','') is not null and not exists(select 1 from public.crm_records where id=(r->>'movement_id')::uuid and org_id=target and kind='stock_movements' and parent_id=(r->>'product_id')::uuid and (data->>'movement_quantity')::numeric=(r->>'quantity')::numeric) then raise exception 'invalid_return_movement';end if;
  if exists(select 1 from public.crm_returns where id=(r->>'id')::uuid and org_id<>target) then raise exception 'return_id_conflict';end if;
  if exists(select 1 from public.crm_returns where id=(r->>'id')::uuid) then continue;end if;
  insert into public.crm_returns(id,org_id,customer_id,product_id,quantity,return_date,reason,reference,status,restocked,movement_id,created_by,created_at,resolved_by,resolved_at,version,material_type,sor_number)
  values((r->>'id')::uuid,target,(r->>'customer_id')::uuid,(r->>'product_id')::uuid,(r->>'quantity')::numeric,(r->>'return_date')::date,r->>'reason',coalesce(r->>'reference',''),r->>'status',(r->>'restocked')::boolean,nullif(r->>'movement_id','')::uuid,auth.uid(),(r->>'created_at')::timestamptz,case when r->>'status'<>'pending' then auth.uid() end,nullif(r->>'resolved_at','')::timestamptz,1,coalesce(r->>'material_type','other'),coalesce(r->>'sor_number',''));
  restored=restored+1;
 end loop;
 return result||jsonb_build_object('returns_imported',restored);
end $$;
revoke all on function public.crm_import_complete(jsonb) from public,anon;
grant execute on function public.crm_import_complete(jsonb) to authenticated;
create or replace function public.crm_deal_result_date() returns trigger language plpgsql set search_path='' as $$
begin
 if new.kind='deals' then
  if new.data->>'stage' in ('won','lost') then
   if (tg_op='INSERT' or old.data->>'stage' is distinct from new.data->>'stage') and coalesce(new.data->>'closed_on','')='' then
    new.data=jsonb_set(new.data,'{closed_on}',to_jsonb((now() at time zone 'Asia/Tehran')::date::text));
   end if;
  else new.data=jsonb_set(new.data,'{closed_on}','""'::jsonb);end if;
 end if;
 return new;
end $$;
create trigger crm_result_date before insert or update on public.crm_records for each row execute function public.crm_deal_result_date();
revoke all on function public.crm_deal_result_date() from public,anon,authenticated;
create or replace function public.crm_apply_automation(record_kind text,record_data jsonb,record_parent uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare target uuid; r public.crm_records; k text;
begin
 select org_id into target from public.crm_members where user_id=auth.uid();
 if target is null or coalesce(public.crm_role(target),'') not in ('admin','sales') then raise insufficient_privilege;end if;
 k=record_data->>'automation_key';
 if record_kind not in ('notes','activities') or k is null or length(k) not between 1 and 200 then raise exception 'invalid_automation';end if;
 perform pg_advisory_xact_lock(hashtextextended(target::text||k,0));
 select * into r from public.crm_records where org_id=target and data->>'automation_key'=k limit 1;
 if r.id is not null then return null;end if;
 insert into public.crm_records(org_id,kind,parent_id,data) values(target,record_kind,record_parent,record_data) returning * into r;
 return to_jsonb(r);
end $$;
revoke all on function public.crm_apply_automation(text,jsonb,uuid) from public,anon;
grant execute on function public.crm_apply_automation(text,jsonb,uuid) to authenticated;
