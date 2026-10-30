-- Keep former members for history and assignments, while denying their access.
alter table public.crm_members add column if not exists active boolean not null default true;
create table if not exists crm_private.membership_audit (
 id bigint generated always as identity primary key,
 org_id uuid not null, actor_id uuid not null, target_id uuid not null,
 old_role text not null, new_role text not null, old_active boolean not null, new_active boolean not null,
 created_at timestamptz not null default now()
);
alter table crm_private.membership_audit enable row level security;
revoke all on crm_private.membership_audit from public, anon, authenticated;
create or replace function public.crm_role(target_org uuid) returns text language sql stable security definer set search_path='' as $$
 select role from public.crm_members where org_id=target_org and user_id=(select auth.uid()) and active and not exists(select 1 from crm_private.access where user_id=(select auth.uid()) and (disabled or expires_on<current_date))
$$;
create or replace function public.crm_access_status() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('platformAdmin',exists(select 1 from crm_private.owners where user_id=auth.uid()),'allowed',auth.uid() is not null and not exists(select 1 from crm_private.access where user_id=auth.uid() and (disabled or expires_on<current_date)) and not exists(select 1 from public.crm_members where user_id=auth.uid() and not active));
$$;
create or replace function public.crm_set_member_access(target_user uuid, new_role text, new_active boolean) returns void language plpgsql security definer set search_path='' as $$
declare target_org uuid; old_member public.crm_members;
begin
 if auth.uid() is null or target_user is null or new_role is null or new_role not in ('admin','sales','viewer') or new_active is null then raise insufficient_privilege; end if;
 select org_id into target_org from public.crm_members where user_id=auth.uid();
 if target_org is null then raise insufficient_privilege; end if;
 perform 1 from public.crm_orgs where id=target_org for update;
 if coalesce(public.crm_role(target_org),'') <> 'admin' or target_user=auth.uid() then raise insufficient_privilege; end if;
 select * into old_member from public.crm_members where org_id=target_org and user_id=target_user for update;
 if old_member.user_id is null or exists(select 1 from crm_private.owners where user_id=target_user) then raise insufficient_privilege; end if;
 if old_member.role='admin' and old_member.active and (new_role<>'admin' or not new_active) and not exists(select 1 from public.crm_members where org_id=target_org and user_id<>target_user and role='admin' and active and not exists(select 1 from crm_private.access a where a.user_id=crm_members.user_id and (a.disabled or a.expires_on<current_date))) then raise exception 'last_admin'; end if;
 if old_member.role=new_role and old_member.active=new_active then return; end if;
 update public.crm_members set role=new_role,active=new_active where org_id=target_org and user_id=target_user;
 insert into crm_private.membership_audit(org_id,actor_id,target_id,old_role,new_role,old_active,new_active) values(target_org,auth.uid(),target_user,old_member.role,new_role,old_member.active,new_active);
end $$;
revoke all on function public.crm_set_member_access(uuid,text,boolean) from public,anon;
grant execute on function public.crm_set_member_access(uuid,text,boolean) to authenticated;
