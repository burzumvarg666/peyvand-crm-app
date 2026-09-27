create function public.crm_sample_trial_identity(r jsonb) returns jsonb language sql immutable set search_path='' as $$
 select r||jsonb_build_object('reason',(r->'reason')-'en','action',(r->'action')-'en','comments',(r->'comments')-'en','conditions',(r->'conditions')-'en','items',(select jsonb_agg(i||jsonb_build_object('description',(i->'description')-'en','grade',(i->'grade')-'en','result',(i->'result')-'en') order by ord) from jsonb_array_elements(r->'items') with ordinality as t(i,ord)))
$$;
revoke all on function public.crm_sample_trial_identity(jsonb) from public,anon,authenticated;
create table public.crm_samples(id uuid primary key default gen_random_uuid(),org_id uuid not null references public.crm_orgs(id),data jsonb not null,version integer not null default 1,created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create index crm_samples_org on public.crm_samples(org_id,created_at desc);
alter table public.crm_samples enable row level security;
revoke all on public.crm_samples from anon,authenticated;
grant select on public.crm_samples to authenticated;
create policy samples_read on public.crm_samples for select to authenticated using(public.crm_role(org_id) is not null);
create function public.crm_sample_save(sample_id uuid,expected_version integer,payload jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare target uuid;r public.crm_samples;round jsonb;item jsonb;oldround jsonb;result uuid;
begin
 select org_id into target from public.crm_members where user_id=auth.uid();
 if target is null or coalesce(public.crm_role(target),'') not in ('admin','sales') then raise insufficient_privilege;end if;
 if jsonb_typeof(payload)<>'object' or octet_length(payload::text)>2000000 or jsonb_typeof(payload->'rounds') is distinct from 'array' or jsonb_array_length(payload->'rounds')>200 then raise exception 'invalid_sample';end if;
 if jsonb_typeof(payload->'details') is distinct from 'object' then raise exception 'invalid_sample';end if;
 if (select count(*) from jsonb_array_elements(payload->'rounds'))<>(select count(distinct x->>'id') from jsonb_array_elements(payload->'rounds') x) then raise exception 'duplicate_trial';end if;
 if not exists(select 1 from public.crm_records where id=(payload->>'customer_id')::uuid and org_id=target and kind='companies') then raise exception 'invalid_customer';end if;
 if nullif(payload->>'return_id','') is not null and not exists(select 1 from public.crm_returns where id=(payload->>'return_id')::uuid and org_id=target and customer_id=(payload->>'customer_id')::uuid) then raise exception 'invalid_return';end if;
 for round in select value from jsonb_array_elements(payload->'rounds') loop
  if jsonb_typeof(round->'items') is distinct from 'array' or jsonb_array_length(round->'items') not between 1 and 50 or coalesce(round->>'result','') not in ('pending','rejected','lab_approved','line_approved','production') then raise exception 'invalid_trial';end if;
  if round->>'result'<>'pending' and (nullif(round->>'dispatch_date','') is null or nullif(round->>'result_date','') is null or (round->>'result_date')::date<(round->>'dispatch_date')::date) then raise exception 'invalid_trial_dates';end if;
  if round->>'result'='rejected' and (jsonb_array_length(coalesce(round->'defects','[]'))=0 or coalesce(nullif(round#>>'{reason,fa}',''),nullif(round#>>'{reason,en}','')) is null) then raise exception 'missing_failure_reason';end if;
  if round->>'result'='production' and (nullif(round->>'production_date','') is null or (round->>'production_date')::date<(round->>'result_date')::date) then raise exception 'invalid_production_date';end if;
  for item in select value from jsonb_array_elements(round->'items') loop
   if nullif(item->>'quantity','') is null or (item->>'quantity')::numeric<=0 or (item->>'quantity')::numeric>1e12 then raise exception 'invalid_quantity';end if;
   if nullif(item->>'product_id','') is not null and not exists(select 1 from public.crm_records where id=(item->>'product_id')::uuid and org_id=target and kind='products') then raise exception 'invalid_product';end if;
   if round->>'result'<>'pending' and (nullif(trim(item->>'batch'),'') is null or nullif(trim(item->>'root_batch'),'') is null) then raise exception 'missing_batch';end if;
  end loop;
 end loop;
 if sample_id is null then
  insert into public.crm_samples(org_id,data) values(target,payload) returning id into result;
 else
  select * into r from public.crm_samples where id=sample_id for update;
  if r.id is null or r.org_id<>target then raise insufficient_privilege;end if;
  if expected_version is null or r.version<>expected_version then raise exception 'version_conflict';end if;
  if payload->>'customer_id'<>r.data->>'customer_id' then raise exception 'customer_locked';end if;
  for oldround in select value from jsonb_array_elements(r.data->'rounds') loop
   if oldround->>'result'<>'pending' and not exists(select 1 from jsonb_array_elements(payload->'rounds') x where public.crm_sample_trial_identity(x)=public.crm_sample_trial_identity(oldround)) then raise exception 'completed_trial_locked';end if;
  end loop;
  update public.crm_samples set data=payload,version=version+1,updated_at=now() where id=sample_id;result=sample_id;
 end if;
 return result;
end $$;
revoke all on function public.crm_sample_save(uuid,integer,jsonb) from public,anon;
grant execute on function public.crm_sample_save(uuid,integer,jsonb) to authenticated;
create function public.crm_import_with_samples(payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;s jsonb;target uuid;n integer:=0;newid uuid;
begin
 result=public.crm_import_complete(payload);
 select org_id into target from public.crm_members where user_id=auth.uid();
 for s in select value from jsonb_array_elements(coalesce(payload->'samples','[]')) loop
  if exists(select 1 from public.crm_samples where id=(s->>'id')::uuid and org_id<>target) then raise exception 'sample_id_conflict';end if;
  if exists(select 1 from public.crm_samples where id=(s->>'id')::uuid) then continue;end if;
  newid=public.crm_sample_save(null,0,s->'data');
  update public.crm_samples set id=(s->>'id')::uuid where id=newid;n=n+1;
 end loop;
 return result||jsonb_build_object('samples_imported',n);
end $$;
revoke all on function public.crm_import_with_samples(jsonb) from public,anon;
grant execute on function public.crm_import_with_samples(jsonb) to authenticated;
