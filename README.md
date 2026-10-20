# Meeting

A browser meeting app with an interactive Three.js Earth home, two-way voice and camera video, simultaneous screen sharing, shared audio/video playback, in-room chat, moderation, and optional local recording. Single meetings support two people; group rooms accept up to 1,000 members. This is only a server admission limit: group calls still use a full mesh of browser WebRTC connections and are not suitable for 1,000 active media participants without an SFU. Different networks require public HTTPS hosting and a working TURN relay. This checkout is not automatically a publicly reachable website. The home copyright credit highlights the creator, **Kausar mia**.

## Run

Requires Node.js 20.19+ and npm. From this workspace:

```sh
npm install
npm run dev
```

On Windows PowerShell, use `npm.cmd` instead of `npm` if script execution policy blocks npm. The **Relay: development server** VS Code task also starts the app.

- PC: <http://localhost:5173>
- Phone: use the `https://YOUR-PC-LAN-IP:5443` address printed in the development-server terminal.
- These default addresses are only for local preview on the same LAN. They are not reachable from someone else's Wi-Fi or mobile data.
- For internet access, follow **Public Deployment** below. Both devices must open the same public website; they do not need the same Wi-Fi.

## Group Voice And Screens

The home page contains **Create a meeting**, which opens **Create new meeting** and **Join meeting** choices. Both currently open the Group workflow. Mouse/touch drag rotates the globe. Motion respects the reduced-motion preference; WebGL-unavailable browsers see a bitmap fallback.

1. Select **Create a meeting > Create new meeting**, enter your display name and an optional profile image, then press **Create meeting**. Allow microphone access when prompted. The room displays its six-digit group code. Names must contain at least four characters after trimming and must not contain numbers, including Bengali or other Unicode numbers. The inputs filter numbers, and client/server validation rejects invalid names.
2. Share the code or use **Copy meeting code** / **Share meeting link**. Guests choose **Join meeting**, enter a valid name and the six-digit code, or open the shared `?join=123456` URL. Entering all six digits can start joining automatically; **Connect** can retry a rejected code. Share links still require a valid name and admission checks.
3. Everyone can talk and listen at the same time. Use the microphone button to mute/unmute yourself and the speaker button to mute/unmute playback on your device. If autoplay is blocked, press the member's **Hear** button.
4. Any member using a supported desktop Chrome/Edge browser can press **Share screen**. Multiple members can share simultaneously; their screen tiles appear separately with fullscreen controls. Screen sharing here sends video only; voices are carried by each member's microphone. Phones can join voice and view screens, but mobile browser screen capture is generally unavailable.
5. **Stop sharing** ends only your screen, not the voice call. Clicking **Meeting home** or the active meeting header returns to the hero while keeping the call, microphone, screen sharing, chat, and peer connections mounted. A corner call dock restores the same room and offers mic mute and an explicit end button. The hero's **Return to Meeting** button also restores it. Only one meeting is active at a time.
6. **Leave meeting**, **End minimized meeting**, closing/reloading the tab, or losing signaling releases your microphone/screen and peer connections. Home/minimize is not a hang-up action; native browser Back or navigating to another website is not supported as persistent background calling.

Groups admit **up to 1,000 members including the creator**, using the existing full mesh of browser WebRTC connections. This limit does not mean a 1,000-person call will work reliably: each member creates a separate connection to every other member, so browser CPU, memory, signaling traffic, and upload bandwidth grow rapidly with group size. Large meetings need an SFU media server, which this app does not implement. Use small groups for active audio/video until an SFU is integrated.

A group code remains valid while at least one member stays connected. The creator leaving does not end the room for others; the last member leaving deletes it. Owners/admins have moderation controls, and the owner can allow local recording. Names are display labels, not verified identities; account authentication is not provided. If microphone permission is denied, you can still join and view; press **Unmute** after allowing permission to speak.

Groups and Single meetings share the same HTTPS/STUN/TURN infrastructure. **Local private-IP links only work on the local network.** Browser verification used generated microphones and screens; real physical microphones, mobile capture permissions and public/TURN connectivity still require real-device testing.

## Room Tools And Layout

- **People:** participant roles, microphone status, raised hands and a first-raised-first speaking queue. Owners/admins can invite the next speaker and mute participants.
- **Moderation:** participant menus provide microphone, camera and screen-sharing permissions, immediate mute, and removal. Only the owner can grant/revoke admin access. Room chat and recording also have permission controls.
- **Permission:** owners/admins can accept or reject pending rejoin requests. Not every initial join requires approval; a pending request shows a waiting state instead of starting capture immediately.
- **Reactions:** a mobile-contained picker sends room reactions that float upward within the call stage. Raise/lower hand is separate from emoji reactions.
- **Chat tools:** emoji, file attachments, polls and student-information submission. Admins can view submitted name, roll, section and department details and download the student list as a PDF under **Others**.
- **Location:** joining can prompt for browser location permission. Admin participant tools can open available coordinates in Google Maps; location is unavailable if permission is denied or unsupported. Coordinates travel through the signaling server, not an end-to-end encrypted channel.
- **Rescue:** an optional weak-network mode adjusts media transport settings. It does not replace TURN or make a large full-mesh call scalable.
- **Participant cards:** centered, wrapping 16:9 tiles that grow with the available width. Mobile uses tighter spacing, avatars and captions; row counts depend on available space and participant count, not a fixed two-column or count-specific layout. Shared screens retain their own containment and fullscreen controls.

## Camera Video Calls

- In a Single or Group meeting, press **Turn camera on** and allow camera permission. Camera is off by default and is never requested just by opening the home page or joining voice.
- Both sides can enable video. Your local preview is mirrored; transmitted video is not. Each participant's microphone remains separate from camera capture.
- **Turn camera off** stops the camera's tracks, not just the preview. Voice and screen sharing continue. Screens and cameras use separate negotiated video channels so both can be active together; camera tiles become a compact strip below shared screens.
- Camera capture requests 640x360 at 24fps, up to 30fps, with a front-facing camera preference. Actual quality adapts to the browser and connection. It requires HTTPS or desktop localhost. Phones can use their cameras even when mobile browser screen sharing is unavailable.
- Denied/busy/missing cameras show a specific message without ending voice. Allow camera permission in browser settings and retry, or close another app that is using the webcam.
- Minimizing to Home keeps camera capture active just like voice and screen sharing. Use Camera off or Leave/End to stop it. Leaving during a pending camera permission request also stops any camera stream returned afterward.
- Reload participants after deploying media updates; older cached clients may not negotiate the additional camera video channel. Video increases upload and TURN relay bandwidth as the group grows.

Camera verification used generated video over real WebRTC, checked decoded remote camera pixels and simultaneous screen/camera streams, permission denial, off/on, minimized continuity, late Group joining and capture cleanup. Physical webcams, mobile camera hardware, and the public TURN deployment still require real-device testing.

## Shared Media

Open **Shared audio and video** in the call toolbar. The left dock has Audio playlist, Video playlist and Direct media link modes. Its heading, permission toggle, mode icons, search and playlist heading stay fixed while only the result list scrolls.

Search is submitted with Enter or the search button; autocomplete suggestions are disabled. Refresh loads another discovery playlist, and **See more** appends the next page when available. Searches preserve existing results when a later request fails and show the error without requiring the room to close.

Owners and admins can play, seek, pause/resume, and stop shared audio or video. **Allow members to manage media** grants the same shared controls to members; turning it off removes those controls immediately. The signaling server enforces this permission. Local mute/pause affects only the listener's device and remains available without management permission.

Every newly started media item begins at **50% volume**. Listeners with access to the volume slider can adjust it for that item; a new item starts at 50% again rather than restoring an older saved volume.

YouTube and direct media use the app's playback controls instead of native player controls. YouTube keyboard and iframe pointer controls are disabled. YouTube may still show its title, branding, recommendations, or other provider overlays; its official embedding options do not guarantee an overlay-free player. The app does not crop or cover those overlays.

YouTube search and YouTube/Music link lookup require **YouTube Data API v3** and a server-side `YOUTUBE_API_KEY`. Configure it in the hosting provider's secrets or your untracked local environment, then restart the server. Do not commit the key or expose it in a `VITE_` variable. The server caches search results and reports missing configuration, quota exhaustion and provider errors. A pasted YouTube link still needs lookup access and an embeddable item; it does not bypass provider restrictions.

Direct non-YouTube links must point to a browser-playable audio/video resource, not an ordinary web page. HTTPS pages may block insecure HTTP resources, and the provider must permit playback in the browser. Each member streams shared media separately from its provider; media files are not redistributed through the meeting's WebRTC mesh.

## Local Recording

In **Others**, the owner can enable **Allow meeting recording**. A participant can then select **Record meeting**, choose the meeting tab/window/screen in the browser prompt, and use **Stop & save** followed by **Download recording**.

Recording uses `getDisplayMedia`, Web Audio and `MediaRecorder`. It combines the selected screen video with local/remote meeting microphone tracks and saves a WebM file in that browser's IndexedDB. System/tab audio and shared music are not explicitly mixed into this recording. Availability depends on browser capture/recording support; do not assume mobile browsers can record a screen.

The room displays active recorders and attempts a local spoken announcement when recording starts. Permission revocation or leaving the room stops an active app recording. Files stay on the recording device, are not uploaded to the signaling server, and can be lost if browser storage is cleared. This permission cannot prevent someone from using external recording software.

## Meeting Chat

The right-side panel has **Chat**, **People**, an admin **Permission** tab for rejoin requests, and **Others**. On small screens, the chat button opens an overlay drawer. Text messages are limited to 2,000 characters; file attachments are limited to 5 MB. Messages stay within the room, text is not rendered as arbitrary HTML, and the server assigns sender identity and rate-limits messages/uploads. Owners/admins can disable room chat.

Chat, file attachments, polls and student submissions travel over the signaling connection (TLS on HTTPS deployments); unlike WebRTC media, they are not end-to-end encrypted from the signaling server. No server-side chat history is persisted. Each browser keeps at most 200 messages until leaving, so late joiners do not receive earlier messages. Display names are not verified identities.

## Refresh And Sound Feedback

The home clock displays the device's local time in **12-hour format with AM/PM**, including seconds and a timezone label. It updates once per second; it is not a server-synchronized clock.

The current Single/Group view, create/receive form, display name, entered code, chat tab/drawer, meeting picker and minimized state are saved in this tab's `sessionStorage`. Refresh returns to that view instead of resetting to the hero. This does not preserve a live WebRTC connection, microphone, camera, screen capture, or chat history across a document reload.

If an active call was interrupted by refresh, the same meeting page shows **Reconnect to meeting** with the previous code. Reconnection is explicit: refresh never silently requests microphone/camera/screen permissions. Rejoining succeeds only while the room still exists, has capacity, and any required owner/admin approval is granted; if everyone left or the server restarted, return to meeting options and create a new room. Camera and screen sharing remain off until explicitly enabled again. A refreshed minimized call says **Reconnect needed**, not connected.

Short locally synthesized sound cues play for enabled button/card/link clicks, actual call connection, call/member departure, server-confirmed sent messages, and pending admission requests for admins. Sound requires browser user interaction; autoplay policy or device mute can suppress it. The speaker icon in the hero/header toggles **interface sounds**, independently from meeting speaker mute, and remembers the preference in `localStorage`. These cues are not added to outgoing WebRTC audio tracks; headphones avoid acoustic pickup by a physical microphone. No external audio assets are downloaded.

## Public Deployment

Two services are required: a public HTTPS application server for signaling, and a TURN media relay for NAT/firewall traversal. STUN alone is not a reliable substitute for TURN. Some networks block even TURN, so no browser application can promise to bypass every network policy.

1. Deploy this repository as one Docker web service using the included Dockerfile. `render.yaml` is a Render Blueprint example using a paid Starter instance; review the provider's price before deploying. No hosting account, billing, or deployment is created automatically.
2. The hosting platform must supply trusted HTTPS and forward WebSocket upgrades on `/signal`. Set `PUBLIC_URL` to the site's public HTTPS origin. Render's `RENDER_EXTERNAL_URL` is detected automatically. Set `LOCAL_HTTPS=false`; the platform terminates HTTPS in front of the Node HTTP port. The app respects the platform's `PORT`.
3. Obtain a TURN service or run coturn on a publicly reachable server. Configure UDP and TCP/TLS endpoints; TLS on port 443 is useful for restrictive networks. TURN incurs media-bandwidth costs. TURN is a separate service, not the Render HTTP container.
4. Set `TURN_URLS` to the actual comma-separated provider URLs. Use either `TURN_SECRET` for coturn REST/shared-secret credentials or `TURN_USERNAME` plus `TURN_PASSWORD` for your provider's credentials. For managed TURN without a coturn shared secret, remove the Blueprint's required `TURN_SECRET` field and configure the username/password instead. Never enter credentials in chat or commit them to git; use the hosting dashboard's secret fields.
5. Keep **one app instance**. Pairing sessions are in memory; multiple instances require a shared session/signaling backend, which is not implemented here. Restarts end sessions. Do not use static-only hosting for this server.
6. Open the public website on both devices. Send the receiver the same website address and the six-digit pairing code. Different Wi-Fi and mobile data can then connect through direct WebRTC or TURN as needed.

For local configuration, use `.env.example` as the template for an untracked `.env`. Node loads it at startup; hosting environment variables take precedence. The template intentionally contains no working TURN service or fake public address.

| Variable                         | Purpose                                                                                                                                  |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `PUBLIC_URL`                     | Actual public HTTPS origin, without a subpath                                                                                            |
| `LOCAL_HTTPS`                    | `true` for a local self-signed listener; `false` behind public TLS termination                                                           |
| `TRUST_PROXY`                    | `true` only behind a trusted proxy that appends/overwrites `X-Forwarded-For`; never on a directly exposed Node port                      |
| `TURN_URLS`                      | Example syntax only: `turn:relay.example:3478?transport=udp,turn:relay.example:3478?transport=tcp,turns:relay.example:443?transport=tcp` |
| `TURN_SECRET`                    | coturn shared secret; server generates one-hour HMAC credentials, never sends the shared secret                                          |
| `TURN_USERNAME`, `TURN_PASSWORD` | Alternative provider credentials, necessarily delivered to the WebRTC client                                                             |
| `ICE_RELAY_ONLY`                 | `true` to force TURN for verification; requires working relay configuration                                                              |
| `YOUTUBE_API_KEY`                | Server-only YouTube Data API v3 key for media search and YouTube link lookup; provider quota and embedding restrictions still apply          |
| `PORT`, `HTTPS_PORT`             | Node HTTP and optional local HTTPS ports                                                                                                 |

Verify from real separate networks, for example PC broadband and phone mobile data. Temporarily enable `ICE_RELAY_ONLY=true`, restart, create a **new** session, and confirm video and voice. This tests TURN rather than accidentally succeeding through LAN/direct candidates. The app loads fresh ICE credentials on each connection. Set this back to `false` to allow efficient direct connections. No real TURN credentials or public hosting are supplied in this repository.

## Public Access Security

Treat the code as temporary screen access: give it only to the intended person and stop sharing afterward. Codes are not account authentication or cryptographic identity verification. Guess limits persist per address across socket reconnects, and WebSocket origins are checked. For an internet-facing installation, add access control, connection/request limits, and monitoring at the trusted reverse proxy or hosting provider. This anonymous app alone is not a hardened public service.

The ICE configuration endpoint provides client-usable TURN credentials. Anyone able to access it can consume relay bandwidth; put it and the rest of the app behind your access control and enforce TURN quotas. Shared secrets remain server-side, but short-lived credentials can still be used until they expire. Static provider credentials are visible to authorized browser clients by design. Configure provider usage limits and rotate credentials when needed.

## Single Meeting Support

The shared room component and signaling protocol still support Single meetings with a two-person limit and separate code validation. The current home chooser creates/joins Group rooms; it does not expose a separate Single-mode button. Restored Single sessions still use the Single room component.

Single meetings require the same valid names and secure browser context, provide two-way microphone voice, opt-in cameras, chat and later screen sharing, and do not require screen capture to start voice. A Single code cannot be used in Group mode. Stopping screen sharing preserves voice; leaving releases capture, and an empty room is deleted.

Meeting codes last while a participant remains connected. All sessions and chat are in memory and disappear on server restart. The old one-way casting protocol remains supported server-side for compatibility, but the new Single meeting UI uses two-way voice rooms.

## Local HTTPS

The app creates a self-signed certificate in `.cert/localhost.json`, which is excluded from git. Browsers may show a certificate/privacy warning. Continue only on your trusted network after checking that the address is your own PC. Some phone/browser configurations require installing and explicitly trusting a local certificate; a CA-trusted certificate is the alternative. An insecure HTTP LAN address may not expose the browser APIs needed to receive video. Desktop capture works on HTTP **localhost**, which browsers treat as a secure context.

Keep the private certificate file private. It is renewed when the detected LAN addresses change. Do not expose the local self-signed development listeners directly to the internet. Public deployment requires a trusted TLS-terminating proxy as described above.

## Mirroring Versus Extended Desktop

**A website alone cannot create a native Windows secondary display.** Relay mirrors an existing screen, window, or tab. To use the phone as a genuinely separate desktop, first install a trusted Windows virtual display driver separately, configure Windows to **Extend** to that display, and then select that existing display in Relay's screen picker. This project does not install drivers, create virtual displays, or provide remote mouse/keyboard control.

## Controls

- Six-digit meeting code with copy and automatic receiving.
- Two-way microphone voice in Single meetings; multi-way voice in groups.
- Optional two-way camera video with camera on/off, local mirrored preview, camera-off placeholders, and simultaneous camera/screen sharing.
- Screen video requests 720p at 15fps, up to 30fps; actual quality adapts to browser, network and CPU. The meeting UI sends microphone voice, not system/tab audio.
- Multiple simultaneous screens, screen fullscreen, microphone and speaker mute.
- Shared-screen stages are capped at 1540px wide and 725px high, shrink to the available viewport, and contain the video without stretching. The explicit fullscreen control can still expand a screen to the browser's fullscreen view.
- Home minimizes an active Single or Group meeting into a responsive corner dock with live screen preview when available, restore, mic mute, and explicit leave controls.
- Chat/participants/admin tools with a mobile drawer, polls, file attachments and student-list PDF export.
- Permission-based shared audio/video playback, fixed media-dock controls, and 50% initial volume per item.
- Owner/admin moderation, rejoin requests, raised-hand speaking queues, floating reactions and weak-network rescue mode.
- Owner-enabled local recording and participant recording notices.
- Responsive layouts, accessible input labels, keyboard focus, reduced-motion support, and connection/error states.

## Troubleshooting

- **Different-network receiver cannot open the address:** private `10.x`, `192.168.x`, or localhost URLs are not public websites. Deploy publicly and share the HTTPS domain, not the PC's private IP.
- **Local preview unreachable:** use the PC's LAN address, allow Node.js on the Windows Private network only, and check the local ports. Never disable the firewall.
- **Paired but no video/audio:** verify TURN URLs, credentials, open relay ports and firewall rules; test `ICE_RELAY_ONLY=true`. The UI's relay-configured indicator only confirms settings exist, not relay reachability or credentials validity. Check VPNs and browser permissions. Local previews can still connect without TURN.
- **Capture unavailable:** use desktop Chrome/Edge on localhost or a trusted HTTPS origin. Phones are receivers, not PC-screen capture sources.
- **Voice unavailable:** allow microphone access on each device, check its input device and mic/speaker mute controls, and press a member's Hear button if browser autoplay is blocked.
- **Code rejected:** check all six digits, matching Single/Group mode, room capacity, and whether anyone remains in the room.
- **Name rejected:** use at least four trimmed characters and no numbers. Typing/pasting Unicode numbers into the name inputs removes them; the server also rejects numeric names.
- **Waiting for rejoin approval:** ask an owner/admin to review the request under **Permission**; do not assume the old media session survived refresh.
- **YouTube search unavailable:** set `YOUTUBE_API_KEY` server-side, enable YouTube Data API v3, check key restrictions/quota, and restart after changing environment variables. Search/lookup may still fail for region-, account- or embedding-restricted items.
- **Cannot change shared playback:** the owner must enable **Allow members to manage media**. Local pause/mute is separate and does not pause everyone.
- **No recording option or saved file:** ask the owner to allow recording, use a browser with screen capture and MediaRecorder support, and keep local browser storage available. Download important recordings; clearing site data removes local files.
- **Port busy:** set `PORT` and/or `HTTPS_PORT` before starting. For example in PowerShell, run `$env:PORT=5174` and `$env:HTTPS_PORT=5444`, then `npm.cmd run dev`.

## Production And Tests

```sh
npm test
npm run build
npm start
```

`npm run test:load` runs synthetic WebSocket/signaling load scenarios. It is not a browser WebRTC media benchmark, does not measure TURN capacity, and does not establish support for 1,000 active camera/microphone participants.

The production server serves `dist`; development serves Vite middleware. Local HTTP/HTTPS share one pairing service. Production defaults to HTTP behind your platform's trusted HTTPS proxy, without writing a local certificate. `/healthz` provides a health check. Restart for server/environment changes; reload after frontend edits.

Automated tests cover pairing, cleanup, invalid/expired codes, Single/Group isolation and capacity, names without numbers, room-scoped chat/files, moderation, location disclosure, media permission grants/revocation, tab-session persistence, STUN/TURN credentials, trusted origins, rate limits and production endpoints. Run the commands above on the current checkout; do not assume a historical pass proves the latest working tree is clean.

Latest local documentation check (**2026-10-20**): `npm run build` passed, and `npm test` passed 25 of 27 tests in the current working tree. Two existing assertions fail: the sound-cue test does not expect the `admission` cue, and the group-member snapshot expects the older mute/state shape without `rescueMode`. These failures are not fixed by this README update. The build also reports Vite's large-chunk warning.

Prior browser checks used generated microphone/camera/screen tracks over real WebRTC, decoded received video, and checked mute, capture cleanup, simultaneous media and minimized continuity. Recent component checks covered responsive cards, picker containment, upward reactions, the AM/PM clock, number filtering, permission-based media controls and per-item 50% volume. YouTube control checks used a mocked player API; direct-media checks used generated local media. These do not prove unrestricted live YouTube playback or connectivity to the current public deployment.

Physical microphone/camera hardware, separate-network testing, current public/TURN connectivity, Docker image execution and forced TURN validation require the corresponding devices, tools, hosting and relay credentials and remain unverified. This documentation update does not re-run browser or load-test scenarios.

## Stack And Privacy

React, Vite, Three.js, Express, `ws`, and browser WebRTC. WebSockets carry signaling and room events; live microphone, camera, and screen tracks go directly between devices or through TURN, encrypted by WebRTC in either case. Shared media is played separately by each browser from its provider. Optional meeting recordings are stored on the recording participant's device, not uploaded to the signaling server. Signaling and relay providers can see connection metadata, IP addresses and traffic volumes. Display names are not verified identities. A public Cloudflare STUN endpoint is used for candidate discovery. Display fonts use Google Fonts when online; artwork is local. Wallpaper: [Unsplash](https://images.unsplash.com/photo-1464822759023-fed622ff2c3b).
