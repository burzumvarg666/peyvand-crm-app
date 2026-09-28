begin;
select set_config('test.user',gen_random_uuid()::text,true),set_config('test.org',gen_random_uuid()::text,true),set_config('test.customer',gen_random_uuid()::text,true),set_config('test.product',gen_random_uuid()::text,true);
insert into auth.users(id,email,email_confirmed_at) values(current_setting('test.user')::uuid,'returns-test@example.invalid',now());
insert into public.crm_orgs(id,name) values(current_setting('test.org')::uuid,'returns test');
insert into public.crm_members(org_id,user_id,email,role) values(current_setting('test.org')::uuid,current_setting('test.user')::uuid,'returns-test@example.invalid','admin');
insert into public.crm_records(id,org_id,kind,data) values(current_setting('test.customer')::uuid,current_setting('test.org')::uuid,'companies','{"name":"Test customer","status":"active"}'),(current_setting('test.product')::uuid,current_setting('test.org')::uuid,'products','{"name":"Test material","status":"active","stock":0,"unit":"kg"}');
select set_config('request.jwt.claim.sub',current_setting('test.user'),true);
set local role authenticated;
do $$ declare sid uuid; sid2 uuid; p jsonb; q jsonb; rid uuid:=gen_random_uuid(); rid2 uuid:=gen_random_uuid(); begin
 p=jsonb_build_object('customer_id','','return_id','','request_date','','required_date','','details',jsonb_build_object('title',jsonb_build_object('fa','','en','Standalone')),'rounds','[]'::jsonb);
 q=jsonb_build_object('id',rid,'customer_name','Independent customer','result','rejected','dispatch_date',current_date,'result_date',current_date,'return_date','','production_date','','defects',jsonb_build_array('Custom defect'),'reason',jsonb_build_object('fa','','en','Failure'),'items',jsonb_build_array(jsonb_build_object('product_id','','quantity',200,'package_count',10,'packing_weight',20,'batch','5001','root_batch','5001','outcome','inherit')));
 p=jsonb_set(p,'{rounds}',jsonb_build_array(q,jsonb_set(q,'{id}',to_jsonb(rid2))));
 sid=public.crm_sample_save(null,0,p);
 sid2=public.crm_sample_save(null,0,p);
 -- Completed results can be edited; unrelated samples stay intact.
 p=jsonb_set(p,'{rounds,0,reason,en}','"Updated failure"');
 perform public.crm_sample_save(sid,1,p);
 if (select data#>>'{rounds,0,reason,en}' from public.crm_samples where id=sid)<>'Updated failure' then raise exception 'edit_failed';end if;
 begin perform public.crm_sample_save(sid,1,p);raise exception 'stale_save_allowed' using errcode='22000';exception when raise_exception then null;end;
 -- Atomic deletion must roll back earlier operations when any version is stale.
 begin
  perform public.crm_sample_delete_dispatches(jsonb_build_array(jsonb_build_object('id',sid,'version',2,'all',true),jsonb_build_object('id',sid2,'version',999,'all',true)));
  raise exception 'stale_bulk_allowed' using errcode='22000';
 exception when raise_exception then null;end;
 if (select count(*) from public.crm_samples)<>2 then raise exception 'partial_delete';end if;
 perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
 begin perform public.crm_sample_delete_dispatches(jsonb_build_array(jsonb_build_object('id',sid,'version',2,'all',true)));raise exception 'cross_tenant_allowed' using errcode='22000';exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claim.sub',current_setting('test.user'),true);
 perform public.crm_sample_delete_dispatches(jsonb_build_array(jsonb_build_object('id',sid,'version',2,'round_ids',jsonb_build_array(rid))));
 if (select jsonb_array_length(data->'rounds') from public.crm_samples where id=sid)<>1 then raise exception 'single_delete_failed';end if;
 if (select data#>>'{rounds,0,id}' from public.crm_samples where id=sid)<>rid2::text then raise exception 'wrong_dispatch_deleted';end if;
 -- Backups of independent records remain restorable.
 perform public.crm_import_with_samples(jsonb_build_object('format','peyvand-online','schemaVersion',1,'records','[]'::jsonb,'samples',jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'version',1,'data',p))));
 if (select count(*) from public.crm_samples)<>3 then raise exception 'backup_restore_failed';end if;
 perform public.crm_sample_delete_dispatches((select jsonb_agg(jsonb_build_object('id',id,'version',version,'all',true)) from public.crm_samples));
 if exists(select 1 from public.crm_samples) then raise exception 'delete_all_failed';end if;
 if not exists(select 1 from public.crm_records where id=current_setting('test.product')::uuid and (data->>'stock')::numeric=0) then raise exception 'inventory_changed';end if;
end $$;
reset role;
select 'PASS: standalone save, completed edit, optimistic concurrency, atomic bulk deletion, tenant isolation, backup restore, inventory unchanged' as result;
rollback;
