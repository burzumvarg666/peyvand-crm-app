-- Run only against a disposable test database after applying project migrations.
begin;
select set_config('test.snapshot_org',gen_random_uuid()::text,true),set_config('test.snapshot_admin',gen_random_uuid()::text,true),set_config('test.snapshot_sales',gen_random_uuid()::text,true),set_config('test.snapshot_other',gen_random_uuid()::text,true),set_config('test.snapshot_other_org',gen_random_uuid()::text,true);
insert into auth.users(id,email,email_confirmed_at) values(current_setting('test.snapshot_admin')::uuid,'snapshot-admin@example.invalid',now()),(current_setting('test.snapshot_sales')::uuid,'snapshot-sales@example.invalid',now()),(current_setting('test.snapshot_other')::uuid,'snapshot-other@example.invalid',now());
insert into public.crm_orgs(id,name) values(current_setting('test.snapshot_org')::uuid,'snapshot test'),(current_setting('test.snapshot_other_org')::uuid,'other workspace');
insert into public.crm_members(org_id,user_id,email,role) values(current_setting('test.snapshot_org')::uuid,current_setting('test.snapshot_admin')::uuid,'snapshot-admin@example.invalid','admin'),(current_setting('test.snapshot_org')::uuid,current_setting('test.snapshot_sales')::uuid,'snapshot-sales@example.invalid','sales'),(current_setting('test.snapshot_other_org')::uuid,current_setting('test.snapshot_other')::uuid,'snapshot-other@example.invalid','admin');
insert into public.crm_records(org_id,kind,data) values(current_setting('test.snapshot_org')::uuid,'companies','{"name":"Customer","status":"active"}'::jsonb);
select set_config('request.jwt.claim.sub',current_setting('test.snapshot_admin'),true);
set local role authenticated;
do $$ declare s jsonb; begin
 s=public.crm_workspace_snapshot();
 if s->>'format'<>'peyvand-workspace-snapshot' or s#>>'{workspace,id}'<>current_setting('test.snapshot_org') or jsonb_array_length(s->'members')<>2 or jsonb_array_length(s->'records')<>1 or jsonb_array_length(s->'audit')<1 then raise exception 'snapshot_incomplete';end if;
 if s::text like '%snapshot-other@example.invalid%' then raise exception 'snapshot_tenant_leak';end if;
end $$;
select set_config('request.jwt.claim.sub',current_setting('test.snapshot_sales'),true);
do $$ begin begin perform public.crm_workspace_snapshot();raise exception 'sales_snapshot_allowed';exception when insufficient_privilege then null;end;end $$;
select set_config('request.jwt.claim.sub',current_setting('test.snapshot_other'),true);
do $$ declare s jsonb;begin s=public.crm_workspace_snapshot();if jsonb_array_length(s->'records')<>0 or s::text like '%snapshot-sales@example.invalid%' then raise exception 'other_org_data_leaked';end if;end $$;
reset role;
rollback;
