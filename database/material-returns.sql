create table public.crm_returns(
 id uuid primary key default gen_random_uuid(),org_id uuid not null references public.crm_orgs(id),
 customer_id uuid not null references public.crm_records(id),product_id uuid not null references public.crm_records(id),
 quantity numeric not null check(quantity>0 and quantity<=1e12 and round(quantity,2)=quantity),
 return_date date not null,reason text not null check(length(trim(reason)) between 1 and 2000),
 reference text not null default '' check(length(reference)<=160),
 status text not null default 'pending' check(status in ('pending','received','rejected')),
 restocked boolean not null default false,movement_id uuid references public.crm_records(id),
 created_by uuid not null,created_at timestamptz not null default now(),resolved_by uuid,resolved_at timestamptz,
 version integer not null default 1,
 check(not restocked or (status='received' and movement_id is not null))
);
create index crm_returns_org_created on public.crm_returns(org_id,created_at desc);
alter table public.crm_returns enable row level security;
revoke all on public.crm_returns from anon,authenticated;
grant select on public.crm_returns to authenticated;
create policy returns_read on public.crm_returns for select to authenticated using(public.crm_role(org_id) is not null);
create function public.crm_return_create(customer uuid,product uuid,qty numeric,day date,why text,ref text default '') returns uuid language plpgsql security definer set search_path='' as $$
declare c public.crm_records;p public.crm_records;result uuid;
begin
 select * into c from public.crm_records where id=customer and kind='companies';
 if c.id is null or coalesce(public.crm_role(c.org_id),'') not in ('admin','sales') then raise insufficient_privilege;end if;
 select * into p from public.crm_records where id=product and kind='products' and org_id=c.org_id;
 if p.id is null then raise exception 'invalid_product';end if;
 insert into public.crm_returns(org_id,customer_id,product_id,quantity,return_date,reason,reference,created_by) values(c.org_id,c.id,p.id,qty,day,trim(why),ref,auth.uid()) returning id into result;
 return result;
end $$;
create function public.crm_return_resolve(return_id uuid,expected_version integer,decision text,restock boolean default false) returns void language plpgsql security definer set search_path='' as $$
declare r public.crm_returns;p public.crm_records;mid uuid;
begin
 select * into r from public.crm_returns where id=return_id for update;
 if r.id is null or coalesce(public.crm_role(r.org_id),'') not in ('admin','sales') then raise insufficient_privilege;end if;
 if r.status<>'pending' or r.version<>expected_version then raise exception 'version_conflict';end if;
 if decision is null or decision not in ('received','rejected') or restock is null or (restock and decision<>'received') then raise exception 'invalid_decision';end if;
 if restock then
  select * into p from public.crm_records where id=r.product_id and org_id=r.org_id and kind='products' for update;
  mid=public.crm_inventory(p.id,p.version,'in',r.quantity,'RETURN-'||r.id::text,'دریافت مواد برگشتی: '||r.reason);
 end if;
 update public.crm_returns set status=decision,restocked=restock,movement_id=mid,resolved_by=auth.uid(),resolved_at=now(),version=version+1 where id=r.id;
end $$;
revoke all on function public.crm_return_create(uuid,uuid,numeric,date,text,text) from public,anon;
revoke all on function public.crm_return_resolve(uuid,integer,text,boolean) from public,anon;
grant execute on function public.crm_return_create(uuid,uuid,numeric,date,text,text) to authenticated;
grant execute on function public.crm_return_resolve(uuid,integer,text,boolean) to authenticated;
