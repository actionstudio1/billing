-- Billing Software — Supabase schema
-- Run this in Supabase Dashboard → SQL Editor → New query → Run

-- ── Collections (one row per record, full JSON in `data`) ──────────────────

create table if not exists bills (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  data jsonb not null,
  created_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists clients (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  data jsonb not null,
  created_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists vendors (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  data jsonb not null,
  created_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists templates (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  data jsonb not null,
  created_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists products (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  data jsonb not null,
  created_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists items (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  data jsonb not null,
  created_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists brands (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  data jsonb not null,
  created_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists staff (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  data jsonb not null,
  created_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists major_groups (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  data jsonb not null,
  created_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists sub_groups (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  data jsonb not null,
  created_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists inventory_entries (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  data jsonb not null,
  created_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists expenses (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  data jsonb not null,
  created_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists recurring (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  data jsonb not null,
  created_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists receipts (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  data jsonb not null,
  created_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists purchases (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  data jsonb not null,
  created_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists business_profiles (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  data jsonb not null,
  created_at timestamptz not null default now(),
  primary key (user_id, id)
);

-- Active business profile + meta counters/settings
create table if not exists user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  profile jsonb not null default '{}'::jsonb,
  meta jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- ── Row Level Security ───────────────────────────────────────────────────────
-- Safe to re-run: drops existing policies first (42710 = already exists).

alter table bills enable row level security;
alter table clients enable row level security;
alter table vendors enable row level security;
alter table templates enable row level security;
alter table products enable row level security;
alter table items enable row level security;
alter table brands enable row level security;
alter table staff enable row level security;
alter table major_groups enable row level security;
alter table sub_groups enable row level security;
alter table inventory_entries enable row level security;
alter table expenses enable row level security;
alter table recurring enable row level security;
alter table receipts enable row level security;
alter table purchases enable row level security;
alter table business_profiles enable row level security;
alter table user_settings enable row level security;

drop policy if exists "bills_own" on bills;
drop policy if exists "clients_own" on clients;
drop policy if exists "vendors_own" on vendors;
drop policy if exists "templates_own" on templates;
drop policy if exists "products_own" on products;
drop policy if exists "items_own" on items;
drop policy if exists "brands_own" on brands;
drop policy if exists "staff_own" on staff;
drop policy if exists "major_groups_own" on major_groups;
drop policy if exists "sub_groups_own" on sub_groups;
drop policy if exists "inventory_entries_own" on inventory_entries;
drop policy if exists "expenses_own" on expenses;
drop policy if exists "recurring_own" on recurring;
drop policy if exists "receipts_own" on receipts;
drop policy if exists "purchases_own" on purchases;
drop policy if exists "business_profiles_own" on business_profiles;
drop policy if exists "user_settings_own" on user_settings;

create policy "bills_own" on bills for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "clients_own" on clients for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "vendors_own" on vendors for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "templates_own" on templates for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "products_own" on products for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "items_own" on items for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "brands_own" on brands for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "staff_own" on staff for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "major_groups_own" on major_groups for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "sub_groups_own" on sub_groups for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "inventory_entries_own" on inventory_entries for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "expenses_own" on expenses for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "recurring_own" on recurring for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "receipts_own" on receipts for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "purchases_own" on purchases for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "business_profiles_own" on business_profiles for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "user_settings_own" on user_settings for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ── Atomic invoice counter (race-free) ───────────────────────────────────────

create or replace function increment_meta(p_key text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_next integer;
begin
  if v_user is null then
    raise exception 'Not authenticated';
  end if;

  insert into user_settings (user_id, meta)
  values (v_user, jsonb_build_object(p_key, 1))
  on conflict (user_id) do update
  set meta = jsonb_set(
    user_settings.meta,
    array[p_key],
    to_jsonb(coalesce((user_settings.meta->>p_key)::integer, 0) + 1)
  ),
  updated_at = now();

  select (meta->>p_key)::integer into v_next
  from user_settings where user_id = v_user;

  return v_next;
end;
$$;

grant execute on function increment_meta(text) to authenticated;

-- ── PDF storage bucket (optional) ──────────────────────────────────────────

insert into storage.buckets (id, name, public)
values ('invoices', 'invoices', false)
on conflict (id) do nothing;

drop policy if exists "invoices_own_read" on storage.objects;
drop policy if exists "invoices_own_write" on storage.objects;
drop policy if exists "invoices_own_delete" on storage.objects;

create policy "invoices_own_read" on storage.objects
  for select using (bucket_id = 'invoices' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "invoices_own_write" on storage.objects
  for insert with check (bucket_id = 'invoices' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "invoices_own_delete" on storage.objects
  for delete using (bucket_id = 'invoices' and auth.uid()::text = (storage.foldername(name))[1]);
