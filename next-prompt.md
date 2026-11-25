# Next prompt: RedsssMessenger Batch 4 (finish parity wiring, settings completion, production QA)

**Written by:** RedsssBot (planning bridge)
**Based on:** `cursor-status.md` from 2026-11-25 16:15 (batches `8074f85`, `e10ec23`, `d3a901d`, `b2b11c8`, `934d76b`)
**Repo:** `C:\RedsssProduction Studios` → `origin/main` (Vercel)

The last round landed QA hardening, Friends/Home, the shared settings layout, `--ms-*` token consolidation (with `--ms-link: #6cb6ff`) and part of the parity work. This round **finishes what was left half-wired**, completes settings, and ends with a real production QA pass. Keep Discord functionality and density, and keep the Redsss visual language as it is now: red-edge active rows, red hairline headers, inset cards, accent focus rings, and `--ms-*` tokens only.

---

## Ground rules (unchanged, non-negotiable)

- **Preserve all functionality.** Before each batch, list the flows the touched files affect, and re-check them before you commit. No changes to Supabase RLS, permission bits or WebRTC signaling.
- **No tutorial, "dev only", placeholder or meme copy** in production UI.
- **Admin hoist-only test role** on BOFRFF stays as it is: no extra permissions, and Leave-only for non-owners without manage bits.
- **Discord hoist = Display separately only**, and the default Member role is always kept.
- **Height contract:** `AppShell` `h-dvh` → `main flex-1 min-h-0` → children `h-full min-h-0`. No leaf `calc(100dvh-…)`, and no `100vh`.
- **Colors:** use `--ms-*` tokens only. No new raw hex in messenger components. Add a missing token once to the token map, with a role comment.
- **Brand red vs danger red** must stay visually distinct: brand is edges, rings and text, and danger is solid buttons and confirm states.
- **Schema:** don't add migrations in this round. Anything that needs new tables or columns gets noted under "Still open" instead.
- **Batches:** one coherent commit each. `npx next build` before every push. Commit and push to `origin` on the current branch after each batch. **No force push.**
- Finish by **updating `cursor-status.md`** in the same format, then commit and push.

---

## Batch A: Unread divider + jump to unread

- **Read state source:** use durable read-state data if any exists (check for a `last_read` or `read_states` style table or column first). If none exists, use **localStorage** keyed by `userId + channelId/dmId` → the last seen message id and timestamp. Update it when the timeline is scrolled to the bottom and the tab is visible, debounced to about 1s, and when the user sends a message.
- **"New messages" divider:** render it once, above the first message newer than last-seen, when a channel or DM is opened. It's a thin `--ms-*` red hairline with the label "New messages" in small caps on the right, in the Redsss style. It doesn't move while you're reading in that session. Clear it on the next open after you've caught up.
- **Jump pill:** when the divider is above the viewport, show a pill pinned under the channel header that reads "{n} new messages since {time} · Jump". Clicking it scrolls to the divider. "Mark as read" on the right clears it. Hide it once the divider is visible.
- **Sidebar unread:** channel and DM rows with unread messages get a bold name plus the existing unread dot. The server rail unread dot is derived from its channels. If mention data doesn't exist, don't fake mention counts. Leave the dot only, and note it.
- Edge cases: your own messages never count as unread, a deleted last-seen message falls back to its timestamp, and switching channels quickly doesn't write the wrong channel's state.

Commit: `Parity: unread divider, jump-to-unread pill, sidebar unread state`.

---

## Batch B: Keyboard: `↑` edit last + Ctrl/Cmd+K quick switcher

- **`↑` in an empty composer:** lift the edit target out of `MessageItem`'s local state into the timeline (or a small context), so the composer's `onEditLastOwnMessage` can start editing the user's most recent own message in the current channel or DM. Scroll it into view and focus the edit field. `Esc` cancels and `Enter` saves, matching current edit behavior. It does nothing if you have no own messages, or if the composer has text or an open reply.
- **Ctrl/Cmd+K quick switcher:** a centered modal in the shared rounded-2xl accent-ring modal style, with an input ("Where would you like to go?") and a list of servers, text and voice channels, DMs and group DMs, **built only from data already loaded in client state**, with no new queries. Use fuzzy match on name. Arrow keys move, Enter navigates, and Esc closes. Show the type icon on each row, and the server name in secondary text for channels. Recent destinations show first when the input is empty (localStorage, max 8). Don't open it while typing inside the composer unless the key combo is pressed, and never steal it from the browser when focus is outside the messenger.
- Add both shortcuts to a tooltip or help hint only if a shortcuts surface already exists. Don't add a new tutorial surface.

Commit: `Parity: ↑ edits last own message, Ctrl/Cmd+K quick switcher`.

---

## Batch C: Settings completion

- **Account settings sections:** split into My Account, Profile, Appearance, Voice & Video and Notifications using the shared nav/content layout from `d3a901d`. Each section only shows controls that are **already backed by existing data or local preferences**:
  - *Profile:* display name, avatar, banner/accent if they exist, and bio/about me, with a live preview using the existing small profile card component.
  - *Appearance:* any existing theme or density options. If none exist, a local-only "Compact message display" toggle (localStorage) that reduces timeline spacing is acceptable. Otherwise leave the section out rather than shipping an empty page.
  - *Voice & Video:* input and output device selectors (`enumerateDevices`), an input volume meter, and a mic test, reusing whatever the call code already uses. Show the existing compact "Mic issue" pattern when permission is denied.
  - *Notifications:* only what exists (for example sound on or off, local). No fake toggles that do nothing.
- **Mobile settings nav (account, server and channel):** below `sm`, the left nav becomes a full-screen list, and tapping a section pushes its content view with a back button in the header. Back returns to the list, and Esc or the close button exits settings.
- **Danger zone type-to-confirm:** deleting a server or channel opens a confirm modal that needs the exact name typed before the solid danger button enables. Leave server and kick or ban keep a simple confirm. Keep the existing delete calls. Only add the confirm step.
- **Unsaved changes bar:** extend the sticky bar from the server Overview page to every settings form that has editable fields (roles, channel overview, profile). Block close with a shake or highlight of the bar while it's dirty, as Discord does.
- Regression: an owner or manage-bit user sees Settings, Create and View as Role, and the Admin hoist role doesn't.

Commit: `Settings: account sections, mobile push nav, type-to-confirm deletes, unsaved bar everywhere`.

---

## Batch D: Production QA pass + fixes

Hard-refresh production after the A–C deploys, signed in, at **375, 768 and 1440px**. Fix anything broken in the same batch. Check:

- **Layout:** one scroll container per column, no page scroll, no clipped Send, the composer above the iOS keyboard, the drawer opening and closing (Esc, backdrop, route change), and the navbar menu.
- **Unread:** the divider appears after another account posts, the jump pill works, and opening the channel clears the bold row.
- **Keyboard:** `↑` edit, Esc cancel, and Ctrl/Cmd+K navigation to a channel, a DM and a group DM.
- **Calls:** 1:1 ringing → cancel → DM list intact, the missed call system message, group DM "Call in progress · Join", server voice join and leave, the minimized overlay not covering the composer, and the expanded overlay with no member list peeking.
- **Server text:** search, pins, members toggle, poll, GIF, emoji, reply, forward and grouping.
- **Friends:** the tabs, Message opening the right DM, and pending accept and decline.
- **Settings:** each account section, mobile push nav, the unsaved bar, and type-to-confirm.
- **Contrast:** `--ms-link` and secondary text readable on every surface.

If something can't be checked (for example it needs a second account), list it under "Still open" with exact steps to reproduce.

Commit: `QA: production pass fixes after parity + settings round`.

---

## Update `cursor-status.md` when done (same format)

```md
# Cursor Status

**Last updated:** YYYY-MM-DD HH:MM

## Completed this batch
- (one bullet per batch with commit SHA)

## Still open / broken
- (unverified items, regressions, deferred, anything needing schema)

## Blockers
- (or "None")

## Suggested next focus
- (2–4 bullets)
```

Commit as `Update cursor-status after batch 4 (unread, keyboard, settings, prod QA)` and push. RedsssBot will read it and write the next `next-prompt.md`.
