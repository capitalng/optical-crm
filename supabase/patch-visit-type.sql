-- Patch (2026-07-24): record whether a visit is for glasses or contact lenses.
-- Run once in the Supabase SQL Editor. Safe to re-run.
alter table public.visits add column if not exists visit_type text
  check (visit_type in ('glasses', 'contact_lens'));
