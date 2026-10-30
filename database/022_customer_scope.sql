-- PROTOTYPE ONLY: do not deploy before all access paths and UI are verified.
alter table public.crm_members add column if not exists customer_scope text not null default 'all' check(customer_scope in ('all','assigned'));
alter table public.crm_samples add column if not exists created_by uuid default auth.uid();
alter table crm_private.membership_audit add column if not exists old_customer_scope text;
alter table crm_private.membership_audit add column if not exists new_customer_scope text;

create or replace function public.crm_scope_restricted(target_org uuid) returns boolean language sql stable security definer set search_path='' as $$
 select coalesce((select m.role<>'admin' and m.customer_scope='assigned' from public.crm_members m where m.org_id=target_org and m.user_id=auth.uid() and m.active and public.crm_role(target_org) is not null),true)
$$;
revoke all on function public.crm_scope_restricted(uuid) from public,anon;
grant execute on function public.crm_scope_restricted(uuid) to authenticated;

create or replace function public.crm_record_in_scope(target_org uuid, record_kind text, record_parent uuid, record_data jsonb) returns boolean language plpgsql stable security definer set search_path='' as $$
declare parent_row public.crm_records; depth integer:=0;
begin
 if public.crm_role(target_org) is null then return false;end if;
 if not public.crm_scope_restricted(target_org) then return true;end if;
 if record_kind in ('products','automations') then return true;end if;
 if record_kind='stock_movements' then return false;end if;
 while record_parent is not null loop
  depth=depth+1;if depth>20 then return false;end if;
  select * into parent_row from public.crm_records where org_id=target_org and id=record_parent;
  if parent_row.id is null then return false;end if;
  if parent_row.kind in ('products','stock_movements','automations') then return false;end if;
  record_kind=parent_row.kind;record_data=parent_row.data;record_parent=parent_row.parent_id;
 end loop;
 return coalesce(record_data->>'assignee','')=auth.uid()::text;
end $$;
revoke all on function public.crm_record_in_scope(uuid,text,uuid,jsonb) from public,anon;
grant execute on function public.crm_record_in_scope(uuid,text,uuid,jsonb) to authenticated;
create or replace function public.crm_customer_in_scope(target_org uuid, customer uuid) returns boolean language sql stable security definer set search_path='' as $$
 select coalesce((select public.crm_record_in_scope(r.org_id,r.kind,r.parent_id,r.data) from public.crm_records r where r.org_id=target_org and r.id=customer and r.kind='companies'),false)
$$;
revoke all on function public.crm_customer_in_scope(uuid,uuid) from public,anon;
grant execute on function public.crm_customer_in_scope(uuid,uuid) to authenticated;
create or replace function public.crm_sample_in_scope(target_org uuid, payload jsonb, creator uuid) returns boolean language plpgsql stable security definer set search_path='' as $$
begin
 if public.crm_role(target_org) is null then return false;end if;
 if not public.crm_scope_restricted(target_org) then return true;end if;
 if nullif(payload->>'customer_id','') is not null then return public.crm_customer_in_scope(target_org,(payload->>'customer_id')::uuid);end if;
 return coalesce(creator=auth.uid(),false);
end $$;
revoke all on function public.crm_sample_in_scope(uuid,jsonb,uuid) from public,anon;
grant execute on function public.crm_sample_in_scope(uuid,jsonb,uuid) to authenticated;

create or replace function public.crm_set_customer_scope(target_user uuid, new_scope text) returns void language plpgsql security definer set search_path='' as $$
declare target_org uuid; member public.crm_members;
begin
 if auth.uid() is null or target_user is null or new_scope is null or new_scope not in ('all','assigned') then raise insufficient_privilege;end if;
 select org_id into target_org from public.crm_members where user_id=auth.uid();
 if target_org is null then raise insufficient_privilege;end if;
 perform 1 from public.crm_orgs where id=target_org for update;
 if coalesce(public.crm_role(target_org),'')<>'admin' or target_user=auth.uid() then raise insufficient_privilege;end if;
 select * into member from public.crm_members where org_id=target_org and user_id=target_user for update;
 if member.user_id is null or member.role='admin' then raise insufficient_privilege;end if;
 if member.customer_scope=new_scope then return;end if;
 update public.crm_members set customer_scope=new_scope where org_id=target_org and user_id=target_user;
 insert into crm_private.membership_audit(org_id,actor_id,target_id,old_role,new_role,old_active,new_active,old_can_delete,new_can_delete,old_customer_scope,new_customer_scope) values(target_org,auth.uid(),target_user,member.role,member.role,member.active,member.active,member.can_delete,member.can_delete,member.customer_scope,new_scope);
end $$;
revoke all on function public.crm_set_customer_scope(uuid,text) from public,anon;
grant execute on function public.crm_set_customer_scope(uuid,text) to authenticated;

-- Scope applies at the database boundary, including direct client requests.
drop policy records_read on public.crm_records;
create policy records_read on public.crm_records for select to authenticated using(public.crm_record_in_scope(org_id,kind,parent_id,data));
drop policy records_insert on public.crm_records;
create policy records_insert on public.crm_records for insert to authenticated with check(public.crm_role(org_id) in ('admin','sales') and public.crm_record_in_scope(org_id,kind,parent_id,data));
drop policy records_update on public.crm_records;
create policy records_update on public.crm_records for update to authenticated using(public.crm_role(org_id) in ('admin','sales') and public.crm_record_in_scope(org_id,kind,parent_id,data)) with check(public.crm_role(org_id) in ('admin','sales') and public.crm_record_in_scope(org_id,kind,parent_id,data));
drop policy records_delete on public.crm_records;
create policy records_delete on public.crm_records for delete to authenticated using(public.crm_can_delete(org_id) and kind<>'stock_movements' and public.crm_record_in_scope(org_id,kind,parent_id,data));
drop policy returns_read on public.crm_returns;
create policy returns_read on public.crm_returns for select to authenticated using(public.crm_role(org_id) is not null and public.crm_customer_in_scope(org_id,customer_id));
drop policy samples_read on public.crm_samples;
create policy samples_read on public.crm_samples for select to authenticated using(public.crm_sample_in_scope(org_id,data,created_by));
drop policy audit_read on public.crm_audit;
create policy audit_read on public.crm_audit for select to authenticated using(public.crm_role(org_id) is not null and not public.crm_scope_restricted(org_id));

create or replace function public.crm_guard_record_scope() returns trigger language plpgsql set search_path='' as $$
begin
 if auth.uid() is null then if tg_op='DELETE' then return old;else return new;end if;end if;
 if tg_op<>'INSERT' and not public.crm_record_in_scope(old.org_id,old.kind,old.parent_id,old.data) then raise insufficient_privilege;end if;
 if tg_op<>'DELETE' and not (new.kind='stock_movements' and current_user='postgres') and not public.crm_record_in_scope(new.org_id,new.kind,new.parent_id,new.data) then raise insufficient_privilege;end if;
 if tg_op='DELETE' then return old;else return new;end if;
end $$;
revoke all on function public.crm_guard_record_scope() from public,anon,authenticated;
create trigger crm_guard_record_scope before insert or update or delete on public.crm_records for each row execute function public.crm_guard_record_scope();
create or replace function public.crm_guard_return_scope() returns trigger language plpgsql set search_path='' as $$
begin
 if auth.uid() is null then if tg_op='DELETE' then return old;else return new;end if;end if;
 if tg_op<>'INSERT' and not public.crm_customer_in_scope(old.org_id,old.customer_id) then raise insufficient_privilege;end if;
 if tg_op<>'DELETE' and not public.crm_customer_in_scope(new.org_id,new.customer_id) then raise insufficient_privilege;end if;
 if tg_op='DELETE' then return old;else return new;end if;
end $$;
revoke all on function public.crm_guard_return_scope() from public,anon,authenticated;
create trigger crm_guard_return_scope before insert or update or delete on public.crm_returns for each row execute function public.crm_guard_return_scope();
create or replace function public.crm_guard_sample_scope() returns trigger language plpgsql set search_path='' as $$
begin
 if auth.uid() is null then if tg_op='DELETE' then return old;else return new;end if;end if;
 if tg_op<>'INSERT' and not public.crm_sample_in_scope(old.org_id,old.data,old.created_by) then raise insufficient_privilege;end if;
 if tg_op<>'DELETE' and not public.crm_sample_in_scope(new.org_id,new.data,new.created_by) then raise insufficient_privilege;end if;
 if tg_op='DELETE' then return old;else return new;end if;
end $$;
revoke all on function public.crm_guard_sample_scope() from public,anon,authenticated;
create trigger crm_guard_sample_scope before insert or update or delete on public.crm_samples for each row execute function public.crm_guard_sample_scope();

create or replace function public.crm_return_create(customer uuid,product uuid,qty numeric,day date,why text,ref text default '') returns uuid language plpgsql security definer set search_path='' as $$
declare c public.crm_records;p public.crm_records;result uuid;
begin
 select * into c from public.crm_records where id=customer and kind='companies';
 if c.id is null or (coalesce(public.crm_role(c.org_id),'') not in ('admin','sales') or not public.crm_customer_in_scope(c.org_id,c.id)) then raise insufficient_privilege;end if;
 select * into p from public.crm_records where id=product and kind='products' and org_id=c.org_id;
 if p.id is null then raise exception 'invalid_product';end if;
 insert into public.crm_returns(org_id,customer_id,product_id,quantity,return_date,reason,reference,created_by) values(c.org_id,c.id,p.id,qty,day,trim(why),ref,auth.uid()) returning id into result;
 return result;
end $$;

create or replace function public.crm_return_resolve(return_id uuid,expected_version integer,decision text,restock boolean default false) returns void language plpgsql security definer set search_path='' as $$
declare r public.crm_returns;p public.crm_records;mid uuid;
begin
 select * into r from public.crm_returns where id=return_id for update;
 if r.id is null or (coalesce(public.crm_role(r.org_id),'') not in ('admin','sales') or not public.crm_customer_in_scope(r.org_id,r.customer_id)) then raise insufficient_privilege;end if;
 if r.status<>'pending' or r.version<>expected_version then raise exception 'version_conflict';end if;
 if decision is null or decision not in ('received','rejected') or restock is null or (restock and decision<>'received') then raise exception 'invalid_decision';end if;
 if restock then
  select * into p from public.crm_records where id=r.product_id and org_id=r.org_id and kind='products' for update;
  mid=public.crm_inventory(p.id,p.version,'in',r.quantity,'RETURN-'||r.id::text,'دریافت مواد برگشتی: '||r.reason);
 end if;
 update public.crm_returns set status=decision,restocked=restock,movement_id=mid,resolved_by=auth.uid(),resolved_at=now(),version=version+1 where id=r.id;
end $$;

create or replace function public.crm_return_followup(return_id uuid,expected_version integer,step text,note text,day date,qty numeric default 0,ref text default '') returns void language plpgsql security definer set search_path='' as $$
declare r public.crm_returns;p public.crm_records;sent numeric;mid uuid;next_stage text;events jsonb;
begin
 select * into r from public.crm_returns where id=return_id for update;
 if r.id is null or auth.uid() is null or (coalesce(public.crm_role(r.org_id),'') not in ('admin','sales') or not public.crm_customer_in_scope(r.org_id,r.customer_id)) then raise insufficient_privilege;end if;
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

create or replace function public.crm_return_delete(return_id uuid,expected_version integer) returns void
language plpgsql security definer set search_path='' as $$
declare r public.crm_returns;
begin
 select * into r from public.crm_returns where id=return_id for update;
 if r.id is null or auth.uid() is null or (not public.crm_can_delete(r.org_id) or not public.crm_customer_in_scope(r.org_id,r.customer_id)) then raise insufficient_privilege;end if;
 if expected_version is null or r.version<>expected_version then raise exception 'version_conflict';end if;
 delete from public.crm_returns where id=r.id and org_id=r.org_id;
end $$;

create or replace function public.crm_sample_delete(sample_id uuid,expected_version integer) returns void language plpgsql security definer set search_path='' as $$
declare r public.crm_samples;
begin
 select * into r from public.crm_samples where id=sample_id for update;
 if r.id is null or auth.uid() is null or (not public.crm_can_delete(r.org_id) or not public.crm_sample_in_scope(r.org_id,r.data,r.created_by)) then raise insufficient_privilege;end if;
 if expected_version is null or expected_version<>r.version then raise exception 'version_conflict';end if;
 delete from public.crm_samples where id=r.id and org_id=r.org_id;
end $$;

create or replace function public.crm_sample_delete_dispatches(selections jsonb) returns void language plpgsql security definer set search_path='' as $$
declare target uuid; selection jsonb; existing public.crm_samples; remaining jsonb;
begin
 select org_id into target from public.crm_members where user_id=auth.uid();
 if target is null or not public.crm_can_delete(target) then raise insufficient_privilege;end if;
 if jsonb_typeof(selections) is distinct from 'array' or jsonb_array_length(selections) not between 1 and 10000 then raise exception 'invalid_selection';end if;
 if (select count(*) from jsonb_array_elements(selections))<>(select count(distinct v->>'id') from jsonb_array_elements(selections) v) then raise exception 'duplicate_selection';end if;
 for selection in select value from jsonb_array_elements(selections) order by value->>'id' loop
  select * into existing from public.crm_samples where id=(selection->>'id')::uuid for update;
  if existing.id is null or existing.org_id<>target or not public.crm_sample_in_scope(existing.org_id,existing.data,existing.created_by) then raise insufficient_privilege;end if;
  if (selection->>'version')::int is distinct from existing.version then raise exception 'version_conflict';end if;
  if coalesce((selection->>'all')::boolean,false) then
   delete from public.crm_samples where id=existing.id;
  else
   if jsonb_typeof(selection->'round_ids') is distinct from 'array' or jsonb_array_length(selection->'round_ids')=0 then raise exception 'invalid_selection';end if;
   if exists(select 1 from jsonb_array_elements_text(selection->'round_ids') wanted where not exists(select 1 from jsonb_array_elements(existing.data->'rounds') r where r->>'id'=wanted)) then raise exception 'invalid_selection';end if;
   select coalesce(jsonb_agg(r order by ord),'[]') into remaining from jsonb_array_elements(existing.data->'rounds') with ordinality t(r,ord) where not (selection->'round_ids') ? (r->>'id');
   if jsonb_array_length(remaining)=0 then delete from public.crm_samples where id=existing.id;
   else update public.crm_samples set data=jsonb_set(data,'{rounds}',remaining),version=version+1,updated_at=now() where id=existing.id;end if;
  end if;
 end loop;
end $$;

create or replace function public.crm_sample_save(sample_id uuid,expected_version integer,payload jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare target uuid;r public.crm_samples;round jsonb;item jsonb;oldround jsonb;result uuid;
begin
 select org_id into target from public.crm_members where user_id=auth.uid();
 if target is null or coalesce(public.crm_role(target),'') not in ('admin','sales') then raise insufficient_privilege;end if;
 if sample_id is null then
  if not public.crm_sample_in_scope(target,payload,auth.uid()) then raise insufficient_privilege;end if;
 else
  select * into r from public.crm_samples where id=sample_id for update;
  if r.id is null or r.org_id<>target or not public.crm_sample_in_scope(target,r.data,r.created_by) or not public.crm_sample_in_scope(target,payload,r.created_by) then raise insufficient_privilege;end if;
 end if;
 if jsonb_typeof(payload)<>'object' or octet_length(payload::text)>2000000 or jsonb_typeof(payload->'rounds') is distinct from 'array' or jsonb_array_length(payload->'rounds')>200 then raise exception 'invalid_sample';end if;
 if jsonb_typeof(payload->'details') is distinct from 'object' then raise exception 'invalid_sample';end if;
 if (select count(*) from jsonb_array_elements(payload->'rounds'))<>(select count(distinct x->>'id') from jsonb_array_elements(payload->'rounds') x) then raise exception 'duplicate_trial';end if;
 if nullif(payload->>'customer_id','') is not null and not exists(select 1 from public.crm_records where id=(payload->>'customer_id')::uuid and org_id=target and kind='companies') then raise exception 'invalid_customer';end if;
 if nullif(payload->>'return_id','') is not null and not exists(select 1 from public.crm_returns where id=(payload->>'return_id')::uuid and org_id=target and customer_id=(payload->>'customer_id')::uuid) then raise exception 'invalid_return';end if;
 for round in select value from jsonb_array_elements(payload->'rounds') loop
  if jsonb_typeof(round->'items') is distinct from 'array' or jsonb_array_length(round->'items') not between 1 and 50 or coalesce(round->>'result','') not in ('pending','rejected','lab_approved','line_approved','production') then raise exception 'invalid_trial';end if;
  if (round->>'result'<>'pending' or exists(select 1 from jsonb_array_elements(round->'items') v where v->>'outcome' in ('approved','rejected'))) and (nullif(round->>'dispatch_date','') is null or nullif(round->>'result_date','') is null or (round->>'result_date')::date<(round->>'dispatch_date')::date) then raise exception 'invalid_trial_dates';end if;
  if (round->>'result'='rejected' or exists(select 1 from jsonb_array_elements(round->'items') v where v->>'outcome'='rejected')) and (jsonb_array_length(coalesce(round->'defects','[]'))=0 or coalesce(nullif(round#>>'{reason,fa}',''),nullif(round#>>'{reason,en}','')) is null) then raise exception 'missing_failure_reason';end if;
  if round->>'result'='production' and (nullif(round->>'production_date','') is null or (round->>'production_date')::date<(round->>'result_date')::date) then raise exception 'invalid_production_date';end if;
  if nullif(round->>'return_date','') is not null and ((round->>'result'<>'rejected' and not exists(select 1 from jsonb_array_elements(round->'items') v where v->>'outcome'='rejected')) or nullif(round->>'result_date','') is null or (round->>'return_date')::date<(round->>'result_date')::date) then raise exception 'invalid_return_date';end if;
  if jsonb_typeof(round->'defects') is distinct from 'array' or jsonb_array_length(round->'defects')>50 then raise exception 'invalid_defects';end if;
  for item in select value from jsonb_array_elements(round->'items') loop
   if coalesce(item->>'outcome','inherit') not in ('inherit','pending','approved','rejected') then raise exception 'invalid_product_result';end if;
   if nullif(item->>'quantity','') is null or (item->>'quantity')::numeric<=0 or (item->>'quantity')::numeric>1e12 then raise exception 'invalid_quantity';end if;
   if ((item->>'package_count') is null)<>((item->>'packing_weight') is null) then raise exception 'invalid_packing';end if;
   if item->>'package_count' is not null and ((item->>'package_count')::numeric<=0 or trunc((item->>'package_count')::numeric)<>(item->>'package_count')::numeric or (item->>'packing_weight')::numeric<=0 or abs((item->>'quantity')::numeric-(item->>'package_count')::numeric*(item->>'packing_weight')::numeric)>0.000001) then raise exception 'invalid_packing';end if;
   if nullif(item->>'product_id','') is not null and not exists(select 1 from public.crm_records where id=(item->>'product_id')::uuid and org_id=target and kind='products') then raise exception 'invalid_product';end if;
   if (round->>'result'<>'pending' or exists(select 1 from jsonb_array_elements(round->'items') v where v->>'outcome' in ('approved','rejected'))) and (nullif(trim(item->>'batch'),'') is null or nullif(trim(item->>'root_batch'),'') is null) then raise exception 'missing_batch';end if;
  end loop;
 end loop;
 if sample_id is null then
  insert into public.crm_samples(org_id,data) values(target,payload) returning id into result;
 else
  select * into r from public.crm_samples where id=sample_id for update;
  if r.id is null or r.org_id<>target then raise insufficient_privilege;end if;
  if not public.crm_sample_in_scope(target,r.data,r.created_by) or not public.crm_sample_in_scope(target,payload,r.created_by) then raise insufficient_privilege;end if;
  if expected_version is null or r.version<>expected_version then raise exception 'version_conflict';end if;
  update public.crm_samples set data=payload,version=version+1,updated_at=now() where id=sample_id;result=sample_id;
 end if;
 return result;
end $$;

create or replace function public.crm_set_member_access(target_user uuid, new_role text, new_active boolean) returns void language plpgsql security definer set search_path='' as $$
declare target_org uuid; old_member public.crm_members;
begin
 if auth.uid() is null or target_user is null or new_role is null or new_role not in ('admin','sales','viewer') or new_active is null then raise insufficient_privilege; end if;
 select org_id into target_org from public.crm_members where user_id=auth.uid();
 if target_org is null then raise insufficient_privilege; end if;
 perform 1 from public.crm_orgs where id=target_org for update;
 if coalesce(public.crm_role(target_org),'') <> 'admin' or target_user=auth.uid() then raise insufficient_privilege; end if;
 select * into old_member from public.crm_members where org_id=target_org and user_id=target_user for update;
 if old_member.user_id is null or exists(select 1 from crm_private.owners where user_id=target_user) then raise insufficient_privilege; end if;
 if old_member.role='admin' and old_member.active and (new_role<>'admin' or not new_active) and not exists(select 1 from public.crm_members where org_id=target_org and user_id<>target_user and role='admin' and active and not exists(select 1 from crm_private.access a where a.user_id=crm_members.user_id and (a.disabled or a.expires_on<current_date))) then raise exception 'last_admin'; end if;
 if old_member.role=new_role and old_member.active=new_active then return; end if;
 update public.crm_members set role=new_role,active=new_active,can_delete=case when old_member.role='sales' and new_role='sales' then old_member.can_delete else false end,customer_scope=case when new_role='admin' then 'all' else old_member.customer_scope end where org_id=target_org and user_id=target_user;
 insert into crm_private.membership_audit(org_id,actor_id,target_id,old_role,new_role,old_active,new_active,old_can_delete,new_can_delete,old_customer_scope,new_customer_scope) values(target_org,auth.uid(),target_user,old_member.role,new_role,old_member.active,new_active,old_member.can_delete,case when old_member.role='sales' and new_role='sales' then old_member.can_delete else false end,old_member.customer_scope,case when new_role='admin' then 'all' else old_member.customer_scope end);
end $$;

create or replace function public.crm_import_with_samples(payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;s jsonb;target uuid;n integer:=0;newid uuid;
begin
 result=public.crm_import_complete(payload);
 select org_id into target from public.crm_members where user_id=auth.uid();
 for s in select value from jsonb_array_elements(coalesce(payload->'samples','[]')) loop
  if exists(select 1 from public.crm_samples where id=(s->>'id')::uuid and org_id<>target) then raise exception 'sample_id_conflict';end if;
  if exists(select 1 from public.crm_samples where id=(s->>'id')::uuid) then continue;end if;
  newid=public.crm_sample_save(null,0,s->'data');
  update public.crm_samples set id=(s->>'id')::uuid,created_by=case when exists(select 1 from public.crm_members m where m.org_id=target and m.user_id=nullif(s->>'created_by','')::uuid) then nullif(s->>'created_by','')::uuid else null end where id=newid;n=n+1;
 end loop;
 return result||jsonb_build_object('samples_imported',n);
end $$;

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
  update public.crm_samples set id=t.object_id,created_at=(t.payload->>'created_at')::timestamptz,updated_at=(t.payload->>'updated_at')::timestamptz,version=(t.payload->>'version')::integer,created_by=case when exists(select 1 from public.crm_members m where m.org_id=target and m.user_id=nullif(t.payload->>'created_by','')::uuid) then nullif(t.payload->>'created_by','')::uuid else null end where id=new_id and org_id=target;
 else
  select * into item from public.crm_samples where id=t.object_id and org_id=target for update;
  if item.id is null then raise exception 'trash_parent_missing';end if;
  if exists(select 1 from jsonb_array_elements(item.data->'rounds') x where x->>'id'=t.payload#>>'{round,id}') then raise exception 'trash_item_exists';end if;
  perform public.crm_sample_save(item.id,item.version,jsonb_set(item.data,'{rounds}',jsonb_insert(item.data->'rounds',array[(t.payload->>'position')::integer::text],t.payload->'round',false)));
 end if;
 update crm_private.trash set restored_at=now(),restored_by=auth.uid() where id=t.id;
end $$;

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
  select 'member:'||a.id::text,'member','UPDATE','تغییر دسترسی عضو',a.actor_id,a.created_at,false,jsonb_build_object('target_id',a.target_id,'old_role',a.old_role,'new_role',a.new_role,'old_active',a.old_active,'new_active',a.new_active,'old_can_delete',a.old_can_delete,'new_can_delete',a.new_can_delete,'old_customer_scope',a.old_customer_scope,'new_customer_scope',a.new_customer_scope)
  from crm_private.membership_audit a where a.org_id=target
  union all
  select 'entity:'||a.id::text,a.entity_kind,a.action,a.label,a.actor_id,a.created_at,false,null::jsonb from crm_private.entity_audit a where a.org_id=target
 ), latest as (select * from events order by created_at desc,event_id desc limit max_rows)
 select coalesce(jsonb_agg(jsonb_build_object('id',e.event_id,'category',e.category,'action',e.action,'label',e.label,'actor_name',case when e.actor_id is null then 'سیستم' else coalesce(nullif(trim(u.raw_user_meta_data->>'full_name'),''),nullif(trim(u.raw_user_meta_data->>'name'),''),m.email,'نام ثبت نشده') end,'target_name',case when tm.user_id is null then null else coalesce(nullif(trim(tu.raw_user_meta_data->>'full_name'),''),nullif(trim(tu.raw_user_meta_data->>'name'),''),tm.email,'نام ثبت نشده') end,'created_at',e.created_at,'restored_from_backup',e.restored_from_backup,'detail',e.detail) order by e.created_at desc,e.event_id desc),'[]'::jsonb)
 from latest e left join public.crm_members m on m.org_id=target and m.user_id=e.actor_id left join auth.users u on u.id=m.user_id left join public.crm_members tm on tm.org_id=target and tm.user_id=nullif(e.detail->>'target_id','')::uuid left join auth.users tu on tu.id=tm.user_id);
end $$;
