begin;

do $migration$
declare
  existing_type text;
begin
  if to_regclass('public.saved_designs') is null then
    raise exception 'Migration blocked: public.saved_designs was not found.';
  end if;

  select data_type into existing_type
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'saved_designs'
    and column_name = 'design_metadata';

  if found and existing_type <> 'jsonb' then
    raise exception 'Migration blocked: public.saved_designs.design_metadata already exists with a non-JSONB type. Inspect it before retrying.';
  end if;
end;
$migration$;

alter table public.saved_designs
  add column if not exists design_metadata jsonb null;

commit;
