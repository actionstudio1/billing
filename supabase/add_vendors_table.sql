-- Run once in Supabase Dashboard → SQL Editor → New query → Run
-- Adds the vendors table (required for vendor save in cloud mode)

create table if not exists vendors (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  data jsonb not null,
  created_at timestamptz not null default now(),
  primary key (user_id, id)
);

alter table vendors enable row level security;

drop policy if exists "vendors_own" on vendors;
create policy "vendors_own" on vendors
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
