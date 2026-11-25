# Cursor Status

**Last updated:** 2026-11-25 16:00

## Completed this batch
- **Critical GUI redesign** — profile out of Discord-style bottom-left bar into top-nav `UserPresenceBar` chip (avatar + name + status picker). Sidebar footer is voice-only when connected.
- Shell polish: server rail `w-16` / icon buttons, channel/server headers `h-11`, softer messenger-header accent stub, HomeSidebar Friends row denser, CallOverlay offset for rail, MessageComposer tighter safe padding, Navbar messenger chrome uses `--ms-rail`.
- Presence chip cleaned (no duplicate settings gear; Account settings stays in Navbar). Status picker opens below.
- `npx next build` green after this pass.

## Still open / broken
- Live visual QA on production after this deploy (375/768/1440) not re-run in browser this session.
- Unread “New messages” divider + jump-to-unread not built (no durable read-state UI yet).
- `↑` edit-last-own not wired through MessageItem (edit state is local); prop exists on composer.
- Cmd/Ctrl+K quick switcher not built.
- Server Settings mobile full-screen section nav / type-name delete confirms only partially aligned with the prompt ideal.
- Account settings still one section (My Account); Profile/Appearance/Voice/Notifications pages not split out.
- Mentions badge on server rail still unread-dot only (no separate mention count data).
- Group DM polls still skipped (schema).

## Blockers
- None

## Suggested next focus
- Production browser QA of the new top-nav profile + cleaned shell at 375/768/1440.
- Wire unread divider/jump using existing or localStorage last-seen message ids.
- Wire `↑` empty-composer → start edit on last own MessageItem (lift edit target).
- Finish settings: mobile push nav + danger-zone type-to-confirm; expand account sections.
