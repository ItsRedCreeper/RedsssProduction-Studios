# Cursor Status

**Last updated:** 2026-11-28 (Fix tag inline position + visible restyle)

## Localhost health
**Healthy** (prior).

## Profile tags
Display-only — ItsRed Creeper still has pioneer + funder.

### Layout fix
- Small/big profile use `inline-flex` content-hugging rows (no `flex-1` / `ml-auto`)
- Result: `[Username] [Pioneer] [Funder]` with ~6–8px gaps, not far-right

### Style
- Pills: clearer red/gold fills, light inset highlight + border, compact height
- Member circles: 12px, soft ring, clear Pioneer red / Funder gold
- Hover still shows name + description on circles

## Still open / broken
- Reports / Funding placeholders (out of messenger scope)
- Jump-to-unread pill not built
- Cmd/Ctrl+K quick switcher not built

## Blockers
- None
