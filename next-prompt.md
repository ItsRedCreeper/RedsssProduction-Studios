# Next prompt: RedsssMessenger Batch 3 (QA hardening, Friends/Home, Settings interiors, token consolidation)

**Written by:** RedsssBot (planning bridge)
**Based on:** `cursor-status.md` from 2026-11-25 15:36 (commit `7dcba53`)
**Repo:** `C:\RedsssProduction Studios` → `origin/main` (Vercel)

You are the implementer for RedsssMessenger (Next.js App Router + Supabase). The last pass gave the messenger shell a Redsss chrome identity: the `--ms-*` tokens, a non-Discord server rail, red-edge active rows, red hairline headers, inset account dock and voice bar cards, accent focus rings, and a shared rounded-2xl modal look with an accent ring. **This batch builds on that identity and does not undo it.** Keep Discord *functionality* and *information density*, and keep the visual language Redsss.

---

## Ground rules (non-negotiable)

- **Preserve all functionality.** Before each batch, list the user flows the files you touch can affect, and re-check them before you commit. Don't change Supabase queries, RLS assumptions, permission bits, or WebRTC signaling unless a listed bug requires it.
- **No tutorial, "dev only", placeholder, or meme copy** in production UI. Empty states are short and plain ("No pinned messages yet.").
- **Admin hoist-only test role** on BOFRFF stays as it is: no extra permissions, and Leave-only server menu for non-owners without manage bits. Don't "fix" it.
- **Discord hoist = Display separately only**, and the default Member role is always kept.
- **Height contract:** `AppShell` is `h-dvh` → `main flex-1 min-h-0` → children `h-full min-h-0`. No leaf `h-[calc(100dvh-…)]`, and no `100vh`.
- **Tokens:** new or touched messenger styles use `--ms-*` CSS variables, not raw hex. If a token you need is missing, add it to the token file once and reuse it.
- **Brand red** goes on active and selected states, primary CTAs, focus rings, and hairlines. It never goes on large fills, body text, or every hover. Danger actions keep a distinct danger red token, so red brand and red danger never read as the same thing (for example, danger buttons are solid, and brand accents are edges, rings and text).
- **Batches:** one coherent commit per batch. Run `npx next build` (typecheck + compile) before each push. Commit and push to `origin` on the current branch after each batch. **No force push.**
- After the final batch, **update `cursor-status.md`** (format at the bottom), commit it, and push.
- Delete or `.gitignore` the untracked `messenger-polish-planner-prompt.md`. Don't commit it.

---

## Batch 1: Live QA hardening (P0, do this first)

Hard-refresh the production deploy (or the latest preview) while signed in. Check it at **375px, 768px and 1440px**. Fix every regression the redesign introduced. Check at least:

1. **Scroll:** only one scroll container per column. No body or page scroll in the messenger. The chat timeline, channel list, member list and settings panes scroll on their own.
2. **Composer at 375px:** Send is never clipped, the + menu (Poll, GIF, stickers) opens fully on-screen, and the reply bar doesn't push Send off-screen. The composer stays above the iOS keyboard (use `dvh` and `env(safe-area-inset-bottom)` padding).
3. **Mobile channel/DM drawer:** it opens and closes from the header button, closes on route change, swipe or Escape, and on backdrop tap. It traps focus while open, and the active row keeps the red edge.
4. **Call overlay:** the minimized card never covers the composer or Send at 375px. The expanded call is a fixed layer under the navbar, with no member list peeking through. 1:1 ringing shows "Ringing…", and cancel returns to the DM with the list intact.
5. **Profile cards:** small cards open inside the viewport (use HoverTip-style edge flip), the big profile modal scrolls inside itself, and the accent ring isn't clipped.
6. **Server rail:** with no pill morph, make sure the selected, unread and mention states are still clearly distinct (selected uses the red edge, unread a small dot, mentions a red count badge). Show tooltips on hover and focus.
7. **Navbar ↔ shell seam:** there's a single hairline, and no double border or gap at any width.
8. **Guest and missing session:** `/messenger` goes to login or `@me` with no infinite loader, and no messenger skeleton stays stuck when signed out.

Commit: `QA: fix post-redesign layout regressions at 375/768/1440`.

---

## Batch 2: Friends / Home chrome pass

Bring the Friends home and DM home up to the new shell language. They're the most Discord-adjacent surfaces left.

- **Friends header:** tabs (Online, All, Pending, Blocked, Add Friend) styled like the unified headers, with the red hairline. The active tab gets a red underline or edge, not a filled pill. "Add Friend" is the primary CTA in accent.
- **Friend rows:** the same density and red-edge hover and active treatment as channel and DM rows. Avatar, presence dot, display name, @username, and the custom status in secondary text. Row actions (Message, Call, More) show as icon buttons on hover and on focus-within, with tooltips. **Message opens that friend's DM** (keep the existing `startDm` / `messengerDmPath` behavior).
- **Pending:** incoming and outgoing are grouped with counts. Accept uses the connected or join green token, and Decline and Cancel use neutral styling with a danger hover.
- **Add Friend:** an inline input card with clear success and error states ("Friend request sent to @name.", "No user found with that username."), and no exclamation-stacked copy.
- **Empty states** for each tab: short and plain, with a small Redsss-styled illustration or icon if one already exists in the repo. Don't add new image assets.
- **Active Now column** (desktop ≥ `xl` only): friends in voice or in a call, shown as inset cards like the account dock. Hide it below `xl`.
- **DM home sidebar:** the "Friends" entry at the top gets the same active treatment, and the group DM "Call in progress · Join" row stays functional.

Commit: `Friends/Home: match Redsss shell chrome, row actions, pending and empty states`.

---

## Batch 3: Account settings + Server/Channel settings interiors

Interior polish only. **No permission logic changes.**

- **Shared settings layout:** a left nav (sections with group labels in secondary uppercase small caps) and a right content pane with a max readable width (~720px). It scrolls inside the pane, never the page. Mobile: the nav becomes a full-screen list that pushes into a section view with a back button.
- **Form rows:** consistent label, helper text and control spacing, inputs on `--ms-*` surface tokens, focus ring in accent, and inline validation text under the field.
- **Unsaved changes bar:** when a settings form is dirty, show a bottom inset card that reads "You have unsaved changes." with Reset (neutral) and Save (accent). Disable navigation away, or warn on close, while it's dirty. If a version of this already exists, restyle it rather than duplicating it.
- **Danger zone:** delete server, delete channel, leave and ban actions sit together in a bordered danger section at the bottom of the relevant page, with a confirm modal that asks you to type the server or channel name for destructive deletes, if that matches existing behavior.
- **Roles page:** keep the two-pane layout, category perms and View as Role. Polish the role list (drag handle, color dot, member count), the permission toggles (consistent switch component), and the search. Regression-check owner and manage-bit users, and that the Admin hoist role lacks Settings.
- **Channel settings:** Overview, Permissions and Invites tabs get the same shared layout.
- **Account settings:** My Account, Profile, Appearance, Voice & Video and Notifications get the same shared layout. The profile preview card uses the existing small profile card component, so it matches what others see.
- **Modal sizing:** all settings modals use the same `max-h-[min(90dvh,…)]` and full-screen sheet behavior on mobile.

Commit: `Settings: shared Redsss layout for account, server, and channel settings interiors`.

---

## Batch 4: Token consolidation + link color decision

- Grep the messenger (`components/messenger/**`, `app/messenger/**` and any shared chat components) for hard-coded Discord grays and colors (`#313338`, `#2b2d31`, `#1e1f22`, `#1f2023`, `#404249`, `#949ba4`, `#23a559`, `#ed4245`, `#00a8fc`, `#5865f2` and similar), and replace each with its `--ms-*` token. Leave a short comment in the token file that maps each token to its role.
- **Links and embeds:** keep links readable with a dedicated `--ms-link` token. Pick a link color that passes WCAG AA on the chat background and fits the Redsss palette (a lighter, desaturated red or a neutral light blue are both fine). Document the choice in the token file, and use it everywhere links render (messages, embeds, profile bios, invite cards).
- Make sure no messenger component still uses site tokens like `border-border`, `text-muted` or `ring-accent` meant for the marketing site, when an `--ms-*` equivalent exists.
- Optional if time allows: a quick contrast check of secondary text, disabled controls and placeholder text on each surface token. Bump anything under AA.

Commit: `Tokens: consolidate messenger colors onto --ms-* and add --ms-link`.

---

## Batch 5: Discord-parity functionality gaps (only if Batches 1–4 are green)

Small functional gaps that make it feel like Discord. **Don't build new large surfaces.**

- **Unread handling:** a "New messages" divider in the timeline at the first unread message, a "Jump to unread" pill at the top when it's off-screen, and channel rows bolded when unread. Use whatever read-state data already exists. If none does, keep it client-side (local storage per channel, last seen message id) and say so in the status.
- **Keyboard:** `Esc` closes menus, modals, drawers and the reply bar. `↑` in an empty composer edits your last message, if editing exists. `Ctrl/Cmd+K` opens a quick switcher for servers, channels and DMs, only if it can reuse existing data without new queries.
- **Message grouping:** consecutive messages from the same author within 7 minutes collapse under one header. Hovering a grouped message shows a time gutter.
- **Typing indicator:** sits above the composer in secondary text, with animated dots, and names up to 3 people ("A, B and 2 others are typing…").
- **Group DM polls:** **skip.** It needs a schema change (`dm_messages` has no poll columns). Just keep the poll option hidden in group DMs.

Commit: `Parity: unread divider/jump, keyboard shortcuts, grouping, typing line`.

---

## QA checklist before updating status

- `npx next build` passes.
- 375px: no clipped Send, no double scroll, the drawer works, the call overlay doesn't cover the composer, and the navbar menu is usable.
- Desktop: the Friends tabs, pending and row actions work, and Message opens the right DM.
- Settings: an owner sees Settings, Create and View as Role, and the Admin hoist role doesn't. The unsaved bar works, and the danger zone confirm works.
- Calls: 1:1 ring, cancel, missed-call system message, group DM Join, and server voice join and leave.
- Server text: search, pins, members toggle, poll, GIF, emoji, reply, forward and grouping all still work.

---

## Update `cursor-status.md` when done (keep this format)

```md
# Cursor Status

**Last updated:** YYYY-MM-DD HH:MM

## Completed this batch
- (one bullet per batch with its commit SHA)

## Still open / broken
- (anything not verified, regressions found, deferred items)

## Blockers
- (or "None")

## Suggested next focus
- (2–4 bullets)
```

Commit it as `Update cursor-status after batch 3 (QA, Friends, Settings, tokens, parity)` and push. RedsssBot will read it and write the next `next-prompt.md`.
