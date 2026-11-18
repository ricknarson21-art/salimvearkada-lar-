alter table public.room_music_session
  add column if not exists paused_position double precision
  check (paused_position is null or paused_position between 0 and 43200);
