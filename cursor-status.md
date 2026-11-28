# Cursor Status

**Last updated:** 2026-11-28 (Messenger UI sound effects)

## Localhost health
**Healthy** (prior).

## UI sounds
Wired `/public/sounds/*.mp3` via `src/lib/ui-sounds.ts` (`playSound` / `startSoundLoop`).

### Triggers
- Message send success → `message-send`
- Active channel/DM receive (not self) → `message-receive`
- Mention / reply notification → `mention`
- Friend-style notification → `notification`
- Voice/call connect → `voice-join`
- Voice/call leave → `voice-leave`
- Mute / unmute → `mute` / `unmute`
- Incoming call → looping `incoming-call` (stops on accept/decline)
- Send/upload failure → `error`

### Controls
- Volume ~0.4, per-sound debounce
- Toggle in Account Settings → Sounds (default on, `localStorage`)
- Missing files skipped silently

## Profile tags
ItsRed Creeper tags cleared earlier.

## Still open / broken
- Reports / Funding placeholders (out of messenger scope)
- Jump-to-unread pill not built
- Cmd/Ctrl+K quick switcher not built

## Blockers
- None
