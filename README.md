# TiltRace

TiltRace is a small multiplayer arcade racer. A browser runs the race and creates a room; phones join as motion controllers over the WebSocket server. Deploy it publicly to let players join from different Wi-Fi networks or cellular data.

## Tech stack

| Component | Technology | Role |
| --- | --- | --- |
| Monorepo | npm workspaces | Runs the server, browser game, and phone controller from one repository. |
| Relay server | Node.js (ES modules), `ws` | Creates rooms, pairs clients, relays controller input, tracks readiness and ping, and validates nitro recharge claims. |
| Browser game | React 18, Vite 6, Three.js 0.186 | Hosts the room and renders the 3D race; each racer gets a viewport, a smoothly damped follow camera, and local frame-by-frame car simulation. |
| Phone controller | React Native 0.86, Expo SDK 57 | Reads motion sensors, scans room QR codes, sends controls, and stores reconnect details. Expo Camera, Sensors, Haptics, Screen Orientation, and AsyncStorage provide those device features. |
| Hosting | Render Blueprint (optional) | Serves the built browser app and WebSocket relay from a public HTTPS/WSS endpoint for play across networks. |

### Pairing flow

1. Start the browser and relay locally with `npm run dev`, or deploy the service with [`render.yaml`](render.yaml). Locally, Vite serves the page on port `5173` and the WebSocket relay listens on port `3001`.
2. In the browser, create a race room. The server returns an eight-character room code; the page's QR code packages that code with the relay address.
3. Open TiltRace Controller in Expo Go or an installed build. Scan the QR code, or enter the relay address and room code manually. The phone sends a `join` message and receives a player session ID.
4. Calibrate in the phone's landscape driving position, then tap **Ready to race**. The browser host starts the round when the racers are ready.

For **local play**, the phone must be able to reach the laptop on the LAN: use the laptop's LAN IP (not `localhost`) and allow ports `5173` and `3001` through the private-network firewall. For **play across different Wi-Fi networks or cellular data**, deploy publicly and pair using the hosted `https://` page/`wss://` relay address. Both devices need internet access; they do not need to share a Wi-Fi network. See [Play across networks](#play-across-networks) for deployment steps.

### Latency and input flow

- The phone samples steering and sends normalized steering, gyro readings, and button states every **33 ms** (about 30 updates/second). Sensor smoothing and neutral calibration happen on the phone before sending.
- The relay accepts at most **one input every 20 ms per racer** (up to 50/second), then forwards the latest controls to the browser. The browser simulates cars locally and renders its scene with the display's animation frames; it sends position snapshots to the server about every **60 ms** for room state and nitro-pad checks.
- The phone measures round-trip ping by sending a timestamped ping about every **2 seconds** and timing the server's pong. The server also pings each phone every 2 seconds; the phone replies, and the server records that round trip for the browser's racer list. These are RTT measurements, not one-way control delay, and the display is refreshed on ping/room updates rather than on every control packet.
- Ping includes network transit in both directions plus phone/server scheduling. Actual control response can also be affected by Wi-Fi or cellular congestion, device load, and browser frame scheduling. A public relay enables cross-network play, but cannot guarantee a fixed latency.

## Prerequisites

- Node.js 22.13 or newer and npm.
- Android Studio/Android SDK for a native Android build, or Expo Go for quick device development.
- For local development, laptop and phone on the same Wi-Fi network. For play across networks, deploy the public service described below.

## Install and run

From the repository root:

```sh
npm install
npm run dev
```

This starts the WebSocket server on port `3001` and Vite on port `5173`, both listening on all network interfaces. These are separate services on separate ports, so this setup does not create a port conflict. The mobile controller also connects to the WebSocket server on port `3001`; only the laptop's IP/hostname changes. Open `http://localhost:5173` on the laptop for local play. For phone pairing on the same Wi-Fi, open the laptop's LAN URL such as `http://192.168.1.20:5173`; the QR uses that host with port `3001` as the WebSocket server address. The server health endpoint is `http://localhost:3001/health`.

To run components separately:

```sh
npm run dev -w server
npm run dev -w web
```

For local production builds, run `npm run build -w web`. The public Render setup below serves this build and the WebSocket relay from one host.

## Play across networks

The easiest setup uses a public host with HTTPS and secure WebSockets. This repository includes a Render Blueprint at [`render.yaml`](render.yaml), which builds the browser game and runs the relay in one web service.

1. Push this repository to a Git provider and create a Render Blueprint from it. Render reads `render.yaml` and creates the `tiltrace` web service.
2. Wait for the first deploy, then open the service's public `https://…onrender.com` URL. The page and relay share that public host; the browser automatically connects over `wss://`.
3. Create a room in the hosted game and scan its QR code with each phone. The QR includes the public WSS server address and room code. Phones can use cellular data or a different Wi-Fi network; they only need internet access.
4. If entering details manually, use the service's public host as `wss://YOUR-SERVICE.onrender.com` and type the room code. For the Expo controller, build/install the app once; no per-network server changes are needed after scanning the QR.

Render's free web service can spin down after inactivity, so its first wake-up may take a little while and an idle or deploy event can disconnect an active room. Reconnect and create a fresh room after the service wakes. For a continuously available game, select a paid always-on web service in Render.

The server supports an optional comma-separated `ALLOWED_ORIGINS` environment variable to restrict browser WebSocket origins, for example `https://your-service.onrender.com`. Native phone clients do not send a browser Origin header. Leave it unset if you do not need this restriction.

### Join a phone

1. Find the laptop's Wi-Fi IPv4 address (for example `192.168.1.20`). Open `http://192.168.1.20:5173` on the laptop, keep the server on port 3001, and allow Node.js through the laptop firewall on the private network. The QR's server address comes from this page URL, so using `localhost` here would make the phone try to connect to itself.
2. On the laptop, open the browser game and choose **Create a race room**. It displays a QR code and eight-character room code.
3. In a terminal, run `cd mobile && npm install && npx expo start`. Open TiltRace Controller in Expo Go or install a development/release build. Rebuild/reinstall a native app after changing the Expo orientation setting so it takes effect on the phone.
4. Scan the browser QR or enter `ws://LAPTOP-IP:3001` and the room code in the phone app. The QR encodes both server address and room. Scanning requires camera permission; code entry is always available.
5. Scan and join while the phone is in portrait. After joining, it rotates to landscape; hold it like a steering wheel, tap **Calibrate**, and rotate it left/right to steer. Tap **Ready to race** to tell the browser you are ready. The laptop host starts the round when racers are ready.

For local play, the laptop browser and phones must be able to reach each other over Wi-Fi. Open inbound TCP ports 5173 (web page) and 3001 (WebSocket) on the laptop's private network if the firewall asks. The QR is generated in the browser and is not uploaded to a service.

## Controls and round flow

- Join in portrait; the controller locks to landscape after connecting. Rotate the phone left/right like a steering wheel to steer, then tap **Calibrate** to recenter. Steering uses the gyroscope with a small dead zone and smoothing, with a higher default sensitivity and an adjustable range up to 3×. Tilt input is ignored until the accelerator is first pressed; the car waits pointed along the circuit and then gets a gentle track-follow assist.
- Cars accelerate only while **Accelerate** is held. Releasing it lets the car coast to a stop; **Brake** slows the car without putting it into reverse. Throttle acceleration has been reduced for more gradual speed buildup.
- Hitting a track boundary resets the car to the track center at the collision point and holds it stationary for a two-second penalty. The camera eases after the reset rather than snapping to the new position.
- Each complete circuit awards 2 bonus points. The finish scoreboard ranks racers by total points, with laps breaking ties.
- Hold **Accelerate** to drive; hold **Brake** to slow down. On-screen feedback shows connection state and measured ping.
- Shake the phone beyond the configurable threshold to trigger a short jump. A 1.4 second cooldown limits accidental retriggers.
- Press **Nitro** to consume a server-issued boost charge. The glowing green pads along the track recharge up to 35 points each, subject to a server-side 1.5 second pickup cooldown. Haptics can be disabled in the controller.
- Browser keyboard test car: WASD or arrow keys to steer/accelerate/brake, Space for nitro, Shift to jump. Select **Add keyboard racer** in the room lobby.
- Each round runs for two minutes; the finish screen ranks players by score. **Race again** returns connected phones to the lobby and resets readiness, score, and nitro.

## WebSocket protocol

Messages are JSON objects with a `type` field. The server limits message payloads to 4 KiB, checks roles and room membership, bounds numbers, caps rooms at eight phones, and rate-limits controller input.

| Direction | Type | Purpose |
| --- | --- | --- |
| Browser → server | `create` | Create a lobby; server responds `created` with room code. |
| Phone → server | `join` | Join by room code and optional stored `playerId` for session resume. |
| Phone → server | `ready` | Set player readiness with a request ID; server replies `readyAck` and broadcasts the updated room roster. |
| Phone → server | `input` | `{input:{steer,throttle,brake,jump,nitro,gyro:{x,y,z}}}`; steering is -1…1, throttle 0…1, and gyro axes are bounded by the server. |
| Phone ↔ server | `ping`, `pong` | Server pings phones every 2 seconds; client echoes ID and server timestamp for RTT. Phones also ping to keep their live display current. |
| Browser → server | `start`, `restart` | Begin a round or return to lobby. |
| Browser → server | `state` | Position snapshots for server-checked recharge zones; snapshots are throttled at 16 Hz. |
| Server → clients | `room`, `control`, `gameState`, `nitro`, `recharge`, `readyAck`, `browserGone` | Lobby/player state, controls, scores, authoritative nitro updates, readiness confirmation, and race-page disconnect notices. |

Disconnected player records are retained for 60 seconds. The controller stores the room, server address, display name, and player ID locally, reconnects with exponential backoff, and reuses the ID when the session is still present. A room is removed after the browser and all player sessions have gone away.

## Network, permissions, and troubleshooting

- **Connection refused:** confirm the server is running, use the laptop's LAN IP rather than `localhost` on the phone for local play, and allow port 3001 through the private-network firewall. The controller no longer fills in a fixed example IP; scan the race QR or enter `ws://LAPTOP-IP:3001`. If the server reports `EADDRINUSE`, another process already owns port 3001; stop that process before starting TiltRace. For internet play, use the deployed `wss://` host.
- **QR scan filled no room:** confirm it is the room QR displayed by TiltRace. You can type the eight-character code instead.
- **Phone says the race page disconnected:** the browser page refreshed or lost its WebSocket. Create a new room in the browser and scan its new QR code; an old room cannot reconnect to a newly created browser room.
- **Local devices on Wi-Fi cannot connect:** disable guest Wi-Fi/client isolation or connect both devices to the same non-isolated subnet. Public hosting avoids this restriction.
- **No motion input:** ensure Expo Go or the installed app has motion access, check the device has an accelerometer, and recalibrate while the phone is held level. Sensor availability varies by hardware. Camera access is only needed to scan; room-code entry does not require it.
- **Transport:** local development uses `ws://`; public deployment uses HTTPS and `wss://`. Browsers require a secure context for web sensor APIs; the phone app uses native sensors. Do not expose the local development server directly to the public internet.
- Network round-trip time includes phone radio, Wi-Fi contention, operating-system scheduling, and server/browser processing. A nearby laptop and 5 GHz Wi-Fi can help; the game displays measured latency instead of promising a fixed delay.

## Android build and iOS

From `mobile`:

```sh
npm install
npx expo prebuild --platform android
cd android
./gradlew assembleRelease
```

On Windows, run `gradlew.bat assembleRelease`. The APK is produced at `mobile/android/app/build/outputs/apk/release/app-release.apk`. Install it with `adb install -r app-release.apk` or copy it to the phone. This repository does **not** include an APK; the build requires a local Android SDK and a signing configuration for store distribution. Expo Go is sufficient to exercise the controller during development.

iOS source/configuration is included. Run `npx expo run:ios` on macOS with Xcode installed. A physical iPhone can require a development build signed with an Apple developer identity; the project does not include signing credentials.

## Demo recording and known limitations

No real phone or screen-recording facility was available in the build environment, so no recording is included. To record a demo, start the server and browser, join using a physical phone on the same Wi-Fi, start a screen recording on both phone and laptop, then show room pairing, calibration, steering, shake jump, nitro use and a recharge-pad pickup, latency, a reconnect, and a second phone joining.

This is a compact arcade prototype rather than a full racing simulator. The browser host owns the 3D visual simulation; rounds use a timer, lap bonuses, and a points scoreboard rather than a championship format. Gyroscope sensitivity and axis behavior vary by device; calibrate with the phone held in its landscape driving position. For an internet-hosted game, add room authentication, stricter server-authoritative physics, persistence, and production mobile signing.
