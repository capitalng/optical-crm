-- Patch (2026-08-29): attach scans and documents (PDF or photo) to a customer.
-- Run once in the Supabase SQL Editor. Safe to re-run.
--
-- IF YOU HIT: "must be owner of table objects" on the storage policies below,
-- your project restricts policy creation on storage.objects from the SQL editor.
-- In that case run everything EXCEPT the two storage policies, then create them
-- by hand: Dashboard > Storage > customer-docs > Policies > New policy,
-- one for SELECT and one for INSERT, both for the "authenticated" role.

-- ------------------------------------------------------------
-- 1. Private bucket for the files themselves.
--    These are medical records: public must stay FALSE forever.
--    Photos are shrunk in the browser before upload (~2000px, JPEG),
--    so the 25 MB cap only ever bites on untouched originals.
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'customer-docs', 'customer-docs', false, 26214400,
  array[
    'application/pdf',
    'image/jpeg', 'image/png', 'image/webp',
    'image/heic', 'image/heif', 'image/tiff'
  ]
)
on conflict (id) do update
  set public             = false,
      file_size_limit    = 26214400,
      allowed_mime_types = array[
        'application/pdf',
        'image/jpeg', 'image/png', 'image/webp',
        'image/heic', 'image/heif', 'image/tiff'
      ];

-- ------------------------------------------------------------
-- 2. Storage access: signed-in staff may read and upload within
--    this bucket only. No UPDATE policy (an upload can never
--    overwrite an existing scan) and no DELETE policy (the app is
--    structurally unable to destroy a scan — same philosophy as
--    the soft-delete rule on customers and visits).
-- ------------------------------------------------------------
drop policy if exists "staff read customer docs" on storage.objects;
create policy "staff read customer docs"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'customer-docs');

drop policy if exists "staff upload customer docs" on storage.objects;
create policy "staff upload customer docs"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'customer-docs');

-- ------------------------------------------------------------
-- 3. Metadata table: one row per attached file.
--    Kept in Postgres (not read from the bucket listing) so documents
--    can be joined to customers, labelled, dated, soft-deleted,
--    exported to the CSV backup, and summed for the storage meter.
-- ------------------------------------------------------------
create table if not exists public.customer_documents (
  id            uuid primary key default gen_random_uuid(),
  customer_id   uuid not null references public.customers (id) on delete cascade,
  storage_path  text not null unique,       -- key inside the customer-docs bucket
  file_name     text not null,              -- original name as picked by staff
  label         text,                       -- optional, e.g. "Right eye"
  doc_date      date,                       -- date the scan was taken
  byte_size     bigint,
  content_type  text not null default 'application/pdf',
  uploaded_by   uuid references auth.users (id) default auth.uid(),
  deleted_at    timestamptz,                -- soft delete: null = active
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists customer_documents_customer
  on public.customer_documents (customer_id, created_at desc);
create index if not exists customer_documents_deleted_at
  on public.customer_documents (deleted_at) where deleted_at is not null;

drop trigger if exists customer_documents_touch on public.customer_documents;
create trigger customer_documents_touch
  before update on public.customer_documents
  for each row execute function public.touch_updated_at();

alter table public.customer_documents enable row level security;

drop policy if exists "staff read customer documents" on public.customer_documents;
create policy "staff read customer documents"
  on public.customer_documents for select to authenticated using (true);

drop policy if exists "staff insert customer documents" on public.customer_documents;
create policy "staff insert customer documents"
  on public.customer_documents for insert to authenticated with check (true);

drop policy if exists "staff update customer documents" on public.customer_documents;
create policy "staff update customer documents"
  on public.customer_documents for update to authenticated using (true);
-- (no delete policy — removal is a soft delete)

-- ------------------------------------------------------------
-- 4. Storage usage summary for the meter on the Export page.
--    security_invoker = on is essential: without it the view would
--    run as its owner and bypass the table's row level security.
-- ------------------------------------------------------------
create or replace view public.customer_documents_usage
with (security_invoker = on) as
select
  count(*) filter (where deleted_at is null)                        as active_count,
  coalesce(sum(byte_size) filter (where deleted_at is null), 0)     as active_bytes,
  count(*) filter (where deleted_at is not null)                    as deleted_count,
  coalesce(sum(byte_size) filter (where deleted_at is not null), 0) as deleted_bytes
from public.customer_documents;

grant select on public.customer_documents_usage to authenticated;

-- ------------------------------------------------------------
-- OWNER-ONLY HOUSEKEEPING (not run by the app)
--
-- Files stay forever unless someone removes them deliberately, and a
-- removed file still occupies storage. To reclaim that space, list what
-- was removed more than 90 days ago:
--
--   select storage_path, file_name, byte_size, deleted_at
--   from public.customer_documents
--   where deleted_at < now() - interval '90 days'
--   order by deleted_at;
--
-- Delete those objects in Dashboard > Storage > customer-docs
-- (the dashboard runs as service role and bypasses the missing
-- delete policy), then remove their rows:
--
--   delete from public.customer_documents
--   where deleted_at < now() - interval '90 days';
-- ------------------------------------------------------------
