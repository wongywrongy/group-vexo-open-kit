# Getting camera photos and live video from Mentra Live (MentraOS) into a Mac program

**Read this first (source quality and access limits).**
- Network in this research session blocked `docs.mentraglass.com`, `docs.mentra.glass`, `unpkg.com` and `smartglassesgeek.com` (DNS failure on every fetch), and the GitHub MCP tool was restricted to another repository. I therefore could NOT read the official docs pages directly. Most "documented" findings below come from WebSearch result summaries that quote or paraphrase those official pages; the URLs are the pages the summaries pointed at. Treat them as "documented per search summary, not verified on the page" until someone opens the page.
- The one page I read in full: [Mentra-Community/MentraOS PR #3622](https://github.com/Mentra-Community/MentraOS/pull/3622) (via WebFetch of github.com).
- No hands-on, measured glass-to-screen latency for Mentra Live was found anywhere. The only latency numbers are protocol-level claims in docs and BLE transfer timings in PR descriptions.
- Today is 2026-11-14. Docs mirrors for several SDK generations are live at once (see "SDK options"); signatures differ between them.

---

## 1. Mentra Live hardware facts

### Takeaway
Mentra Live is a camera-only (no display) pair of glasses: 12 MP camera, 3 microphones, speakers, a button, LEDs and Wi-Fi/Bluetooth. Whether it has an IMU that developers can read is NOT confirmed; the official IMU guide says raw accelerometer streaming is currently for a different device (G2), so do not plan a gesture tool around head motion from Mentra Live.

### Cited Findings
- Camera: 12 MP, 119-degree field of view (one 9to5Google piece gives 112 degrees for landscape capture); 1080p video recording reported; 3 microphones; built-in stereo speakers; MediaTek MTK8766 plus a low-power MCU (dual-chip); 43 g. — [TechSpot](https://www.techspot.com/news/110955-new-mentra-live-smart-glasses-built-livestreaming-platforms.html?rand=98523), [9to5Google](https://9to5google.com/2026/01/15/mentra-live-smart-glasses-youtube-livestream/) (figures as summarised by search tool)
- Price: $299 per most outlets, $349 per one outlet; shipping began early 2026 in limited batches. — [Engadget](https://www.engadget.com/wearables/mentras-first-smart-glasses-are-open-source-and-come-with-their-own-app-store-150021126.html), [yespress.io](https://yespress.io/mentra)
- Battery: Engadget reports "more than 12 hours" with 50+ extra hours in a 2,200 mAh charging case; a separate spec sheet lists a 260 mAh glasses battery; an "Infinity Cable" lets the glasses draw power while worn. — [Engadget](https://www.engadget.com/wearables/mentras-first-smart-glasses-are-open-source-and-come-with-their-own-app-store-150021126.html). The 12 h figure is a launch claim for mixed use, not streaming.
- Photo full-resolution spec: a spec page lists 3264x2448 photos (not mapped to SDK size tiers). — [Smart Glasses Geek](https://smartglassesgeek.com/glasses/mentra-live/) (appeared in search results, page not fetched)
- Capabilities flag `hasIMU` exists in MentraOS (boolean; `imu` object is null when false; optional `hasCompass`, `hasGyroscope`). — [Capabilities reference](https://docs.mentraglass.com/app-devs/reference/interfaces/capabilities)
- IMU guide: raw accelerometer streaming is "G2-only today"; on glasses without an exposed IMU stream the subscription succeeds and no events arrive; gyroscope, magnetometer and fused orientation not exposed yet. — [IMU guide](https://docs.mentraglass.com/app-devs/core-concepts/imu) (per search summary)
- A `onHeadPosition` handler (head up/down past a threshold) is documented in the device docs; the Mentra Live Bluetooth SDK hardware page lists "button, touch, head-up, and switch events" as input. — [Device overview](https://mentraos-docs-temp.pages.dev/app-devs/core-concepts/device/overview), [Bluetooth SDK hardware](https://docs.mentraglass.com/bluetooth-sdk/hardware)
- An unofficial March 2026 community hardware note (firmware v34.0) reports 4 hardware sensors, no magnetometer, accelerometer only in its sensor table; single source. — surfaced in the same search ([idevice.com guide](https://idevice.com/guide-text/mentra-live.md)), not read directly
- The Bluetooth SDK exposes button-press and battery events and controls for camera, microphone, speaker, LEDs, Wi-Fi and streaming. — [@mentra/bluetooth-sdk on npm](https://npmjs.com/package/@mentra/bluetooth-sdk), [API reference](https://docs.mentraglass.com/bluetooth-sdk/api-reference)
- Wi-Fi commands in the Bluetooth SDK API: `requestWifiScan`, `sendWifiCredentials`, `forgetWifiNetwork`, `setHotspotState`. — [API reference](https://docs.mentraglass.com/bluetooth-sdk/api-reference)
- Speaker: no SDK call plays sound on the glasses; audio is routed through the phone's normal audio APIs as Bluetooth media output (on iOS the user must select the glasses manually). — [Bluetooth SDK audio](https://mentraos-docs-temp.pages.dev/bluetooth-sdk/audio)

### Inferences
- `hasIMU` for Mentra Live is probably false or unreadable as of the docs I could see; check `session.capabilities` at runtime on the actual glasses before designing any motion feature.
- A hackathon gesture tool should derive gestures from the camera frames (vision), with the button/voice as triggers, not from head motion.
- Battery life while streaming video is very likely far below 12 h (no measured figure found).

### Gaps
- Battery life while streaming: no measurement found.
- Exact LED layout/behaviour and which LED is the "recording" LED: not found in the pages I could reach.
- Confirmation of the Mentra Live `hasIMU` value and of the number/types of buttons: not found.
- Video resolution/fps default and maximum: not found (see section 4).

---

## 2. SDK options and which fits a hackathon team with its own Mac/server

### Takeaway
Three generations coexist in the docs: (a) the cloud-hosted TypeScript SDK `@mentra/sdk` (app server you host, glasses talk via Mentra cloud), (b) the standalone Bluetooth SDK `@mentra/bluetooth-sdk` (Android/iOS/React Native, talks to the glasses directly from a phone app), (c) MentraOS 3.0 on-phone miniapps via `@mentra/miniapp`, which per docs supports local testing only, with no public distribution yet. For "frames end up in a Mac program" the cloud SDK (photo + managed/unmanaged streams) or a phone app on the Bluetooth SDK that forwards to the Mac are the realistic routes.

### Cited Findings
- Cloud/miniapp TypeScript SDK exposes `session.camera.requestPhoto()` (needs CAMERA permission in the app manifest; only on camera-equipped glasses such as Mentra Live). — [Photo capture](https://docs.mentraglass.com/app-devs/core-concepts/camera/photo-capture), [Camera manager reference](https://docs.mentraglass.com/app-devs/reference/managers/camera)
- Camera, photo upload and camera streaming are also documented in the standalone Bluetooth SDK docs, whose `requestPhoto` has a different shape (webhook URL, auth token, compression options). A starter kit `Mentra-Bluetooth-SDK-Starter-Kit` covers photo upload to a webhook and camera streaming. — [Bluetooth SDK camera streaming](https://docs.mentraglass.com/bluetooth-sdk/camera-streaming), [Example apps](https://docs.mentraglass.com/example-apps) (per search summary)
- Bluetooth SDK: base SDK for mobile apps controlling Mentra Live directly over Bluetooth; npm package is the React Native/Expo entry point, with native Android and iOS versions; needs a physical phone, a development build (not Expo Go); `scan` takes a device model then `connect`; React hooks under `@mentra/bluetooth-sdk/react`. — [@mentra/bluetooth-sdk on npm](https://npmjs.com/package/@mentra/bluetooth-sdk), [Mentra Live docs](https://docs.mentraglass.com/mentra-live)
- The Bluetooth SDK and the glasses software must be the same release; the docs listed 0.1.19 as the latest matching pair in one search and 0.1.20 in another. Other sources show unpkg README at 3.3.0 and a pkgstats snapshot at v0.1.6, so version numbering is inconsistent across sources. — [Mentra Live docs](https://docs.mentraglass.com/mentra-live/overview), [unpkg README 3.3.0](https://unpkg.com/@mentra/bluetooth-sdk@3.3.0/README.md), [pkgstats](https://www.pkgstats.com/pkg:@mentra/bluetooth-sdk) (0.1.20 is the highest "matching pair" seen; treat as newest, unverified)
- MentraOS 3.0: miniapps run on the user's phone via `@mentra/miniapp`; no server, domain or uptime to manage; the older `@mentra/sdk` was cloud-hosted. 3.0 supports local development/testing (release install onto test phones on the local network; CLI can produce a ZIP artifact) but provides no supported way to distribute a miniapp; public distribution via the Miniapp Store is "planned for a future release". One Mentra Live page said 3.0 would ship "Summer 2026"; I could not confirm current release status. — [Local development](https://docs.mentraglass.com/app-devs/getting-started/deployment/local-development), [Distribution](https://docs.mentraglass.com/app-devs/getting-started/distribution), [Getting started overview](https://docs.mentraglass.com/app-devs/getting-started/overview)
- Conflict: an Algolia-indexed repo summary says the Cloud V2 CLI can publish to the Cloud V2 console; this conflicts with the official "no distribution in 3.0" statement; official docs preferred. — [Algolia summary](https://docsearch.algolia.com/mcp/docs/repo/mentra-community/mentraos)
- Camera example apps: `MentraOS-Camera-Example-App` (captures photos with the glasses, shows them on the phone) and `photo-taker`; the org's pinned repo is a Display example for HUD glasses. — [Example apps](https://docs.mentra.glass/example-apps), [Mentra Community mirror](https://dr.molodetz.nl/_proxy/https/github.com/Mentra-Community)
- Cloud docs mention SDK integration with the MentraOS cloud. — [Cloud docs: SDK integration](https://cloud-docs.mentra.glass/cloud-overview/sdk-integration)

### Inferences
- Because 3.0 miniapps cannot be distributed and run on the phone, the cloud SDK (`@mentra/sdk`) is the simplest way to have the team's own Mac/server receive data: run the app server on the Mac, expose it by tunnel, and register it. Check that the cloud-hosted path is still supported in Nov 2026; the docs now push on-phone miniapps and the Bluetooth SDK.
- If the team wants zero dependence on Mentra's cloud (see section 5), the Bluetooth SDK in a small phone app that forwards JPEGs to the Mac over the LAN is the route, at the cost of writing a native/React Native app.

### Gaps
- How to register an app, what accounts/API keys/package names are needed, and whether the developer console still applies: the pages for this were not retrievable; no cited facts.
- Whether the Mentra mobile app must run on the phone alongside a Bluetooth SDK app (and whether the glasses can pair with two apps at once): not found.

---

## 3. Photo capture: requestPhoto

### Takeaway
`requestPhoto()` returns the image to the app (buffer, mimeType, size) and takes size/compress/saveToGallery options. The Bluetooth-SDK path over BLE is slow-ish (several seconds for ~260 KB), with a 30 s timeout. No measured end-to-end "request to pixels" latency exists in what I found; assume multiple seconds, not video-rate.

### Cited Findings
- Cloud SDK `requestPhoto` options: `saveToGallery`, `size` (small, medium (default), large), `compress`; result has a buffer (convertible to base64), `mimeType`, `size`, `filename`. Resolution received depends on requested size and whether the glasses are on Wi-Fi. — [Photo capture](https://docs.mentraglass.com/app-devs/core-concepts/camera/photo-capture), [Camera manager](https://docs.mentra.glass/reference/managers/camera)
- Bluetooth SDK `requestPhoto(...)` resolves only after terminal success; rejects if no terminal `photo_response` arrives within 30 s (110 s when `presend_thumbnail` is enabled). — per search summary of the Bluetooth SDK docs ([API reference](https://docs.mentraglass.com/bluetooth-sdk/api-reference))
- Compression mapping (PR text): none/low/medium/high map to JPEG Q95/Q88/Q78/Q60; "heavy" is a legacy alias; size tier pixel dimensions are not given. — [PR #4259](https://github.com/Mentra-Community/MentraOS/pull/4259), [PR #4258](https://github.com/Mentra-Community/MentraOS/pull/4258)
- Mentra AI app requests `size: "low", mode: "photo", transferMethod: "ble", compress: "high"`; a follow-up PR says lower resolution and stronger compression can reduce fine-detail readability. — [PR #4258](https://github.com/Mentra-Community/MentraOS/pull/4258)
- BLE timings from a PR: 5779 ms for 264,812 bytes over GATT, about 3.5 s over CoC for a similar-sized file, measured on the glasses side through the last MCU ACK, not final phone receipt. — [PR #4574](https://github.com/Mentra-Community/MentraOS/pull/4574) (per search summary)
- Native SDKs keep `auto` transport for ordinary public upload URLs (direct Wi-Fi upload with fallback delays). — [PR #4259](https://github.com/Mentra-Community/MentraOS/pull/4259)
- Known bug class: a truncated frame at the BES parse head can hold all later MTK messages for 9 to 32 s during BLE photo transfer; fixes for BLE photo recovery stalls were in flight. — [PR #4349](https://github.com/Mentra-Community/MentraOS/pull/4349), [PR #4574](https://github.com/Mentra-Community/MentraOS/pull/4574)
- Issue: "New Mentra AI doesn't get transcripts while a BLE Photo Transfer is ongoing" — transcription is starved during BLE photo transfer. — [Issue #3399](https://github.com/Mentra-Community/MentraOS/issues/3399)
- Local miniapp path (read in full): `takePhoto()` requests `destination: {kind: "phone"}` from the Bluetooth SDK; the phone reads the JPEG into a data URL and resolves `PhotoTaken {requestId, dataUrl, photoUrl, mimeType, size}`; "no network request anywhere in the flow"; `saveToGallery` maps to `keepOnGlasses`; `transferMethod` is ignored and `compress` is ignored (BLE codec governs); timeouts chain 60 s native, 75 s coordinator, 90 s miniapp default; large photos become base64 strings in memory; PR is open/approved, on-device air-gap and max-size memory tests not yet run, `saveToGallery` depends on firmware from another PR. — [PR #3622](https://github.com/Mentra-Community/MentraOS/pull/3622)

### Inferences
- Best-case photo rate is roughly one frame every several seconds over BLE, likely faster over Wi-Fi upload, with an unmeasured camera-ready delay. Not suitable for continuous gesture tracking; fine for "snapshot on trigger".
- A BLE photo transfer may starve voice transcription (issue #3399), so avoid photo bursts while relying on live speech events.

### Gaps
- Pixel dimensions of small/medium/large: not found (only the 3264x2448 full-size spec).
- Measured shutter-to-Mac latency on Wi-Fi vs BLE: none found.
- How the photo reaches a cloud-SDK developer's server precisely (direct return vs webhook): summaries conflict (buffer in the cloud SDK vs webhook URL in the Bluetooth SDK); open the docs to confirm.

---

## 4. Video: managed vs unmanaged streaming, Mac-side receiver, latency

### Takeaway
There are two modes: managed (Mentra cloud ingests and gives you playback URLs; WebRTC/WHIP sub-second, or SRT with HLS/DASH at ~10-20 s) and unmanaged direct publish to a URL you own (RTMP), which is the route that can land on a Mac. Only one unmanaged stream runs per device at a time. No measured glass-to-screen latency was found for the direct route.

### Cited Findings
- Two modes: managed (cloud-orchestrated; multiple apps can consume the same managed stream) and unmanaged (direct RTMP to your endpoint; you handle ingest, transcoding, distribution). One unmanaged stream at a time per device; it blocks managed streams while active; another page says it takes exclusive control of the camera so other apps' starts fail. — [Streaming (core concepts)](https://docs.mentraglass.com/app-devs/core-concepts/camera/streaming), [RTMP streaming](https://docs.mentraglass.com/camera/rtmp-streaming), [Unmanaged streaming extension](https://docs.mentraglass.com/cloud-architecture/managers/unmanaged-streaming-extension), [Managed streaming extension](https://docs.mentraglass.com/cloud-architecture/managers/managed-streaming-extension)
- Managed ingest options: `srt` (default) about 10-20 s latency, HLS/DASH playback, recording; `whip` sub-second WebRTC playback, no HLS/DASH, no recording. — [Streaming](https://docs.mentraglass.com/app-devs/core-concepts/stream) (per search summary); WHIP bitrate PR: [PR #3948](https://github.com/Mentra-Community/MentraOS/pull/3948)
- Default WebRTC mode is "sub-second latency"; adding `restreamDestinations` switches to SRT plus HLS/DASH with higher latency. For YouTube/Twitch/Facebook the newer docs recommend managed streaming with restream because glasses->cloud goes over stable SRT. — [Camera streaming (Mentra Live)](https://docs.mentraglass.com/mentra-live/camera-streaming)
- Managed streaming needs internet; unmanaged "can work on local networks". — same search summary of [RTMP streaming](https://docs.mentraglass.com/camera/rtmp-streaming)
- API shapes differ by docs version: older `startManagedStream()` and `startStream({ rtmpUrl })` returning `{ success, streamId? }`; newer `session.stream.startStream({ direct: <url> , video: { fps: 30 }, ... })` with `destinations`. Bluetooth SDK `startStream` takes optional `video` (`width, height, bitrate, fps`) and `audio`; omitted configs use model defaults; status reports `resolvedConfig.video` (encoded `width/height`, `captureWidth/captureHeight`, `bitrate`, `fps`); `setVideoRecordingDefaults({width,height,fps})` exists. Newest is the Bluetooth SDK / `session.stream` docs. — [Streaming](https://docs.mentraglass.com/app-devs/core-concepts/stream), [Bluetooth SDK API reference](https://docs.mentraglass.com/bluetooth-sdk/api-reference), [Cloud SDK integration](https://cloud-docs.mentra.glass/cloud-overview/sdk-integration)
- Glasses-side streaming uses an Android library fork: [Mentra-Community/StreamPackLite](https://github.com/Mentra-Community/StreamPackLite) (SRT/RTMP/RTMPS).
- Generic (non-Mentra) context: standard HLS glass-to-glass is typically 25-30 s; low-latency HLS about 5 s. — [Mux](https://www.mux.com/docs/live-streaming-latency)

### Inferences
- Mac receiver for unmanaged RTMP: run an RTMP ingest on the Mac (MediaMTX or nginx-rtmp, or `ffmpeg -listen 1 -i rtmp://0.0.0.0:1935/live`), give the glasses `rtmp://<mac-lan-ip>:1935/live/<key>`, then read it in Python with OpenCV `cv2.VideoCapture` (FFmpeg backend) or PyAV. Mentra's docs do not prescribe this; it is my inference from the "you provide the endpoint" description. It requires the glasses to be on the same Wi-Fi/LAN as the Mac (or a hotspot), so no client-isolation guest Wi-Fi.
- Expect roughly 1-3 s for RTMP into a local receiver and 10-20 s for managed SRT/HLS; WHIP/WebRTC should be sub-second but you consume it via the cloud URL and a WebRTC client. All unmeasured for Mentra Live.
- Because only one unmanaged stream is allowed and it takes over the camera, `requestPhoto` while streaming may fail; plan to take stills from the video stream rather than mixing.

### Gaps
- Default and maximum resolution/fps/bitrate for Mentra Live video: not found.
- Any measured glass-to-screen latency for RTMP, SRT or WHIP on Mentra Live: not found.
- Whether unmanaged RTMP works in practice with a LAN endpoint without internet (docs say it "can"; not validated).
- Battery/thermal behaviour while streaming: not found.

---

## 5. Local-only / no Mentra cloud path

### Takeaway
Yes, in two forms: (1) unmanaged RTMP to a LAN endpoint (per docs, direct publish to a URL you own), and (2) on-phone photo delivery over BLE directly into a miniapp with no network request (PR #3622, still unmerged/unverified at read time). There is no documented path that streams video to a Mac over BLE without Wi-Fi or a phone intermediary.

### Cited Findings
- Unmanaged streaming "can work on local networks" and needs no Mentra relay. — [RTMP streaming](https://docs.mentraglass.com/camera/rtmp-streaming)
- PR #3622 explicitly targets air-gapped Mentra Live use: BLE photo delivered to the phone-side miniapp with no network request. — [PR #3622](https://github.com/Mentra-Community/MentraOS/pull/3622)
- MentraOS 3.0 local development installs release builds onto test phones on the local network. — [Local development](https://docs.mentraglass.com/app-devs/getting-started/deployment/local-development)
- The Bluetooth SDK runs in a phone app and talks to the glasses directly. — [@mentra/bluetooth-sdk](https://npmjs.com/package/@mentra/bluetooth-sdk)

### Inferences
- Local-only photo pipeline for a Mac: phone app (Bluetooth SDK) -> receives JPEG over BLE -> POSTs to `http://<mac-ip>:PORT` over Wi-Fi. Phone is the unavoidable hop.
- Local-only video: glasses need Wi-Fi credentials (sent over BLE via `sendWifiCredentials`) then publish RTMP to the Mac.

### Gaps
- No on-glasses server/pull interface (e.g., HTTP/RTSP served by the glasses) was found; none documented.

---

## 6. Other inputs for a gesture tool (voice, buttons, IMU)

### Takeaway
Voice transcription and button presses are the documented triggers; head motion on Mentra Live is unconfirmed (section 1).

### Cited Findings
- Button press and battery events come through the Bluetooth SDK; input events listed for Mentra Live include button, touch, head-up and switch. — [Bluetooth SDK hardware](https://docs.mentraglass.com/bluetooth-sdk/hardware), [@mentra/bluetooth-sdk](https://npmjs.com/package/@mentra/bluetooth-sdk)
- Transcription events exist in the Mentra AI app path, and are starved during BLE photo transfers. — [Issue #3399](https://github.com/Mentra-Community/MentraOS/issues/3399)
- `onHeadPosition` ("up"/"down") exists in the device docs; raw IMU is G2-only per the IMU guide. — [Device overview](https://mentraos-docs-temp.pages.dev/app-devs/core-concepts/device/overview), [IMU guide](https://docs.mentraglass.com/app-devs/core-concepts/imu)

### Inferences
- Use button press or a spoken keyword to trigger photo/stream, and do gesture recognition on frames.

### Gaps
- Event names/payloads for transcription and button events in the cloud SDK (e.g., `onTranscription`, `onButtonPress`): not retrieved.

---

## 7. Open-source repos and community projects

### Takeaway
The relevant repos are the main MentraOS monorepo and a few example apps; I found no community project doing vision or frame forwarding to a desktop.

### Cited Findings
- [Mentra-Community/MentraOS](https://github.com/Mentra-Community/MentraOS): OS, SDKs, cloud, ASG (glasses) client; active PR traffic on photo transport (#3622, #4258, #4259, #4349, #4574).
- [Mentra-Community/StreamPackLite](https://github.com/Mentra-Community/StreamPackLite): lightweight Android SRT/RTMP/RTMPS libraries (glasses-side streaming).
- Example apps: `MentraOS-Camera-Example-App`, `photo-taker`, `Mentra-Bluetooth-SDK-Starter-Kit` (photo upload to webhook, camera streaming); `MentraOS-Display-Example-App` is for HUD glasses. — [Example apps](https://docs.mentra.glass/example-apps)

### Gaps
- No vision/AI-analysis or frame-forwarding community repo found; GitHub org listing was only seen via a third-party mirror.

---

## 8. Known limitations, privacy, rate limits, battery/thermal

### Takeaway
Documented limits: one unmanaged stream at a time with camera takeover; BLE photo transfer is slow and has stall bugs; the photo timeout is 30 s on the Bluetooth SDK. Privacy rules (recording LED), rate limits and thermal throttling were not found.

### Cited Findings
- One unmanaged stream per device, exclusive camera. — [Unmanaged streaming extension](https://docs.mentraglass.com/cloud-architecture/managers/unmanaged-streaming-extension)
- BLE transfer stalls of 9-32 s from a truncated frame; BES firmware 26.10.8.0 and paced BLE file frames shipped for older BES firmware. — [PR #4574](https://github.com/Mentra-Community/MentraOS/pull/4574), [PR #4349](https://github.com/Mentra-Community/MentraOS/pull/4349)
- Bluetooth SDK and glasses software must be version-matched. — [Mentra Live docs](https://docs.mentraglass.com/mentra-live/overview)
- Launch coverage focuses on livestreaming to platforms (YouTube etc.); a news report relies on a founder's announcement for traction claims (unverified). — [9to5Google](https://9to5google.com/2026/01/15/mentra-live-smart-glasses-youtube-livestream/), [RuntimeWire](https://runtimewire.com/article/mentra-live-open-source-smart-glasses-ga)

### Inferences
- Version-match glasses firmware and SDK at the start of the hackathon; many photo/stream fixes are recent and unreleased builds may behave differently.

### Gaps
- Recording-LED behaviour and privacy rules, API rate limits, thermal throttling, battery drain while streaming: nothing found. Next step: open `docs.mentraglass.com/llms.txt` (indexes all pages) and the camera, stream and capability pages directly once the host is allowed in the session network settings.

---

## Suggested route ranking for a Mac-side gesture tool (inference)

1. Unmanaged RTMP direct to MediaMTX/ffmpeg on the Mac over LAN, frames pulled with OpenCV: best chance of continuous low-latency frames with no cloud; unverified on Mentra Live; needs same-LAN Wi-Fi.
2. Cloud SDK app server on the Mac with `requestPhoto` on a trigger: simplest, but seconds per frame and depends on Mentra cloud.
3. Managed WHIP (WebRTC) via cloud URL: sub-second claim but needs a WebRTC client on the Mac and internet.
4. Bluetooth SDK phone app forwarding JPEGs over LAN: no Mentra cloud, but a native/RN app and BLE-speed photos.
