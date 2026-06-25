-- Brand Master table (run if upgrading an existing Supabase project)
-- Safe to re-run.

create table if not exists brands (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  data jsonb not null,
  created_at timestamptz not null default now(),
  primary key (user_id, id)
);

alter table brands enable row level security;

drop policy if exists "brands_own" on brands;

create policy "brands_own" on brands for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
