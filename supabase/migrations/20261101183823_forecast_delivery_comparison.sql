-- Extend monthly forecasts without changing customer scope, audit or existing month values.
create or replace function public.crm_validate_forecast() returns trigger language plpgsql set search_path='' as $$
declare item jsonb; product uuid; field text; has_value boolean:=false;
begin
 if new.kind<>'forecasts' then return new;end if;
 if new.parent_id is null or not exists(select 1 from public.crm_records where id=new.parent_id and org_id=new.org_id and kind='companies') then raise exception 'invalid_forecast_customer';end if;
 begin product=(new.data->>'forecast_product_id')::uuid;exception when invalid_text_representation then raise exception 'invalid_forecast_product';end;
 if product is null or not exists(select 1 from public.crm_records where id=product and org_id=new.org_id and kind='products') then raise exception 'invalid_forecast_product';end if;
 new.data=jsonb_set(new.data,'{forecast_product_id}',to_jsonb(product::text));
 if tg_op='UPDATE' and (new.parent_id is distinct from old.parent_id or new.data->>'forecast_product_id' is distinct from old.data->>'forecast_product_id') then raise exception 'immutable_forecast_pair';end if;
 if coalesce(jsonb_typeof(new.data->'forecast_months'),'')<>'array' then raise exception 'invalid_forecast_months';end if;
 if jsonb_array_length(new.data->'forecast_months') not between 1 and 240 then raise exception 'invalid_forecast_months';end if;
 for item in select value from jsonb_array_elements(new.data->'forecast_months') loop
  if jsonb_typeof(item)<>'object' then raise exception 'invalid_forecast_months';end if;
  if not (item ?& array['month','quantity','amount']) or exists(select 1 from jsonb_object_keys(item) k where k not in ('month','quantity','amount','basis','production','consumption','actual_quantity')) or jsonb_typeof(item->'month')<>'string' or item->>'month'!~'^(20[0-9]{2}|21[0-9]{2})-(0[1-9]|1[0-2])$' then raise exception 'invalid_forecast_months';end if;
  if item?'basis' and (jsonb_typeof(item->'basis') is distinct from 'string' or item->>'basis' not in ('forecast','otm')) then raise exception 'invalid_forecast_values';end if;
  foreach field in array array['production','consumption','actual_quantity'] loop
   if item?field then
    if jsonb_typeof(item->field) not in ('number','null') then raise exception 'invalid_forecast_values';end if;
    if jsonb_typeof(item->field)='number' then
     if (item->>field)::numeric<0 or (item->>field)::numeric>1e12 then raise exception 'invalid_forecast_values';end if;
     if field='actual_quantity' then has_value=true;end if;
    end if;
   end if;
  end loop;
  if jsonb_typeof(item->'quantity') not in ('number','null') or jsonb_typeof(item->'amount') not in ('number','null') then raise exception 'invalid_forecast_values';end if;
  if jsonb_typeof(item->'quantity')='number' then
   if (item->>'quantity')::numeric<0 or (item->>'quantity')::numeric>1e12 then raise exception 'invalid_forecast_values';end if;has_value=true;
  end if;
  if jsonb_typeof(item->'amount')='number' then
   if (item->>'amount')::numeric<0 or (item->>'amount')::numeric>1e15 then raise exception 'invalid_forecast_values';end if;has_value=true;
  end if;
 end loop;
 if (not has_value and coalesce(new.data->>'forecast_import_key','')='') or exists(select 1 from jsonb_array_elements(new.data->'forecast_months') m group by m->>'month' having count(*)>1) then raise exception 'invalid_forecast_months';end if;
 return new;
end $$;
revoke all on function public.crm_validate_forecast() from public,anon,authenticated;
