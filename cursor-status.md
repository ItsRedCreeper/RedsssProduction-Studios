# Cursor Status

**Last updated:** 2026-11-28 (Voice audio + screen share media delivery)

## Localhost health
**Healthy**

## Voice media not reaching peers — cause + fix
**Cause**
1. **Silent mic outbound:** Voice channels sent a Web Audio `MediaStreamDestination` track to WebRTC. Speaking outlines still worked (ScriptProcessor on the raw mic), but Chromium often delivered that destination track as silence to remotes. DM/group calls already used a raw mic track.
2. **Unstable SDP m-lines:** Peers mixed `addTrack(audio)` after two video transceivers (and could `addTrack` again later). That produced offer/answer m-line order mismatches and broken renegotiation — screen/camera RTP never settled.
3. **Polite-peer screen glare:** When the polite peer started screen share, their renegotiation offer could be dropped under Perfect Negotiation glare, and the impolite peer never re-offered — remotes stayed on a muted/black receiver.

**Fix**
- Voice mic → WebRTC uses a **raw mic clone**; Web Audio kept only for meter / speaking outlines
- Mesh always creates fixed transceivers **audio → camera → screen** and only `replaceTrack` (never late `addTrack`)
- Fresh `voice-rtc` / `call-rtc` channel on mesh start so hello/signaling always fires
- After local camera/screen attach: impolite peer re-offers; on remote `media` announce (screen/camera start or screenEpoch bump), impolite peer re-offers if needed
- Autoplay block surfaces “Click anywhere to enable voice audio.” and unlocks on gesture

Green speaking outlines and fast roster (broadcast + FULL replica identity) left intact.

## Still open / broken
- Reports / Funding placeholders
- Jump-to-unread pill not built
- Cmd/Ctrl+K quick switcher not built
- Input volume slider no longer scales what peers hear (meter/speaking only); output volume still does

## Blockers
- None
