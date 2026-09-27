alter table public.crm_returns add column material_condition text not null default 'unknown' check(material_condition in ('unknown','raw','thinned'));
alter table public.crm_returns add column batch_number text not null default '' check(length(batch_number)<=80);
alter table public.crm_returns add column thinner_batch text not null default '' check(length(thinner_batch)<=80);
alter table public.crm_returns add column workflow jsonb not null default '{"stage":"inspection","events":[]}'::jsonb check(jsonb_typeof(workflow)='object' and jsonb_typeof(workflow->'events')='array');
create index crm_returns_batch_lookup on public.crm_returns(org_id,product_id,batch_number);
create or replace function public.crm_return_register_v2(customer uuid,product uuid,qty numeric,day date,why text,ref text,material text,sor text,condition text,batch text,thinner text) returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
 if condition is null or condition not in ('raw','thinned') or batch is null or trim(batch)='' or length(batch)>80 or thinner is null or length(thinner)>80 or (condition='thinned' and trim(thinner)='') then raise exception 'invalid_batch_details';end if;
 result=public.crm_return_register(customer,product,qty,day,why,ref,material,sor);
 update public.crm_returns set material_condition=condition,batch_number=upper(trim(batch)),thinner_batch=case when condition='thinned' then upper(trim(thinner)) else '' end where id=result;
 return result;
end $$;
revoke all on function public.crm_return_register_v2(uuid,uuid,numeric,date,text,text,text,text,text,text,text) from public,anon;
grant execute on function public.crm_return_register_v2(uuid,uuid,numeric,date,text,text,text,text,text,text,text) to authenticated;
create or replace function public.crm_return_followup(return_id uuid,expected_version integer,step text,note text,day date,qty numeric default 0,ref text default '') returns void language plpgsql security definer set search_path='' as $$
declare r public.crm_returns;p public.crm_records;sent numeric;mid uuid;next_stage text;events jsonb;
begin
 select * into r from public.crm_returns where id=return_id for update;
 if r.id is null or auth.uid() is null or coalesce(public.crm_role(r.org_id),'') not in ('admin','sales') then raise insufficient_privilege;end if;
 if r.version<>expected_version then raise exception 'version_conflict';end if;
 if r.status<>'received' then raise exception 'receive_first';end if;
 if step is null or step not in ('inspection','rework','ready','resend','note') or note is null or trim(note)='' or length(note)>2000 or day is null or day<r.return_date or day>(now() at time zone 'Asia/Tehran')::date or ref is null or length(ref)>160 then raise exception 'invalid_followup';end if;
 events=coalesce(r.workflow->'events','[]');
 select coalesce(sum((e->>'quantity')::numeric),0) into sent from jsonb_array_elements(events) e where e->>'step'='resend';
 next_stage=coalesce(r.workflow->>'stage','inspection');
 if step<>'note' and sent>=r.quantity then raise exception 'already_resent';end if;
 if step='resend' then
  if next_stage<>'ready' or qty is null or qty<=0 or round(qty,2)<>qty or qty>r.quantity-sent or trim(ref)='' then raise exception 'invalid_resend';end if;
  if r.restocked then
   select * into p from public.crm_records where id=r.product_id and org_id=r.org_id for update;
   mid=public.crm_inventory(p.id,p.version,'out',qty,ref,'ارسال مجدد برگشتی '||r.id::text||': '||note);
  end if;
  next_stage=case when sent+qty=r.quantity then 'resent' else 'ready' end;
 elsif step<>'note' then next_stage=step;
 end if;
 events=events||jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'step',step,'note',trim(note),'date',day,'quantity',case when step='resend' then qty else 0 end,'reference',ref,'movement_id',mid,'actor',auth.uid(),'created_at',now()));
 update public.crm_returns set workflow=jsonb_build_object('stage',next_stage,'events',events),version=version+1 where id=r.id;
end $$;
revoke all on function public.crm_return_followup(uuid,integer,text,text,date,numeric,text) from public,anon;
grant execute on function public.crm_return_followup(uuid,integer,text,text,date,numeric,text) to authenticated;

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
  insert into public.crm_returns(id,org_id,customer_id,product_id,quantity,return_date,reason,reference,status,restocked,movement_id,created_by,created_at,resolved_by,resolved_at,version,material_type,sor_number,material_condition,batch_number,thinner_batch,workflow)
  values((r->>'id')::uuid,target,(r->>'customer_id')::uuid,(r->>'product_id')::uuid,(r->>'quantity')::numeric,(r->>'return_date')::date,r->>'reason',coalesce(r->>'reference',''),r->>'status',(r->>'restocked')::boolean,nullif(r->>'movement_id','')::uuid,auth.uid(),(r->>'created_at')::timestamptz,case when r->>'status'<>'pending' then auth.uid() end,nullif(r->>'resolved_at','')::timestamptz,1,coalesce(r->>'material_type','other'),coalesce(r->>'sor_number',''),coalesce(r->>'material_condition','unknown'),coalesce(r->>'batch_number',''),coalesce(r->>'thinner_batch',''),coalesce(r->'workflow','{"stage":"inspection","events":[]}'::jsonb));
  restored=restored+1;
 end loop;
 return result||jsonb_build_object('returns_imported',restored);
end $$;
revoke all on function public.crm_import_complete(jsonb) from public,anon;
grant execute on function public.crm_import_complete(jsonb) to authenticated;

create or replace function public.crm_return_condition_guard() returns trigger language plpgsql set search_path='' as $$
begin
 if new.restocked and new.material_condition='thinned' then raise exception 'thinned_requires_quarantine';end if;
 return new;
end $$;
revoke all on function public.crm_return_condition_guard() from public,anon,authenticated;
create trigger crm_return_condition_guard before insert or update on public.crm_returns for each row execute function public.crm_return_condition_guard();
