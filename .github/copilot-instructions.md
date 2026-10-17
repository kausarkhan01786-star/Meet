# Project Setup

- [x] Verify project instructions exist.
- [x] Clarify requirements: PC-to-phone browser screen casting with six-digit pairing and a dark purple theme.
- [x] Scaffold the project: React, Vite, Express, and WebSocket signaling in the existing workspace.
- [x] Customize the project.
- [x] Install required extensions: none required.
- [x] Compile and test the project.
- [x] Create and run the development task.
- [x] Launch and verify the application.
- [x] Complete documentation.

# Conventions

- Use browser WebRTC for media; keep signaling separate from media transport.
- Never claim browser capture creates a native Windows extended display.
- Keep pairing codes ephemeral and clean up peers on disconnect.
- Run `npm test` and `npm run build` before completion.
- Different-network sharing requires public HTTPS hosting and configured TURN. Never claim local private IPs are internet-accessible or that configuration proves relay connectivity.
- The current Meeting UI uses two-way microphone voice in Single rooms (two members) and Group rooms (six members). The legacy server-side PC/phone casting protocol remains one-way; do not confuse it with the new Single meeting UI.
- Group mode supports up to six members with multi-way microphone voice and simultaneous desktop screen videos through a WebRTC mesh. Keep group signaling isolated from one-to-one rooms; remove empty groups and clean up media on leave.
- Keep TURN secrets server-side and out of git; public deployments need access control and relay bandwidth quotas.
- Meeting UI: hero-only Three.js Earth home, Add Meeting reveals Single/Group cards, fullscreen voice-first rooms, and right-side chat with mobile drawer. Chat is scoped to the room, length/rate-limited, not persisted and not end-to-end encrypted from the signaling server.
- Keep active rooms mounted when Home minimizes them; restoring must reuse the same peers and media. Only explicit Leave/End, tab close/reload, or signaling loss ends capture. Shared-screen stages are capped at 1540x725px with responsive containment; native fullscreen remains available.
- Camera capture is opt-in via the camera button. Keep microphone, screen video and camera video on separate negotiated transceiver slots; camera off must stop camera tracks without ending voice or screen sharing. Home credit highlights Kausar mia with a copyright symbol.
- Names are required for Single and Group creation/joining: validate trimmed nonblank names on the client and server, without Host/Guest admission fallbacks. Creator credit links to Kausar mia's provided portfolio, GitHub, Facebook, Instagram and LinkedIn in new tabs with safe rel attributes.
- Persist tab-local navigation/form/panel state on refresh. An interrupted active call restores to an explicit Reconnect view; never claim live media survived reload or silently restart capture. Short optional interface/call/message cues use local Web Audio and must respect browser interaction/autoplay restrictions and the sound toggle.

# Verification

- Tests cover signaling, proxy origins, reconnect rate limits, STUN/TURN credentials, and public production-server endpoints.
- Browser verification covers generated video over real WebRTC, decoded receiver pixels, playback pause, and stop propagation.
- Desktop and mobile screenshots were checked; a physical PC/phone pair and native capture permissions still require user testing.
- Internet/voice update: generated video and audio tracks were received over real WebRTC, mic mute/unmute and capture cleanup were checked. Real separate-network/TURN verification requires a public deployment and real relay credentials and remains unverified.
- Group verification: three browser members connected in a full mesh with inbound audio packets; two simultaneous screen streams decoded. Late joining, mute propagation, creator departure and capture cleanup were checked with generated media. Physical devices and public/TURN group connectivity remain unverified.
- Start the app with the `Relay: development server` task. Windows PowerShell may require `npm.cmd` instead of `npm`.
- Meeting redesign verification: Single code auto-join connected two-way audio before any screen capture; receiver-initiated screen decoded; chat delivered; screen stop preserved voice and leave stopped capture. Three-member group auto-join and chat broadcast also passed with generated media. Globe canvas pixels and pointer-driven camera changes checked on desktop/mobile layouts. Physical devices and current public/TURN deployment were not re-tested.
- Camera verification: generated two-way camera video decoded with separate simultaneous screen video; permission denial preserved voice; off/on, minimized continuity, late group joining and pending-permission cleanup passed. Real camera hardware and public/TURN video connectivity remain unverified.
