# Cursor Status

**Last updated:** 2026-11-27 21:25

## Completed this batch — Hypotheses F–L

| Hypothesis | Result | Fix |
|---|---|---|
| **F** Bell vs panel row count | **Not confirmed** as a separate formula bug (bell already = panel unread rows). Hardened by filtering blocked/ignored actors out of the notification list so badge/panel stay aligned. |
| **G** Channel badges / `readAt` don’t sync across tabs | **Confirmed** | MessengerShell now subscribes to `user_channel_reads` / `user_dm_reads` and listens to `redsss-reads` BroadcastChannel + window events to keep local `readAt` / `dmReadAt` live. |
| **H** New messages divider wrong/stuck | **Partially confirmed** (logs: `showUnreadDivider:true` with `found:null`, empty list) | Clear the divider flag once the visible list is loaded and there is no first-unread anchor. |
| **I** DM list doesn’t jump to top | **Partially confirmed** (skip path could bail before re-sort) | Only skip patch when preview is unchanged *and* thread is already top; HomeSidebar sort prefers `previewAt` then typing. |
| **J** Presence stuck Online | **Partially confirmed** | `publishLocal` now requires `document.hasFocus()` so switching to another app marks Idle; pagehide offline path unchanged. |
| **K** Mentions from blocked/ignored | **Partially confirmed** | Blocked already filtered in SQL; added `are_users_ignored` + checks in `notify_message_mentions` / `notify_message_reply`. Client also hides notifs from blocked/ignored actors. |
| **L** Mark all leaves channel badges | **Confirmed** | `markAll` / channel / DM read now `publishReadSync` so MessengerShell local cursors clear with the panel. |

### Files
- `src/lib/read-sync.ts` (new)
- `src/components/notifications/UnreadProvider.tsx`
- `src/components/messenger/MessengerShell.tsx`
- `src/components/messenger/HomeSidebar.tsx`
- `src/components/presence/PresenceController.tsx`
- Supabase migration: `notify_skip_ignored_users`

## Still open / broken
- Live visual QA of notification panel + badges at 375/768/1440 after deploy
- Jump-to-unread pill / scroll-to-divider not built (divider only)
- `↑` edit-last-own still not fully wired through MessageItem
- Cmd/Ctrl+K quick switcher not built
- Account settings still one section; Profile/Appearance/Voice/Notifications pages not split out
- Group DM polls still skipped (schema)
- Presence idle-on-unfocus still depends on focus/visibility events (input-idle remains 10m)

## Blockers
- None

## Suggested next focus
- Continue messenger bug hunt (mobile composer, friends realtime, voice state cleanup)
- Production QA of cross-tab unread badges + mark-all after this deploy
