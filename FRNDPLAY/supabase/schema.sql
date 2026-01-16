-- Party Queue minimal schema
-- Run this in Supabase: SQL Editor -> New query -> Run

-- Extensions
create extension if not exists pgcrypto;

-- Rooms
create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null default 'Party',
  owner_id uuid not null,
  host_user_id uuid not null,
  created_at timestamptz not null default now(),
  ended_at timestamptz null
);

-- Members
create table if not exists public.room_members (
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null,
  role text not null default 'guest' check (role in ('host','guest')),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

-- Queue items
create table if not exists public.queue_items (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  added_by uuid not null,
  provider text not null,
  track_id text not null,
  title text not null,
  artist text null,
  artwork_url text null,
  duration_ms int null,
  position int not null,
  status text not null default 'queued' check (status in ('queued','playing','skipped','removed','done')),
  created_at timestamptz not null default now()
);

create index if not exists queue_items_room_pos_idx on public.queue_items(room_id, position);

-- Playback state (one row per room)
create table if not exists public.room_playback_state (
  room_id uuid primary key references public.rooms(id) on delete cascade,
  provider text null,
  track_id text null,
  started_at timestamptz null,
  is_playing boolean not null default false,
  updated_at timestamptz not null default now()
);
