# Cursor Status

**Last updated:** 2026-11-28 (Fix production sounds + deploy build)

## Localhost health
**Healthy**

## UI sounds on production
Root cause: Vercel builds were failing (`lint_or_type_error`), so sound code/assets never reached production. Live site stayed on an older deploy.

### Fixes
- Build: `raceTimeout` accepts thenables; `asProfile` accepts DB `string[]` tags; `ui-sounds` TS idle timer
- Playback: unlock AudioContext on first gesture; HTMLAudio fallback when Web Audio is suspended; absolute `/sounds/` URLs; don’t permanently blacklist transient fetch failures

### Wired sounds (unchanged set)
Send/receive, mention, notification, error, voice join/leave, peer join/leave, mute/unmute, deafen/undeafen, screenshare start/stop, incoming-call loop.

## Still open / broken
- Reports / Funding placeholders (out of messenger scope)
- Jump-to-unread pill not built
- Cmd/Ctrl+K quick switcher not built

## Blockers
- None
