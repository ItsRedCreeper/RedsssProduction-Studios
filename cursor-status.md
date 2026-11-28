# Cursor Status

**Last updated:** 2026-11-28 (Severe load perf pass)

## Localhost health
**Healthy**

## Performance — bottlenecks found
1. **Home pulled ~1.1MB components chunk** including Voice/Call/WebRTC on every route
2. **`logo.jpg` was 558KB / 4320²** for a 36px navbar slot
3. **MessengerShell static-imported** settings (~4k lines), pickers, CallOverlay, all modals
4. **DM inbox N+1** last-message REST fan-out at boot
5. **Presence/Unread/emoji** competed with critical messenger REST on startup

## What changed
- Lazy-load **VoiceCallProviders** (immediate on `/messenger`, idle on other routes); thin context modules so Navbar doesn’t import WebRTC
- `next/dynamic` for MessengerShell, ServerSettings, CallOverlay (gated), Voice/Discover panes, all create/edit modals, Friends/Notifications/Account panels, profile modals, Emoji/Gif pickers, MediaLightbox
- Compact logos (`logo-128.jpg` 4KB / `logo-256.jpg` 10KB); SiteLogo uses them
- Fewer font weights (Sora 400/600, Mono 400) + `display: swap`
- Defer custom emoji catalog (~700ms), PresenceFeed fetch/RT (~900ms), SiteActivityTracker until secondaryReady
- RPC `get_dm_last_messages` replaces N DM preview queries
- REST concurrency still **6** (auth unqueued)

## Before / after (dev, cold `/`, cache disabled)
| Metric | Before | After |
|--------|--------|-------|
| DCL | ~493ms | ~173ms |
| load | ~677ms | ~336ms |
| script transfer | ~6.1MB | ~5.4MB |
| largest app chunk | ~1133KB components | ~440KB (voice out of home) |
| logo | 559KB | 4KB |
| voice on home initial | yes | **no** |

Messenger shell still appears with channels/rail after voice chunk loads; heavy UI (settings, pickers, call overlay) on demand.

## Still open / broken
- Reports / Funding placeholders
- Jump-to-unread pill not built
- Cmd/Ctrl+K quick switcher not built
- Production Lighthouse not re-run (dev numbers inflated by Next/React dev bundles)

## Blockers
- None
