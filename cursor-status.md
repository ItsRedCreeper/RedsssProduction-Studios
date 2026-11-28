# Cursor Status

**Last updated:** 2026-11-27 21:15

## Completed this batch — Hypothesis A–E debug

| Hypothesis | Result | Fix |
|---|---|---|
| **A** Manual mark-unread wiped by auto-mark-read | **Confirmed** | Suppress auto-mark while viewing after manual unread; never fall back to `Date.now()` when `activeLast` is missing (that caused a ~1.6s mark loop); stabilize `unreadFeed` via ref so context churn doesn’t re-arm the timer |
| **B** `firstUnreadMessageId` points at thread-only message | **Confirmed** | Compute first unread against the visible timeline only (main channel excludes `thread_id`; active thread filters to that thread) |
| **C** DM call teardown `useEffect` hangs up on re-render | **Confirmed** | Unmount-only teardown + event listener use `leaveCall`/`clearRingTimer` refs; empty deps |
| **D** View-as-role composer still looks enabled | **Confirmed** | Disable composer / attach / poll while `viewAsRoleId` is set; placeholder explains exit view-as |
| **E** Optimistic merge matches only `user_id` + `content` | **Confirmed** | Match closest `created_at` among optimistic msgs with same user/content/thread/reply |

### Files
- `src/components/messenger/MessengerShell.tsx`
- `src/components/messenger/voice/CallSessionProvider.tsx`

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
- Continue messenger bug hunt (mobile composer, friends realtime, voice state cleanup)
- Production QA of bell panel, badges, divider after this unread/call fix deploy
