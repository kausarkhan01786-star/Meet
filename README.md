# Relay

A dark-purple browser screen-sharing app with six-digit pairing, PC microphone voice, and optional system audio. Receivers can use a phone or another computer. Different networks are supported when the app is publicly hosted over HTTPS and a working TURN relay is configured. This checkout is not automatically a publicly reachable website.

## Run

Requires Node.js 20.19+ and npm. From this workspace:

```sh
npm install
npm run dev
```

On Windows PowerShell, use `npm.cmd` instead of `npm` if script execution policy blocks npm. The **Relay: development server** VS Code task also starts the app.

- PC: <http://localhost:5173>
- Phone: use the `https://YOUR-PC-LAN-IP:5443` address printed in the terminal, shown on the PC pairing page, or listed under Connection details.
- These default addresses are only for local preview on the same LAN. They are not reachable from someone else's Wi-Fi or mobile data.
- For internet access, follow **Public Deployment** below. Both devices must open the same public website; they do not need the same Wi-Fi.

## Group Voice And Screens

The home page has a **Group** option alongside the existing PC/phone modes.

1. Open **Group**, choose **Create group**, enter your name, and allow microphone access. The room displays a six-digit group code.
2. Give the same website address and group code only to the intended people. They select **Group > Add group / Join group**, enter their name and the code, and allow their microphones.
3. Everyone can talk and listen at the same time. Use the microphone button to mute/unmute yourself and the speaker button to mute/unmute playback on your device. If autoplay is blocked, press the member's **Hear** button.
4. Any member using a supported desktop Chrome/Edge browser can press **Share screen**. Multiple members can share simultaneously; their screen tiles appear separately with fullscreen controls. Screen sharing here sends video only; voices are carried by each member's microphone. Phones can join voice and view screens, but mobile browser screen capture is generally unavailable.
5. **Stop sharing** ends only your screen, not the group voice. **Leave group**, returning home, closing the tab, or losing the signaling connection releases your microphone/screen and peer connections.

Groups support **up to six members including the creator**, using a full mesh of browser WebRTC connections. Larger groups need an SFU media server, which this app does not implement. Each member uploads to every other member, so bandwidth and CPU use increase with group size, especially for simultaneous screens. Use headphones to reduce feedback.

A group code remains valid while at least one member stays connected. The creator leaving does not end the room for others; the last member leaving deletes it. Names are display labels, not verified identities. No moderator, member-kicking, recording, or account authentication is provided. If microphone permission is denied, you can still join and view; press **Unmute** after allowing permission to speak.

Groups use the same HTTPS/STUN/TURN setup as PC/phone mode. **Local private-IP links still only work on the local network.** Different-network group calls require a public HTTPS deployment and working TURN. Group browser verification used three generated microphone sources, confirmed the full mesh and inbound audio packets at each member, decoded two concurrent screen streams, exercised mute status, late join and creator departure, and checked track cleanup. Real physical microphones, mobile hardware, and public/TURN connectivity still require real-device testing.

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

## Connect

1. Open the website in desktop Chrome or Edge and select **This device is my PC**.
2. Open the **same** website on the receiving device and select **This device is my phone**. Another computer can also use this receiver mode.
3. Enter the PC's six-digit code on the phone and press **Connect to PC**.
4. On the PC, enable **Share microphone** for your voice and optionally **Share system audio**. Press **Choose a screen**, approve a screen/window/tab, and allow the microphone. You can start sharing before pairing. If microphone permission is denied, capture stops and the app asks you to retry or disable microphone sharing.
5. Use fullscreen on the phone for a larger view. Audio starts muted: tap **Unmute audio** to hear the PC's voice and optional system audio. The PC's **Mute microphone** button mutes voice without muting system audio. This is one-way voice from PC to receiver, not a two-way call. Keep the receiver browser open and the phone awake.
6. **Stop sharing**, the browser's native stop action, or returning home ends capture. Disconnecting only the phone leaves the PC capture running so another phone can reconnect before the code expires.

Only one phone can pair with a PC session at a time. Unused codes expire after 10 minutes. An already connected stream can continue after that; generate a new code before pairing a replacement phone. Sessions are in memory and disappear when the server restarts.

## Local HTTPS

The app creates a self-signed certificate in `.cert/localhost.json`, which is excluded from git. Browsers may show a certificate/privacy warning. Continue only on your trusted network after checking that the address is your own PC. Some phone/browser configurations require installing and explicitly trusting a local certificate; a CA-trusted certificate is the alternative. An insecure HTTP LAN address may not expose the browser APIs needed to receive video. Desktop capture works on HTTP **localhost**, which browsers treat as a secure context.

Keep the private certificate file private. It is renewed when the detected LAN addresses change. Do not expose the local self-signed development listeners directly to the internet. Public deployment requires a trusted TLS-terminating proxy as described above.

## Mirroring Versus Extended Desktop

**A website alone cannot create a native Windows secondary display.** Relay mirrors an existing screen, window, or tab. To use the phone as a genuinely separate desktop, first install a trusted Windows virtual display driver separately, configure Windows to **Extend** to that display, and then select that existing display in Relay's screen picker. This project does not install drivers, create virtual displays, or provide remote mouse/keyboard control.

## Controls

- Six-digit code with copy, expiry countdown, and regeneration.
- 1080p, 720p, or 480p requested capture height at up to 30fps. Actual resolution adapts to browser, screen, bandwidth, and CPU.
- Optional system/tab audio, depending on browser and selected capture source.
- Optional PC microphone voice, with microphone and system audio mixed into one outgoing track and live microphone mute/unmute.
- Local PC preview, phone fullscreen, playback pause/resume, and mute/unmute.
- Responsive layouts, accessible input labels, keyboard focus, reduced-motion support, and connection/error states.

## Troubleshooting

- **Different-network receiver cannot open the address:** private `10.x`, `192.168.x`, or localhost URLs are not public websites. Deploy publicly and share the HTTPS domain, not the PC's private IP.
- **Local preview unreachable:** use the PC's LAN address, allow Node.js on the Windows Private network only, and check the local ports. Never disable the firewall.
- **Paired but no video/audio:** verify TURN URLs, credentials, open relay ports and firewall rules; test `ICE_RELAY_ONLY=true`. The UI's relay-configured indicator only confirms settings exist, not relay reachability or credentials validity. Check VPNs and browser permissions. Local previews can still connect without TURN.
- **Capture unavailable:** use desktop Chrome/Edge on localhost or a trusted HTTPS origin. Phones are receivers, not PC-screen capture sources.
- **Voice unavailable:** allow microphone permission on the PC, enable Share microphone before capture, and unmute audio on the receiver. Check the PC's live mic mute button and the system microphone input. For system audio, choose a supported browser source and enable its audio checkbox in the native picker.
- **Code rejected:** check all six digits, expiration, and whether another phone is connected.
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
