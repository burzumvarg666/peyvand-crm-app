alter table public.crm_returns add column material_type text not null default 'other' check(material_type in ('paint','primer','clearcoat','other'));
alter table public.crm_returns add column sor_number text not null default '' check(length(sor_number)<=80);
create function public.crm_return_register(customer uuid,product uuid,qty numeric,day date,why text,ref text,material text,sor text) returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
 if material is null or material not in ('paint','primer','clearcoat','other') or sor is null or length(sor)>80 then raise exception 'invalid_material_details';end if;
 result=public.crm_return_create(customer,product,qty,day,why,ref);
 update public.crm_returns set material_type=material,sor_number=trim(sor) where id=result;
 return result;
end $$;
revoke all on function public.crm_return_register(uuid,uuid,numeric,date,text,text,text,text) from public,anon;
grant execute on function public.crm_return_register(uuid,uuid,numeric,date,text,text,text,text) to authenticated;
