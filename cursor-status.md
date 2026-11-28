# Cursor Status

**Last updated:** 2026-11-28 (Funder / Pioneer tag display fix)

## Localhost health
**Healthy** (prior).

## Profile tags
Site reward tags (not server roles).

### Display fix
- Funder pill used near-transparent gold + dark text → invisible on dark cards
- Now: solid soft gold `#e8b84a` + dark `#1f1608` (with explicit `WebkitTextFillColor`)
- Pioneer: muted red fill + light `#fecaca` text
- Fixed min-height / padding so pills never collapse empty
- Small card: tags sit under the name button (not inside it) so styles don’t fight

### Data (unchanged)
- ItsRed Creeper still has both `pioneer` + `funder`

## Still open / broken
- Reports / Funding placeholders (out of messenger scope)
- Jump-to-unread pill not built
- Cmd/Ctrl+K quick switcher not built

## Blockers
- None
