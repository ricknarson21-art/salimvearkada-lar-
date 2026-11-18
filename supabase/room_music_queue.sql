begin;

alter table public.room_music_session
  add column if not exists queue text[] not null default '{}'
    check (cardinality(queue) <= 25),
  add column if not exists track_id uuid not null default gen_random_uuid();

create or replace function public.change_room_music_queue(
  p_action text, p_room text, p_video text, p_track uuid
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_track public.room_music_session%rowtype;
begin
  perform pg_catalog.pg_advisory_xact_lock(1803779046, 1);
  select * into current_track from public.room_music_session where slot = 1 for update;

  if p_action = 'play' then
    if current_track.room = p_room then
      if cardinality(current_track.queue) >= 25 then
        return jsonb_build_object('error', 'queue_full');
      end if;
      update public.room_music_session set queue = array_append(queue, p_video)
        where slot = 1 returning * into current_track;
    else
      insert into public.room_music_session (slot, room, video_id, started_at)
        values (1, p_room, p_video, clock_timestamp())
        on conflict (slot) do update set room = excluded.room, video_id = excluded.video_id,
          started_at = excluded.started_at, paused_position = null, queue = '{}',
          track_id = gen_random_uuid()
        returning * into current_track;
    end if;
  elsif current_track.room is distinct from p_room then
    return jsonb_build_object('session', null);
  elsif p_action = 'stop' then
    delete from public.room_music_session where slot = 1;
    return jsonb_build_object('session', null);
  elsif p_action = 'clear' then
    update public.room_music_session set queue = '{}' where slot = 1 returning * into current_track;
  elsif p_action in ('end', 'skip') then
    if current_track.track_id is distinct from p_track
      or (p_action = 'end' and current_track.paused_position is not null) then
      return jsonb_build_object('session', to_jsonb(current_track) - 'slot');
    end if;
    if cardinality(current_track.queue) = 0 then
      delete from public.room_music_session where slot = 1;
      return jsonb_build_object('session', null);
    end if;
    update public.room_music_session set video_id = queue[1], queue = queue[2:],
      started_at = clock_timestamp(), paused_position = null, track_id = gen_random_uuid()
      where slot = 1 returning * into current_track;
  else
    return jsonb_build_object('error', 'invalid_action');
  end if;
  return jsonb_build_object('session', to_jsonb(current_track) - 'slot');
end;
$$;

revoke all on function public.change_room_music_queue(text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.change_room_music_queue(text, text, text, uuid) to service_role;

commit;
