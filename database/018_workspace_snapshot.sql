-- A consistent application-data snapshot, not a database/Auth credential backup.
create or replace function public.crm_workspace_snapshot() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare target uuid; result jsonb;
begin
 select org_id into target from public.crm_members where user_id=auth.uid();
 if target is null or coalesce(public.crm_role(target),'')<>'admin' then raise insufficient_privilege; end if;
 select jsonb_build_object(
  'format','peyvand-workspace-snapshot', 'schemaVersion',2, 'exportedAt',statement_timestamp(),
  'workspace',(select to_jsonb(o) from public.crm_orgs o where o.id=target),
  'members',(select coalesce(jsonb_agg(to_jsonb(m) order by m.user_id),'[]'::jsonb) from public.crm_members m where m.org_id=target),
  'invites',(select coalesce(jsonb_agg(to_jsonb(i) order by i.id),'[]'::jsonb) from public.crm_invites i where i.org_id=target),
  'records',(select coalesce(jsonb_agg(to_jsonb(r) order by r.id),'[]'::jsonb) from public.crm_records r where r.org_id=target),
  'returns',(select coalesce(jsonb_agg(to_jsonb(r) order by r.id),'[]'::jsonb) from public.crm_returns r where r.org_id=target),
  'samples',(select coalesce(jsonb_agg(to_jsonb(s) order by s.id),'[]'::jsonb) from public.crm_samples s where s.org_id=target),
  'audit',(select coalesce(jsonb_agg(to_jsonb(a) order by a.created_at,a.id),'[]'::jsonb) from public.crm_audit a where a.org_id=target),
  'membershipAudit',(select coalesce(jsonb_agg(to_jsonb(a) order by a.id),'[]'::jsonb) from crm_private.membership_audit a where a.org_id=target),
  'limitations',jsonb_build_array('auth_credentials_excluded','storage_objects_excluded','platform_configuration_excluded')
 ) into result;
 if octet_length(result::text)>18000000 then raise exception 'snapshot_too_large'; end if;
 return result;
end $$;
revoke all on function public.crm_workspace_snapshot() from public,anon;
grant execute on function public.crm_workspace_snapshot() to authenticated;
