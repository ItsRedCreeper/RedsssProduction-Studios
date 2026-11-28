# Cursor Status

**Last updated:** 2026-11-28 (Funder / Pioneer profile tags)

## Localhost health
**Healthy** (prior).

## Profile tags
Added site reward tags (not server roles; no permission effect).

### Data
- Column: `profiles.profile_tags text[]` default `{}`
- Values: `pioneer`, `funder`
- Seeded **ItsRed Creeper** with both: `['pioneer','funder']`
- Everyone else empty
- Ops helper: `setProfileTagsByUsername` in `src/lib/profile-tags.ts` (+ SQL notes in that file)

### UI
- Shared `ProfileTagsPills` — Pioneer (muted red) then Funder (soft gold/amber), with tooltips
- Shown on: big profile (under name), small profile card, member list
- Not on navbar or chat messages

### Confirmed
- DB: ItsRed Creeper has `pioneer` + `funder`
- No other profile has tags

## Still open / broken
- Reports / Funding placeholders (out of messenger scope)
- Jump-to-unread pill not built
- Cmd/Ctrl+K quick switcher not built

## Blockers
- None
