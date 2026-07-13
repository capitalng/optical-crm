-- Patch for projects created before 2026-07-11 (adds the visit discount column).
-- Run once in the Supabase SQL Editor. Fresh projects using the current
-- schema.sql do NOT need this.
alter table public.visits add column if not exists discount text;
