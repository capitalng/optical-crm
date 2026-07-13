-- Patch (2026-07-13): Add becomes per-eye (R and L), like SPH/CYL/AXIS/V.A/PD.
-- Existing single-Add values are copied to both eyes before the old column is removed.
-- Run once in the Supabase SQL Editor. Safe to re-run.
alter table public.visits add column if not exists r_add text;
alter table public.visits add column if not exists l_add text;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'visits' and column_name = 'add_power'
  ) then
    update public.visits
      set r_add = coalesce(r_add, add_power),
          l_add = coalesce(l_add, add_power)
      where add_power is not null;
    alter table public.visits drop column add_power;
  end if;
end $$;
