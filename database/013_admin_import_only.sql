-- Only active workspace admins may import; helper functions remain internal.
create or replace function public.crm_import_complete(payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare target uuid; result jsonb; r jsonb; restored integer:=0;
begin
 select org_id into target from public.crm_members where user_id=auth.uid();
 if target is null or coalesce(public.crm_role(target),'') <> 'admin' then raise insufficient_privilege;end if;
 if payload ? 'returns' and (jsonb_typeof(payload->'returns')<>'array' or jsonb_array_length(payload->'returns')>100000) then raise exception 'invalid_returns';end if;
 result=public.crm_import_backup(payload);
 for r in select value from jsonb_array_elements(coalesce(payload->'returns','[]'::jsonb)) loop
  if not exists(select 1 from public.crm_records where id=(r->>'customer_id')::uuid and org_id=target and kind='companies')
   or not exists(select 1 from public.crm_records where id=(r->>'product_id')::uuid and org_id=target and kind='products') then raise exception 'invalid_return_relation';end if;
  if nullif(r->>'movement_id','') is not null and not exists(select 1 from public.crm_records where id=(r->>'movement_id')::uuid and org_id=target and kind='stock_movements' and parent_id=(r->>'product_id')::uuid and (data->>'movement_quantity')::numeric=(r->>'quantity')::numeric) then raise exception 'invalid_return_movement';end if;
  if exists(select 1 from public.crm_returns where id=(r->>'id')::uuid and org_id<>target) then raise exception 'return_id_conflict';end if;
  if exists(select 1 from public.crm_returns where id=(r->>'id')::uuid) then continue;end if;
  insert into public.crm_returns(id,org_id,customer_id,product_id,quantity,return_date,reason,reference,status,restocked,movement_id,created_by,created_at,resolved_by,resolved_at,version,material_type,sor_number,material_condition,batch_number,thinner_batch,workflow)
  values((r->>'id')::uuid,target,(r->>'customer_id')::uuid,(r->>'product_id')::uuid,(r->>'quantity')::numeric,(r->>'return_date')::date,r->>'reason',coalesce(r->>'reference',''),r->>'status',(r->>'restocked')::boolean,nullif(r->>'movement_id','')::uuid,auth.uid(),(r->>'created_at')::timestamptz,case when r->>'status'<>'pending' then auth.uid() end,nullif(r->>'resolved_at','')::timestamptz,1,coalesce(r->>'material_type','other'),coalesce(r->>'sor_number',''),coalesce(r->>'material_condition','unknown'),coalesce(r->>'batch_number',''),coalesce(r->>'thinner_batch',''),coalesce(r->'workflow','{"stage":"inspection","events":[]}'::jsonb));
  restored=restored+1;
 end loop;
 return result||jsonb_build_object('returns_imported',restored);
end $$;
revoke execute on function public.crm_import_complete(jsonb) from public,anon,authenticated;

