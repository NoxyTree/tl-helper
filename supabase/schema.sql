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
