# Cursor Status

**Last updated:** 2026-11-28 (Fix message-load timeout)

## Localhost health
**Healthy** (prior).

## Message load timeout
Fixed "Timed out loading messages. Try again."

### Cause
- Channel/DM history load shared an effect with realtime subscriptions
- `CHANNEL_ERROR` / `TIMED_OUT` bumped `realtimeEpoch` → remounted the load effect, cancelled in-flight fetches, and could leave a sticky 20s timeout banner
- RPC had no client-side deadline (hung calls waited for the UI timer)

### Fix
- Split history load vs realtime subscribe (channel + DM)
- Debounce realtime resubscribe to ≥5s
- `loadChannelMessages`: 10s RPC race → table fallback; table also capped at 10s
- Clear the timeout banner when messages arrive successfully
- RPC now returns `message_kind` / `poll` / `thread_id` / etc.

## Profile tags
Unchanged (Funder/Pioneer pills + ItsRed Creeper seed).

## Still open / broken
- Reports / Funding placeholders (out of messenger scope)
- Jump-to-unread pill not built
- Cmd/Ctrl+K quick switcher not built

## Blockers
- None
