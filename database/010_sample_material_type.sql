create or replace function public.crm_sample_trial_identity(r jsonb) returns jsonb language sql immutable set search_path='' as $$
 select (jsonb_build_object('registration_date','')||r)-'return_date'||jsonb_build_object('reason',(r->'reason')-'en','action',(r->'action')-'en','comments',(r->'comments')-'en','conditions',(r->'conditions')-'en','items',(select jsonb_agg(jsonb_build_object('material_type_name','','manufacture_date','','package_count',null,'packing_weight',null,'sor','')||i||jsonb_build_object('description',(i->'description')-'en','grade',(i->'grade')-'en','result',(i->'result')-'en') order by ord) from jsonb_array_elements(r->'items') with ordinality as t(i,ord)))
$$;
revoke all on function public.crm_sample_trial_identity(jsonb) from public,anon,authenticated;
