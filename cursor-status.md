# Cursor Status

**Last updated:** 2026-11-28 (Fix messenger hang from sound prefetch)

## Localhost health
**Healthy**

## Messenger load hang
Cause: UI sound helper mass-prefetched ~12 MP3s (and decoded them) on app boot / first click, competing with messenger bootstrap.

### Fix
- Sounds are fully lazy — load/decode only the clip that is about to play
- No startup `fetch` storm for `/sounds/*`
- `/sounds/` remains auth-public; production build is green

## Still open / broken
- Reports / Funding placeholders (out of messenger scope)
- Jump-to-unread pill not built
- Cmd/Ctrl+K quick switcher not built

## Blockers
- None
