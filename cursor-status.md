# Cursor Status

**Last updated:** 2026-11-27 21:35

## Pass 2b — Final verdicts (F / H / I / J / K / L)

| ID | Final verdict | Evidence |
|---|---|---|
| **F** | **Disproved** | Bell and panel both use `countUnreadPanelRows()` on the same UnreadProvider state (1 server aggregate + 1 DM row + 1 unread individual notif). They cannot diverge while the provider is mounted. |
| **H** | **Disproved** | Empty stuck divider cleared when list is loaded and `firstUnreadMessageId` is null. Thread-only anchors fixed earlier. Divider remaining until scroll after auto-mark is intentional (Discord-style), not a position bug. |
| **I** | **Disproved** | Realtime patch always re-sorts unless that conversation is already top with the same preview/`previewAt`. HomeSidebar also sorts by `previewAt` then typing. |
| **J** | **Disproved** | Unfocus → Idle via `computeAutoEffectiveStatus` when `tabFocused` is false; `publishLocal` now requires `document.hasFocus()` (not only `!document.hidden`). Unit check: unfocus=`idle`, focus=`online`, dnd stays `dnd`. Last-tab Offline still via `pagehide`. |
| **K** | **Disproved** | SQL proof: both `notify_message_mentions` and `notify_message_reply` short-circuit on `are_users_blocked` **and** `are_users_ignored` before `INSERT INTO notifications`. Client also filters blocked/ignored actors on refresh. |
| **L** | **Confirmed (fix holds)** | Mark-all still publishes `redsss-reads` sync. Additional fix this pass: applyMarkAll also advances every local `lastMessageAt` / DM thread id, not only feed summary ids — closes leftover local-only badges. |

### Code changes this pass
- `src/lib/unread.ts` — shared `countUnreadPanelRows`
- `src/components/notifications/UnreadProvider.tsx` — bell uses shared helper
- `src/components/messenger/MessengerShell.tsx` — mark-all covers local activity maps
- Prior pass 2 fixes retained (read-sync, ignored SQL, presence hasFocus, divider clear, DM reorder)

## Still open / broken
- Live visual QA at 375/768/1440 after deploy
- Jump-to-unread pill not built
- `↑` edit-last-own still incomplete
- Cmd/Ctrl+K quick switcher not built
- Account settings still one section
- Group DM polls still skipped (schema)

## Blockers
- None

## Suggested next focus
- Next messenger bug-hunt batch (mobile composer, friends realtime, voice cleanup)
