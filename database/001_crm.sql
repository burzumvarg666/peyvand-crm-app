-- Run once in the Supabase SQL editor on a new project. Transactional migration.
begin;
create table public.crm_orgs(id uuid primary key default gen_random_uuid(),name text not null check(length(name) between 1 and 100),created_at timestamptz not null default now());
create table public.crm_members(org_id uuid not null references public.crm_orgs(id) on delete cascade,user_id uuid not null references auth.users(id) on delete cascade,email text not null,role text not null check(role in ('admin','sales','viewer')),primary key(org_id,user_id),unique(user_id));
create table public.crm_invites(id uuid primary key default gen_random_uuid(),org_id uuid not null references public.crm_orgs(id) on delete cascade,email text not null check(email=lower(email) and length(email)<=254),role text not null check(role in ('sales','viewer')),created_at timestamptz not null default now(),unique(email));
create table public.crm_records(id uuid primary key default gen_random_uuid(),org_id uuid not null references public.crm_orgs(id) on delete cascade,kind text not null check(kind in ('companies','contacts','deals','tasks','notes')),parent_id uuid,data jsonb not null,version integer not null default 1,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(org_id,id),foreign key(org_id,parent_id) references public.crm_records(org_id,id) on delete set null (parent_id),check(id is distinct from parent_id),check(jsonb_typeof(data)='object'),check(length(data->>'name') between 1 and 160),check(data ? 'name'),check((data->>'amount')::numeric >=0 and (data->>'amount')::numeric <=1e15),check(data->>'stage' in ('lead','qualified','proposal','negotiation','won','lost')),check(data->>'priority' in ('low','normal','high')),check(length(coalesce(data->>'description',''))<=10000));
create index crm_records_org_kind on public.crm_records(org_id,kind,created_at desc,id);
create index crm_records_parent on public.crm_records(org_id,parent_id);
create table public.crm_audit(id uuid primary key default gen_random_uuid(),org_id uuid not null references public.crm_orgs(id) on delete cascade,record_id uuid not null,actor_id uuid,action text not null,label text not null,created_at timestamptz not null default now());
create index crm_audit_org_time on public.crm_audit(org_id,created_at desc);
create function public.crm_role(target_org uuid) returns text language sql stable security definer set search_path='' as $$ select role from public.crm_members where org_id=target_org and user_id=(select auth.uid()) $$;
revoke all on function public.crm_role(uuid) from public;grant execute on function public.crm_role(uuid) to authenticated;
alter table public.crm_orgs enable row level security;
alter table public.crm_members enable row level security;
alter table public.crm_invites enable row level security;
alter table public.crm_records enable row level security;
alter table public.crm_audit enable row level security;
create policy org_read on public.crm_orgs for select to authenticated using(public.crm_role(id) is not null);
create policy members_read on public.crm_members for select to authenticated using(public.crm_role(org_id) is not null);
create policy invites_admin on public.crm_invites for all to authenticated using(public.crm_role(org_id)='admin') with check(public.crm_role(org_id)='admin');
create policy records_read on public.crm_records for select to authenticated using(public.crm_role(org_id) is not null);
create policy records_insert on public.crm_records for insert to authenticated with check(public.crm_role(org_id) in ('admin','sales'));
create policy records_update on public.crm_records for update to authenticated using(public.crm_role(org_id) in ('admin','sales')) with check(public.crm_role(org_id) in ('admin','sales'));
create policy records_delete on public.crm_records for delete to authenticated using(public.crm_role(org_id) in ('admin','sales'));
create policy audit_read on public.crm_audit for select to authenticated using(public.crm_role(org_id) is not null);
revoke all on public.crm_orgs,public.crm_members,public.crm_records,public.crm_invites,public.crm_audit from anon,authenticated;
grant select on public.crm_orgs,public.crm_members,public.crm_audit to authenticated;
grant select,insert,update,delete on public.crm_records to authenticated;
grant select,insert,delete on public.crm_invites to authenticated;
create function public.crm_create_workspace(workspace_name text) returns uuid language plpgsql security definer set search_path='' as $$
declare new_id uuid; user_email text;
begin
 if auth.uid() is null then raise exception 'unauthenticated'; end if;
 -- Serializes simultaneous workspace creation and invitation claims for this user.
 perform 1 from auth.users where id=auth.uid() for update;
 if exists(select 1 from public.crm_members where user_id=auth.uid()) then raise exception 'already_member'; end if;
 select email into user_email from auth.users where id=auth.uid() and email_confirmed_at is not null;
 if user_email is null then raise exception 'email_not_verified'; end if;
 if exists(select 1 from public.crm_invites where email=lower(user_email)) then raise exception 'invitation_pending'; end if;
 insert into public.crm_orgs(name) values(trim(workspace_name)) returning id into new_id;
 insert into public.crm_members(org_id,user_id,email,role) values(new_id,auth.uid(),user_email,'admin');
 return new_id;
end $$;
create function public.crm_accept_invites() returns void language plpgsql security definer set search_path='' as $$
declare invitation public.crm_invites; user_email text;
begin
 if auth.uid() is null then raise exception 'unauthenticated'; end if;
 perform 1 from auth.users where id=auth.uid() for update;
 if exists(select 1 from public.crm_members where user_id=auth.uid()) then return; end if;
 select email into user_email from auth.users where id=auth.uid() and email_confirmed_at is not null;
 if user_email is null then return; end if;
 select * into invitation from public.crm_invites where email=lower(user_email) for update;
 if invitation.id is not null then
 insert into public.crm_members(org_id,user_id,email,role) values(invitation.org_id,auth.uid(),user_email,invitation.role);
 delete from public.crm_invites where id=invitation.id;
 end if;
end $$;
revoke all on function public.crm_create_workspace(text),public.crm_accept_invites() from public;
grant execute on function public.crm_create_workspace(text),public.crm_accept_invites() to authenticated;
create function public.crm_validate_record() returns trigger language plpgsql set search_path='' as $$
declare parent_kind text;
begin
 if TG_OP='UPDATE' then
 if NEW.org_id is distinct from OLD.org_id or NEW.kind is distinct from OLD.kind or NEW.id is distinct from OLD.id then raise exception 'immutable_identity'; end if;
 NEW.version=OLD.version+1;NEW.created_at=OLD.created_at;
 else NEW.version=1;NEW.created_at=now(); end if;
 NEW.updated_at=now();
 if NEW.kind='companies' and NEW.parent_id is not null then raise exception 'invalid_parent'; end if;
 if NEW.parent_id is not null then
 select kind into parent_kind from public.crm_records where id=NEW.parent_id and org_id=NEW.org_id;
 if parent_kind is null or parent_kind='notes' or (NEW.kind<>'notes' and parent_kind<>'companies') then raise exception 'invalid_parent'; end if;
 end if;
 if NEW.kind='tasks' and coalesce(NEW.data->>'status','') not in ('open','done') then raise exception 'invalid_status'; end if;
 if NEW.kind in ('companies','contacts') and coalesce(NEW.data->>'status','') not in ('active','lead','inactive') then raise exception 'invalid_status'; end if;
 if nullif(NEW.data->>'assignee','') is not null and not exists(select 1 from public.crm_members where org_id=NEW.org_id and user_id=(NEW.data->>'assignee')::uuid) then raise exception 'invalid_assignee'; end if;
 return NEW;
end $$;
create trigger crm_record_validate before insert or update on public.crm_records for each row execute function public.crm_validate_record();
create function public.crm_log_change() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if TG_OP='DELETE' then
 insert into public.crm_audit(org_id,record_id,actor_id,action,label) values(OLD.org_id,OLD.id,auth.uid(),TG_OP,OLD.data->>'name');return OLD;
 end if;
 insert into public.crm_audit(org_id,record_id,actor_id,action,label) values(NEW.org_id,NEW.id,auth.uid(),TG_OP,NEW.data->>'name');return NEW;
end $$;
revoke all on function public.crm_log_change(),public.crm_validate_record() from public;
create trigger crm_record_audit after insert or update or delete on public.crm_records for each row execute function public.crm_log_change();
commit;
