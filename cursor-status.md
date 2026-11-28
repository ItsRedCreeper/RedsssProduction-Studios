# Cursor Status

**Last updated:** 2026-11-27 22:10

## Pass 3 — Voice / permissions / composer / profiles / mobile (M–V)

| ID | Final verdict | Evidence / fix |
|---|---|---|
| **M** | **Partially confirmed → Fixed** | Minimized DM call bar used `sm:bottom-3`, overlapping the composer / colliding with the sidebar voice bar. Mini bar is now top-anchored on all breakpoints. Disconnect / unmount paths already cleared overlay state. |
| **N** | **Confirmed → Fixed** | Camera toggle could mark UI on even when mesh `setLocalVideoTrack` failed, and camera lacked a track `ended` handler (screen share already had one). Both Call + Voice session providers now require mesh `ok`, stop the track on failure, and clear camera UI/`persistMediaFlags` on `ended`. |
| **O** | **Disproved** | Server voice leaves only when pathname leaves `/messenger`; channel/DM/Discover switches inside messenger keep the session. Intentional leave still deletes `voice_states` immediately; refresh uses heartbeat + stale cleanup. |
| **P** | **Partially confirmed → Fixed** | View as Role still offered create/edit channel, invite, and settings because manage gates used real owner perms. Management UI/actions now require `manageUiAllowed` (`!viewAsRoleId && !previewMode`). `MENTION_EVERYONE` was unused: role mention suggestions + `encodeMentions` role list are empty without it. |
| **Q** | **Partially confirmed → Fixed** | Failed optimistic messages stayed forever; deleting `temp-*` hit the DB and rolled back the ghost. Temp deletes are local-only; failed rows expose a Dismiss control. |
| **R** | **Disproved** | `clampCardPosition` keeps small cards on-screen; blocked/restricted profiles already hide mutuals/about. No reproducible stale-open or off-screen bug after edge cases in code review. |
| **S** | **Partially confirmed → Fixed** | Channel drawer already Escape-closes via `ResizableSidebar`. Members sheet (mobile) had backdrop click but no Escape — Escape now closes it below `lg`. |
| **T** | **Partially confirmed → Fixed** | Scope clear already resets draft/reply/files on channel change. Failure path could restore a draft into the *new* conversation after navigate-away; restore is now gated on `scopeRef` matching the send-time scope. |
| **U** | **Partially confirmed → Fixed** | Friends panel refreshed on realtime; open profile friend button kept `initialStatus` and never re-fetched. Button now reloads friendship and subscribes to `friends` postgres_changes. Block already closes profiles and filters members/DM list via `blockedIds`. |
| **V** | **Partially confirmed → Fixed** | Initial channel load already used `messagesRequest` / `stillCurrent`. `loadOlderChannel` / `loadOlderDm` applied results after a switch — now discard when `activeChannelRef` / `conversationRef` no longer match. |

### Code changes this pass
- `CallOverlay.tsx` — minimized bar top-only
- `CallSessionProvider.tsx` / `VoiceSessionProvider.tsx` — camera mesh ok + `ended`
- `MessengerShell.tsx` — manage UI under view-as, `MENTION_EVERYONE`, temp delete, scoped failure restore, older-message race guards, members Escape
- `MessageItem.tsx` — dismiss failed optimistic
- `ProfileFriendButton.tsx` — friendship realtime refresh

## Pass 2b — Final verdicts (F / H / I / J / K / L)

| ID | Final verdict | Evidence |
|---|---|---|
| **F** | **Disproved** | Bell and panel both use `countUnreadPanelRows()` on the same UnreadProvider state. |
| **H** | **Disproved** | Empty stuck divider cleared when list is loaded and `firstUnreadMessageId` is null. |
| **I** | **Disproved** | Realtime patch always re-sorts unless that conversation is already top with the same preview. |
| **J** | **Disproved** | Unfocus → Idle via `hasFocus()`; last-tab Offline via `pagehide`. |
| **K** | **Disproved** | Notify RPCs short-circuit on blocked **and** ignored. |
| **L** | **Confirmed (fix holds)** | Mark-all publishes read-sync and advances local activity maps. |

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
- Live QA of Pass 3 voice + mobile after deploy
- Remaining product gaps (jump-to-unread, quick switcher)
