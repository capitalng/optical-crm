-- ============================================================
-- Optical CRM database schema (v2 — refined card format)
-- Run this once in the Supabase SQL Editor of a fresh project.
-- ============================================================

create extension if not exists pg_trgm;

-- ------------------------------------------------------------
-- Staff profiles (RBAC-ready: single superuser today, more
-- roles later by inserting rows — no schema change needed)
-- ------------------------------------------------------------
create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  email      text,
  role       text not null default 'superuser'
             check (role in ('superuser', 'staff', 'optometrist')),
  created_at timestamptz not null default now()
);

-- Auto-create a profile row whenever an auth user is created.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ------------------------------------------------------------
-- Customers
-- ref_no is deliberately NOT unique: 2,381 duplicate refs exist
-- in the legacy data (families sharing cards, reused numbers).
-- tags: labels shown beside the name (VIP / GENEROUS /
-- PROBLEMATIC are the presets; any custom text tag is allowed).
-- ------------------------------------------------------------
create table public.customers (
  id            uuid primary key default gen_random_uuid(),
  legacy_id     text,          -- "id" field from the old system
  legacy_key    text,          -- Firebase push key (for migration traceability)
  ref_no        text,
  name          text,
  phone         text,
  -- digits-only shadow of phone so "0167100143" matches "016-7100143 / ..."
  phone_digits  text generated always as (regexp_replace(coalesce(phone, ''), '\D', '', 'g')) stored,
  email         text,
  address       text,
  ic            text,
  occupation    text,
  dob           date,
  dominant_eye  text check (dominant_eye in ('L', 'R')),
  tags          text[] not null default '{}',
  notes         text,
  deleted_at    timestamptz,   -- soft delete: null = active
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index customers_name_trgm    on public.customers using gin (name gin_trgm_ops);
create index customers_phone_trgm   on public.customers using gin (phone_digits gin_trgm_ops);
create index customers_ref_no       on public.customers (ref_no);
create index customers_deleted_at   on public.customers (deleted_at) where deleted_at is not null;

-- ------------------------------------------------------------
-- Visits: one customer -> unlimited visit "lines" over time.
-- Each line = prescription + optometrist + date + purchases + total.
-- Optical values are lenient TEXT on purpose: staff write "PL",
-- "+1.50", "31/31", whatever the card would have held. Speed and
-- freedom of entry at the counter beat strict validation.
-- ------------------------------------------------------------
create table public.visits (
  id           uuid primary key default gen_random_uuid(),
  customer_id  uuid not null references public.customers (id) on delete cascade,
  visit_date   date,
  optometrist  text,
  r_sph text, r_cyl text, r_axis text, r_add text, r_va text, r_pd text,
  l_sph text, l_cyl text, l_axis text, l_add text, l_va text, l_pd text,
  discount     text,          -- as written by staff: "20", "RM20", "30%", …
  total_rm     numeric(10, 2),
  notes        text,
  deleted_at   timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index visits_customer on public.visits (customer_id, visit_date desc nulls last);

-- ------------------------------------------------------------
-- Purchase items: 0..n per visit. One flexible row type covers
-- frame / lens / contact lens / other — unused columns stay null.
-- quantity is text for freedom ("1 pair", "2 boxes").
-- price is numeric so the app can suggest the visit total.
-- ------------------------------------------------------------
create table public.visit_items (
  id          uuid primary key default gen_random_uuid(),
  visit_id    uuid not null references public.visits (id) on delete cascade,
  item_type   text not null check (item_type in ('frame', 'lens', 'contact_lens', 'other')),
  brand       text,
  model       text,
  color       text,
  intake      text,          -- lens
  thickness   text,          -- lens
  quantity    text,          -- contact lens / other
  description text,          -- free text, mainly for "other"
  price       numeric(10, 2),
  created_at  timestamptz not null default now()
);

create index visit_items_visit on public.visit_items (visit_id);

-- ------------------------------------------------------------
-- Auto ref no: "YYMM-NNNN" (e.g. 2607-0001), a per-month counter.
-- Assigned only when a NEW customer is saved with a blank ref;
-- migrated legacy rows (they carry legacy_id/legacy_key) and
-- hand-typed refs are never touched.
-- ------------------------------------------------------------
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
-- Smart search: one query across name (exact substring AND
-- fuzzy/misspelled via pg_trgm), phone digits, ref prefix, and
-- IC digits — plus an optional birthday that narrows the results
-- (matches the dob field OR the birth date encoded in the IC).
-- q may be empty to search by birthday alone.
-- Runs with the caller's rights, so Row Level Security applies.
-- ------------------------------------------------------------
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

-- ------------------------------------------------------------
-- updated_at maintenance
-- ------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger customers_touch before update on public.customers for each row execute function public.touch_updated_at();
create trigger visits_touch    before update on public.visits    for each row execute function public.touch_updated_at();

-- ------------------------------------------------------------
-- Row Level Security: every table locked to signed-in staff.
-- The anon key alone (which ships in the browser bundle) can
-- read NOTHING — fixing the old site's core flaw.
-- Customers and visits can NOT be hard-deleted by the app; they
-- are soft-deleted by setting deleted_at (restorable from Trash).
-- visit_items may be hard-deleted: they are edited in place as
-- part of their visit, and deleting a visit soft-deletes them
-- with it (they stay attached to the soft-deleted visit).
-- ------------------------------------------------------------
alter table public.profiles    enable row level security;
alter table public.customers   enable row level security;
alter table public.visits      enable row level security;
alter table public.visit_items enable row level security;

create policy "staff read own profile"
  on public.profiles for select
  to authenticated
  using (id = auth.uid());

create policy "staff read customers"
  on public.customers for select to authenticated using (true);
create policy "staff insert customers"
  on public.customers for insert to authenticated with check (true);
create policy "staff update customers"
  on public.customers for update to authenticated using (true);

create policy "staff read visits"
  on public.visits for select to authenticated using (true);
create policy "staff insert visits"
  on public.visits for insert to authenticated with check (true);
create policy "staff update visits"
  on public.visits for update to authenticated using (true);

create policy "staff read visit items"
  on public.visit_items for select to authenticated using (true);
create policy "staff insert visit items"
  on public.visit_items for insert to authenticated with check (true);
create policy "staff update visit items"
  on public.visit_items for update to authenticated using (true);
create policy "staff delete visit items"
  on public.visit_items for delete to authenticated using (true);
