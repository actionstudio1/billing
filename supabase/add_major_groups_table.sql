-- Major Group Master table (run if upgrading an existing Supabase project)
-- Safe to re-run.

create table if not exists major_groups (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  data jsonb not null,
  created_at timestamptz not null default now(),
  primary key (user_id, id)
);

alter table major_groups enable row level security;

drop policy if exists "major_groups_own" on major_groups;

create policy "major_groups_own" on major_groups for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
