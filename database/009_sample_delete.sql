create or replace function public.crm_sample_delete(sample_id uuid,expected_version integer) returns void language plpgsql security definer set search_path='' as $$
declare r public.crm_samples;
begin
 select * into r from public.crm_samples where id=sample_id for update;
 if r.id is null or auth.uid() is null or coalesce(public.crm_role(r.org_id),'') not in ('admin','sales') then raise insufficient_privilege;end if;
 if expected_version is null or expected_version<>r.version then raise exception 'version_conflict';end if;
 delete from public.crm_samples where id=r.id and org_id=r.org_id;
end $$;
revoke all on function public.crm_sample_delete(uuid,integer) from public,anon;
grant execute on function public.crm_sample_delete(uuid,integer) to authenticated;
