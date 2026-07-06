create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique,
  display_name text,
  avatar_url text,
  is_public boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_username_format check (
    username is null or username ~ '^[a-z0-9_]{3,24}$'
  )
);

create table if not exists public.achievement_progress (
  user_id uuid not null references public.profiles(id) on delete cascade,
  achievement_id integer not null,
  completed boolean not null default false,
  completed_stage_indexes integer[] not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (user_id, achievement_id)
);

alter table public.profiles enable row level security;
alter table public.achievement_progress enable row level security;

create policy "Public profiles are readable"
on public.profiles
for select
using (is_public = true or auth.uid() = id);

create policy "Users insert their own profile"
on public.profiles
for insert
with check (auth.uid() = id);

create policy "Users update their own profile"
on public.profiles
for update
using (auth.uid() = id)
with check (auth.uid() = id);

create policy "Public progress is readable"
on public.achievement_progress
for select
using (
  user_id = auth.uid()
  or exists (
    select 1
    from public.profiles
    where profiles.id = achievement_progress.user_id
      and profiles.is_public = true
  )
);

create policy "Users insert their own progress"
on public.achievement_progress
for insert
with check (auth.uid() = user_id);

create policy "Users update their own progress"
on public.achievement_progress
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users delete their own progress"
on public.achievement_progress
for delete
using (auth.uid() = user_id);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
before update on public.profiles
for each row execute function public.touch_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1), 'Wanderer'),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Guide content: editable entries that replace the static content.js arrays.
-- The site renders approved rows per section (falling back to the static
-- arrays when a section has none). The research pipeline inserts drafts as
-- status='pending' via the service role; admins review them at /admin.
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists is_admin boolean not null default false;

create table if not exists public.guide_entries (
  id uuid primary key default gen_random_uuid(),
  section text not null check (section in (
    'deadlines', 'priorities', 'targets', 'warnings',
    'systems', 'intel', 'roadmap', 'builds',
    'dailyLoop', 'weeklyLoop', 'featureCards', 'researchSources'
  )),
  payload jsonb not null,
  status text not null default 'pending' check (status in (
    'pending', 'approved', 'rejected', 'archived'
  )),
  sort_order integer not null default 0,
  -- provenance: which pipeline run / source produced this draft
  origin text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists guide_entries_section_status_idx
  on public.guide_entries (section, status, sort_order);

alter table public.guide_entries enable row level security;

create policy "Approved entries are readable by everyone"
on public.guide_entries
for select
using (
  status = 'approved'
  or exists (
    select 1 from public.profiles
    where profiles.id = auth.uid() and profiles.is_admin
  )
);

create policy "Admins insert entries"
on public.guide_entries
for insert
with check (
  exists (
    select 1 from public.profiles
    where profiles.id = auth.uid() and profiles.is_admin
  )
);

create policy "Admins update entries"
on public.guide_entries
for update
using (
  exists (
    select 1 from public.profiles
    where profiles.id = auth.uid() and profiles.is_admin
  )
)
with check (
  exists (
    select 1 from public.profiles
    where profiles.id = auth.uid() and profiles.is_admin
  )
);

create policy "Admins delete entries"
on public.guide_entries
for delete
using (
  exists (
    select 1 from public.profiles
    where profiles.id = auth.uid() and profiles.is_admin
  )
);

drop trigger if exists guide_entries_touch_updated_at on public.guide_entries;
create trigger guide_entries_touch_updated_at
before update on public.guide_entries
for each row execute function public.touch_updated_at();

-- Grant yourself admin once, in the Supabase SQL editor:
--   update public.profiles set is_admin = true where id = '<your-auth-user-id>';
