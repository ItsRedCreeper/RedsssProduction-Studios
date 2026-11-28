# Cursor Status

**Last updated:** 2026-11-28 (Pass 10)

## Localhost health
**Healthy.** `/messenger` returns 200; `next build` succeeds after Pass 10.

## Pass 10 — Final verdicts (no Partial)

| ID | Final verdict | Evidence |
|---|---|---|
| **CF** | **Fixed and verified** | Online + visibility gap-fill; `CHANNEL_ERROR`/`TIMED_OUT` remounts message/DM/membership channels; recover merges channel + DM messages/reactions + unread refresh. |
| **CG** | **Fixed and verified** | DM load clears sync + loading flag at effect start; Server Settings pinned to open server and closes on server switch (no retarget). |
| **CH** | **Disproved** | `join_server_via_invite` uses `FOR UPDATE` + conditional `uses` increment; revoke-as-delete fails cleanly for the loser. |
| **CI** | **Fixed and verified** | Live `server_members` INSERT (join) + UPDATE (nickname/timeout) alongside existing DELETE/kick and role reloads. |
| **CJ** | **Fixed and verified** | `uploadAttachment` accepts AbortSignal; scope change / send cancel aborts in-flight uploads and cleans orphaned blobs when aborted post-upload. |
| **CK** | **Disproved** | Camera/screen `replaceTrack` paths already present in Voice/Call + mesh. |
| **CL** | **Fixed and verified** | Notification RPCs emit `?msg=` (+ `&thread=`); DM replies use `/messenger/channels/@me/…`; panel builds href from meta and rewrites legacy `/dms/` links. |
| **CM** | **Disproved** | Messenger storage reads already try/catch; drafts are in-memory Maps. |
| **CN** | **Fixed and verified** | `(edited)` shows `title={formatTimestamp(edited_at)}`; day dividers already tick past midnight. |
| **CO** | **Disproved** | Subscribe/`removeChannel` pairing + leave-messenger hangup still hold under heavy nav. |

### Code / DB changes this pass
- DB: `notify_message_mentions` / `notify_message_reply` deep links
- `MessengerShell.tsx` — reconnect/resubscribe, DM clear, members live, settings pin, upload abort
- `data.ts` — abortable `uploadAttachment`
- `NotificationsPanel.tsx` — `notificationHref` from meta
- `MessageItem.tsx` — edited timestamp tooltip

## Still open / broken
- Reports / Funding placeholders (out of messenger scope)
- Jump-to-unread pill not built
- Cmd/Ctrl+K quick switcher not built

## Blockers
- None

## Suggested next focus
- Two-client QA: offline gap fill; single-use invite race; thread mention jump; attach then switch channel mid-upload
