-- Only administrators may delete workspace records.
drop policy if exists records_delete on public.crm_records;
create policy records_delete on public.crm_records for delete to authenticated using(public.crm_role(org_id)='admin' and kind<>'stock_movements');

-- Deleting a case does not undo physical receipts or dispatches.
-- Keep stock movements and current inventory intact.
create or replace function public.crm_return_delete(return_id uuid,expected_version integer) returns void
language plpgsql security definer set search_path='' as $$
declare r public.crm_returns;
begin
 select * into r from public.crm_returns where id=return_id for update;
 if r.id is null or auth.uid() is null or coalesce(public.crm_role(r.org_id),'') <> 'admin' then raise insufficient_privilege;end if;
 if expected_version is null or r.version<>expected_version then raise exception 'version_conflict';end if;
 delete from public.crm_returns where id=r.id and org_id=r.org_id;
end $$;
revoke all on function public.crm_return_delete(uuid,integer) from public,anon;
grant execute on function public.crm_return_delete(uuid,integer) to authenticated;

create or replace function public.crm_sample_delete(sample_id uuid,expected_version integer) returns void language plpgsql security definer set search_path='' as $$
declare r public.crm_samples;
begin
 select * into r from public.crm_samples where id=sample_id for update;
 if r.id is null or auth.uid() is null or coalesce(public.crm_role(r.org_id),'') <> 'admin' then raise insufficient_privilege;end if;
 if expected_version is null or expected_version<>r.version then raise exception 'version_conflict';end if;
 delete from public.crm_samples where id=r.id and org_id=r.org_id;
end $$;
revoke all on function public.crm_sample_delete(uuid,integer) from public,anon;
grant execute on function public.crm_sample_delete(uuid,integer) to authenticated;

create or replace function public.crm_sample_delete_dispatches(selections jsonb) returns void language plpgsql security definer set search_path='' as $$
declare target uuid; selection jsonb; existing public.crm_samples; remaining jsonb;
begin
 select org_id into target from public.crm_members where user_id=auth.uid();
 if target is null or coalesce(public.crm_role(target),'') <> 'admin' then raise insufficient_privilege;end if;
 if jsonb_typeof(selections) is distinct from 'array' or jsonb_array_length(selections) not between 1 and 10000 then raise exception 'invalid_selection';end if;
 if (select count(*) from jsonb_array_elements(selections))<>(select count(distinct v->>'id') from jsonb_array_elements(selections) v) then raise exception 'duplicate_selection';end if;
 for selection in select value from jsonb_array_elements(selections) order by value->>'id' loop
  select * into existing from public.crm_samples where id=(selection->>'id')::uuid for update;
  if existing.id is null or existing.org_id<>target then raise insufficient_privilege;end if;
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
revoke all on function public.crm_sample_delete_dispatches(jsonb) from public,anon;
grant execute on function public.crm_sample_delete_dispatches(jsonb) to authenticated;

create or replace function public.crm_restrict_product_archive() returns trigger language plpgsql set search_path='' as $$
begin
 if old.kind='products' and coalesce(old.data->>'archived','false') is distinct from coalesce(new.data->>'archived','false') and coalesce(public.crm_role(old.org_id),'') <> 'admin' then raise insufficient_privilege; end if;
 return new;
end $$;
drop trigger if exists crm_restrict_product_archive on public.crm_records;
create trigger crm_restrict_product_archive before update on public.crm_records for each row execute function public.crm_restrict_product_archive();

-- Editing a sample must not silently remove dispatch history for sales users.
create or replace function public.crm_restrict_sample_round_removal() returns trigger language plpgsql set search_path='' as $$
begin
 if coalesce(public.crm_role(old.org_id),'') <> 'admin' and exists (
  select 1 from jsonb_array_elements(coalesce(old.data->'rounds','[]'::jsonb)) old_round
  where not exists (select 1 from jsonb_array_elements(coalesce(new.data->'rounds','[]'::jsonb)) new_round where new_round->>'id'=old_round->>'id')
 ) then raise insufficient_privilege; end if;
 return new;
end $$;
drop trigger if exists crm_restrict_sample_round_removal on public.crm_samples;
create trigger crm_restrict_sample_round_removal before update on public.crm_samples for each row execute function public.crm_restrict_sample_round_removal();
