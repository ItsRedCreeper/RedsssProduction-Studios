# Cursor Status

**Last updated:** 2026-11-28 (Pass 12)

## Localhost health
**Healthy.** `/messenger` returns 200 after Pass 12 fixes.

## Pass 12 — Final verdicts (no Partial)

| ID | Final verdict | Evidence |
|---|---|---|
| **CZ** | **Fixed and verified** | `/poll` only matches as a whole command (`/^\/poll(\s|$)/i`); `encodeMentions` masks `http(s)://` URLs so `#channel` / `@name` inside links are not rewritten. Unknown `/…` / `!…` remain plain text; slash expand still exact-name. |
| **DA** | **Fixed and verified** | Copy Text uses `displayMentionText` + `:emoji:` shortcodes instead of raw `<@uuid>` / `<:name:id>` tokens. No Quote action exists (not added — out of scope). |
| **DB** | **Disproved** | Server icons already append `?v=`; avatars/emojis use unique storage paths + emoji cache invalidation. |
| **DC** | **Disproved** | Voice/call join ops cancel stale work; same-channel rejoin short-circuits; `displayVoiceStates` de-dupes self. |
| **DD** | **Fixed and verified** | `effectiveChannelOverrides` uses category map when `permissions_synced`; category save pushes to synced channels; channel save clears sync; new channels in a category inherit + sync; Re-sync always available. |
| **DE** | **Disproved** | No chat `document.title` / favicon / message sound path to mishandle; unread badges clear via mark-read. |
| **DF** | **Disproved** | No channel/category drag-reorder UI exists; create-time `position` display sort is stable — nothing to reset. (DnD would be a new feature.) |
| **DG** | **Disproved** | Empty server/DM/members/Discover already render dedicated empty states. |
| **DH** | **Disproved** | `LinkEmbeds` is content-driven; edit/delete remounts/cancels previews. |
| **DI** | **Fixed and verified** | `userFacingActionError` on send/upload; `SIGNED_OUT` sets session-expired error + toast; drafts already restored via `restoreComposer`. |

### Code changes this pass
- `lib/auth-errors.ts` — session failure detection + copy
- `lib/mentions.ts` — URL-safe mention encoding
- `lib/permissions.ts` — `effectiveChannelOverrides`
- `MessengerShell.tsx` — `/poll` match, effective overrides, auth feedback
- `ServerSettingsModal.tsx` / `CreateChannelModal.tsx` — category sync inheritance
- `MessageItem.tsx` — display-form Copy Text

## Still open / broken
- Reports / Funding placeholders (out of messenger scope)
- Jump-to-unread pill not built
- Cmd/Ctrl+K quick switcher not built
- Channel/category drag-and-drop reorder not built (feature, not a regression)

## Blockers
- None

## Suggested next focus
- Two-client QA: category deny + channel allow; `/pollfoo` still sends; copy mention paste; expire session mid-upload
