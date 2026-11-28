# Cursor Status

**Last updated:** 2026-11-28 (Voice join/leave presence latency)

## Localhost health
**Healthy**

## Voice presence (~10s join/leave delay) — cause + fix
**Cause**
1. `voice_states` had **REPLICA IDENTITY DEFAULT**, so Realtime DELETE payloads lacked `server_id` → RLS `is_server_member(server_id)` dropped leave events. Peers only noticed on a later full refetch (often another user’s ~15s heartbeat).
2. Join UI waited on a **full REST refetch** inside the postgres_changes handler (queued behind other PostgREST traffic) instead of applying the payload.
3. No broadcast fast path for roster changes.

**Fix**
- `ALTER TABLE voice_states REPLICA IDENTITY FULL`
- Apply INSERT/UPDATE/DELETE payloads in-memory immediately (filtered by `server_id`)
- Broadcast `voice-roster:{serverId}` on join / leave / mute / camera / screenshare
- Infrequent reconcile refetch on INSERT/DELETE only (not heartbeats)
- Subscribe as soon as a server is active (don’t wait for `loadingServers` to open the socket)

## Performance (prior)
- Voice/call deferred off home; dynamic heavy messenger UI; logo 4–10KB; DM last-message RPC; REST cap 6

## Still open / broken
- Reports / Funding placeholders
- Jump-to-unread pill not built
- Cmd/Ctrl+K quick switcher not built

## Blockers
- None
