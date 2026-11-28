# Cursor Status

**Last updated:** 2026-11-28 (Fix messenger auth/PostgREST stampede hang)

## Localhost health
**Healthy** (dev server up; PostgREST was 504ing under boot stampede)

## Messenger load hang
### Root causes
1. Every `useCurrentProfile()` mount called `auth.getUser()` → dozens of parallel `/auth/v1/user` calls
2. AppShell booted Voice + Call + Unread + Presence + blocked/ignored/nicknames + messenger at once → PostgREST **504 / statement timeout** storm
3. Sound prefetch (earlier) added more boot contention

### Fixes shipped
- `useCurrentProfile` module singleton (`getSession` + one profile fetch)
- Shared browser Supabase client
- Boot-path `getClientUser()` instead of `getUser()` (blocking, ignoring, friends, nicknames, presence)
- Shared `useBlockedUsers` store; deferred blocked/ignored/nicknames/presence privacy (2s)
- AppShell defers Unread + PresenceController 2s on messenger routes
- Voice restore deferred 1.5s with abort
- Server/message loads use abort timeouts (12s / 8s)

## Still open / broken
- Reports / Funding placeholders
- Jump-to-unread pill not built
- Cmd/Ctrl+K quick switcher not built

## Blockers
- None
