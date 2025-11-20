# Supabase backend for coin3

The game exposes a generic REST interface through `SyncService` and reads its connection
settings from `[remoteStorage]` inside `config file.tet`. To persist jars online we only
need three JSON payloads per room (current state, archives, and user settings), and the
client always talks to `GET/PUT /rooms/:roomCode/:resource` (`resource` = `state`,
`archives`, `settings`). This directory contains everything required to satisfy that API
with Supabase. 【F:src/services/SyncService.ts†L20-L189】【F:config file.tet†L52-L70】

## Database schema

1. Open the Supabase SQL editor and run [`schema.sql`](./schema.sql). It creates a
   single table, `coin3_rooms`, that stores the latest payload for each resource along
   with timestamps. The table keeps row level security enabled and only allows access via
   the service role so that anonymous REST queries stay blocked by default.
2. You do **not** need any additional triggers—`SyncService` already sends fully-formed
   payloads (including `updatedAt`).

## Edge Function (`coin3`)

`edge-function.ts` implements the expected `/rooms/:room/:resource` contract as a Supabase
Edge Function. Deploy it as `coin3` so the final URL becomes
`https://<project>.supabase.co/functions/v1/coin3`.

```bash
supabase functions deploy coin3 --no-verify-jwt --env-file ./supabase/.env.coin3
```

The function expects the following secrets:

| Name | Purpose |
| --- | --- |
| `SUPABASE_URL` | Project URL (e.g. `https://xyzcompany.supabase.co`). |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key so the function can bypass RLS and upsert rows. |
| `COIN3_FUNCTION_TOKEN` | Shared bearer token validated against incoming requests. Keep it secret and reuse it inside `config file.tet`. |

Example `supabase/.env.coin3` file:

```
SUPABASE_URL=https://xyzcompany.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOi...
COIN3_FUNCTION_TOKEN=supabase-shared-room-secret
```

## Updating the game configuration

Point the game to the function by editing `[remoteStorage]` inside `config file.tet`:

```
[remoteStorage]
enabled = true
baseUrl = https://xyzcompany.supabase.co/functions/v1/coin3
roomCode = team-room-001
authToken = supabase-shared-room-secret
pollIntervalMs = 15000
```

The `authToken` is sent as a `Bearer` header and must match the `COIN3_FUNCTION_TOKEN`
value so unauthorized callers are rejected. Any players that share the same `roomCode`
will stay in sync.

## Testing

1. Deploy the function locally with `supabase functions serve coin3 --env-file supabase/.env.coin3`.
2. Start the Vite dev server (`npm run dev`) and ensure coins/archives propagate between
   two browser tabs within ~15 seconds.
3. Inspect the `coin3_rooms` table in the Supabase dashboard to confirm the payload
   columns update whenever the jar fills up.
