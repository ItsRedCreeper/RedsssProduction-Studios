# Cursor Status

**Last updated:** 2026-11-25 15:36

## Completed this batch
- Full RedsssMessenger GUI redesign pass (10+ UI commits on `main`, pushed).
- Shell chrome: messenger CSS tokens, non-Discord server rail (no pill morph), red-edge active rows, unified headers with red hairline, account dock + voice bar as inset cards.
- Chat/composer: accent Send + reply bar, calmer context menus (neutral hover; danger delete), empty channel starts, jump-to-present, day dividers, reaction pills.
- Sidebars/mobile: channel/DM active rows, Discover hero/cards in red identity, mobile channel drawer sheet.
- Profiles: small/big profile cards with accent ring; role pills restyled.
- Voice/call: CallOverlay tiles/minimized card, VoicePane join preview + tiles, control chrome.
- Modals/Discover/invites/polls: shared rounded-2xl + accent-ring language; Discord blue focus rings → accent.
- Earlier: HoverTip edge flip/slide; navbar always “RedsssProduction Studios” + avatar username tip when name hidden.

## Still open / broken
- Visual QA on live deploy (hard-refresh CDN) — not browser-verified end-to-end after this redesign.
- Friends home panel / account-settings chrome may still look more Discord-adjacent than the rest of the shell.
- Some link/embed blues (`#00a8fc`) intentionally kept for link readability; could be revisited for brand consistency.
- ServerSettingsModal internals (tabs/forms) only got shell chrome — dense Discord-like form layout remains.
- Group DM polls still channel-only (known intentional gap from prior polish).
- Admin hoist-only test role Leave-only menu remains intentional — do not grant extra perms.
- Untracked local file `messenger-polish-planner-prompt.md` (not committed).

## Blockers
- None for continued GUI work. Waiting on next planning prompt for priority order.

## Suggested next focus
- Live visual QA at 375px + desktop: double-scroll, clipped send, drawer, call overlay, profile open.
- Friends / Home chrome pass to match new shell language.
- Server Settings + channel settings interior polish (tabs, rows, save/danger buttons) without changing permissions.
- Optional: consolidate remaining hard-coded Discord grays onto `--ms-*` messenger tokens.
