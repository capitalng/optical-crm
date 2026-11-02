begin;

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'visits'
      and column_name = 'warranty_start_date'
  ) then
    alter table public.visits add column warranty_start_date date;
    update public.visits
      set warranty_start_date = coalesce(visit_date, (created_at at time zone 'Asia/Kuala_Lumpur')::date)
      where warranty_followup;
  end if;
end;
$$;

create index if not exists visits_warranty_history
  on public.visits (warranty_start_date, id)
  where warranty_followup and deleted_at is null;

create or replace function public.warranty_followups_v2()
returns table (
  visit_id uuid, customer_id uuid, customer_name text, customer_phone text,
  customer_tags text[], ref_no text, visit_date date,
  warranty_start_date date, warranty_contacted_at timestamptz,
  warranty_note text, total_rm numeric, items text
)
language sql stable security invoker
set search_path = public
as $$
  select v.id, c.id, c.name, c.phone, c.tags, c.ref_no, v.visit_date,
    v.warranty_start_date, v.warranty_contacted_at, v.warranty_note, v.total_rm,
    (
      select string_agg(
        coalesce(nullif(btrim(concat_ws(' ', i.brand, coalesce(i.model, i.description))), ''),
          initcap(replace(i.item_type, '_', ' '))), ', ' order by i.created_at, i.id)
      from public.visit_items i where i.visit_id = v.id
    )
  from public.visits v
  join public.customers c on c.id = v.customer_id
  where v.deleted_at is null and c.deleted_at is null and v.warranty_followup
  order by v.warranty_start_date asc nulls first, v.id
$$;

revoke all on function public.warranty_followups_v2() from public, anon;
grant execute on function public.warranty_followups_v2() to authenticated;

notify pgrst, 'reload schema';
commit;
