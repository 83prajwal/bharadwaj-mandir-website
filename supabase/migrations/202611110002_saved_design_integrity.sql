-- Execute the complete file as one migration/script. Supabase migration runners
-- wrap each migration in a transaction; explicit BEGIN/COMMIT here would break
-- that wrapper and could leave schema changes without matching migration history.
-- Preflight before making schema changes. Nothing in this migration deletes or
-- rewrites customer/design rows. Unique-index creation is stopped if existing
-- rows violate the requested constraints.
do $migration$
declare
  duplicate_value text;
  child_column smallint;
  parent_column smallint;
  customer_fk record;
  customer_fk_count integer;
  existing_index record;
begin
  if to_regclass('public.customer_profiles') is null
     or to_regclass('public.saved_designs') is null then
    raise exception 'Migration blocked: expected customer_profiles and saved_designs tables were not found in public.';
  end if;

  select share_token_hash into duplicate_value
  from public.saved_designs
  where share_token_hash is not null
  group by share_token_hash
  having count(*) > 1
  limit 1;
  if found then
    raise exception 'Migration blocked: duplicate non-null share_token_hash values exist. Review and resolve them without deleting customer data, then retry.';
  end if;

  select legacy_design_id into duplicate_value
  from public.saved_designs
  where legacy_design_id is not null
  group by legacy_design_id
  having count(*) > 1
  limit 1;
  if found then
    raise exception 'Migration blocked: duplicate non-null legacy_design_id values exist. Review ownership links without deleting customer data, then retry.';
  end if;

  for existing_index in
    select index_class.relname, index_data.indexrelid, index_data.indrelid,
           index_data.indisunique, index_data.indisready, index_data.indisvalid,
           index_data.indpred, index_data.indnkeyatts, access_method.amname,
           pg_get_indexdef(index_data.indexrelid, 1, true) as indexed_column,
           pg_get_expr(index_data.indpred, index_data.indrelid) as predicate
    from pg_index index_data
    join pg_class index_class on index_class.oid = index_data.indexrelid
    join pg_namespace index_schema on index_schema.oid = index_class.relnamespace
    join pg_am access_method on access_method.oid = index_class.relam
    where index_schema.nspname = 'public'
      and index_class.relname in (
        'saved_designs_share_token_hash_uidx',
        'saved_designs_legacy_design_id_uidx'
      )
  loop
    if existing_index.relname = 'saved_designs_share_token_hash_uidx'
       and (existing_index.indrelid <> 'public.saved_designs'::regclass
         or not existing_index.indisunique
         or not existing_index.indisready
         or not existing_index.indisvalid
         or existing_index.amname <> 'btree'
         or existing_index.indpred is null
         or existing_index.indnkeyatts <> 1
         or existing_index.indexed_column <> 'share_token_hash'
         or regexp_replace(existing_index.predicate, '[()]', '', 'g') <> 'share_token_hash IS NOT NULL') then
      raise exception 'Migration blocked: saved_designs_share_token_hash_uidx exists with an unexpected definition. Inspect it before retrying.';
    end if;
    if existing_index.relname = 'saved_designs_legacy_design_id_uidx'
       and (existing_index.indrelid <> 'public.saved_designs'::regclass
         or not existing_index.indisunique
         or not existing_index.indisready
         or not existing_index.indisvalid
         or existing_index.amname <> 'btree'
         or existing_index.indpred is null
         or existing_index.indnkeyatts <> 1
         or existing_index.indexed_column <> 'legacy_design_id'
         or regexp_replace(existing_index.predicate, '[()]', '', 'g') <> 'legacy_design_id IS NOT NULL') then
      raise exception 'Migration blocked: saved_designs_legacy_design_id_uidx exists with an unexpected definition. Inspect it before retrying.';
    end if;
  end loop;

  select attnum into child_column
  from pg_attribute
  where attrelid = 'public.saved_designs'::regclass
    and attname = 'customer_id'
    and not attisdropped;
  select attnum into parent_column
  from pg_attribute
  where attrelid = 'public.customer_profiles'::regclass
    and attname = 'id'
    and not attisdropped;

  select count(*) into customer_fk_count
  from pg_constraint
  where conrelid = 'public.saved_designs'::regclass
    and contype = 'f'
    and child_column = any(conkey);
  if customer_fk_count <> 1 then
    raise exception 'Migration blocked: saved_designs has an unexpected number of foreign keys involving customer_id. Inspect them before changing constraints.';
  end if;

  select conname, conkey, confkey, confrelid, confdeltype
  into customer_fk
  from pg_constraint
  where conrelid = 'public.saved_designs'::regclass
    and conname = 'saved_designs_customer_id_fkey'
    and contype = 'f';

  if not found then
    raise exception 'Migration blocked: expected saved_designs_customer_id_fkey was not found. Inspect the current foreign keys before changing them.';
  end if;
  if customer_fk.conkey <> array[child_column]::smallint[]
     or customer_fk.confkey <> array[parent_column]::smallint[]
     or customer_fk.confrelid <> 'public.customer_profiles'::regclass
     or customer_fk.confdeltype not in ('a', 'c', 'r') then
    raise exception 'Migration blocked: saved_designs_customer_id_fkey has an unexpected definition. Inspect it before changing it.';
  end if;
end;
$migration$;

create unique index if not exists saved_designs_share_token_hash_uidx
  on public.saved_designs (share_token_hash)
  where share_token_hash is not null;

create unique index if not exists saved_designs_legacy_design_id_uidx
  on public.saved_designs (legacy_design_id)
  where legacy_design_id is not null;

create or replace function public.set_updated_at_if_unchanged()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if new.updated_at is not distinct from old.updated_at then
    new.updated_at := clock_timestamp();
  end if;
  return new;
end;
$$;

drop trigger if exists customer_profiles_set_updated_at
  on public.customer_profiles;
create trigger customer_profiles_set_updated_at
before update on public.customer_profiles
for each row
execute function public.set_updated_at_if_unchanged();

drop trigger if exists saved_designs_set_updated_at
  on public.saved_designs;
create trigger saved_designs_set_updated_at
before update on public.saved_designs
for each row
execute function public.set_updated_at_if_unchanged();

do $migration$
declare
  delete_action "char";
begin
  select confdeltype into delete_action
  from pg_constraint
  where conrelid = 'public.saved_designs'::regclass
    and conname = 'saved_designs_customer_id_fkey'
    and contype = 'f';

  if not found then
    raise exception 'Migration blocked: saved_designs_customer_id_fkey changed after preflight.';
  end if;

  if delete_action <> 'r' then
    execute 'alter table public.saved_designs drop constraint saved_designs_customer_id_fkey';
    execute 'alter table public.saved_designs add constraint saved_designs_customer_id_fkey foreign key (customer_id) references public.customer_profiles (id) on delete restrict';
  end if;
end;
$migration$;
