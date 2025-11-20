create table if not exists public.coin3_rooms (
  room_code text primary key,
  created_at timestamptz not null default timezone('utc', now()),
  state_payload jsonb,
  state_updated_at timestamptz,
  archives_payload jsonb,
  archives_updated_at timestamptz,
  settings_payload jsonb,
  settings_updated_at timestamptz
);

comment on table public.coin3_rooms is 'Per-room snapshots that store the latest state/archives/settings payloads consumed by the coin3 SyncService.';
comment on column public.coin3_rooms.room_code is 'Shared identifier entered into config file.tet -> [remoteStorage].roomCode';
comment on column public.coin3_rooms.state_payload is 'RemoteGameStatePayload JSON blob.';
comment on column public.coin3_rooms.archives_payload is 'RemoteArchivesPayload JSON blob.';
comment on column public.coin3_rooms.settings_payload is 'RemoteSettingsPayload JSON blob.';

alter table public.coin3_rooms enable row level security;

-- Keep the table locked down for anonymous clients; only service role / edge functions should touch it.
create policy if not exists "coin3 service only" on public.coin3_rooms
  for all
  to service_role
  using (true)
  with check (true);
