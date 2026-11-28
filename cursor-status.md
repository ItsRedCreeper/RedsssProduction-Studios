# Cursor Status

**Last updated:** 2026-11-28 (Messenger hang fixed — fetch queue + no premature abort)

## Localhost health
**Healthy**

## Messenger load hang — fixed
### Causes
1. Auth/profile stampede + many parallel REST calls filled the browser’s ~6 connections/host
2. Client AbortSignal timeouts (~8–12s) discarded responses that still returned 200 from PostgREST
3. Queuing auth with REST caused a brief deadlock (fixed: auth bypasses the queue)

### Fixes
- Shared profile store + single-flight profile fetch
- Queued REST fetch (max 3); `/auth/v1/*` unqueued
- No abort on critical server/message loads; coalesce message RPC
- Defer unread/presence/blocked/voice restore/activity/call recovery
- Sequential channel chrome loads

## Still open / broken
- Reports / Funding placeholders
- Jump-to-unread pill not built
- Cmd/Ctrl+K quick switcher not built

## Blockers
- None
