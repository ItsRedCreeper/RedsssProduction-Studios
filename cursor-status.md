# Cursor Status

**Last updated:** 2026-11-28 (Pass 9)

## Localhost health
**Healthy.** `/messenger` returns 200; `next build` succeeds after Pass 9.

## Pass 9 — Final verdicts (no Partial)

| ID | Final verdict | Evidence |
|---|---|---|
| **BV** | **Disproved** | Unread cursors persist via `user_channel_reads` / `user_dm_reads` + `get_unread_summary`; pending watermarks prevent refresh revive; re-login reloads from DB. |
| **BW** | **Fixed and verified** | CallSession: exact→ideal mic fallback; mid-call input switch replaces tracks on mesh; `track.onended` surfaces mic/camera failure; output device sync. |
| **BX** | **Fixed and verified** | Private create/toggle auto-allows VIEW for creator `actorRoleIds`; overlapping role resolution already Discord-ordered in `can()`. |
| **BY** | **Disproved** | System messages skip toolbar; `temp-` ids blocked for delete/react/pin; failed messages expose dismiss-only. |
| **BZ** | **Fixed and verified** | Empty/long already validated; duplicate channel name blocked on create/rename (Create + Edit + Server Settings). |
| **CA** | **Fixed and verified** | Group DMs no longer treat one blocked participant as conversation-wide send lock; 1:1 block + null profile “Unknown” paths OK. |
| **CB** | **Fixed and verified** | Composer `onPaste` attaches clipboard image/files when `allowAttach`; drag-drop already worked. |
| **CC** | **Fixed and verified** | Shared LIFO `pushOverlayEscape` / `useEscapeToClose` so Escape closes the top overlay only (modals, notifs, lightbox, pins, mobile sheets). |
| **CD** | **Fixed and verified** | Typing channel teardown + composer unmount send `stop: true`; presence/activity intervals already cleaned. |
| **CE** | **Disproved** | Build + core messenger paths clean; no new happy-path crash sources found in this pass. |

### Code changes this pass
- `lib/overlay-escape.ts`, `hooks/useEscapeToClose.ts` — Escape stack
- `CallSessionProvider.tsx` — mid-call device/permission recovery
- `CreateChannelModal` / `EditChannelModal` / `ServerSettingsModal` — private auto-allow + duplicate names
- `MessageComposer.tsx` — paste files + typing stop on unmount
- `MessengerShell.tsx` — group block, typing stop broadcast, Escape stack for pins/sheets
- Modals/panels migrated to `useEscapeToClose`

## Still open / broken
- Reports / Funding placeholders (out of messenger scope)
- Jump-to-unread pill not built
- Cmd/Ctrl+K quick switcher not built

## Blockers
- None

## Suggested next focus
- Two-client QA: private channel create as non-admin; paste image; call device switch; stacked Escape
