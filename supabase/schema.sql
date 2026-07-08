create table if not exists public.manager_saves (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  save_data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.manager_saves enable row level security;

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
