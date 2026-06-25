-- Staff / Employee Master table (safe to re-run)

create table if not exists staff (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  data jsonb not null,
  created_at timestamptz not null default now(),
  primary key (user_id, id)
);

alter table staff enable row level security;

drop policy if exists "staff_own" on staff;

create policy "staff_own" on staff
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
