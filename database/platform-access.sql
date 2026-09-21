-- Access administration; existing users remain active until explicitly changed.
create schema if not exists crm_private;
revoke all on schema crm_private from public, anon, authenticated;
create table crm_private.owners(user_id uuid primary key references auth.users(id));
create table crm_private.access(user_id uuid primary key references auth.users(id), disabled boolean not null default false, expires_on date, updated_at timestamptz not null default now());
create table crm_private.access_audit(id bigint generated always as identity primary key,actor uuid not null,target uuid not null,before_value jsonb,after_value jsonb,created_at timestamptz not null default now());
alter table crm_private.owners enable row level security;
alter table crm_private.access enable row level security;
alter table crm_private.access_audit enable row level security;
insert into crm_private.owners(user_id) select id from auth.users where lower(email)='beelzebublord6@gmail.com' and email_confirmed_at is not null;
create or replace function public.crm_access_status() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('platformAdmin',exists(select 1 from crm_private.owners where user_id=auth.uid()),'allowed',auth.uid() is not null and not exists(select 1 from crm_private.access where user_id=auth.uid() and (disabled or expires_on<current_date)));
$$;
revoke all on function public.crm_access_status() from public,anon;
grant execute on function public.crm_access_status() to authenticated;
create or replace function public.crm_role(target_org uuid) returns text language sql stable security definer set search_path='' as $$
 select role from public.crm_members where org_id=target_org and user_id=(select auth.uid()) and not exists(select 1 from crm_private.access where user_id=(select auth.uid()) and (disabled or expires_on<current_date))
$$;
create or replace function public.crm_platform_users() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not exists(select 1 from crm_private.owners where user_id=auth.uid()) then raise insufficient_privilege; end if;
 return (select coalesce(jsonb_agg(jsonb_build_object('id',u.id,'email',u.email,'created_at',u.created_at,'confirmed',u.email_confirmed_at is not null,'disabled',coalesce(a.disabled,false),'expires_on',a.expires_on,'owner',exists(select 1 from crm_private.owners o where o.user_id=u.id),'workspaces',(select coalesce(jsonb_agg(jsonb_build_object('name',o.name,'role',m.role)),'[]'::jsonb) from public.crm_members m join public.crm_orgs o on o.id=m.org_id where m.user_id=u.id)) order by u.created_at desc),'[]'::jsonb) from auth.users u left join crm_private.access a on a.user_id=u.id);
end $$;
create or replace function public.crm_platform_update(target_user uuid,disabled_value boolean,expires_value date) returns void language plpgsql security definer set search_path='' as $$
declare old jsonb;
begin
 if not exists(select 1 from crm_private.owners where user_id=auth.uid()) then raise insufficient_privilege; end if;
 if exists(select 1 from crm_private.owners where user_id=target_user) then raise exception 'owner_is_protected'; end if;
 perform 1 from auth.users where id=target_user for update;if not found then raise exception 'user_not_found';end if;
 select to_jsonb(a) into old from crm_private.access a where user_id=target_user;
 insert into crm_private.access(user_id,disabled,expires_on) values(target_user,disabled_value,expires_value) on conflict(user_id) do update set disabled=excluded.disabled,expires_on=excluded.expires_on,updated_at=now();
 insert into crm_private.access_audit(actor,target,before_value,after_value) values(auth.uid(),target_user,old,jsonb_build_object('disabled',disabled_value,'expires_on',expires_value));
end $$;
revoke all on function public.crm_platform_users() from public,anon;
revoke all on function public.crm_platform_update(uuid,boolean,date) from public,anon;
grant execute on function public.crm_platform_users() to authenticated;
grant execute on function public.crm_platform_update(uuid,boolean,date) to authenticated;
create or replace function public.crm_create_workspace(workspace_name text) returns uuid language plpgsql security definer set search_path='' as $$
declare new_id uuid; user_email text;
begin
 if auth.uid() is null then raise exception 'unauthenticated'; end if;
 if not (public.crm_access_status()->>'allowed')::boolean then raise insufficient_privilege;end if;
 perform 1 from auth.users where id=auth.uid() for update;
 if exists(select 1 from public.crm_members where user_id=auth.uid()) then raise exception 'already_member'; end if;
 select email into user_email from auth.users where id=auth.uid() and email_confirmed_at is not null;
 if user_email is null then raise exception 'email_not_verified'; end if;
 if exists(select 1 from public.crm_invites where email=lower(user_email)) then raise exception 'invitation_pending'; end if;
 insert into public.crm_orgs(name) values(trim(workspace_name)) returning id into new_id;
 insert into public.crm_members(org_id,user_id,email,role) values(new_id,auth.uid(),user_email,'admin');
 return new_id;
end $$;
