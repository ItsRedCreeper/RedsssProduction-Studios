# Cursor Status

**Last updated:** 2026-11-28 00:25

## Localhost health
**Healthy.** `/messenger` returns 200; `next build` succeeds after Pass 5 changes.

## Pass 5 — Final verdicts (no Partial)

| ID | Final verdict | Evidence |
|---|---|---|
| **AG** | **Fixed and verified** | Thread view includes starter via `starter_message_id`; create reopens existing thread (“Open Thread”); thread-scoped older load; jump exits thread when target is outside scope; `?msg=` deep-link scrolls after load. Send/realtime already used `thread_id`. |
| **AH** | **Fixed and verified** | DM pin/unpin updates `pinnedExtra`; DM realtime UPDATE applies `pinned`. Server pin still gated by `canManageMessages`. Jump-to-pin shares AG jump fix. |
| **AI** | **Fixed and verified** | Edit encodes mentions, strips `@everyone`/`@here`/role tokens without permission, and calls `notify_message_mentions`. Send path uses the same strip helper. |
| **AJ** | **Fixed and verified** | Owner leave already blocked. Kick/ban clear `voice_states`. `server_members` DELETE realtime ejects kicked user + updates peer lists. Server delete calls `leaveVoice` when connected. |
| **AK** | **Fixed and verified** | Collapse persistence already worked. Edit Channel can move category. Sidebar rename validates min/max. Category delete checks channel detach errors. |
| **AL** | **Disproved** | Auth listener + 4s timeout + login `?next=` handle expired session / logged-out deep links; multi-tab logout via `onAuthStateChange`. Google is link-only (no unlink UI). |
| **AM** | **Fixed and verified** | Outgoing block already filtered. Incoming block: live `blocked_users` + poll refresh; `isMessageHidden` hides partner messages; composer already gated by `dmBlockedByThem`. |
| **AN** | **Fixed and verified** | Sync `sendingRef` + slowmode clock before await; DB trigger `trg_enforce_channel_slowmode` enforces slowmode server-side. |
| **AO** | **Disproved** | Dividers use `localDayKey` / `shouldGroupWithPrevious` on `created_at`; edits/deletes recompute from the visible list correctly. |
| **AP** | **Fixed and verified** | Profile/emoji paths already OK after refresh. Added `servers` UPDATE realtime so other clients see icon/name changes without reload. |

### Code / DB changes this pass
- **DB** `pass5_channel_slowmode_enforce` — BEFORE INSERT slowmode trigger
- `MessengerShell.tsx` — threads, pins, mentions edit, send guards, membership/servers realtime, blocked-by-them, jump/`?msg=`, category rename validation
- `MessageItem.tsx` / `ChatTimeline.tsx` — Open Thread label + starter map
- `EditChannelModal.tsx` — category select
- `ServerSettingsModal.tsx` — kick/ban voice cleanup; category detach errors
- `mentions.ts` — strip everyone/here helpers

## Still open / broken
- Jump-to-unread pill not built
- Cmd/Ctrl+K quick switcher not built
- Group DM polls still skipped (schema)
- In-memory message search does not page older history

## Blockers
- None

## Suggested next focus
- Two-client QA: kick while in voice; create/open thread; slowmode hammer Enter; block mid-DM
