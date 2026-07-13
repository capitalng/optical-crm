-- Patch v2 (2026-07-12): auto-generated ref numbers (YYMM-NNNN) + smart search
-- with combinable birthday filter.
-- Run the WHOLE file once in the Supabase SQL Editor. Safe to re-run.
-- Fresh projects using the current schema.sql do NOT need this.

-- ------------------------------------------------------------
-- Auto ref no: "YYMM-NNNN" (e.g. 2607-0001), a per-month counter.
-- Assigned only when a NEW customer is saved with a blank ref;
-- migrated legacy rows (they carry legacy_id/legacy_key) and
-- hand-typed refs are never touched.
-- ------------------------------------------------------------
drop trigger if exists customers_assign_ref on public.customers;
drop function if exists public.assign_ref_no();
drop function if exists public.next_ref_no();
drop table if exists public.ref_counters;

create table public.ref_counters (
  period int primary key,  -- e.g. 2607 = July 2026
  last_n int not null
);

-- No policies on purpose: only the security-definer function below writes it.
alter table public.ref_counters enable row level security;

create or replace function public.next_ref_no()
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  y int := (extract(year from now())::int) % 100;
  m int := extract(month from now())::int;
  n int;
begin
  insert into ref_counters as rc (period, last_n) values (y * 100 + m, 1)
  on conflict (period) do update set last_n = rc.last_n + 1
  returning rc.last_n into n;
  return lpad(y::text, 2, '0') || lpad(m::text, 2, '0') || '-'
         || lpad(n::text, greatest(4, length(n::text)), '0');
end;
$$;

create or replace function public.assign_ref_no()
returns trigger
language plpgsql
as $$
begin
  if (new.ref_no is null or btrim(new.ref_no) = '')
     and new.legacy_key is null and new.legacy_id is null then
    new.ref_no := public.next_ref_no();
  end if;
  return new;
end;
$$;

create trigger customers_assign_ref
  before insert on public.customers
  for each row execute function public.assign_ref_no();

-- ------------------------------------------------------------
-- Smart search v2: one query across name (exact substring AND
-- fuzzy/misspelled via pg_trgm), phone digits, ref prefix, and
-- IC digits — plus an optional birthday that narrows the results
-- (matches the dob field OR the birth date encoded in the IC).
-- q may be empty to search by birthday alone.
-- Runs with the caller's rights, so Row Level Security applies.
-- ------------------------------------------------------------
drop function if exists public.search_customers(text, int);
drop function if exists public.search_customers(text, date, int);

create function public.search_customers(q text, bday date default null, max_rows int default 50)
returns setof public.customers
language sql stable
as $$
  select c.*
  from public.customers c
  where c.deleted_at is null
    and (
      q is null or btrim(q) = ''
      or c.name ilike '%' || q || '%'
      or c.ref_no ilike q || '%'
      or (
        length(regexp_replace(q, '\D', '', 'g')) >= 4
        and c.phone_digits like '%' || regexp_replace(q, '\D', '', 'g') || '%'
      )
      or (
        length(regexp_replace(q, '\D', '', 'g')) >= 6
        and regexp_replace(coalesce(c.ic, ''), '\D', '', 'g')
            like regexp_replace(q, '\D', '', 'g') || '%'
      )
      or c.name % q
    )
    and (
      bday is null
      or c.dob = bday
      or c.ic like to_char(bday, 'YYMMDD') || '%'
    )
  order by
    (c.name ilike '%' || q || '%') desc,
    similarity(c.name, q) desc nulls last,
    c.name
  limit max_rows
$$;
