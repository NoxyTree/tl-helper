begin;

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  server text,
  role text,
  avatar_path text,
  settings jsonb not null default '{}'::jsonb check (jsonb_typeof(settings) = 'object'),
  revision bigint not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.builds (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(name) between 1 and 120),
  kind text not null check (kind in ('current', 'preset', 'questlog-import')),
  is_active boolean not null default false,
  document jsonb not null check (jsonb_typeof(document) = 'object'),
  document_schema text not null default 'tl-helper.armory-state',
  schema_version integer not null default 1 check (schema_version > 0),
  game_build text not null default 'unversioned',
  source_url text,
  derived_snapshot jsonb check (derived_snapshot is null or jsonb_typeof(derived_snapshot) = 'object'),
  snapshot_schema_version integer,
  snapshot_ruleset text,
  snapshot_game_build text,
  revision bigint not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create unique index builds_one_active_per_user
  on public.builds(user_id)
  where is_active and deleted_at is null;
create index builds_user_updated_idx on public.builds(user_id, updated_at desc);

create table public.tracker_states (
  user_id uuid primary key references auth.users(id) on delete cascade,
  document jsonb not null default '{}'::jsonb check (jsonb_typeof(document) = 'object'),
  schema_version integer not null default 1 check (schema_version > 0),
  revision bigint not null default 1 check (revision > 0),
  updated_at timestamptz not null default now()
);

create table public.achievement_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  achievement_id text not null,
  completed_stage_indexes integer[] not null default '{}',
  completed boolean not null default false,
  source_updated_at timestamptz,
  revision bigint not null default 1 check (revision > 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, achievement_id)
);
create index achievement_progress_user_updated_idx
  on public.achievement_progress(user_id, updated_at desc);

create table public.wishlists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'My Wishlist' check (length(name) between 1 and 120),
  revision bigint not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index wishlists_user_updated_idx on public.wishlists(user_id, updated_at desc);

create table public.wishlist_items (
  id uuid primary key default gen_random_uuid(),
  wishlist_id uuid not null references public.wishlists(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  game_item_id text not null,
  target_level integer,
  priority smallint not null default 0,
  acquired boolean not null default false,
  notes text,
  source_context jsonb not null default '{}'::jsonb check (jsonb_typeof(source_context) = 'object'),
  revision bigint not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (wishlist_id, game_item_id)
);
create index wishlist_items_order_idx
  on public.wishlist_items(wishlist_id, priority desc, created_at);

create table public.user_media (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  bucket text not null default 'user-images' check (bucket = 'user-images'),
  object_path text not null,
  purpose text not null check (purpose in ('avatar', 'build-reference')),
  build_id uuid references public.builds(id) on delete cascade,
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  size_bytes bigint not null check (size_bytes between 1 and 2097152),
  crop jsonb not null default '{}'::jsonb check (jsonb_typeof(crop) = 'object'),
  created_at timestamptz not null default now(),
  unique (bucket, object_path)
);

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger builds_updated_at before update on public.builds
  for each row execute function public.set_updated_at();
create trigger tracker_states_updated_at before update on public.tracker_states
  for each row execute function public.set_updated_at();
create trigger achievement_progress_updated_at before update on public.achievement_progress
  for each row execute function public.set_updated_at();
create trigger wishlists_updated_at before update on public.wishlists
  for each row execute function public.set_updated_at();
create trigger wishlist_items_updated_at before update on public.wishlist_items
  for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.builds enable row level security;
alter table public.tracker_states enable row level security;
alter table public.achievement_progress enable row level security;
alter table public.wishlists enable row level security;
alter table public.wishlist_items enable row level security;
alter table public.user_media enable row level security;

create policy profiles_owner_all on public.profiles for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy builds_owner_all on public.builds for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy tracker_states_owner_all on public.tracker_states for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy achievement_progress_owner_all on public.achievement_progress for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy wishlists_owner_all on public.wishlists for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy wishlist_items_owner_all on public.wishlist_items for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy user_media_owner_all on public.user_media for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('user-images', 'user-images', false, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy user_images_owner_select on storage.objects for select
  using (bucket_id = 'user-images' and (storage.foldername(name))[1] = auth.uid()::text);
create policy user_images_owner_insert on storage.objects for insert
  with check (bucket_id = 'user-images' and (storage.foldername(name))[1] = auth.uid()::text);
create policy user_images_owner_update on storage.objects for update
  using (bucket_id = 'user-images' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'user-images' and (storage.foldername(name))[1] = auth.uid()::text);
create policy user_images_owner_delete on storage.objects for delete
  using (bucket_id = 'user-images' and (storage.foldername(name))[1] = auth.uid()::text);

commit;
