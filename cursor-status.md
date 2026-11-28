# Cursor Status

**Last updated:** 2026-11-28 (Pass 11)

## Localhost health
**Healthy.** `/messenger` returns 200 after Pass 11 fixes.

## Pass 11 — Final verdicts (no Partial)

| ID | Final verdict | Evidence |
|---|---|---|
| **CP** | **Fixed and verified** | Channel/DM realtime UPDATE patches children’s `reply_to.content`; DELETE keeps deleted stub; hydrate/RPC map stub when parent missing; optimistic edit also syncs child previews. |
| **CQ** | **Fixed and verified** | DM `@` suggestions use conversation peers (group `participantIds` / DM other), filtered by block list — no longer server `visibleMembers`. Channel path still follows live membership. |
| **CR** | **Disproved** | `useVoiceConnectionQuality` resets to “Measuring” when `active` is false and clears the poll interval on leave/rejoin. |
| **CS** | **Fixed and verified** | Discover `memberIds` updates on live `server_members` INSERT/DELETE for self; join guards concurrent `joiningId` and treats duplicate membership as success without double-counting stats. |
| **CT** | **Fixed and verified** | Own open big/small cards now compare avatar/bio/banner/username (not only status fields) against `useCurrentProfile`; other users already refresh via profiles UPDATE realtime. |
| **CU** | **Fixed and verified** | Composer emoji/gif/sticker register `pushOverlayEscape` so Escape works while search is focused; mention/emoji/reply Escape handlers preventDefault + stopPropagation. ArrowUp edit-last already gated on empty draft. |
| **CV** | **Fixed and verified** | Non-image attachments use blob download with sanitized filename (same pattern as lightbox); cross-origin `download=` attribute no longer relied on. |
| **CW** | **Disproved** | Category move updates `category_id` only; overrides preserved; sync-to-category is an explicit `permissions_synced` action. |
| **CX** | **Fixed and verified** | `displayVoiceStates` filters blocked users out of the roster; mesh already silences either-direction blocks. |
| **CY** | **Disproved** | Post-refresh paths hydrate replies/reactions; scope change clears drafts/aborts uploads; leave/join membership + channel loads stay consistent with DB after heavy nav. |

### Code changes this pass
- `MessengerShell.tsx` — reply preview sync (realtime + edit), DM mentions, blocked voice roster, messages channel reconnect subscribe
- `data.ts` — deleted-parent reply stubs on hydrate/RPC map
- `DiscoverPane.tsx` — live membership + join race guard
- `ProfileProvider.tsx` — own profile card field sync
- `MessageComposer.tsx` — Escape overlay priority for pickers
- `MessageMedia.tsx` / `MediaLightbox.tsx` — safe blob downloads

## Still open / broken
- Reports / Funding placeholders (out of messenger scope)
- Jump-to-unread pill not built
- Cmd/Ctrl+K quick switcher not built

## Blockers
- None

## Suggested next focus
- Two-client QA: reply parent delete while reply visible; Discover join→leave→rejoin; file download with spaced filenames; block mid-voice
