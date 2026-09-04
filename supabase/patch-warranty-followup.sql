-- Patch (2026-08-29): warranty follow-up list.
-- Some products carry a warranty, and the shop wants to contact the buyer
-- within 6 months of the purchase. Flagging a visit puts that customer on a
-- working list straight away; they leave it when staff mark them contacted,
-- or automatically once the 6 months are up.
-- Run once in the Supabase SQL Editor. Safe to re-run.

alter table public.visits add column if not exists warranty_followup boolean not null default false;
alter table public.visits add column if not exists warranty_note text;
alter table public.visits add column if not exists warranty_contacted_at timestamptz;

-- Only the flagged, not-yet-contacted visits are indexed, so the list stays
-- fast against the full ~24k visit history.
create index if not exists visits_warranty_followup
  on public.visits (visit_date)
  where warranty_followup and warranty_contacted_at is null and deleted_at is null;

-- ------------------------------------------------------------
-- Customers still inside their warranty follow-up window, most
-- urgent (closest to expiry) first. The clock starts at the visit
-- date, falling back to when the record was created.
-- Runs with the caller's rights, so row level security still applies.
-- ------------------------------------------------------------
drop function if exists public.warranty_followups(int);

create function public.warranty_followups(window_days int default 180)
returns table (
  visit_id       uuid,
  customer_id    uuid,
  customer_name  text,
  customer_phone text,
  customer_tags  text[],
  ref_no         text,
  visit_date     date,
  purchased_at   timestamptz,
  warranty_note  text,
  total_rm       numeric,
  items          text
)
language sql stable
as $$
  select
    v.id, c.id, c.name, c.phone, c.tags, c.ref_no, v.visit_date,
    coalesce(v.visit_date::timestamptz, v.created_at) as purchased_at,
    v.warranty_note,
    v.total_rm,
    (
      select string_agg(
               coalesce(nullif(btrim(concat_ws(' ', i.brand, coalesce(i.model, i.description))), ''),
                        initcap(replace(i.item_type, '_', ' '))),
               ', ' order by i.created_at)
      from public.visit_items i
      where i.visit_id = v.id
    ) as items
  from public.visits v
  join public.customers c on c.id = v.customer_id
  where v.deleted_at is null
    and c.deleted_at is null
    and v.warranty_followup
    and v.warranty_contacted_at is null
    and coalesce(v.visit_date::timestamptz, v.created_at)
        > now() - make_interval(days => window_days)
  -- repeated rather than "order by purchased_at": that name is also a declared
  -- output column, which Postgres would treat as an ambiguous reference.
  order by coalesce(v.visit_date::timestamptz, v.created_at)
$$;
