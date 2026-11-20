begin;

create function public.birartibir_require_registered_signup()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.is_anonymous is true then
    raise exception 'Bir Artı Bir requires a registered account' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke execute on function public.birartibir_require_registered_signup() from public, anon, authenticated;
create trigger birartibir_require_registered_signup
before insert on auth.users for each row execute function public.birartibir_require_registered_signup();

create policy birartibir_registered_messages on public.messages
  as restrictive for all to authenticated
  using (coalesce((select auth.jwt())->>'is_anonymous','false') = 'false')
  with check (coalesce((select auth.jwt())->>'is_anonymous','false') = 'false');
create policy birartibir_registered_profiles on public.profiles
  as restrictive for all to authenticated
  using (coalesce((select auth.jwt())->>'is_anonymous','false') = 'false')
  with check (coalesce((select auth.jwt())->>'is_anonymous','false') = 'false');
create policy birartibir_registered_voice_members on public.voice_members
  as restrictive for all to authenticated
  using (coalesce((select auth.jwt())->>'is_anonymous','false') = 'false')
  with check (coalesce((select auth.jwt())->>'is_anonymous','false') = 'false');

commit;
