# Cursor Status

**Last updated:** 2026-11-28 00:45

## Localhost health
**Healthy.** `/messenger` returns 200; `next build` succeeds after Pass 6.

## Pass 6 — Final verdicts (no Partial)

| ID | Final verdict | Evidence |
|---|---|---|
| **AQ** | **Fixed and verified** | `openDm` only reuses non-group 1:1 convos; thread reuse compares `participantIds`; group create requires ≥2 friends; late call join updates `peerUserIds` + `mesh.connectPeer`. |
| **AR** | **Fixed and verified** | Speaking rings intersect current voice occupants; leave DELETE prunes watched speaking; voice occupancy re-ticks every 8s so stale seats drop without realtime. |
| **AS** | **Fixed and verified** | Hoist/status sections already correct (disproved duplicates). Group member count fixed via `participantIds` refresh (AQ). |
| **AT** | **Fixed and verified** | Forward uses `attachmentsFromMessage` (legacy URL rows); copy link includes `?thread=`; deep-link waits for messages + opens thread + retries DOM. |
| **AU** | **Fixed and verified** | Channel message load has 20s timeout + cleanup; loading flags clear on hang. Voice “connecting forever” not observed (disproved). |
| **AV** | **Fixed and verified** | Edit rollback only if optimistic content still shown; delete restore only if row still missing (no full-list resurrection). |
| **AW** | **Fixed and verified** | HomeSidebar keeps parent DM order (no unread re-sort scroll jump); `selectServer` prefers recalled channel path. Full scroll restore not required for selection correctness. |
| **AX** | **Fixed and verified** | Opening lightbox pauses/hides inline videos so audio doesn’t dual-play; Escape/route unmount already OK. |
| **AY** | **Disproved** | Custom status caption is separate from presence dots; idle doesn’t clear `status_text` in UI paths audited. |
| **AZ** | **Fixed and verified** | Voice occupant list no longer capped at 8 (missing rows); member-list regroup interval 30s to cut thrash. Full virtualization not required to clear the confirmed bugs. |

### Code / DB changes this pass
- `MessengerShell.tsx` — group DM open, participantIds, speaking prune, voice tick, forward media, msg/thread deep links, load timeout, edit/delete conflict handling, selectServer channel path
- `CallSessionProvider.tsx` / `webrtcMesh.ts` — late joiner mesh connect
- `CreateGroupDmModal.tsx` — min 2 friends
- `HomeSidebar.tsx` — preserve parent sort
- `MessageMedia.tsx` — pause inline video under lightbox
- `ChannelSidebar.tsx` — show all voice occupants
- `MemberList.tsx` — slower stale tick

## Still open / broken
- Jump-to-unread pill not built
- Cmd/Ctrl+K quick switcher not built
- Group DM polls still skipped (schema)
- In-memory message search does not page older history

## Blockers
- None

## Suggested next focus
- Two-client QA: group call late join; voice leave speaking ring; forward attachment; concurrent delete/edit
