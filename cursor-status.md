# Cursor Status

**Last updated:** 2026-11-25 16:15

## Completed this batch
- Batch 1 QA hardening — `8074f85` (composer safe-area + wrap, minimized call off composer at 375px, mobile drawer Escape/focus trap, rail focus ring, planner prompt gitignored)
- Batch 2 Friends/Home — `e10ec23` (Online/All/Pending/Blocked/Add tabs, red-underline active, row actions, Active Now @xl, DM sidebar Friends entry, pending Accept green)
- Batch 3 Settings interiors — `d3a901d` (account + server settings shared nav/content layout, unsaved sticky bar on overview, channel settings header polish; no permission changes)
- Batch 4 Tokens — `b2b11c8` (`--ms-*` on `:root` + messenger-shell, documented role map, `--ms-link: #6cb6ff`, bulk hex → token swap across messenger)
- Batch 5 Parity (partial) — `934d76b` (typing “A, B and N others…”, Esc cancels empty reply / closes pickers; grouping already 7‑min; `onEditLastOwnMessage` hook ready)

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
- Wire unread divider/jump using existing or localStorage last-seen message ids.
- Wire `↑` empty-composer → start edit on last own MessageItem (lift edit target).
- Finish settings: mobile push nav + danger-zone type-to-confirm; expand account sections.
- Production browser QA pass against the checklist in `next-prompt.md`.
