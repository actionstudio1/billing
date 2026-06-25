-- Sub Group Master table (run if upgrading an existing Supabase project)
-- Safe to re-run.

create table if not exists sub_groups (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  data jsonb not null,
  created_at timestamptz not null default now(),
  primary key (user_id, id)
);

alter table sub_groups enable row level security;

drop policy if exists "sub_groups_own" on sub_groups;

create policy "sub_groups_own" on sub_groups for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
