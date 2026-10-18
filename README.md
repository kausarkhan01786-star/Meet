# Meeting

A browser meeting app with an interactive Three.js Earth hero, animated meeting choices, two-way voice and camera video, simultaneous screen sharing, and in-room chat. Single meetings support two people; group rooms accept up to 1,000 members. This is only a server admission limit: group calls still use a full mesh of browser WebRTC connections and are not suitable for 1,000 active media participants without an SFU. Different networks require public HTTPS hosting and a working TURN relay. This checkout is not automatically a publicly reachable website. The home copyright credit highlights the creator, **Kausar mia**.

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

The hero contains **Add Meeting**, which reveals **Single meeting** and **Group meeting** cards. Mouse/touch drag rotates the globe. Motion respects the reduced-motion preference; WebGL-unavailable browsers see a bitmap fallback.

1. Open **Add Meeting > Group meeting**, enter your required display name, select **Create group**, and allow microphone access. The fullscreen room displays its six-digit group code. A nonblank name is required for both creating and joining, enforced by the UI and server.
2. Give the website address and code only to the intended people. They select **Add Meeting > Group meeting > Add group**. Entering all six digits starts joining automatically; **Connect** can retry a rejected code.
3. Everyone can talk and listen at the same time. Use the microphone button to mute/unmute yourself and the speaker button to mute/unmute playback on your device. If autoplay is blocked, press the member's **Hear** button.
4. Any member using a supported desktop Chrome/Edge browser can press **Share screen**. Multiple members can share simultaneously; their screen tiles appear separately with fullscreen controls. Screen sharing here sends video only; voices are carried by each member's microphone. Phones can join voice and view screens, but mobile browser screen capture is generally unavailable.
5. **Stop sharing** ends only your screen, not the voice call. Clicking **Meeting home** or the active meeting header returns to the hero while keeping the call, microphone, screen sharing, chat, and peer connections mounted. A corner call dock restores the same room and offers mic mute and an explicit end button. The hero's **Return to Meeting** button also restores it. Only one meeting is active at a time.
6. **Leave meeting**, **End minimized meeting**, closing/reloading the tab, or losing signaling releases your microphone/screen and peer connections. Home/minimize is not a hang-up action; native browser Back or navigating to another website is not supported as persistent background calling.

Groups admit **up to 1,000 members including the creator**, using the existing full mesh of browser WebRTC connections. This limit does not mean a 1,000-person call will work reliably: each member creates a separate connection to every other member, so browser CPU, memory, signaling traffic, and upload bandwidth grow rapidly with group size. Large meetings need an SFU media server, which this app does not implement. Use small groups for active audio/video until an SFU is integrated.

A group code remains valid while at least one member stays connected. The creator leaving does not end the room for others; the last member leaving deletes it. Names are display labels, not verified identities. No moderator, member-kicking, recording, or account authentication is provided. If microphone permission is denied, you can still join and view; press **Unmute** after allowing permission to speak.

Groups and Single meetings share the same HTTPS/STUN/TURN infrastructure. **Local private-IP links only work on the local network.** Browser verification used generated microphones and screens; real physical microphones, mobile capture permissions and public/TURN connectivity still require real-device testing.

## Camera Video Calls

- In a Single or Group meeting, press **Turn camera on** and allow camera permission. Camera is off by default and is never requested just by opening the home page or joining voice.
- Both sides can enable video. Your local preview is mirrored; transmitted video is not. Each participant's microphone remains separate from camera capture.
- **Turn camera off** stops the camera's tracks, not just the preview. Voice and screen sharing continue. Screens and cameras use separate negotiated video channels so both can be active together; camera tiles become a compact strip below shared screens.
- Camera capture requests 640x360 at 24fps, up to 30fps, with a front-facing camera preference. Actual quality adapts to the browser and connection. It requires HTTPS or desktop localhost. Phones can use their cameras even when mobile browser screen sharing is unavailable.
- Denied/busy/missing cameras show a specific message without ending voice. Allow camera permission in browser settings and retry, or close another app that is using the webcam.
- Minimizing to Home keeps camera capture active just like voice and screen sharing. Use Camera off or Leave/End to stop it. Leaving during a pending camera permission request also stops any camera stream returned afterward.
- Reload participants after deploying media updates; older cached clients may not negotiate the additional camera video channel. Video increases upload and TURN relay bandwidth as the group grows.

Camera verification used generated video over real WebRTC, checked decoded remote camera pixels and simultaneous screen/camera streams, permission denial, off/on, minimized continuity, late Group joining and capture cleanup. Physical webcams, mobile camera hardware, and the public TURN deployment still require real-device testing.

## Meeting Chat

The right-side panel has Chat and People tabs. On small screens, the chat button opens an overlay drawer. Messages are limited to 2,000 characters, sent only to members of the same room, and rendered as plain text. The server assigns sender identity and limits message bursts. Chat travels over the signaling connection (TLS on HTTPS deployments); unlike WebRTC media, it is not end-to-end encrypted from the signaling server. No server-side history is stored. Each browser keeps at most 200 messages until leaving, so late joiners do not receive earlier messages. Display names are not verified identities.

## Refresh And Sound Feedback

The current Single/Group view, create/receive form, display name, entered code, chat tab/drawer, meeting picker and minimized state are saved in this tab's `sessionStorage`. Refresh returns to that view instead of resetting to the hero. This does not preserve a live WebRTC connection, microphone, camera, screen capture, or chat history across a document reload.

If an active call was interrupted by refresh, the same meeting page shows **Reconnect to meeting** with the previous code. Reconnection is explicit: refresh never silently requests microphone/camera/screen permissions. Rejoining succeeds only while the room still exists and has capacity; if everyone left or the server restarted, return to meeting options and create a new room. Camera and screen sharing remain off until explicitly enabled again. A refreshed minimized call says **Reconnect needed**, not connected.

Short locally synthesized sound cues play for enabled button/card/link clicks, actual call connection, call/member departure, and server-confirmed sent messages. Sound requires browser user interaction; autoplay policy or device mute can suppress it. The speaker icon in the hero/header toggles **interface sounds**, independently from meeting speaker mute, and remembers the preference in `localStorage`. These cues are not added to outgoing WebRTC audio tracks; headphones avoid acoustic pickup by a physical microphone. No external audio assets are downloaded.

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
| `PORT`, `HTTPS_PORT`             | Node HTTP and optional local HTTPS ports                                                                                                 |

Verify from real separate networks, for example PC broadband and phone mobile data. Temporarily enable `ICE_RELAY_ONLY=true`, restart, create a **new** session, and confirm video and voice. This tests TURN rather than accidentally succeeding through LAN/direct candidates. The app loads fresh ICE credentials on each connection. Set this back to `false` to allow efficient direct connections. No real TURN credentials or public hosting are supplied in this repository.

## Public Access Security

Treat the code as temporary screen access: give it only to the intended person and stop sharing afterward. Codes are not account authentication or cryptographic identity verification. Guess limits persist per address across socket reconnects, and WebSocket origins are checked. For an internet-facing installation, add access control, connection/request limits, and monitoring at the trusted reverse proxy or hosting provider. This anonymous app alone is not a hardened public service.

The ICE configuration endpoint provides client-usable TURN credentials. Anyone able to access it can consume relay bandwidth; put it and the rest of the app behind your access control and enforce TURN quotas. Shared secrets remain server-side, but short-lived credentials can still be used until they expire. Static provider credentials are visible to authorized browser clients by design. Configure provider usage limits and rotate credentials when needed.

## Single Meetings

1. Select **Add Meeting > Single meeting**, enter your required display name, then choose **Create call** or **Receive call**. Blank or whitespace-only names cannot create or join a call. Allow microphone access; the created room shows **Make room for another screen.** and a six-digit pairing code.
2. The other participant opens the same website and chooses **Single meeting > Receive call**. Filling all six digits starts connecting automatically; no screen capture is required to talk.
3. Both participants can speak and listen, mute microphones/speakers, use chat, and later share a screen from a supported desktop browser. A Single meeting admits at most two people. Its code cannot be used in Group mode.
4. Stopping screen sharing preserves the voice call. The red leave button releases all capture. The remaining person can wait for a replacement participant; the room is deleted when empty.

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
- Right-side chat/participants panel with a mobile drawer.
- Responsive layouts, accessible input labels, keyboard focus, reduced-motion support, and connection/error states.

## Troubleshooting

- **Different-network receiver cannot open the address:** private `10.x`, `192.168.x`, or localhost URLs are not public websites. Deploy publicly and share the HTTPS domain, not the PC's private IP.
- **Local preview unreachable:** use the PC's LAN address, allow Node.js on the Windows Private network only, and check the local ports. Never disable the firewall.
- **Paired but no video/audio:** verify TURN URLs, credentials, open relay ports and firewall rules; test `ICE_RELAY_ONLY=true`. The UI's relay-configured indicator only confirms settings exist, not relay reachability or credentials validity. Check VPNs and browser permissions. Local previews can still connect without TURN.
- **Capture unavailable:** use desktop Chrome/Edge on localhost or a trusted HTTPS origin. Phones are receivers, not PC-screen capture sources.
- **Voice unavailable:** allow microphone access on each device, check its input device and mic/speaker mute controls, and press a member's Hear button if browser autoplay is blocked.
- **Code rejected:** check all six digits, matching Single/Group mode, room capacity, and whether anyone remains in the room.
- **Port busy:** set `PORT` and/or `HTTPS_PORT` before starting. For example in PowerShell, run `$env:PORT=5174` and `$env:HTTPS_PORT=5444`, then `npm.cmd run dev`.

## Production And Tests

```sh
npm test
npm run build
npm start
```

The production server serves `dist`; development serves Vite middleware. Local HTTP/HTTPS share one pairing service. Production defaults to HTTP behind your platform's trusted HTTPS proxy, without writing a local certificate. `/healthz` provides a health check. Restart for server/environment changes; reload after frontend edits.

Tests cover pairing, cleanup, invalid/expired codes, single-viewer enforcement, reconnect-resistant guess limits, trusted public origins, STUN/TURN options and expiring relay credentials, plus production startup/endpoints. Browser checks received generated video and audio tracks over actual WebRTC, exercised system/mic mixing, mic mute/unmute, and verified source-track cleanup. Prior checks covered decoded pixels, pause and stop. Physical microphone audio, separate-network testing, Docker image execution and forced TURN validation require the corresponding hardware, tools, hosting and relay credentials and remain unverified.

## Stack And Privacy

React, Vite, Express, `ws`, and browser WebRTC. WebSockets carry signaling; media goes directly between devices or through TURN, encrypted by WebRTC in either case. No app video or voice recordings are stored. Signaling and relay providers can see connection metadata, IP addresses and traffic volumes. A public Cloudflare STUN endpoint is used for candidate discovery. Display fonts use Google Fonts when online; artwork is local. Wallpaper: [Unsplash](https://images.unsplash.com/photo-1464822759023-fed622ff2c3b).
