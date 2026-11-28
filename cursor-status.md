# Cursor Status

**Last updated:** 2026-11-28 (Fix production sounds + deploy build)

## Localhost health
**Healthy**

## UI sounds on production
Two blockers:
1. Vercel builds were failing (`lint_or_type_error`) — sound code never reached production
2. Auth proxy redirected `/sounds/*.mp3` → `/login`, so Audio/fetch got an HTML page instead of MP3

### Fixes
- Build type errors fixed so deploys succeed
- `/sounds/` (and mp3 matcher) skipped by auth proxy
- Playback: unlock AudioContext on gesture; HTMLAudio fallback when Web Audio is suspended

### Wired sounds (unchanged set)
Send/receive, mention, notification, error, voice join/leave, peer join/leave, mute/unmute, deafen/undeafen, screenshare start/stop, incoming-call loop.

## Still open / broken
- Reports / Funding placeholders (out of messenger scope)
- Jump-to-unread pill not built
- Cmd/Ctrl+K quick switcher not built

## Blockers
- None
