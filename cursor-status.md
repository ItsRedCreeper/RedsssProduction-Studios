# Cursor Status

**Last updated:** 2026-11-28 (Shrink Pioneer/Funder tag pills)

## Localhost health
**Healthy** (prior).

## Profile tags
Site reward tags (not server roles). Size/placement pass only — who has tags unchanged.

### Size
- Tiny label chips (`9px` / `10px`), fixed short height, medium weight — not buttons
- Soft borders; Pioneer muted red + light text; Funder soft gold + dark text

### Placement
- Member list: username full-width on its own row; tags on a second line under the name
- Small card: under username, tighter `mt-0.5`
- Big profile: under username, same small style (`md` only slightly roomier)

### Tooltips (unchanged)
- Pioneer: “Funded before official release”
- Funder: “Funded RedsssProduction Studios”

### Data
- ItsRed Creeper still has both `pioneer` + `funder`

## Message load timeout
Fixed earlier (`5fdc729`) — load vs realtime split + RPC deadline.

## Still open / broken
- Reports / Funding placeholders (out of messenger scope)
- Jump-to-unread pill not built
- Cmd/Ctrl+K quick switcher not built

## Blockers
- None
