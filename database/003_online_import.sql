-- Add a transactional import endpoint for online/desktop JSON backups.
-- The function merges records into the caller's workspace and never deletes existing rows.
begin;

create or replace function public.crm_import_backup(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
 target_org uuid;
 imported integer := 0;
 inserted_now integer := 0;
begin
 if auth.uid() is null then raise exception 'unauthenticated'; end if;
 select m.org_id into target_org
 from public.crm_members m
 where m.user_id=(select auth.uid()) and m.role in ('admin','sales')
 limit 1;
 if target_org is null then raise exception 'forbidden'; end if;
 if jsonb_typeof(payload)<>'object'
    or payload->>'format' not in ('peyvand-desktop','peyvand-online')
    or payload->>'schemaVersion' <> '1'
    or jsonb_typeof(payload->'records')<>'array' then
   raise exception 'invalid_import_format';
 end if;
 if jsonb_array_length(payload->'records')>100000 then raise exception 'import_too_large'; end if;

 create temporary table crm_import_rows(
   id uuid primary key,
   kind text not null,
   parent_id uuid,
   data jsonb not null,
   created_at timestamptz,
   updated_at timestamptz,
   version integer not null default 1,
   inserted boolean not null default false
 ) on commit drop;

 insert into pg_temp.crm_import_rows(id,kind,parent_id,data,created_at,updated_at,version)
 select (r->>'id')::uuid,
        r->>'kind',
        nullif(r->>'parent_id','')::uuid,
        case
          when nullif(r->'data'->>'assignee','') is not null
            and not exists (
              select 1 from public.crm_members m
              where m.org_id=target_org and m.user_id=(r->'data'->>'assignee')::uuid
            )
          then jsonb_set(r->'data','{assignee}','""'::jsonb)
          else r->'data'
        end,
        nullif(r->>'created_at','')::timestamptz,
        nullif(r->>'updated_at','')::timestamptz,
        greatest(coalesce(nullif(r->>'version','')::integer,1),1)
 from jsonb_array_elements(payload->'records') r;

 if exists(select 1 from pg_temp.crm_import_rows group by id having count(*)>1)
   then raise exception 'duplicate_import_ids'; end if;
 -- Existing rows in this workspace are kept as-is and treated as already available
 -- parents. A UUID collision with another workspace is still rejected.
 if exists(
   select 1 from public.crm_records e
   join pg_temp.crm_import_rows i on i.id=e.id
   where e.org_id<>target_org
 ) then raise exception 'import_id_conflict'; end if;
 update pg_temp.crm_import_rows i set inserted=true
 where exists(
   select 1 from public.crm_records e
   where e.id=i.id and e.org_id=target_org
 );
 if exists(select 1 from pg_temp.crm_import_rows where id=parent_id)
   then raise exception 'invalid_parent'; end if;

 -- Insert parents before children so the composite foreign key remains valid.
 loop
   insert into public.crm_records(id,org_id,kind,parent_id,data,created_at,updated_at,version)
   select i.id,target_org,i.kind,i.parent_id,i.data,
          coalesce(i.created_at,now()),coalesce(i.updated_at,now()),i.version
   from pg_temp.crm_import_rows i
   where not i.inserted
     and (i.parent_id is null or exists(
       select 1 from public.crm_records p
       where p.id=i.parent_id and p.org_id=target_org
     ) or exists(
       select 1 from pg_temp.crm_import_rows p
       where p.id=i.parent_id and p.inserted
     ));
   get diagnostics inserted_now = row_count;
   if inserted_now > 0 then
     update pg_temp.crm_import_rows i set inserted=true
     where not i.inserted and exists(
       select 1 from public.crm_records r
       where r.id=i.id and r.org_id=target_org
     );
     imported := imported + inserted_now;
   end if;
   exit when not exists(select 1 from pg_temp.crm_import_rows where not inserted)
          or inserted_now=0;
 end loop;

 if exists(select 1 from pg_temp.crm_import_rows where not inserted)
   then raise exception 'invalid_parent'; end if;
 return jsonb_build_object('imported',imported);
end $$;

revoke all on function public.crm_import_backup(jsonb) from public,anon;
grant execute on function public.crm_import_backup(jsonb) to authenticated;

commit;
