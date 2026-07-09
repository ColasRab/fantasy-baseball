create table if not exists public.manager_saves (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  manager_name text,
  owned_team_id text,
  club_name text,
  division text,
  season integer not null default 1,
  week integer not null default 1,
  reputation integer not null default 1,
  save_data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.manager_saves add column if not exists manager_name text;
alter table public.manager_saves add column if not exists owned_team_id text;
alter table public.manager_saves add column if not exists club_name text;
alter table public.manager_saves add column if not exists division text;
alter table public.manager_saves add column if not exists season integer not null default 1;
alter table public.manager_saves add column if not exists week integer not null default 1;
alter table public.manager_saves add column if not exists reputation integer not null default 1;

create table if not exists public.manager_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  manager_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.manager_club_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  season integer not null,
  week integer not null,
  club_name text,
  event_type text not null,
  summary text not null,
  created_at timestamptz not null default now()
);

alter table public.manager_saves enable row level security;
alter table public.manager_profiles enable row level security;
alter table public.manager_club_events enable row level security;

drop policy if exists "Managers can read own save" on public.manager_saves;
create policy "Managers can read own save"
on public.manager_saves
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Managers can insert own save" on public.manager_saves;
create policy "Managers can insert own save"
on public.manager_saves
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Managers can update own save" on public.manager_saves;
create policy "Managers can update own save"
on public.manager_saves
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Managers can read own profile" on public.manager_profiles;
create policy "Managers can read own profile"
on public.manager_profiles
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Managers can upsert own profile" on public.manager_profiles;
create policy "Managers can upsert own profile"
on public.manager_profiles
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Managers can update own profile" on public.manager_profiles;
create policy "Managers can update own profile"
on public.manager_profiles
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Managers can read own events" on public.manager_club_events;
create policy "Managers can read own events"
on public.manager_club_events
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Managers can insert own events" on public.manager_club_events;
create policy "Managers can insert own events"
on public.manager_club_events
for insert
to authenticated
with check (auth.uid() = user_id);
