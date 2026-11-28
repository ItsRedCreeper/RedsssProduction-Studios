# Cursor Status

**Last updated:** 2026-11-28 (Site-wide speed: REST cap 6 + coalesce)

## Localhost health
**Healthy**

## Performance
- Soft REST concurrency cap **6** (was 3 — felt sluggish site-wide; auth still unqueued)
- Short secondary boot delays (~400ms)
- Coalesce membership / server chrome / channel messages (StrictMode double-fetch)
- Shared profile store + no premature AbortSignal on critical loads

## Still open / broken
- Reports / Funding placeholders
- Jump-to-unread pill not built
- Cmd/Ctrl+K quick switcher not built

## Blockers
- None
