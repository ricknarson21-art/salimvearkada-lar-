begin;
create table if not exists public.timed_voice_mutes (
  user_id uuid primary key references auth.users(id) on delete cascade,
  expires_at timestamptz not null
);
alter table public.timed_voice_mutes enable row level security;
revoke all on public.timed_voice_mutes from public, anon, authenticated;
grant select, insert, update on public.timed_voice_mutes to service_role;
create or replace function public.extend_timed_voice_mute(target_id uuid, seconds integer)
returns timestamptz language sql security invoker set search_path = '' as $$
  insert into public.timed_voice_mutes (user_id, expires_at)
  select target_id, clock_timestamp() + make_interval(secs => seconds)
  where seconds in (30, 120)
  on conflict (user_id) do update set expires_at =
    greatest(public.timed_voice_mutes.expires_at, excluded.expires_at)
  returning expires_at;
$$;
revoke all on function public.extend_timed_voice_mute(uuid, integer) from public, anon, authenticated;
grant execute on function public.extend_timed_voice_mute(uuid, integer) to service_role;
commit;
