begin;

create table if not exists public.room_music_session (
  slot smallint primary key check (slot = 1),
  room text not null check (room in ('genel', 'oyun', 'muhabbet')),
  video_id text not null check (video_id ~ '^[A-Za-z0-9_-]{11}$'),
  started_at timestamptz not null
);

alter table public.room_music_session enable row level security;
revoke all on table public.room_music_session from public, anon, authenticated;
grant select, insert, update, delete on table public.room_music_session to service_role;

commit;
