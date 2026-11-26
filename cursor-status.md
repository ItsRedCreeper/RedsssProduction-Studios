# Cursor Status

**Last updated:** 2026-11-26 00:55

## Completed this batch
- **Live notification + unread system**
  - `user_dm_reads` table + `get_unread_summary()` RPC + `notify_message_reply()`
  - Improved mention notification titles/meta (`#channel · Server`)
  - Shared `UnreadProvider` (realtime on messages, DM messages, reads, notifications)
  - Bell badge uses live total (`#ed4245`); panel has Unread/Read sections, aggregated server + DM rows, individual mention/reply/friend rows, mark read/unread, mark all as read
  - Red count badges on server rail, channels, Home/DM list; DMs sort by latest activity
  - “New messages” divider in `ChatTimeline` (same style as day dividers)
  - Auto-mark channel/DM read after ~1.6s so the divider is visible first
  - Removed per-message `dm_message` inbox spam (aggregates from DM reads instead)

## Still open / broken
- Live visual QA of notification panel + badges at 375/768/1440 after deploy
- Mark-as-unread for aggregated server/DM rows (aggregates leave Unread when cleared; individual notifs support toggle)
- Jump-to-unread pill / scroll-to-divider not built (divider only)
- `↑` edit-last-own still not fully wired through MessageItem
- Cmd/Ctrl+K quick switcher not built
- Account settings still one section; Profile/Appearance/Voice/Notifications pages not split out
- Group DM polls still skipped (schema)

## Blockers
- None

## Suggested next focus
- Production QA of bell panel, badges, divider, and multi-tab realtime sync
- Optional jump-to-first-unread control above the composer
- Wire empty-composer `↑` → edit last own message
