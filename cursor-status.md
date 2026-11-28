# Cursor Status

**Last updated:** 2026-11-28 (Voice regression after roster fix)

## Localhost health
**Healthy**

## Voice regression after `5590c49` — cause + fix
**Cause**
supabase-js **reuses RealtimeChannel instances by topic**. The roster publisher’s `removeChannel()` and MessengerShell’s speaking-watch cleanup could tear down the live `voice-speaking:*` bus (and disturb the shared realtime socket). That broke speaking outlines and could scramble WebRTC signaling while join/leave UI still looked fast.

**Fix**
- `publishVoiceRoster`: never `removeChannel` on the roster topic; reuse or leave the channel for MessengerShell
- On join, VoiceSessionProvider **takes ownership** of `voice-speaking:{channelId}` (clear stale watchers, then subscribe fresh)
- Speaking-watch cleanup **skips** the currently joined speaking topic
- Voice roster subscriptions no longer remount when `loadingServers` flips

Fast roster path kept: in-memory postgres apply + roster broadcast + `REPLICA IDENTITY FULL`.

## Still open / broken
- Reports / Funding placeholders
- Jump-to-unread pill not built
- Cmd/Ctrl+K quick switcher not built

## Blockers
- None
