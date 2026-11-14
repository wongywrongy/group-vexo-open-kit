# Pointing a gimbal / PTZ camera at a named person on a spoken command (podcast setting)

Research date: 2026-11-14. Method note: several vendor hosts (obsbot.com, socket.dev, macmyths.com, readthedocs) were not reachable from the research sandbox, so a number of findings below come from search-result summaries of those pages, not from reading the pages in full. Each such item is tagged "(search summary)". Labels: FACT = stated by a cited source; REPORTED = single third-party/community report; INFERENCE = my reasoning, not sourced. Nothing here was tested on hardware.

---

## 1. Which gimbals and cameras can be controlled from code, and how

### Takeaway
For a student team the lowest-risk routes are (a) a UVC webcam gimbal (OBSBOT Tiny 2, Insta360 Link) driven through standard V4L2/UVC pan/tilt controls, or OBSBOT's OSC interface, (b) a standard PTZ camera over VISCA-over-IP or ONVIF, and (c) a DIY servo/SimpleBGC rig. DJI Osmo Mobile has no documented public control path, and DockKit manual control depends on the specific dock.

### Cited Findings

**OBSBOT (Tiny 2 / Tiny 2 Lite / Tail 2 / Meet)**
- FACT: OBSBOT's Tiny 2 product page advertises an SDK and OSC ("Enhance control of OBSBOT Tiny 2 for developers and musicians"); the search did not return the SDK documentation or download link itself, so command set and platforms are unverified here. — [OBSBOT Tiny 2 page](https://www.obsbot.com/obsbot-tiny-2) (search summary); an OBSBOT SDK landing page exists at [obsbot.com/sdk](https://obsbot.com/sdk) (listed in results, not opened, host blocked)
- FACT: Tiny 2 specs: controllable pan ±140°, tilt +30° to -70°, mechanical pan ±150°, tilt ±90°, max controllable speed 120°/s. — [OBSBOT Tiny 2 specs](https://obsbot.com/obsbot-tiny-2-4k-webcam/specs) (search summary)
- FACT: A community Python script controls the Tiny 2 Lite via OSC using `python-osc`; default 127.0.0.1:16284; OSC control must be enabled in the OBSBOT Center desktop app and OBSBOT Center must be running. The page lists no OSC address paths. — [M4ri002/OBSBOT-Tiny-2-lite-control](https://github.com/M4ri002/OBSBOT-Tiny-2-lite-control)
- REPORTED: A community AutoHotkey project lists OSC addresses such as `/OBSBOT/WebCam/General/SetGimMotorDegree` (speed, pan, pitch) with its own units (pan -129..129, pitch -59..59). Third-party, not official. — [elModo7/OBSBOT-Camera-Control-AHK](https://gh.hhj520.top/elModo7/OBSBOT-Camera-Control-AHK) (search summary)
- FACT: Tiny 2 exposes standard UVC PanTilt (Absolute) and PanTilt (Relative) descriptors; a late-2025 Linux kernel patch about pan/tilt speed controls was tested on an OBSBOT Tiny 2. — [LKML Dec 2025](https://lkml.iu.edu/2512.1/00400.html) (search summary)
- REPORTED: `obsbot-mcp` (npm, TypeScript) is a third-party MCP server controlling a Tiny 2 over standard UVC/USB (gimbal pan/tilt/roll, zoom, AI tracking) with no vendor SDK, and also a Tail 2 over HTTP/WebSocket. — [glama.ai listing](https://glama.ai/mcp/servers/lxman/obsbot-mcp), [socket.dev listing](https://socket.dev/npm/package/obsbot-mcp) (search summaries)
- REPORTED: Tail 2 (network PTZ camera): a third-party write-up describes an HTTP REST API plus a WebSocket at `/ws/` pushing a status block about once a second without live yaw/pitch/roll; tested on one unit, firmware 7.2.13.1 (2026-09-26); author unnamed. Treat endpoints as unit/firmware specific. — [macmyths.com write-up](https://macmyths.com/reverse-engineering-the-obsbot-tail-2-http-usb-and-a-linux-kernel-fix/) (search summary)
- FACT: OBSBOT's Tail 2 support page lists an official "OBSBOT Tail 2 Protocol" document and VISCA over IP / Pelco options (contents not checked). — [OBSBOT Tail 2 support](https://www.obsbot.com/support/obsbot-tail-2) (search summary)
- Gap: I found nothing specific on OBSBOT Meet's programmatic control.

**Insta360 Link**
- FACT: Basic pan/tilt/zoom is available as standard V4L2 controls on Linux (works like any UVC webcam, absolute and relative). — [vrwallace/Insta360-Link-1-and-2-Controller-for-Linux](https://github.com/vrwallace/Insta360-Link-1-and-2-Controller-for-Linux) (search summary)
- REPORTED: AI tracking, gimbal reset etc. need UVC Extension Unit commands reverse-engineered by sniffing the official Windows controller; selector values may differ by firmware; a macOS project writes the XU registers via IOKit. — [insta360link-controller](https://gh.r-mj.com/jfwoods/insta360link-controller), [EdenCoder/insta360-linux](https://tgfed.nhyvvfeijnh.workers.dev/EdenCoder/insta360-linux) (search summaries)
- FACT (negative finding): the search found no official Insta360 developer SDK for the Link; its official integration found was Stream Deck hotkeys. Absence of evidence only.

**Generic UVC webcams (Logitech etc.)**
- FACT: UVC 1.5 defines PanTilt Absolute/Relative controls as signed 4-byte values; Linux exposes `V4L2_CID_PAN_ABSOLUTE`/`TILT_ABSOLUTE`. — [W3C media-capture log](https://lists.w3.org/Archives/Public/public-media-capture-logs/2017Jun/0079.html), [Chromium v4l2_webcam.cc](https://chromium.googlesource.com/chromium/src/+/ca82da4b11/extensions/browser/api/webcam_private/v4l2_webcam.cc) (search summaries)
- Unit of pan/tilt absolute: not confirmed by the search; from my background knowledge it is arc-seconds (1/3600 degree); verify with `v4l2-ctl -l` (min/max/step). INFERENCE/unverified.
- FACT: OpenCV `VideoCapture` does not expose pan/tilt; use `v4l2-ctl --set-ctrl` or a V4L2 binding (search summary). Many Logitech consumer webcams have no motorised pan/tilt at all (digital-crop only) — INFERENCE, unsourced.

**PTZ cameras: VISCA over IP, ONVIF, NDI**
- FACT: PTZOptics: VISCA over IP via TCP port 5678 or UDP 1259, commands in hex; drive command format `81 01 06 01 VV WW 03 01 FF` (up), plus an AbsolutePosition command taking speeds and position values. — [PTZOptics scripting intro](https://docs.ptzoptics.com/articles/miscellaneous/misc-cameras/an-introduction-to-ip-control-&-scripting-for-ptzoptics-cameras), [PTZOptics G2 command list PDF](https://rust-digger.code-maven.com/src/grafton-visca-0.2.1/docs/PTZOptics-G2-VISCA-over-IP-Command-List.pdf) (search summary)
- REPORTED: vendor quirks: one OBS-forum thread says PTZOptics does not want the VISCA-over-IP header; another notes pan/tilt set ignores the tilt speed. Test raw packets per model. — [OBS forum thread](https://obsproject.com/forum/threads/control-visca-over-ip-based-cameras.136462/page-2) (search summary)
- FACT: Python package `visca_over_ip` documents `Camera('192.168.0.123')` and `cam.pantilt(pan_speed=..., tilt_speed=...)`; written for Sony cameras, not confirmed on PTZOptics. — [visca-over-ip docs](https://visca-over-ip.readthedocs.io/en/latest/) (search summary)
- FACT: ONVIF PTZ Service Spec defines AbsoluteMove and ContinuousMove; latest version found is 25.12 (Dec 2025). — [ONVIF PTZ spec v2512](https://www.onvif.org/specs/2512/ONVIF-PTZ-Service-Spec-v2512.pdf) (search summary)
- REPORTED: ContinuousMove problems: a python-onvif-zeep-async issue where the camera starts moving but cannot stop; a Bosch Autodome "Action Failed" fault. — [python-onvif-zeep-async issue 155](https://github.com/openvideolibs/python-onvif-zeep-async/issues/155) (search summary). Libraries: `onvif-python` ([PyPI](https://pypi.org/project/onvif-python/)).
- FACT: Frigate's `autotrack.py` does ONVIF auto pan/tilt/zoom with a move queue that drops requests issued while the camera is still moving. — [Frigate autotrack.py](https://git.laurivan.com/Mirrors/blakeblackshear.frigate/src/commit/e26bb94007bc15bdad9d7bbf6f6310f473e9b805/frigate/ptz/autotrack.py) (search summary)
- Gap: I found no source on NDI PTZ control (NDI camera control over the network); not researched.

**DJI Osmo Mobile / Osmo Pocket / RS**
- FACT: DJI's Mobile SDK page is for drones/handhelds with the Mobile SDK; a DJI SDK forum thread from the Osmo Mobile 3 era says the SDK does not support Osmo 3. — [DJI SDK forum](https://sdk-forum.dji.net/hc/en-us/community/posts/360036561574-dji-osmo-3-gimbal), [DJI Mobile SDK intro](https://developer.dji.com/mobile-sdk/documentation/introduction/mobile_sdk_introduction.html)
- FACT: Switcher Studio says the DJI Osmo Mobile SDK gives it pan/tilt control for OM 1-3 and OM 4-6 (devices released before 2024); this is a partner integration, not a public API. — [Switcher Studio](https://support.switcherstudio.com/article/466-dji-osmo-mobile-integration)
- FACT: Open-source `node-osmo` reverse-engineers BLE control of Osmo Action 3/4 and Pocket 3 (cameras, not Osmo Mobile gimbals). — [datagutt/node-osmo](https://github.imc.re/datagutt/node-osmo)
- REPORTED: On the Osmo Mobile 8 (iPhone 15 Pro, iOS 26.4) the DockKit calls `setAngularVelocity`, `setOrientation(relative:)` and `setLimits` fail with "device doesn't support the requested operation"; only system tracking works. Same app works on the Insta360 Flow 2 Pro. One Apple engineer reply could not reproduce with Apple's sample app. — [Apple Developer Forums 821439](https://developer.apple.com/forums/thread/821439)
- I found no documented public Bluetooth protocol for Osmo Mobile (search summary of results). Treat DJI handhelds as not programmable by students except through DockKit (iPhone only) and with caveats.

**Apple DockKit**
- FACT: DockKit, iOS 17+/iPadOS 17+/macOS 14+. System tracking runs by default; apps can disable it and use `DockAccessory` to set orientation (radians, pitch/yaw/roll), angular velocity, soft limits, region of interest, framing mode, `selectSubject(at:)`, and feed their own detections with `track(_:cameraInformation:)`. Calling animate/setOrientation more than ~2 times per second throws `frameRateTooHigh`. — [DockAccessory docs](https://developer.apple.com/documentation/dockkit/dockaccessory.md)
- FACT: `setFramingMode` / `setRegionOfInterest` steer which part of a multi-subject frame the dock keeps. — same source.
- FACT: Insta360 says DockKit tracking works in 200+ third-party iOS apps and that the joystick is limited during DockKit tracking. — [Insta360 manual](https://onlinemanual.insta360.com/flow2pro/en-us/faq/feature/native) (search summary)
- REPORTED: a single developer says Flow 2 Pro accepts all DockKit motor APIs. — Apple forum thread above. Not confirmed by Insta360.
- Programs are Swift/iOS only; WWDC23 session 10304 and WWDC24 10164 are the intro talks. — [WWDC23](https://developer.apple.com/videos/play/wwdc2023/10304/)

**Hobby gimbals (SimpleBGC, ESP32 + servos)**
- FACT: BaseCam SimpleBGC32 has a documented Serial API; the GUI uses the same API, so external devices can implement everything. `CMD_CONTROL` sets per-axis mode, speed and angle. — [SimpleBGC Serial Protocol spec](https://www.basecamelectronics.com/files/SimpleBGC_2_6_Serial_Protocol_Specification.pdf), [serial API page](https://basecamelectronics.com/serialapi/) (search summary)
- FACT: Official C library, Apache-2.0, targets Arduino AVR, STM32 and Linux (needs 2 KB RAM/16 KB flash minimum). — [basecamelectronics/sbgc32-serial-api](https://github.com/basecamelectronics/sbgc32-serial-api)
- REPORTED: An Instructable drives a BaseCam controller from an ESP32 (PlatformIO) and notes the RC_ROLL pin must be set to serial mode in the GUI. — [Instructables](https://www.instructables.com/ESP32-BaseCam-Bluetooth-Gimbal-Control). A community Python+pyserial gist exists for the PC side — [gist](https://gist.github.com/maiermic/574547db111aa929a607d0c00c4344ef).
- FACT: Servo pan-tilt examples with Raspberry Pi: SunFounder uses deadzone steps, `rpi-deep-pantilt` and PiTracker use PID on the offset between frame centre and bbox centre. — [SunFounder](https://docs.sunfounder.com/projects/ai-lab-kit/en/latest/yolo/yolo_pan_tilt.html), [rpi-deep-pantilt](https://github.com/timayy/rpi-deep-pantilt), [PiTracker](https://jwnicholas99.github.io/project/pitracker)

### Inferences
- INFERENCE: Ranking by student feasibility: (1) a PTZ camera with VISCA/ONVIF (documented, network, language-agnostic) or an OBSBOT Tiny 2 via UVC pan/tilt (cheap, USB, Python via V4L2 on Linux); (2) ESP32 + servos (full control but poor image stabilisation, cheapest); (3) SimpleBGC (smooth but needs a separate camera); (4) DockKit (best tracking UX but Swift-only and dock-dependent); (5) DJI Osmo Mobile (avoid).
- INFERENCE: On macOS/Windows there is no `v4l2-ctl`; UVC pan/tilt needs OS APIs (AVFoundation/DirectShow) or the vendor app's OSC, so OBSBOT OSC via OBSBOT Center is the cross-platform route, with the cost of a desktop app dependency.
- INFERENCE: Pan/tilt latency was not found in any source. With UVC/VISCA/OSC the command path is likely tens of ms plus mechanical motion; budget the motor speed (e.g. 120°/s max on Tiny 2) rather than the protocol.

### Gaps
- Official OBSBOT SDK contents (languages, platforms, command set) and OSC address list: vendor site unreachable here.
- NDI PTZ, OBSBOT Meet, Logitech-specific PTZ models (e.g. Rally/PTZ Pro): no sources gathered.
- Measured command-to-motion latency for any device: none found.
- Real-world DockKit dock model list and prices as of Nov 2026: not gathered.

---

## 2. Person finding: enrolled-face recognition vs open-vocabulary descriptions

### Takeaway
Because the design is a pre-enrolled guest list, ordinary face embeddings (InsightFace/ArcFace or dlib `face_recognition`) fit best: enrol 1-3 consented photos per guest, compare embeddings at runtime. A VLM/open-vocabulary detector is the fallback for descriptive commands ("man in the blue shirt") and as a cross-check, but is slower. Note InsightFace model weights are non-commercial only.

### Cited Findings
- FACT: InsightFace pack `buffalo_l` = SCRFD-10GF detector + ResNet50 recognition trained on WebFace600K, 326 MB; LFW 99.83, CFP-FP 99.33, AgeDB-30 98.23, IJB-C(E4) 97.25; `buffalo_s` (SCRFD-500MF + MobileFaceNet) 159 MB, LFW 99.70, IJB-C 95.02. — [InsightFace model zoo](https://github.com/deepinsight/insightface/blob/master/model_zoo/README.md)
- FACT: Same table shows demographic spread in MR-ALL: Caucasian 94.70, South Asian 93.16, African 90.29, East Asian 74.96 for buffalo_l (buffalo_s: 80.45/73.39/69.45/51.03). Matching quality is not uniform across groups. — same source.
- FACT: The model zoo states "ALL models are available for non-commercial research purposes only"; code is MIT; commercial licence is sold separately. — same source; [insightface.ai licensing](https://www.insightface.ai/solutions/face-recognition-licensing) (search summary). A student project is likely fine; a product is not.
- FACT: LFW is saturated and only a sanity check. — [insightface.ai guide](https://www.insightface.ai/guides/choose-face-recognition-model-and-evaluate) (search summary)
- FACT: dlib/`face_recognition`: 128-D encodings, 99.38% on LFW (author's claim; no independent verification found), default match tolerance 0.6 (lower = stricter); trained mostly on adults, weaker on children and possibly on some groups. — [dlib blog](https://blog.dlib.net/2017/02/high-quality-face-recognition-with-deep.html), [ageitgey/face_recognition](https://github.com/ageitgey/face_recognition)
- FACT: Qwen2.5-VL reports strong box-grounding versus Gemini and Grounding DINO; a 2026 paper says Qwen2.5 has stronger zero-shot generalisation than Grounding DINO. — [Qwen2.5-VL report](https://arxiv.org/pdf/2502.13923), [arXiv 2601.16895](https://arxiv.org/pdf/2601.16895) (search summary)
- FACT: Grounding DINO 1.5 Edge ran 10.7 FPS vs 1.1 FPS for original on Jetson Orin NX; Pro 75.2 FPS on A100 with TensorRT. — [The Batch](https://www.deeplearning.ai/the-batch/grounding-dino-1-5-an-edge-device-model-built-for-faster-smarter-object-detection)
- Not found: latency numbers for Gemini/Claude/Qwen-VL on a single frame; Apple Vision and DeepFace accuracy. (Apple Vision detects faces/bodies but I did not verify that it offers identity matching; background knowledge says it does not provide face recognition by identity - unverified.)

**Enrolment procedure (INFERENCE, standard practice)**
1. Collect 1-3 clear frontal photos of each guest, obtained with their written consent, before the show.
2. Run detector, align, compute one embedding per photo; store the mean (or all) embeddings under the guest's name in a local file, not the cloud.
3. At runtime, embed each detected face and take cosine similarity / L2 distance to each enrolled guest; accept above a threshold with a margin to the second-best match; otherwise report "unknown". Tune the threshold on the actual room lighting and camera angle; podcast cameras often see faces at an angle with headphones/microphone arms in front.

### Inferences
- INFERENCE: For a studio with 2-4 people and a known guest list, recognition is a small closed-set problem; high LFW numbers overstate real accuracy (angle, mic arm, headphones), so use a margin test and a confirmation fallback (ask the host "Is this Bill?" or let the host click once to bind a track to a name).
- INFERENCE: A strong low-risk fallback that needs no biometrics: bind names to seats/positions ("guest left", "host") or to tracked IDs by a one-time click or voice confirmation; this avoids storing face embeddings entirely.
- INFERENCE: Run the VLM only on demand (once per command, on one frame) not per frame, since throughput data above show open-vocabulary detectors are slow.

### Gaps
- Per-frame latency for InsightFace on CPU/GPU/Jetson: search returned none; benchmark.
- DeepFace and Apple Vision capabilities: not researched here.
- Actual accuracy on podcast footage: no source.

---

## 3. Tracking after lock-on

### Takeaway
Detect persons (YOLO11), keep identities with ByteTrack or BoT-SORT, bind the named person to a track ID once, then steer with a PID/deadzone loop toward a framing target.

### Cited Findings
- FACT: Ultralytics usage `model.track(frame, persist=True, tracker="bytetrack.yaml")`; BoT-SORT adds camera-motion compensation and optional ReID; docs disagree on the default tracker across versions (older BoT-SORT; a newer academy page says TrackTrack). — [Ultralytics academy](https://academy.ultralytics.com/courses/yolo-in-production/tracking-with-bytetrack-and-botsort), [Ultralytics track docs](https://docs.ultralytics.com/datasets/track) (search summary)
- Important: BoT-SORT's camera-motion compensation is relevant because the camera itself moves while following. INFERENCE from the same source.
- FACT: NOLO (Go) implements calibration data, pan/tilt limits, velocity limits and smoothing filters; AutoPTZ runs detect, track, re-identify, pose, aim, drive for PTZ, with click-to-target. — [bossthetigan/nolo](https://awesome.ecosyste.ms/projects/github.com%2Fbossthetigan%2Fnolo), [AutoPTZ](https://github.com/AutoPTZ/autoptz)
- FACT: PID on frame-centre-to-bbox-centre offset is the standard pattern in hobby trackers (PiTracker, rpi-deep-pantilt, see section 1). Frigate's ONVIF autotracker drops move requests while the camera is moving. DockKit limits control calls to about 2 per second (section 1).
- Not found: published FPS for YOLO11 tracking, MediaPipe numbers, auto-framing rules.

### Inferences
- INFERENCE: Control structure: vision at 15-30 FPS gives an error in pixels; convert to degrees using field of view; send velocity commands (or small relative moves) at the rate the protocol tolerates; add a deadzone (about 5-10% of frame), low-pass filter or Kalman on the target centre, and limit speed/acceleration so the picture does not whip. Dock/ONVIF rate limits mean velocity or "move then wait" patterns, not per-frame absolute moves.
- INFERENCE: Framing for talking heads: aim the face centre at the upper third line (eyes around 1/3 down), leave head room; for two people, aim at the midpoint and widen zoom; when switching speaker use a slow ease (e.g. 1-2 s) so it reads as a camera move, not a jump.
- INFERENCE: Switching between people = change the target track ID; keep the commanded name-to-ID map; if the track is lost, re-run recognition on the next clear frame.

### Gaps
- No quantitative benchmark found for YOLO11 vs MediaPipe for this use, nor for tracker ID-switch rates in seated, partly occluded podcast scenes.

---

## 4. Voice command to action

### Takeaway
Streaming STT (Deepgram) gives text in about a third of a second; an LLM turns it into a constrained JSON action validated against a whitelist and the enrolled guest list; a push-to-talk or wake word avoids triggering on normal podcast speech.

### Cited Findings
- FACT: Deepgram says streaming models are tuned for transcription latency of 300 ms or less; Nova-3 positioned as sub-300 ms. — [Deepgram latency doc](https://developers.deepgram.com/docs/measuring-streaming-latency.mdx) (search summary). Vendor claim; third-party says test on own audio.
- FACT: Nova-3 keyterm prompting adapts to up to ~100 terms without retraining (Feb 2025 changelog); the Dec 2025 post says multilingual accepts up to 500 tokens via `keyterms`; reliability in streaming mode is queried in a GitHub discussion. — [Deepgram changelog](https://developers.deepgram.com/changelog/2025/2/12), [Deepgram blog](https://deepgram.com/blog/deepgram-expands-nova-3-with-10-new-languages-and-multilingual-keyterm-prompting), [discussion 1605](https://github.com/orgs/deepgram/discussions/1605)
- FACT: With endpointing set, Deepgram finalises the transcript and sets `speech_final`; thresholds may need retuning. — [Deepgram Nova-3 on Cloudflare](https://2b20f69b.previews.developers.cloudflare.com/workers-ai/models/nova-3/) (search summary)
- No sources found for existing voice-controlled PTZ projects (the GitHub search returned none).
- The Vexo kit's own docs in this repo note audio from the band microphone goes to Deepgram and that keys must stay in env variables (AGENTS.md, "Audio to text to AI"); the kit's `speech.py`/`ai.py` helpers (`ai.choose`, `ai.tool`) already implement STT-to-constrained-action. — repo file `/home/user/group-vexo-open-kit/AGENTS.md`

### Inferences
- INFERENCE: Add the guest names as Deepgram keyterms so "Bill" is not heard as "bill/Phil".
- INFERENCE: Pipeline: STT final text -> LLM with a function/tool schema `{action: point_at|zoom|stop|wide_shot, target: one of enrolled names or "host"/"guest"}` -> code validates (`target` in enrolled list, `action` in whitelist) -> executes. Never let the model emit commands or code that are run directly; unknown names map to "none" and trigger a spoken/visual "cannot find" response. The kit's `ai.choose` pattern matches this (AGENTS.md says the same: a model can be wrong; let it choose among actions you wrote).
- INFERENCE: A podcast host talks constantly, so always-listening intent detection will false-trigger. Use push-to-talk on a wearable (wristband tap, double-tap gesture) or a wake word plus a short command window; this is an inference, no source tested it.
- INFERENCE: Latency budget (estimates, unmeasured): STT ~0.3 s + LLM ~0.5-1.5 s + recognition ~0.1-0.5 s + motor move 0.5-2 s: roughly 1.5-4 s end to end, acceptable for a cut to the guest because humans pause after the introduction.
- INFERENCE: Avoid the LLM round trip with a regex/fuzzy-match of "introduce|welcome|over to <name>" against the guest list as a fast path.

### Gaps
- No measured LLM latency or voice-controlled PTZ reference implementation was found.

---

## 5. Practical considerations: calibration, multiple people, latency, failure handling

### Takeaway
Calibrate pixels to degrees with the lens field of view and a short measured sweep, never trust nominal specs, and design explicit failure messages.

### Cited Findings
- FACT: Tiny 2 controllable range pan ±140°, tilt +30°/-70°, max speed 120°/s (section 1), so a target outside ±140° is unreachable.
- FACT: DockKit offers soft limits (`setLimits`), `motionStates` (current orientation/velocity), region of interest and framing mode for multiple subjects. — [DockAccessory](https://developer.apple.com/documentation/dockkit/dockaccessory.md)
- FACT: Tail 2 WebSocket status does not include live yaw/pitch/roll (reported, one unit), so closed-loop angle feedback may be missing on some cameras. — macmyths write-up (search summary)

### Inferences
- INFERENCE: Calibration: angle offset of a target = atan((x - cx)/f_x) with f_x = (W/2)/tan(HFOV/2). Verify by commanding a known pan step and measuring how far a static feature moves in pixels; fit a gain. Zoom changes FOV, so recompute per zoom level.
- INFERENCE: Because the camera moves, "where is Bill" must be tracked in a world frame (pan angle) or re-detected after each move; use BoT-SORT's camera-motion compensation or re-recognise after the move settles.
- INFERENCE: Multiple people: require the recognised face to sit inside a tracked person box; pick the box with highest match; use a margin so two similar scores do not pick arbitrarily; ignore faces below a minimum size.
- INFERENCE: Failure handling: if the name is not enrolled -> reply "I don't know a guest called X"; enrolled but not seen within N seconds of a slow scan -> "I cannot see Bill", hold current shot, optionally sweep once; low confidence -> ask for confirmation; command rate limit and a manual-override/stop (voice "stop" or button); soft pan/tilt limits to protect the hardware and cables.
- INFERENCE: Show a live preview with boxes and names to the operator so mistakes are visible.

### Gaps
- No source on lens-calibration practice for PTZ trackers; the formula is standard geometry, not cited.

---

## 6. Ethics, privacy and consent

### Takeaway
Treat face matching as biometric processing: only enrolled, consenting guests, stored locally, deleted after the event, with a non-biometric fallback. Not legal advice.

### Cited Findings
- FACT: Under GDPR, biometric data processed to uniquely identify a person is special-category data (Art. 9), prohibited unless an exception applies; explicit consent (Art. 9(2)(a)) is one; Member States may add conditions (Art. 9(4)). — [JD Supra summary](https://www.jdsupra.com/legalnews/privacy-faqs-can-an-application-use-38132), [gdprregister.eu](https://www.gdprregister.eu/articles/biometric-data-gdpr/) (search summaries; secondary sources)
- FACT: UK ICO guidance: you must not assume someone entering the field of view has consented; consent must be informed, freely given, specific and unambiguous. — [ICO biometric guidance](https://cy.ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/lawful-basis/biometric-data-guidance-biometric-recognition/how-do-we-process-biometric-data-lawfully/)
- FACT: Illinois BIPA requires a written release from the subject before collecting biometric identifiers and a public written retention/destruction policy; face scans count, photographs themselves are excluded from the definition. — same JD Supra / sector summaries; statute 740 ILCS 14 (not opened). Secondary sources only.
- Warning: two of the search hits (ailawyer-lawyer.pages.dev, info-nexus.pages.dev) carried unverifiable statistics; not used.
- The Vexo kit's rules also say: the microphone records nearby people, tell them, and Deepgram receives the audio (AGENTS.md "Safety"). — repo file `/home/user/group-vexo-open-kit/AGENTS.md`

### Inferences
- INFERENCE (design guidance, not legal advice): (1) Enrol only guests who give written, specific consent that names the purpose (camera steering), the storage place and deletion time; the embeddings are the biometric, so store them locally and delete after the show. (2) Match only against that list; never run identification on bystanders, audience or unconsented footage, and never identify public figures from faces; unknown faces get "unknown" and no lookup. (3) Prefer the seat/position or click-to-bind fallback to remove biometrics entirely; this is the cleanest answer to GDPR/BIPA exposure. (4) Check the InsightFace non-commercial licence if the project could become a product. (5) Log decisions, not faces; do not send frames to a third-party VLM without checking the guest's consent covers it (sending photos to a cloud VLM is a separate data transfer).
- INFERENCE: Demographic accuracy differences (section 2) mean a student team should test on all their guests and keep a human override.

### Gaps
- Primary legal texts (GDPR Art. 9, 740 ILCS 14, EU AI Act provisions) were not fetched; jurisdiction-specific advice is out of scope. EU AI Act treatment of real-time biometric identification was not checked.
