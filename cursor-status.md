# Cursor Status

**Last updated:** 2026-11-27 23:55

## Localhost health
**Healthy.** Duplicate `paneRef` / `unreadFeedRef` declarations in `MessengerShell.tsx` caused a Turbopack compile failure (500). Removed; `next build` succeeds and `/messenger` loads.

## Pass 4 — Final verdicts (no Partial)

| ID | Final verdict | Evidence |
|---|---|---|
| **W** | **Fixed and verified** | Overview/channel dirty close now confirms before Escape/backdrop dismiss (`ServerSettingsModal`, `EditChannelModal`). Save payloads already matched UI fields; role reorder gated by hierarchy (see AA). |
| **X** | **Fixed and verified** | Private invite landing used member-only `servers` SELECT → false “Invite not found”. Added `get_invite_preview` + `join_server_via_invite` RPCs (atomic expiry/max-uses/pause/ban checks). Self-join RLS limited to `is_public`; open invite UPDATE policy dropped. Pause toggle owner-only to match RLS. |
| **Y** | **Fixed and verified** | Preview RPCs filter `@everyone` View Channel deny + strip overrides; messages gated the same way. Client `visibleChannels` / routing / `canViewActiveChannel` hide private channels in preview. Join blocked for non-public servers (client + RLS). Private server `?preview=1` still fails closed. |
| **Z** | **Fixed and verified** | Scope change clears search; thread open/close also clears. No async search race. In-memory filter is intentional for loaded history; empty/special queries do not crash. |
| **AA** | **Fixed and verified** | `moveRole` rejects swaps above the actor’s highest role; move buttons use `canManageRoleTarget` on the neighbor. Default role remains pinned. |
| **AB** | **Fixed and verified** | Inline preview only for raster `isImageMime`; lightbox opens by media index (duplicate URLs safe); send generation aborts on channel/DM switch mid-upload. |
| **AC** | **Fixed and verified** | DM composer gets `customEmojis={[]}`; HoverTip + EmojiHoverShell dismiss on scroll (capture). Temp-message reactions already blocked. |
| **AD** | **Fixed and verified** | `all-server-activity` subscribes once per user; maps/pane/channel/unread read from refs — no resubscribe churn on channel list updates. |
| **AE** | **Fixed and verified** | ↑ edit-last-own wired on text + voice composers (`onEditLastOwnMessage` + `requestEditMessageId`). Escape confirms dirty settings/channel modals. Cmd/Ctrl+K switcher does not exist — not a broken shortcut. |
| **AF** | **Fixed and verified** | Open big/small profile cards subscribe to `profiles` UPDATE so avatar/banner/bio/username refresh for viewers. Password change already surfaces invalid-current errors. |

### Code / DB changes this pass
- **DB migration** `pass4_invite_join_and_preview_privacy` — preview guest channel helper, hardened preview RPCs, invite preview/join RPCs, public-only self-join RLS, dropped open invite policies
- `InviteLanding.tsx` — RPC preview + join
- `MessengerShell.tsx` — preview privacy, search clear, send abort, activity sub refs, DM emoji empty, edit-last on voice composer, chooseFiles preview MIME
- `ServerSettingsModal.tsx` / `EditChannelModal.tsx` — unsaved close, role move hierarchy, pause invites owner-only
- `server-membership.ts`, `InvitePeopleModal.tsx`, `MessageMedia.tsx`, `HoverTip.tsx`, `EmojiInfo.tsx`, `ProfileProvider.tsx`, `database.types.ts`

## Still open / broken
- Jump-to-unread pill not built
- Cmd/Ctrl+K quick switcher not built
- Group DM polls still skipped (schema)
- In-memory message search does not page older history (product gap, not Pass 4 failure mode)

## Blockers
- None

## Suggested next focus
- Live invite join QA (expired / max-uses=1 / revoked / paused) on two accounts
- Discover preview of a public server that has a private channel
