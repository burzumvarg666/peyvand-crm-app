-- Restored audit entries are explicitly marked as coming from an uploaded archive.
alter table public.crm_audit add column if not exists restored_from_backup boolean not null default false;
create or replace function public.crm_recover_snapshot(payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare target uuid; result jsonb; entry jsonb; restored integer := 0; audit_id uuid;
begin
 select org_id into target from public.crm_members where user_id=auth.uid();
 if target is null or coalesce(public.crm_role(target),'')<>'admin' then raise insufficient_privilege;end if;
 if jsonb_typeof(payload)<>'object' or payload->>'format'<>'peyvand-workspace-snapshot' or payload->>'schemaVersion'<>'2' or payload#>>'{workspace,id}' is distinct from target::text or octet_length(payload::text)>20000000 then raise exception 'invalid_snapshot';end if;
 if jsonb_typeof(payload->'records') is distinct from 'array' or jsonb_typeof(payload->'returns') is distinct from 'array' or jsonb_typeof(payload->'samples') is distinct from 'array' or jsonb_typeof(payload->'audit') is distinct from 'array' or jsonb_array_length(payload->'audit')>200000 then raise exception 'invalid_snapshot';end if;
 if exists(select 1 from jsonb_array_elements(payload->'records') x where x->>'org_id' is distinct from target::text) or exists(select 1 from jsonb_array_elements(payload->'returns') x where x->>'org_id' is distinct from target::text) or exists(select 1 from jsonb_array_elements(payload->'samples') x where x->>'org_id' is distinct from target::text) then raise insufficient_privilege;end if;
 result=public.crm_import_with_samples(jsonb_build_object('format','peyvand-online','schemaVersion',1,'records',payload->'records','returns',payload->'returns','samples',payload->'samples'));
 for entry in select value from jsonb_array_elements(payload->'audit') loop
  if entry->>'org_id' is distinct from target::text or coalesce(entry->>'action','') not in ('INSERT','UPDATE','DELETE') or length(coalesce(entry->>'label','')) not between 1 and 160 or nullif(entry->>'created_at','') is null or nullif(entry->>'record_id','') is null then raise exception 'invalid_audit_entry';end if;
  audit_id=(entry->>'id')::uuid;
  if audit_id is null then raise exception 'invalid_audit_entry';end if;
  if exists(select 1 from public.crm_audit where id=audit_id and org_id<>target) then raise exception 'audit_id_conflict';end if;
  insert into public.crm_audit(id,org_id,record_id,actor_id,action,label,created_at,restored_from_backup)
   values(audit_id,target,(entry->>'record_id')::uuid,nullif(entry->>'actor_id','')::uuid,entry->>'action',entry->>'label',(entry->>'created_at')::timestamptz,true)
   on conflict(id) do nothing;
  if found then restored=restored+1;end if;
 end loop;
 return result||jsonb_build_object('audit_imported',restored);
end $$;
revoke all on function public.crm_recover_snapshot(jsonb) from public,anon;
grant execute on function public.crm_recover_snapshot(jsonb) to authenticated;
