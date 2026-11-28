# Cursor Status

**Last updated:** 2026-11-27 22:45

## Localhost health
**Healthy.** Root cause of the “bug detected” crash was invalid JSX in `CallOverlay.tsx` (a `{/* comment */}` sibling before the root element inside `return (` → parse error `Expected ',', got 'ident'`). Fixed in this pass; messenger routes compile and load (`#bug-reports` usable, composer works).  
Note: Next.js issues badge may still show a hydration warning while the Cursor browser injects `data-cursor-ref` attributes — that is tooling noise, not an app defect (diff shows `- data-cursor-ref=…`).

## Pass 3b — Final verdicts (no Partial)

| ID | Final verdict | Evidence |
|---|---|---|
| **M** | **Fixed and verified** | Mini call bar is top-anchored only (`top-2`, `sm:right-3`) — no `sm:bottom-*`. Expand + Disconnect remain on the bar; sidebar `VoiceConnectionBar` is separate. Composer sits at bottom; mini bar cannot cover it. |
| **N** | **Fixed and verified** | Call + Voice `toggleCamera` require mesh `ok`, clear UI on failure, and listen for track `ended`. Mesh `setLocalVideoTrack` now also clears/announces off on `ended` (same as screen). Screen stop path already announced off to peers. |
| **O** | **Fixed and verified** | Server voice and DM/group calls both leave when pathname leaves `/messenger`. In-messenger navigation keeps sessions. Refresh: server voice rehydrates via heartbeat; DM calls tear down on unmount (WebRTC). |
| **P** | **Fixed and verified** | View-as: composer/send blocked; manage UI gated by `manageUiAllowed`; create/rename hard-blocked. `MENTION_EVERYONE` filters suggestions + encode list; pasted `<@&roleId>` stripped without permission; view-as computes mention perm from the viewed role. Channel create without `MANAGE_CHANNELS` still rejected by RLS. |
| **Q** | **Fixed and verified** | Failed temps get `failed: true` + Dismiss; `temp-*` deletes are local-only. Failure mark ignored/dropped if channel/DM changed. Scope-gated composer restore. Success still merges via `mergeIncoming`. |
| **S** | **Fixed and verified** | Channel drawer: Escape + backdrop (`ResizableSidebar`). Members + voice sheets: Escape below `lg` + backdrop. Route change closes mobile list. |
| **T** | **Fixed and verified** | Scope effect clears draft/reply/files on channel/DM change. Live check: typed draft in `#bug-reports` → switch to `#general` → composer value `""` / placeholder `#general`. Failure restore gated on `sendScope`. |
| **U** | **Fixed and verified** | Friends panel realtime; `ProfileFriendButton` + open small/big `ready.friendStatus` refresh on `friends` changes. Block closes cards; members/DM lists filter via `blockedIds`. |
| **V** | **Fixed and verified** | Channel load: `messagesRequest`/`stillCurrent`. DM load: `dmMessagesRequest`/`stillCurrent` on load + realtime. Older-page loads discard when channel/conversation refs mismatch. Rapid channel hops ended on matching `#bug-reports` placeholder with empty draft. |

### Code changes this pass (3b)
- `CallOverlay.tsx` — fix invalid JSX comment that broke the build
- `MessengerShell.tsx` — view-as mention perms, strip role tokens, scoped failure list updates
- `webrtcMesh.ts` — camera track `ended` → announce off

## Still open / broken
- Jump-to-unread pill not built
- `↑` edit-last-own still incomplete
- Cmd/Ctrl+K quick switcher not built
- Account settings still one section
- Group DM polls still skipped (schema)

## Blockers
- None

## Suggested next focus
- Live two-client voice/camera QA after deploy
- Remaining product gaps (jump-to-unread, quick switcher)
