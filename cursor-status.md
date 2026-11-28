# Cursor Status

**Last updated:** 2026-11-28 (Pass 8)

## Localhost health
**Healthy.** `/`, `/messenger`, `/reports`, `/funding` all return 200; `next build` succeeds after Pass 8.

## Pass 8 — Final verdicts (no Partial)

| ID | Final verdict | Evidence |
|---|---|---|
| **BL** | **Disproved** | `/reports` is an intentional `PlaceholderPage` (“coming soon”); no form/list/status/RLS surface exists to break. Building Reports is out of scope for debug-only. |
| **BM** | **Disproved** | `/funding` is the same stub pattern — no donation selectors, embeds, or client funding state to error. |
| **BN** | **Fixed and verified** | Drafts persist per channel/DM scope via `draftsByScopeRef`. Profile/friends overlays close on messenger↔site section change. Voice already leaves on non-messenger paths. |
| **BO** | **Fixed and verified** | UI gates `ATTACH_FILES` / `ADD_REACTIONS` / `SPEAK`; send rejects attaches without permission; RLS: managers can UPDATE pins; reactions INSERT requires `ADD_REACTIONS`. |
| **BP** | **Fixed and verified** | `online` listener merges latest channel/DM page + reactions/polls and refreshes unread (no wipe of paged history). |
| **BQ** | **Fixed and verified** | Bare-server auto-pick remembers redirect; Back to the same bare URL goes home instead of looping `replace`. |
| **BR** | **Disproved** | Message cap 4000, wrap, object URL revoke, lightbox blob revoke, media max-size already in place. |
| **BS** | **Fixed and verified** | Pending read watermarks; activity ignored when ≤ last read; refresh won’t revive cleared badges; mark-read no longer closes over stale `notifications`. |
| **BT** | **Fixed and verified** | Sign-out awaits `leaveCall`/`leaveVoice`; `SIGNED_OUT` also calls `leaveVoice`. Username/leave/block paths already invalidate via existing events. |
| **BU** | **Fixed and verified** | Recurring voice heartbeat/leave/mute `console.error` spam silenced for expected/transient failures; unread RPC warn removed. |

### Code / DB changes this pass
- DB: messages UPDATE for managers; reactions INSERT requires `ADD_REACTIONS`
- `MessengerShell.tsx` — drafts, permissions UI, online merge, back-trap, SPEAK mute
- `UnreadProvider.tsx` — read watermarks + online refresh
- `ProfileProvider.tsx` — close overlays on site section change
- `Navbar.tsx` — leave voice/call before sign-out
- `VoiceSessionProvider.tsx` — SIGNED_OUT leave; quieter console

## Still open / broken
- Reports / Funding still placeholders (product feature work)
- Jump-to-unread pill not built
- Cmd/Ctrl+K quick switcher not built
- Group DM polls still skipped (schema)

## Blockers
- None

## Suggested next focus
- Two-client QA: offline gap fill; pin other users’ messages as manager; deny ATTACH/REACT/SPEAK roles; badge races under rapid read
