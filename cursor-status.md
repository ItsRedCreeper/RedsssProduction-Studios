# Cursor Status

**Last updated:** 2026-11-28 (User-facing copy pass)

## Localhost health
**Healthy.** `/messenger` returns 200.

## Copy rewrite summary
Rewrote **~45** user-facing strings that sounded like developer notes or Discord-admin jargon.

### Rewrote (examples)
- Permission sync: “until synced per channel” → clear access language; Sync Now/Re-sync → Match/Reset to category
- Permission list: dropped “overrides,” “permission bit” tone; Administrator / @everyone / Join Voice clarified
- Tri-state: Inherit → Default + plain tooltips
- Role preview: “View Server As Role” → Preview as role
- Voice quality tips: dropped raw `ms` / Measuring → Checking / Connection looks great
- Stickers: removed APNG jargon
- AutoMod, Discover empty, invite link, reply ping tips, notifications empty, discoverable helpers

### Left unchanged on purpose
- Friends panel empty states (already plain)
- Create Channel private helper (already user-facing)
- Age-restricted / Pause invites / Create Server intro (already clear)
- Session-expired message (already clear)
- Code comments (not user-facing)
- Raw Supabase `.message` fallbacks still exist in some paths — mapped where we already had auth helpers; full error sanitization is a separate pass

## Still open / broken
- Reports / Funding placeholders (out of messenger scope)
- Jump-to-unread pill not built
- Cmd/Ctrl+K quick switcher not built
- Channel/category drag-and-drop reorder not built

## Blockers
- None
