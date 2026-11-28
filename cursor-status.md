# Cursor Status

**Last updated:** 2026-11-28 (Pass 7)

## Localhost health
**Healthy.** `/messenger` returns 200; `next build` succeeds after Pass 7.

## Pass 7 — Final verdicts (no Partial)

| ID | Final verdict | Evidence |
|---|---|---|
| **BA** | **Fixed and verified** | `poll_votes` PK → `(message_id, user_id, option_index)`; `votePoll` respects `allowMultiple` with error rollback; duplicate options blocked in `CreatePollModal`; realtime publication + client subscribe; older-page votes loaded with history. |
| **BB** | **Disproved** | Pin inserts one system notice (no dup). Join/leave/kick/call channel system lines are not implemented product surfaces (missed-call + pin only) — no incorrect/duplicated insertion points found. |
| **BC** | **Fixed and verified** | `invalidateEmojiCache` on delete; picker already groups by `server_id` (no cross-server leak); DMs already load membership emojis via `loadCustomEmojis`. |
| **BD** | **Fixed and verified** | Login `next` keeps query (`msg`/`thread`); preview upgrade preserves deep-link params; jump pages older history until found (or toast). Permission redirects still drop inaccessible targets. |
| **AE-follow / BF** | **Fixed and verified** | Escape on notifications, poll, forward, create-server, create-group-DM; notification mark-read/delete visible on `:focus-visible`; pins panel already traps Tab + Escape. |
| **BG** | **Fixed and verified** | Duplicate channel copies live form overrides, keeps category, inserts at `position + 1` and shifts siblings. |
| **BH** | **Fixed and verified** | `formatTimestamp` includes year when not current; ChatTimeline re-ticks day dividers past midnight so Today/Yesterday stay correct; hover titles already use `formatTimestamp`. |
| **BI** | **Disproved** | No multi-select / bulk message-member-invite UI exists to leave orphaned selection state. |
| **BJ** | **Disproved** | `LinkEmbeds` refetches on `url` change (edit-safe); only `http(s)` unfurls; `rel="noreferrer"` on anchors. |
| **BK** | **Disproved** | Audited messenger realtime effects pair `.subscribe()` with `removeChannel` on cleanup; new poll channel follows the same pattern. |

### Code / DB changes this pass
- DB: `poll_votes` PK multi-answer; `poll_votes` added to `supabase_realtime`
- `MessengerShell.tsx` — poll vote/realtime/older votes, deep-link paging + query preserve, login next query
- `CreatePollModal.tsx` — duplicate option validation + Escape
- `EditChannelModal.tsx` — duplicate channel overrides/placement
- `ServerSettingsModal.tsx` — emoji cache invalidate on delete
- `emoji-resolve.ts` — `invalidateEmojiCache`
- `data.ts` / `ChatTimeline.tsx` — timestamp year + day-divider tick
- `NotificationsPanel.tsx` / `Navbar.tsx` — Escape, focus-visible actions, login next query
- `ForwardMessageModal.tsx` / `CreateServerModal.tsx` / `CreateGroupDmModal.tsx` — Escape

## Still open / broken
- Jump-to-unread pill not built
- Cmd/Ctrl+K quick switcher not built
- Group DM polls still skipped (schema)
- In-memory message search does not page older history

## Blockers
- None

## Suggested next focus
- Two-client QA: multi-answer polls live; deep-link after login; duplicate channel overrides; emoji delete while message open
