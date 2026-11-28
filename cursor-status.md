# Cursor Status

**Last updated:** 2026-11-28 (More voice / screenshare UI sounds)

## Localhost health
**Healthy** (prior).

## UI sounds
`src/lib/ui-sounds.ts` — pre-decoded buffers, mute toggle in Account Settings.

### Wired
- Send / receive / mention / notification / error
- Local voice-join / voice-leave (instant)
- Mute / unmute
- Deafen / undeafen
- Other users join/leave current voice/call → `voice-user-join` / `voice-user-leave`
  (skipped for peers already present when you connect; not fired on local leave)
- Screen share start / stop (incl. browser “Stop sharing”)
- Incoming call loop

### Controls
- Volume ~0.4, debounce on busy events
- Missing files skipped

## Still open / broken
- Reports / Funding placeholders (out of messenger scope)
- Jump-to-unread pill not built
- Cmd/Ctrl+K quick switcher not built

## Blockers
- None
