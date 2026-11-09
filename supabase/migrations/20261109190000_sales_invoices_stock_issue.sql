alter table public.crm_records drop constraint if exists crm_records_kind_check;
alter table public.crm_records add constraint crm_records_kind_check
check (kind = any (array['companies','contacts','deals','tasks','activities','notes','products','proformas','invoices','automations','stock_movements','forecasts']::text[]));

create or replace function public.crm_issue_invoice(invoice_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  inv public.crm_records;
  p public.crm_records;
  qty numeric;
  after_stock numeric;
  prefix text;
  next_no integer;
  invoice_no text;
  updated_data jsonb;
  product_ids uuid[];
begin
  if auth.uid() is null then raise exception 'unauthenticated'; end if;
  select * into inv from public.crm_records where id=invoice_id and kind='invoices' for update;
  if inv.id is null or coalesce(public.crm_role(inv.org_id),'') not in ('admin','sales') then raise exception 'forbidden'; end if;
  if coalesce(inv.data->>'invoice_status','draft') <> 'draft' then raise exception 'invoice_not_draft'; end if;
  if jsonb_typeof(inv.data->'items') <> 'array' or jsonb_array_length(coalesce(inv.data->'items','[]'::jsonb))=0 then raise exception 'invoice_empty'; end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(inv.org_id::text,0));
  prefix := 'INV-' || to_char(current_date,'YYYY') || '-';
  select coalesce(max(substring(data->>'invoice_number' from length(prefix)+1)::integer),0)+1 into next_no
  from public.crm_records
  where org_id=inv.org_id and kind='invoices'
    and data->>'invoice_number' like prefix || '%'
    and substring(data->>'invoice_number' from length(prefix)+1) ~ '^[0-9]+$';
  invoice_no := prefix || lpad(next_no::text,4,'0');

  select array_agg(distinct (item->>'product_id')::uuid order by (item->>'product_id')::uuid)
  into product_ids from jsonb_array_elements(inv.data->'items') item;
  if coalesce(array_length(product_ids,1),0)=0 then raise exception 'invoice_empty'; end if;

  for p in
    select * from public.crm_records
    where org_id=inv.org_id and kind='products' and id=any(product_ids)
    order by id for update
  loop
    if coalesce(p.data->>'status','')<>'active' or coalesce((p.data->>'archived')::boolean,false) then
      raise exception 'invoice_inactive_product:%',p.data->>'name';
    end if;
    select coalesce(sum((item->>'quantity')::numeric),0) into qty
    from jsonb_array_elements(inv.data->'items') item
    where (item->>'product_id')::uuid=p.id;
    if qty<=0 or round(qty,2)<>qty then raise exception 'invoice_invalid_quantity'; end if;
    after_stock:=coalesce((p.data->>'stock')::numeric,0)-qty;
    if after_stock<0 then raise exception 'invoice_insufficient_stock:%:%:%',p.data->>'name',coalesce((p.data->>'stock')::numeric,0),qty; end if;
    update public.crm_records set data=jsonb_set(data,'{stock}',to_jsonb(after_stock)),version=version+1,updated_at=now() where id=p.id;
    insert into public.crm_records(org_id,kind,parent_id,data)
    values(inv.org_id,'stock_movements',p.id,jsonb_build_object(
      'name',p.data->>'name','unit',coalesce(p.data->>'unit','عدد'),
      'movement_type','out','movement_quantity',-qty,'stock_after',after_stock,
      'movement_reference',invoice_no,'description','خروج خودکار بابت صدور فاکتور فروش '||invoice_no));
  end loop;
  if (select count(*) from public.crm_records where org_id=inv.org_id and kind='products' and id=any(product_ids))<>cardinality(product_ids) then
    raise exception 'invoice_product_missing';
  end if;

  updated_data:=jsonb_set(jsonb_set(jsonb_set(inv.data,'{invoice_status}','"issued"'::jsonb,true),'{invoice_number}',to_jsonb(invoice_no),true),'{issued_at}',to_jsonb(now()),true);
  update public.crm_records set data=updated_data,version=version+1,updated_at=now() where id=inv.id returning * into inv;
  insert into public.crm_audit(org_id,record_id,actor_id,action,label)
  values(inv.org_id,inv.id,auth.uid(),'UPDATE','صدور فاکتور فروش '||invoice_no);
  return to_jsonb(inv);
end;
$$;

revoke all on function public.crm_issue_invoice(uuid) from public;
revoke all on function public.crm_issue_invoice(uuid) from anon;
grant execute on function public.crm_issue_invoice(uuid) to authenticated;
