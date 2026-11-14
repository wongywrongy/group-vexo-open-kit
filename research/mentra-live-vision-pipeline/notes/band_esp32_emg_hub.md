# Vexo band + Mentra Live glasses + Mac hub + ESP32 + EMG: what each part supplies, and the glue

Scope: Part 1 reads only the local kit (`/home/user/group-vexo-open-kit`, nothing edited). Part 2 is web research as of 2026-11-14.

Labels used below:
- **[DOC]** = stated in the kit's own files (path given).
- **[WEB]** = stated by a web source.
- **[REPORTED]** = forum, blog or practitioner experience (weaker than a datasheet).
- **[INF]** = my inference; not tested, not sourced.

Everything the team has said about their plan (Mentra Live lag of 300-800 ms, a pinch/grab to "crumple and throw the screen to the projector", an ESP32-S3 + OV5640 camera, EMG sensors) is treated as an **unverified plan**.

Research limits you should know about:
- WebFetch could not resolve `docs.mentraglass.com`, `docs.mentra.glass`, `cdn.sparkfun.com` or `learn.sparkfun.com` in this session (host outside the allowed network). Those four hosts have to be allowed in the session's network settings before the primary pages can be fetched.
- Web claims below therefore come from WebSearch result summaries, not from reading the full pages. Where a summary itself said "unverified" or the sources disagreed, I say so.
- No web source was found for: Mentra Live capture timestamps or measured latency, an IMU in Mentra Live, Olimex or OYMotion gForce armband specs, stereo depth on ESP32, and OSC latency.

Band number: the kit's rule is to ask the team for their own number (AGENTS.md, Rule 1). No number was given to me and none is used here. Every code sketch uses a placeholder constant `TEAM_BAND` that must be the team's own number.

---

## 1. What exactly can the Vexo band supply? (from the kit's docs)

### Takeaway
The band is a Bluetooth wrist unit (hardware: XIAO nRF52840 Sense) giving a 6-axis IMU at up to 100 Hz in the simple stream and 208-1666 Hz in the fast stream, seven built-in gesture events, a microphone (Opus audio or loudness only), one RGB LED, steps, battery, signal strength and a tiny key-value store. It has no magnetometer, no absolute heading, no haptic motor, no screen and no speaker, and it is single-connection over Bluetooth.

### Cited Findings

**Motion and IMU**
- [DOC] `hw` = 1 is "XIAO nRF52840 Sense"; capabilities listed are `accel gyro events steps mic led battery temperature storage tx-power usb`. — [docs/api.md](../../../docs/api.md) (`band.info` table); [contract/contract.md](../../../contract/contract.md) (GET_INFO, caps bits)
- [DOC] Simple motion stream (`MOTION`): rates 10, 25 (default), 50, 100 Hz; fields `ax ay az` in milli-g (int16) and `gx gy gz` in tenths of a degree/second (int16). — contract.md section 4 and 5.2
- [DOC] Fast stream (`MOTION2`, firmware 1.1, which every event band has): 10, 25, 50, 100, 208, 416, 833, 1666 Hz; `sensors` = accel, gyro or both. On firmware 1.1 the library's `configure(motion=...)` always uses this stream. — contract.md 5.2; api.md "Fast motion"
- [DOC] Link limits. Bluetooth: 416 Hz both sensors, 833 Hz one sensor. USB: 833 Hz both or gyro alone, 1666 Hz accel alone. With `audio` on over Bluetooth, stay at 208 Hz (both) or 416 Hz (one sensor), or `stream-dropped` notices appear. Over the limit gives `denied`. — contract.md 5.2; api.md
- [DOC] Ranges: accel 2/4/8/16 g (default 2 g after every connect), gyro 250/500/1000/2000 dps or 0 = off (default 2000). A reading beyond range is cut off at the range (a hard shake, punch or clap reads exactly 2.0 g at the default). `set_motion(accel_range=8)` widens it. — api.md "Controls"; AGENTS.md "The sensor's range"
- [DOC] Up to 100 Hz the band sends "the latest sample at each point of a millisecond grid". From 208 Hz up the sensor's own clock drives sampling, every sample is sent, and the real rate can be a few percent off ("833" measured 865 on one real band, about 4 % fast). Place samples with `t` / `period_us`, never with the nominal rate. — contract.md 5.2; api.md
- [DOC] Batching: a `MOTION2` frame holds at most 50 ms of samples (5 samples at 100 Hz, 2 at 50 Hz, 1 at 25 Hz or below). The legacy `MOTION` frame holds 10 samples (100 ms at 100 Hz). — contract.md section 4 and 5.2; api.md "Controlling motion"
- [DOC] `n` / `sample_no` counts samples from 0 at stream start and a jump equals samples lost. `t` is the band's own millisecond counter (with a fractional part in fast motion), never backwards within a connection. — api.md "Fast motion"
- [DOC] At 208 Hz and up, `MOTION`, `EVENT`, `ACTIVITY` and the connect-window double-tap are fed from the fast samples averaged down to 208 Hz, so taps "can feel slightly more or less sensitive". Starting or changing such a stream leaves a gap of about 30 ms in `MOTION` and `EVENT`. — contract.md 5.2
- [DOC] The gyro reads 0 for the first 100 ms after it switches on, and while `gyro_range_dps` is 0. 1666 Hz and gyro never run together. — contract.md 5.2
- [DOC] Measured on one band on a desk: at rest the gyro reads 2.2-2.4 degrees/second and accel steps are at most 0.005 g. "A still hand and real gestures: not yet measured." — [projects/gesture-trainer/README.md](../../../projects/gesture-trainer/README.md)

**Gesture events** (`configure(events=True)`, then `on("tap")` etc.)
- [DOC] Seven kinds with exact definitions: single tap; double tap; free-fall (total acceleration below 0.35 g for 100 ms); tilt (gravity direction moved more than 35 degrees and held 2 s); orientation (one axis above 0.8 g for 300 ms; `arg`/`face` = +x -x +y -y +z -z up); motion started / stopped (movement above 0.1 g / below 0.05 g for 2 s). Only the tap threshold can be changed: `tap_threshold_mg` 200..8000, default 800. — contract.md section 5.2
- [DOC] Each event carries `t_ms` (and `time` via the library). Event latency from the physical event to the frame is not documented.
- [DOC] Steps: `activity` once a second (`steps` lifetime total, `cadence`, `state` still/walk/run, `motion` in mg); interval 0.1-3600 s on firmware 1.1. — api.md
- [DOC] The kit's projects use these events (fall-alarm: free-fall + motion-start + double-tap; gesture-trainer: 50 Hz motion and its own template matcher). All six projects "run on the pretend band", not tried on a real band as whole projects; most thresholds are guesses. — [projects/README.md](../../../projects/README.md)

**LED**
- [DOC] One RGB LED. `LED_SET`: r,g,b 0-255, brightness 0-255, pattern solid / blink (half on, half off) / breathe / flash (60 ms every period) / rainbow / off, `period_ms` 100..10000. `identify()` blinks white 4x a second, 1-30 s. — contract.md 5.1; api.md
- [DOC] LED priority: mic indicator, then critical battery (off), then `IDENTIFY`, then the blue blink of an open connect window, then your setting. On battery below 3.5 V brightness is capped at 64; below 3.3 V the LED is off and `LED_SET` is `denied`. — contract.md section 5.1 and 6
- [DOC] The LED is the only output on the band. No vibration motor, no speaker, no screen. — contract.md section 7 ("Not on this band: heart rate, skin temperature, vibration, NFC, spare pins"); AGENTS.md ("...a screen, a speaker")

**Microphone and the LED lock**
- [DOC] Audio: `configure(audio=True)` gives raw Opus packets, 16 kHz mono, 20 ms each, 50 a second, about 24 kbit/s (about 3,200 bytes/s). Packets have `seq` but **no timestamp**: frame time = start time + `seq` x 20 ms, and the sound of frame 0 starts about 140 ms after `STREAM_START` (about 40 ms if `MIC_LEVEL` already had the mic on). — contract.md section 4
- [DOC] `mic_level`: `peak_db`, `rms_db` (dB below full scale, 0 loudest, 96 silence) over the last interval; interval 20 ms to 10 s in steps of 20 ms (default 100 ms). A real band at default gain (+20 dB) reads `rms_db` about 50 in a quiet room, 20-30 for speech near the band. Mic gain -20..+20 dB. — api.md "Loudness"
- [DOC] **While `audio` or `mic_level` is on the LED is solid blue at full brightness and `set_led`, `led_off`, `identify` fail with `denied`.** Your LED setting comes back when both are off. It is a safety rule that cannot be changed. — contract.md section 6; AGENTS.md rule 4
- [DOC] Speech to text goes through Deepgram (online, team key, `mip_opt_out=true`); the kit's helpers also reach OpenAI from Python. Keys live in environment variables or an untracked `.env` only. People nearby must be told the mic is on. — AGENTS.md "Audio to text to AI" and "Safety"; [docs/deepgram.md](../../../docs/deepgram.md); [docs/speech.md](../../../docs/speech.md)
- [DOC] Clap detection from `mic_level`: `RISE_DB` 20 measured on one band on a desk (quiet room jumps at most 10 dB, loud claps 26-32 dB). — [projects/clap-lights/README.md](../../../projects/clap-lights/README.md)

**One Bluetooth connection, and USB**
- [DOC] The band accepts one Bluetooth connection at a time and advertises only after a double-tap (60 s), after power-on or restart (60 s), or for 120 s after a link closes. While connected it cannot be found. — contract.md section 1; AGENTS.md rules 7-8
- [DOC] One program on the USB cable (CDC ACM, COBS framing, DTR must be asserted) can be connected beside one on Bluetooth, but they **share** the band's settings, its one LED (last `set_led` wins) and its streams; a stream goes to the program that started it last, so starting `motion` over USB silently takes it away from Bluetooth (the library raises `stream-taken` after about 3 s). — api.md "Two programs on one band"; contract.md section 2.2
- [DOC] No pairing, bonding or encryption: "a pairing request is rejected". Anyone nearby can connect to a double-tapped band. — contract.md section 1 and 2.1
- [DOC] Settings reset when the link closes: LED off, streams off, ranges back to 2 g / 2000 dps. Only storage, the band number and (on 1.1, while powered) the clock survive. Auto-reconnect (`auto_reconnect=True`) re-applies settings for up to 120 s. — AGENTS.md rules 2-3; api.md

**Link timing**
- [DOC] Connection interval chosen by the band: 30-50 ms idle (asked for 5 s after connecting) and 15 ms while audio streams, or while `MOTION2` carries more than 2000 bytes/s (208 Hz both sensors; 416 Hz and up with one sensor). 2M PHY when the other side allows. ATT MTU 247 requested, `max_frame` = MTU - 3 (244). — contract.md section 1
- [DOC] The kit gives no measured band-to-host latency figure. The numbers above are its only timing facts.

**Clock and time fields**
- [DOC] Every data event has `t` (band counter, ms since start, wraps at 49.7 days) and `time` (real time: Python seconds float, JavaScript ms). Firmware 1.1: the library sets the band's clock from the computer on every connect/reconnect (`band.clock == "band"`). — api.md "Time"
- [DOC] Accuracy of the band clock: "as good as the client's own clock at `TIME_SET`, plus the time the command took to arrive (usually under 50 ms over Bluetooth, a few ms over USB), plus the drift of the band's counter (expect about 2 s a day)". api.md says `time` is correct "give or take ... a few hundredths of a second over Bluetooth". — contract.md 5.8; api.md
- [DOC] `audio`, `battery` and `notice` events are not stamped by the band; their `time` is arrival time on the computer (audio: first packet plus 20 ms per packet). `band.time()` returns `{time, set, t, source}`; a client without the library can pair `TIME_GET` with its own clock. Conversion formula and wrap handling are in contract.md 5.8.
- [DOC] After a link drop `t` keeps going, but `time` is re-paired to the computer's clock at reconnect and can step if the computer's clock was corrected meanwhile. After a band restart `t` restarts near 0. — api.md "t and time when the link comes back"

**Firmware 1.1 features** (`band.info.features`: `fast-motion intervals clock`)
- [DOC] Fast motion (above), stream intervals in seconds (`configure(battery=60, mic_level=0.02, activity=0.5)`, `set_interval`, `"fastest"`), and the band's real-time clock (`time()`, `set_time()`). Firmware 1.0 is only for fallback (`protocol="1.0"`). — api.md "Firmware 1.0 and 1.1"

**What the band cannot do**
- [DOC] Not listed anywhere in the kit: magnetometer / compass / heading (a grep for magnet, compass, heading over all `.md` files finds nothing, and the capability list has no such entry), quaternion or fused orientation output, haptic output, speaker, screen, heart rate, skin temperature, NFC, spare pins. The only orientation outputs are the six-face `orientation` event and the `tilt` event. — contract.md sections 5.2 and 7; AGENTS.md "What the band can do"
- [DOC] The kit has no pinch, grasp, grab or squeeze detection. Do not claim the band's accelerometer detects a pinch: nobody on this kit has tested it. The kit's own gesture code is the 50 Hz template matcher in `projects/gesture-trainer/recogniser.js` ("guesses ... not tried on a real wrist"). — gesture-trainer README

**Team-number safety rules that bind any glue code** (AGENTS.md, "Only the team's own band: hard rules")
- [DOC] Ask for the team's band number first; keep it in one constant; never use `42`, `7` or any example number; never scan unfiltered, never loop over numbers, never "connect to the first Vexo band"; after every connect check `band.number` / `band.name`; with raw BLE (for example an ESP32) filter on the exact name `Vexo-HACK-NN` (2 digits for 1-99, 3 for 100+) **and** service UUID `254f0001-df82-4a9c-a2b5-563a0f6b2021`; never renumber a band. If the team's band is not found, do not try another number: ask the team to double-tap and use `--sim` meanwhile.

### Inferences
- [INF] For fusion the useful band products are: (a) a relative angular-velocity and linear-acceleration stream at 50-100 Hz with ranges widened as needed; (b) gravity direction (roll/pitch) obtainable by host-side filtering; (c) a clean discrete event stream (tap, double-tap, free-fall, motion-start/stop) with band-side time stamps; (d) mic loudness at 20 ms resolution (an acoustic marker or clap detector); (e) the LED as a visible marker or status light **only when the mic is off**.
- [INF] The band's documented timing floor is about 15-50 ms (connection interval) plus up to 50 ms batching, plus the host's own delay. This is a sum of documented components, not a measurement, and the kit says nothing about iOS/macOS/bleak stack delay.
- [INF] Because the connect-time clock set puts the band in the Mac's time to within tens of ms, the Mac hub gets a usable common clock for the band for free. This holds only if the hub is the program that connected the band and `set_clock` is not disabled.
- [INF] A band-side drift of "about 2 s a day" is about 23 ppm, or about 83 ms per hour. Re-pairing at every (re)connect, or a periodic `time()` call, bounds this for a demo session. This is arithmetic on the documented figure.
- [INF] The band's microphone and LED cannot be used together. Anything that needs a visible LED flash (a sync marker or a status cue) must be scheduled when the mic is off, so voice control and LED feedback must be time-multiplexed.

### Gaps
- Latency from physical event to notification on the host: not documented, not measured by the kit.
- Whether the IMU's internal filtering/ODR gives usable data for sharp transients (such as a pinch) at 833 Hz: not documented. The datasheet of the actual part is not in the kit.
- Whether the glue works with the real band end to end: the kit's own raw-BLE examples "have been run against a pretend Bluetooth layer, not against a real band" ([docs/bluetooth-contract.md](../../../docs/bluetooth-contract.md)), and the six projects are not tested as whole projects on a real band.
- Battery life while streaming fast motion plus audio: not in the kit.

---

## 2. How could an ESP32 (or the Mac) talk to the band, and what is the constraint?

### Takeaway
An ESP32 can be a plain BLE GATT client of the band (exact name + service UUID filter, subscribe to TX, write frames to RX; no pairing), but the kit supplies no ESP32 code, so the frame protocol must be implemented by hand from `contract/contract.md`, and the single-connection rule means either the Mac or the ESP32 is the band's Bluetooth client, not both. The simpler design is: Mac hub is the only Bluetooth client of the band; the ESP32 talks only to the EMG sensor and to the Mac over Wi-Fi.

### Cited Findings
- [DOC] GATT: primary service `254f0001-df82-4a9c-a2b5-563a0f6b2021`; RX `...0002...` (write / write-without-response, client to band, one frame per write, at most `max_frame` bytes); TX `...0003...` (notify, band to client, one frame per notification). Subscribe to TX before the first command; use write-with-response; one command, wait up to 2 s for the response, then the next. A frame is `[type:1][body]`, 1-244 bytes, little-endian. — contract.md sections 2.1, 3
- [DOC] The kit's own text lists "an ESP32" among "anything else": filter the same way, and if the name has not arrived the band number is in the advertising manufacturer data (company `0xFFFF`, bytes `4F 01 lo hi`). The scan response with the name arrives separately, so scan at least 5 s before reporting "not found". — docs/bluetooth-contract.md; contract.md section 1
- [DOC] The kit's libraries are JavaScript (Web Bluetooth/Web Serial) and Python (bleak, pyserial); there is no C/Arduino/ESP-IDF library. A grep over the kit for ESP32, Arduino, NimBLE, MicroPython finds only the one-line mention above.
- [DOC] USB route: the band is a CDC ACM serial port, frames COBS-encoded with a `0x00` terminator, DTR must be asserted and RTS/CTS must be off; it works while a Bluetooth client is connected, but shares streams/LED/settings with it. — contract.md section 2.2
- [WEB] ESP32 BLE central connection limits: NimBLE-Arduino defaults to 3 connections (raised via `nimconfig.h`); one forum thread attributes a fixed limit of 3 on the arduino-esp32 prebuilt SDK for ESP32-S3. One central connection to the band is well within this. — [esp32.com forum on max BLE connections on ESP32-S3](https://esp32.com/viewtopic.php?p=149715); [NimBLE-Arduino](https://github.com/h2zero/nimble-arduino)
- [REPORTED] One ESP32 forum thread reports switching NimBLE to 2M PHY did not raise measured throughput by itself (data-length extension, connection parameters and payload handling also matter); another poster reached about 102.5 KB/s on 2M after turning off logging. Setting the PHY does not prove the link uses it. — [esp32.com NimBLE throughput](https://esp32.com/viewtopic.php?p=84433)

### Inferences
- [INF] Hub-on-Mac is the least risky choice: the kit's Python library (bleak + `vexo_open.sync`) already does scanning, name filtering, wrong-band rejection, auto-reconnect and the clock set. Reimplementing this on an ESP32 adds a protocol port, scan/reconnect logic (the band is findable only 120 s after a drop without a tap), and a second place where the band number must be right.
- [INF] If the ESP32 must hold the band (for example a band-on-the-wrist-plus-EMG bridge), it would forward frames to the Mac over Wi-Fi, and the Mac could not also connect over Bluetooth. The Mac could still reach the band over USB cable, which shares settings, the LED and the streams. I would not do this in a short project.
- [INF] ESP32-S3 (BLE 5, from my own knowledge, not verified in this session) can negotiate 2M PHY; the classic ESP32 is BLE 4.2. The band asks for 2M when allowed; 1M works. At 100 Hz both sensors the band sends about 1.5 kB/s (contract table), which 1M PHY carries easily.
- [INF] Anything that must reach the band quickly, such as an LED command, is a write-with-response round trip at the connection interval (15-50 ms documented), so LED use as a sync flash has an uncertainty of that order.

### Gaps
- No ESP32-to-Vexo-band test exists in the kit or in my search; any ESP32 client code is unwritten and untested.
- Whether an ESP32-S3 acting as USB host can talk to the band's CDC-ACM port was not researched.

---

## 3. Fusing wrist IMU data with camera hand landmarks: filters, drift, sync

### Takeaway
Published systems fuse a wrist IMU with egocentric hand tracking and use Kalman-style filters or learned fusion; the hard, well-documented problems are (a) yaw is unobservable from a 6-axis IMU so it drifts, and (b) the two sensors have different latencies, which Kalman filters handle with delayed-measurement correction. A shared sync event (a visible flash or a physical tap) plus cross-correlation of angular-velocity magnitude is the standard way to estimate the offset between devices.

### Cited Findings
- [WEB] SurfaceXR fuses a 200 Hz smartwatch accelerometer + gyroscope with egocentric headset hand tracking (temporal convolutional net for hand-tracking features, 2D CNN for IMU, gated fusion; runs on either modality alone; 21-participant user study). — [arXiv 2603.19529](https://arxiv.org/abs/2603.19529)
- [WEB] HandCept fuses a wrist-mounted RGB-D camera and 9-axis IMUs with an Extended Kalman Filter, and the filter is used to handle latency between the two modalities (robot-hand proprioception, not a human wearable). — [arXiv 2505.08213](https://arxiv.org/html/2505.08213v1)
- [WEB] A 6-axis IMU hand-pose paper uses a learned estimator followed by a late EKF to reduce noise and drift, with no camera. — [Virginia Tech (Sarker et al.)](https://vtechworks.lib.vt.edu/items/aaca641c-46db-46e1-9fb6-7e4c1de61eea/full)
- [WEB] HOOV (out-of-view hand tracking from a wrist IMU) samples a 6-axis IMU at 427 Hz on a custom wristband and detects pinch events by thresholding a running measure of wrist-acceleration change. — [arXiv 2303.07016](https://arxiv.org/pdf/2303.07016)
- [REPORTED] Yaw about the vertical axis cannot be observed by an accelerometer (gravity does not change under yaw); with a 6-axis IMU, yaw is relative to an arbitrary start and "will always drift", and the same drift appears with Madgwick and EKF. Mitigations named: estimate and subtract gyro bias while stationary, a sensible gyro range (default 2000 dps is a gaming default), zero-velocity / no-motion-no-integration steps. The blog quotes "about +-100 degrees per 10 s" for a cheap 6-DOF part (anecdotal) and notes magnetometers are unreliable indoors. — [RUNE Part 2 blog](https://ikouchiha47.github.io/rune/02-sensor-wars); [Arduino forum thread](https://forum.arduino.cc/t/anyone-know-how-to-get-roll-pitch-and-yaw-from-6-axis-imu-with-sensor-fusion/1258112); [NXP community thread](https://community.nxp.com/t5/Sensors/Gyro-drifting/m-p/435989); [University of Parma paper on no-motion-no-integration](https://air.unipr.it/bitstream/11381/2964499/2/Measurement%20Optimization%20for%20Orientation%20Tracking%20Based%20on%20No%20Motion%20No%20Integration%20Technique..pdf)
- [WEB] MediaPipe Hand Landmarker returns 21 landmarks in image space (z relative to the wrist as origin, smaller = closer to the camera, roughly the same scale as x) and in world coordinates (metres, origin at the hand's geometric centre); the model card says the world landmarks are metric-scale predictions based on the GHUM hand model. The docs found do not say how z is estimated from one image. — [Google AI Edge: Hand Landmarker](https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker)
- [WEB] Time-offset estimation: Kalibr's `--imu-delay-by-correlation` correlates angular-velocity magnitudes as a starting guess, then refines by batch optimisation; the cross-correlation idea is that both sensors rigidly share the same rotation, so their angular-velocity norms match at the same instant, and the camera's angular velocity comes from fitting and differentiating its rotation estimates. Offset convention: `t_IMU = t_cam + t_d`. — [eKalibr-Inertial, arXiv 2509.05923](https://arxiv.org/pdf/2509.05923); [Kalibr wiki](https://github.com/ethz-asl/kalibr/wiki/Multi-IMU-and-IMU-intrinsic-calibration); [MVSEC, arXiv 1801.10202](https://arxiv.org/pdf/1801.10202)
- [WEB] Round-trip (Cristian-style) clock sync for body-worn nodes: offset = timestamp difference plus half the round-trip time, with error bounded by half the RTT minus the minimum one-way delay. — [BodyNets 2012 paper](https://eudl.eu/pdf/10.4108/icst.bodynets.2012.250342)
- [WEB] Visual sync markers: RocSync uses an LED clock whose millisecond timestamp is read out of video frames to estimate per-camera offset and drift from at least two frames; SyncWISE aligns a wearable camera and an accelerometer; a blinking-LED reference validated a markerless video sync to about 0 +- 2 frames. — [RocSync arXiv 2511.14948](https://arxiv.org/html/2511.14948v1); [SyncWISE (NSF PAR)](https://par.nsf.gov/servlets/purl/10274462); [Curtin record](https://cendekia.unisza.edu.my/neuaxis-e/Record/curtin-20.500.11937-76309/Description)
- [REPORTED] A practitioner article: two clocks 20 ppm apart diverge about 72 ms per hour, and a physical sync event (clap or light flash) is recommended as ground truth. — [Digital Divide Data](https://www.digitaldividedata.com/blog/sensor-synchronization-for-egocentric-robotics-data)
- [WEB] Mentra Live: the developer docs describe RTMP streaming as taking exclusive control of the camera and give no latency figure; one doc mirror says the managed relay returns WebRTC playback with "sub-second latency (default)", another says SRT to the cloud then fan-out to RTMP destinations; API names (`camera.startStream`, `stream.startStream`, `startLivestream`) differ across doc versions. — [RTMP Streaming Guide](https://docs.mentra.glass/camera/rtmp-streaming); [Camera streaming docs](https://docs.mentraglass.com/mentra-live/camera-streaming.md)
- [WEB] Mentra Live hardware: no display; 12 MP camera, 1080p with streaming (field of view quoted as 112 or 119 degrees by different outlets); three microphones; speakers; buttons; RGB LEDs and a white privacy light; MediaTek MTK8766; 43 g; 2,200 mAh; Wi-Fi; phone link through the Mentra app (iOS and Android). **No IMU is mentioned in any source I found.** — [Mentra hardware docs](https://docs.mentraglass.com/mentra-live/hardware); [camera glasses capabilities](https://docs.mentraglass.com/app-devs/core-concepts/hardware-capabilities/camera-glasses); [9to5Google](https://9to5google.com/2026/01/15/mentra-live-smart-glasses-youtube-livestream/); [Engadget](https://www.engadget.com/wearables/mentras-first-smart-glasses-are-open-source-and-come-with-their-own-app-store-150021126.html)

### Inferences
- [INF] **Frame problem.** An egocentric camera moves with the head, so MediaPipe landmarks live in a head-moving camera frame, while the band's gyro and accel live in the wrist's body frame and its yaw is relative. Without a head-pose source (no IMU documented for Mentra Live) the system cannot turn wrist motion into a screen position by integration. Use the camera for **where** (position in image), the band for **how** (angular rate, tilt, events), and re-zero the band's yaw whenever the camera sees the hand with a trusted orientation.
- [INF] **Complementary filter first.** For wrist orientation: gyro integration with accel gravity correction for roll/pitch (Madgwick/Mahony/complementary), yaw taken from vision when available, otherwise held with bias subtraction (the 2.2-2.4 dps rest reading on one band is the order of drift to expect: about 2.3 deg/s x 10 s = 23 degrees if left uncorrected; this is arithmetic on a one-band desk measurement, not a claim about real wear). A Kalman filter is only worth it if the team already knows how to write the delayed-measurement update.
- [INF] **Late-measurement pattern** (the standard way to cope with a 300-800 ms camera lag): keep a ring buffer of the last 2 s of IMU state at the hub; when a camera pose arrives labelled with its capture time, apply the correction to the state at that capture time and re-propagate the buffered IMU samples to "now". This is what HandCept's EKF is reported to do for its modality latency; the glasses path would be the delayed one.
- [INF] **The lag may be partly a timestamp problem.** If Mentra frames carry a capture timestamp the offset can be removed exactly; if they do not, the offset must be measured. I found no source saying which is true.
- [INF] **Measuring the glasses-to-hub offset** with tools the team already has, in order of effort: (1) a physical tap: the band's `tap` event has a band-side `t` (documented), and the same impact is visible in the glasses video when the hand hits a table; read the video frame of impact; (2) a band LED flash (`pattern="flash"`, 60 ms flash) seen by the glasses camera, only with the mic off, and with an uncertainty of one Bluetooth command round trip (15-50 ms interval, documented); (3) cross-correlate the band's gyro-norm with hand speed from landmarks (the Kalibr idea) over a 10-20 s waving trial; (4) repeat at the start and end of a session to measure drift (20-30 ppm gives 70-85 ms per hour, so for a demo a single measurement is enough). Report the delay as a distribution, not one number: video pipelines vary frame to frame.
- [INF] **Mac to band clock:** already handled by the library (see section 1). **Mac to ESP32 clock:** do a ping-pong over the same WebSocket every few seconds, keep the sample with the smallest round trip (error bound half RTT per BodyNets), and let the ESP32 stamp samples with its own microsecond counter. No library is needed.

### Gaps
- No Mentra Live measurements (capture-to-hub latency, jitter, frame rate, timestamps) found. The team's "300-800 ms" is unverified and must be measured.
- No source found on a complementary-versus-Kalman comparison for exactly this wrist-IMU plus egocentric-camera setup.
- No source on how MediaPipe's z behaves on a 1080p wide-angle egocentric view (field of view quoted as 112-119 degrees implies heavy distortion); not researched.
- Whether Mentra Live has an IMU, and whether the SDK exposes it: not found.

---

## 4. Gesture recognition from the wrist IMU alone: grab, release, squeeze, pinch

### Takeaway
IMU-only detection of a sharp pinch transient has been shown on a custom 427 Hz wristband, but IMU-only grasp/release or squeeze on commercial wrist hardware is not well established; the best published grasp results added optical sensing. Nothing in the Vexo kit tests a pinch or grab, so treat this as a research task on the team's own wrist, not as a feature.

### Cited Findings
- [WEB] HOOV: pinch events cause sudden changes in wrist acceleration; a running score of acceleration change with a threshold detects them (custom wristband, 427 Hz). — [arXiv 2303.07016](https://arxiv.org/pdf/2303.07016)
- [WEB] Wrist-worn optical + inertial network: 97 % touch and 98 % grasp detection accuracy for 12 participants in a lab; the paper does not isolate the IMU's contribution. — [Stanford HCI](https://hci.stanford.edu/publications/paper.php?id=474)
- [WEB] SonarWatch cites about 83 % for IMU-based pinch recognition in a standard posture from prior work, noticeably higher with the wrist held up. — [arXiv 2408.12689](https://arxiv.org/pdf/2408.12689)
- [WEB] A patent text notes EMG is more sensitive than IMU for fine pinch features but costs more power. — [USPTO 12468393](https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/12468393)
- [WEB] ViBand raised a smartwatch accelerometer to 4 kHz to sense body-coupled vibrations (tapping on forearm, palm or hand, finger rubbing) at about twice the power draw; stock APIs are capped near 100 Hz. — [ViBand, UIST 2016](https://www.robertxiao.ca/research/viband/); [CMU news](https://www.cmu.edu/news/stories/archives/2016/october/smartwatch-capability.html)
- [WEB] OpenWatch (2026) notes that most wrist-worn gesture datasets are single-sensor, lack "no gesture" background classes and were recorded under controlled conditions. — [arXiv 2605.04791](https://arxiv.org/pdf/2605.04791)

### Inferences
- [INF] The Vexo band's fast accel (833 Hz over Bluetooth with one sensor, 1666 Hz over USB) is between a stock watch (about 100 Hz) and ViBand (4 kHz). Whether the chip's own filter passes a pinch's vibration is unknown. A cheap experiment is: `set_motion(accel_range=8)` (so a transient does not clip at 2 g), `configure(motion="fastest", sensors="accel")`, record 30 pinches and 30 rest/hand-wave trials, and plot the high-pass magnitude. If separation is not obvious by eye, drop the idea.
- [INF] Plan on the band's IMU providing **motion context** (still vs moving, flick, wrist orientation, a throw gesture as a large gyro/accel burst) and a coarse veto (reject a "grab" from EMG or vision when the wrist is swinging fast), not the grab/release trigger itself.
- [INF] The band's `double-tap` and `tap` events (documented, 0.2-8 g threshold) are a robust fallback trigger that needs no ML.

### Gaps
- No Vexo-specific pinch/grab data. No source on the IMU part's internal bandwidth or filter, which decides the fast-accel idea.

---

## 5. EMG muscle sensors for ESP32

### Takeaway
Analog EMG boards (MyoWare 2.0, DFRobot/OYMotion Gravity SEN0240) feed an ESP32's ADC; use ADC1 with the continuous (DMA) driver, about 1 kHz or more for raw signal, and an envelope threshold for clench-vs-rest. Distinguishing pinch types needs multiple channels and a trained classifier; I would not promise pinch-versus-grip from one channel.

### Cited Findings
- [WEB] MyoWare 2.0: analog output; three output modes (raw EMG, rectified, envelope); output range 0 to VIN; SparkFun's guide lists sample rate as "not applicable - analog", the rate comes from the measuring device; the envelope output suits a microcontroller ADC. The MyoWare 2.0 Wireless Shield regulates power to 3.3 V for the ESP32 ADC range. One result marks the MyoWare 2.0 Muscle Sensor page as a retired product: check availability. — [SparkFun Advanced Guide](https://cdn.sparkfun.com/assets/learn_tutorials/1/9/5/6/MyoWare_v2_AdvancedGuide-Updated.pdf); [SparkFun Getting Started](https://learn.sparkfun.com/tutorials/getting-started-with-the-myoware-20-muscle-sensor-ecosystem/myoware-20-muscle-sensor); [MyoWare Arduino library](https://github.com/AdvancerTechnologies/MyoWare-Arduino-Library); [Core Electronics wireless shield](https://core-electronics.com.au/myoware-20-wireless-shield.html.md)
- [WEB] DFRobot Gravity Analog EMG sensor (SEN0240, by OYMotion): 20-500 Hz spectrum, amplifies sEMG within +-1.5 mV by 1000x, differential input with analog filter, output 0-3.0 V around a 1.5 V reference, dry electrodes with wrist belt, 22 x 35 mm, 36 g kit. Supply: DFRobot wiki says 3.3-5.5 V, a RobotShop listing says 3.0 V (conflict). Not a medical device. — [DFRobot wiki SEN0240](https://wiki.dfrobot.com/sen0240/); [Core Electronics listing](https://core-electronics.com.au/gravity-analog-emg-sensor-by-oymotion.html.plain.md)
- [REPORTED] A third-party blog suggests 12-bit, 11 dB attenuation and at least 1000 Hz (preferably 2000 Hz) sampling for sEMG on an ESP32; it describes a different sensor and I could not verify it against a vendor source. — [industrialmonitordirect.com](https://industrialmonitordirect.com/blogs/knowledgebase/semg-sensor-selection-for-muscle-tension-detection-with-arduino-esp32)
- [WEB] ESP-IDF ADC: on the classic ESP32, ADC2 is shared with Wi-Fi, so `adc2_get_raw` may fail between `esp_wifi_start()` and `esp_wifi_stop()`; single-read mode suits low-frequency sampling; the continuous driver uses an I2S peripheral as DMA FIFO (I2S0 must be free, else `ESP_ERR_NOT_FOUND`) and can overflow its pool; a unit can be either continuous or one-shot at one time; Espressif suggests a 0.1 uF capacitor on the ADC pad and multisampling for noise. IDF docs differ by version. — [ESP-IDF ADC (v4.3)](https://docs.espressif.com/projects/esp-idf/en/v4.3/esp32/api-reference/peripherals/adc.html); [ADC continuous driver (v5.2)](https://docs.espressif.com/projects/esp-idf/en/v5.2/esp32/api-reference/peripherals/adc_continuous.html)
- [REPORTED] The ESP32 can inject noise into its own supply rails when Wi-Fi transmits. — [universal-solder.ca](https://www.universal-solder.ca/troubleshooting-adc-inputs/)
- [WEB] EMG gesture literature: the Myo armband (8 channels) supports multi-class gestures including fist, open hand and pinch (one user-independent study reports 95 % overall accuracy on its gesture set, against 68 % for the original algorithm); similar pinch types (finger, key, tape pinch) are hard to separate; a 2025 study uses a medium-density armband (7 nodes of 3 channels) for power grip, lateral pinch, tripod grip, pointer, open and rest; an early muscle-computer-interface paper is cited for in-air pinch gestures with a much lower 66 % for finger presses on a surface in a cross-session condition. — [Saarland EMG paper](https://umtl.cs.uni-saarland.de/paper_preprints/EMG.pdf); [Frontiers 2018](https://public-pages-files-2025.frontiersin.org/journals/neurorobotics/articles/10.3389/fnbot.2018.00003/xml); [Frontiers 2025](https://public-pages-files-2025.frontiersin.org/journals/neurorobotics/articles/10.3389/fnbot.2025.1531815/pdf); [Microsoft Research, Making Muscle-Computer Interfaces More Practical](https://www.microsoft.com/en-us/research/publication/making-muscle-computer-interfaces-practical/)
- [WEB] A ring-IMU + smartwatch-EMG transformer estimates hand pose and per-finger force (UIST '25); no camera. — [arXiv 2510.04122](https://arxiv.org/abs/2510.04122)

### Inferences
- [INF] The DFRobot board's 20-500 Hz band implies at least 1 kHz sampling for the raw output (Nyquist). If using an envelope output (MyoWare ENV) a few hundred Hz is plenty, and the ESP32 can compute its own envelope from raw (rectify, low-pass, threshold with hysteresis).
- [INF] One channel on the forearm flexors can plausibly tell "muscle tense" from "relaxed" (a grab/release by threshold with a calibration step, a refractory time, and a per-wearer baseline). It will not tell a pinch from a fist; two or more channels plus a small classifier (for example LDA on RMS/waveform-length features per window) would be needed, and the literature shows cross-session and cross-user accuracy drops. Electrode placement and skin contact will dominate the result: mark this as the biggest risk for EMG.
- [INF] Keep the ESP32's Wi-Fi transmit away from the analog front end: ADC1 pins only, continuous driver, filter capacitor, power the EMG board from a clean regulated 3.3 V, and send data in 20-50 ms batches so the radio is not transmitting on every sample.
- [INF] Safety/ethics: dry-electrode EMG boards here are maker products; the DFRobot page says it is not a medical device. Do not wire any mains-powered equipment to the subject; run from battery or an isolated USB supply.

### Gaps
- Not researched: Olimex EKG-EMG, OYMotion gForce armband specs and SDK, Meta Neural Band/Mudra-type consumer EMG, Arduino/ESP-IDF EMG libraries beyond the MyoWare one, and measured false-positive rates of a single-channel clench detector on a wrist/forearm. The SparkFun PDF and wiki were not fetched in full (see the research-limits note).
- Whether ADC2/Wi-Fi limits apply the same way on the ESP32-S3: the pages I found were for the classic ESP32 and ESP32-S2; verify in the S3 docs.

---

## 6. ESP32-S3 + OV5640 camera and depth options

### Takeaway
An ESP32-S3 with an OV5640 can stream JPEG at roughly 20-25 fps at modest resolutions, but it gives no depth; depth would come from an add-on ToF sensor such as the VL53L5CX (8x8 zones) or from stereo, which I did not research.

### Cited Findings
- [WEB] Adafruit OV5640 module: 5 MP, 72-degree view, autofocus motor (from a product-image caption; pin list not retrieved). — [Adafruit Learn guide image](https://learn.adafruit.com/elements/3161911/assets/126639/exhibit)
- [WEB] Espressif: OV5640 on ESP32-S3, about 25 fps at 1600x1200 JPEG; the esp-rtsp example reaches about 20 fps at 720p MJPEG; a 480x320 JPEG is 30-50 KB so 20 fps needs roughly 600-1000 KB/s of Wi-Fi, which the S3 can meet; JPEG mode gives better frame rates; use at least two frame buffers (`fb_count`). — [DVP & MIPI-CSI camera solution](https://docs.espressif.com/projects/esp-techpedia/en/latest/esp-friends/solution-introduction/camera/dvp-mipi-csi-camera-solution.html); [DVP camera solution](https://docs.espressif.com/projects/esp-techpedia/en/latest/esp-friends/solution-introduction/camera/dvp-camera-solution.html)
- [WEB] The esp32-camera driver notes PSRAM DMA mode on S2/S3 can double the frame rate, JPEG only, with extra CPU and memory load. — [esp32-camera 2.1.6](https://components.espressif.com/components/espressif/esp32-camera/versions/2.1.6/readme?language=en)
- [REPORTED] A Reddit user says that at the OV5640's maximum JPEG rate the S3 cannot process all frames and mostly drops them. — [r/esp32 thread](https://redlib.hbubli.cc/r/esp32/comments/1jmqf1z/best_resolutions_and_framerates_available_for)
- [WEB] VL53L5CX: 8x8 zones (also 4x4), ranging 2-400 cm per zone, up to 60 Hz maximum (lower at long range or higher resolution), wide diagonal field of view 63 degrees (65 in a later datasheet revision), I2C or SPI, IOVDD 1.8/2.8/3.3 V, AVDD 2.8/3.3 V. The VL53L8CX is a newer similar part. — [ST VL53L5CX page](https://www.st.com/en/product/vl53l5cx.html); [SparkFun-hosted datasheet](https://cdn.sparkfun.com/assets/6/e/3/0/6/vl53l5cx-datasheet.pdf)

### Inferences
- [INF] MediaPipe's monocular output gives hand shape and relative depth but, as documented, a world frame centred on the hand and not a camera-to-hand distance; absolute depth to a screen or the camera needs either apparent-size heuristics or a ToF sensor. An 8x8 ToF at 63-65 degrees field of view is a coarse "is the hand within X cm, and which zone" sensor, not a hand-pose depth camera.
- [INF] An ESP32-S3 camera adds a third clock domain and Wi-Fi video latency on top of the glasses; I would use it only if the glasses video cannot be obtained at all, and treat it as a fallback hand-camera, not as part of the first build.

### Gaps
- The Adafruit pin list and the per-resolution frame rate of the VL53L5CX (my memory says the 8x8 mode is slower than 4x4, but I did not verify it). No stereo depth source researched. No test of MediaPipe on the OV5640's 72-degree view.

---

## 7. Transport, hub design and the "warp the screen to the projector" effect

### Takeaway
Use the Mac as the single hub: it owns the band's Bluetooth link, hosts a WebSocket server for the ESP32 and the projector page, timestamps everything on arrival, and drives the capture/crumple app. WebSocket is the pragmatic default (the only measured ESP32 comparison found ranked it lowest-latency and most reliable); OSC over UDP is a fine alternative for sensor streams if the team already has OSC tools; MQTT adds a broker hop with no benefit at this size.

### Cited Findings
- [WEB] A 2026 comparison on an ESP32-C3 found WebSocket had the lowest latency and highest reliability, MQTT balanced and efficient, Firebase slower. — [JATI paper](https://ejournal.itn.ac.id/jati/article/view/18056)
- [REPORTED] An ESP32 forum thread: with more than 3 WebSocket connections and `.loop()` called per client, the ESP32 server becomes almost unresponsive. — [esp32.com](https://esp32.com/viewtopic.php?p=151689)
- [WEB] MQTT's strengths are session persistence and delivery resilience for unreliable networks. No measured OSC latency was found; the vendor comparisons found are marketing-grade and disagree. — [websocket.org comparison](https://websocket.org/comparisons/mqtt/); [Ably](https://ably.com/topic/mqtt-vs-websocket)
- [WEB] ESP-NOW: payload 250 bytes (v1.0), 1470 bytes in v2.0 (ESP-IDF 5.4 and later; keep to 250 bytes in mixed networks); default 1 Mbps; Espressif gives no latency figure; third-party sources quote 1-5 ms and disagree. An Espressif staff reply on the forum advises at most 250 bytes per `esp_now_send` and not sending too fast (one user needed about 3 ms between sends to avoid out-of-memory errors). — [Espressif ESP-NOW FAQ](https://docs.espressif.com/projects/espressif-esp-faq/en/latest/application-solution/esp-now.html); [esp32.com ESP-NOW speed thread](https://esp32.com/viewtopic.php?p=52942)
- [WEB] ScreenCaptureKit: Apple's sample "Capturing screen content in macOS" builds an `SCContentFilter` for a display, an `SCStreamConfiguration`, and an `SCStream` with a delegate (output and error callbacks), then `startCapture`; it requires macOS 15 and Xcode 16 or later; WWDC22 session 10156 covers the lifecycle and a 60 fps frame interval. Developer Forum threads report repeated screen-recording permission prompts and some audio failures. Rust bindings exist (`screencapturekit` crate). — [Apple sample](https://developer.apple.com/documentation/screencapturekit/capturing-screen-content-in-macos.md); [WWDC22 10156](https://developer.apple.com/videos/play/wwdc2022-10156); [docs.rs crate](https://docs.rs/crate/screencapturekit/3.1.2/source/README.md)
- [DOC] The kit's dashboard and examples are a ready reference for a browser page that connects to the band (Web Bluetooth, Chrome or Edge, localhost), and the Python library is synchronous with background handler threads; handlers must be short and "collect in the handler and do slow work elsewhere". — AGENTS.md rule 17; api.md "Handlers: the rules"
- No source found for the crumple animation itself; the following is design.

### Inferences (proposed design; none of this is tested)

**Roles.**

| Device | Gives the hub | Latency class | Why this device |
|---|---|---|---|
| ESP32 + EMG | `grab` / `release` events plus an activation level 0..1 | tens of ms (Wi-Fi, local) [INF] | Muscle onset leads the movement; no camera in the trigger path |
| Vexo band (Bluetooth, hub-owned) | gyro/accel at 50-100 Hz, `tap`/`double-tap`/`free-fall`/`motion-*` events, `mic_level` loudness | about 15-50 ms interval + up to 50 ms batching (documented parts) | Continuous wrist motion, throw/flick burst, discrete fallback triggers, voice if needed |
| Mentra Live glasses (via Mentra relay or RTMP/SRT to the Mac) | video frames to the Mac; hand landmarks computed on the Mac | 300-800 ms (team's estimate, unverified) | Slow context: where the hand is in the scene, which screen it points at, hand present/absent |
| Mac hub | fusion state, timestamps, drives the effect | n/a | Single place for clocks and logs |
| Projector computer | browser page that shows the arriving screen | n/a | Display only |

**Signal rule when the glasses lag.** The trigger (grab, release) and its timing must come from EMG, with the band as veto and fallback; the camera may only (a) select the target ("which window / which screen region" at grab time, looked up in the buffered past, because the grab happened 300-800 ms before the frame arrives), (b) correct slow drift in position, (c) say "hand visible / not visible". Never close a feedback loop through the glasses. With late measurements: look up the camera pose at `t_grab - camera_delay` in the hub's buffer, not "latest".

**Hub process (Mac).** One Python asyncio process:
- Band: `Band.connect(TEAM_BAND, auto_reconnect=True)` from the kit's library (`TEAM_BAND` = the team's own number, one constant, asked for and never guessed), check `band.number`, then `set_motion(accel_range=8)`, `configure(motion=100, events=True)`. Handlers only push `(band.t, band.time, time.monotonic_ns(), payload)` into an `asyncio` queue (rule 17: keep handlers short).
- Network: WebSocket server for the ESP32 (as a client), the projector page and a debug page; UDP socket if OSC is wanted. Keep the number of simultaneous WebSocket clients small (the ESP32 should be a client, not a server, given the forum report above).
- Logging: append every message to a JSON-lines file with hub receive time. This one file is what lets the team measure latency and tune thresholds offline.
- Dashboard conflict: close the kit's dashboard tab while the hub runs (one Bluetooth connection, AGENTS.md rule 7).

**Message format** (JSON text frames for events; binary frames for high-rate arrays if needed). Every message carries the device's own clock and a sequence number; the hub adds its receive time.
```
{"v":1,"src":"emg","seq":812,"t_dev_us":123456789,"type":"grab","level":0.83,"conf":0.9}
{"v":1,"src":"band","seq":4410,"t_band_ms":52340.8,"type":"imu","a_g":[0.01,-0.02,0.99],"g_dps":[1.2,-0.4,0.3]}
{"v":1,"src":"band","type":"event","kind":"double-tap","t_band_ms":52900}
{"v":1,"src":"glasses","frame_id":9012,"t_capture":null,"t_hub_rx_ns":...,"type":"hand","handed":"R","lm_img":[...],"lm_world":[...]}
{"v":1,"src":"hub","type":"clock_ping","t_hub_ns":...}   # ESP32 echoes with its own t_dev_us
```
Rules: device clock and hub receive time are both always kept; `t_capture` for glasses is `null` until the pipeline is shown to carry one; the hub never overwrites the raw device time.

**EMG to hub transport.** First choice: ESP32 as Wi-Fi client of the hub's WebSocket (or UDP for lowest latency), batches of 20-50 ms of envelope plus the ESP32-side decided `grab`/`release` events (so a dropped packet cannot lose a trigger). ESP-NOW only if Wi-Fi is hostile (event network); it would need a second ESP32 plugged into the Mac as a USB-serial receiver, because the Mac cannot receive ESP-NOW itself (my knowledge, not sourced here).

**Warp-the-screen effect (design).**
1. On `grab` the hub asks a Swift/Rust capture helper for one still frame of the display (ScreenCaptureKit `SCStream`; one frame is enough, no streaming needed).
2. The still is drawn on a mesh (Metal / SceneKit / three.js in a local browser window) and a crumple is animated as vertex displacement plus fold lines over 0.5-1 s; the "throw" is the band's gyro/accel burst or the `release` event.
3. The hub sends the same still (JPEG, a few hundred KB) as one WebSocket binary message to the projector computer, and sends a small `{"type":"arrive","id":...}` message to start the reverse animation (uncrumple) in a plain browser page there (canvas or WebGL). Text and JSON on one connection, images on the same, no WebRTC needed for a still.
4. A live mirrored projector view (continuous stream) is a later extra: MJPEG over WebSocket, or WebRTC.
Because step 3 works from a keyboard key, this effect can be built and demonstrated with no sensors, which makes it the safest first deliverable.

### Gaps
- No measured OSC, WebSocket-vs-UDP or Wi-Fi jitter numbers for a crowded event network (the hackathon room has about 100 bands and many laptops; Bluetooth is "shared by every band in the room" per the contract).
- No source for the crumple effect, ScreenCaptureKit-to-browser latency, or whether Mentra's relay can deliver frames to a Mac in real time at 1080p without cloud round trips.

---

## 8. Key question: which signals from which device so the system survives a 300-800 ms glasses lag?

### Takeaway
Put every time-critical decision on EMG (trigger) and the band (motion, events, veto), use the glasses only for slow, retroactively-looked-up context, and measure the real glasses delay on day one instead of trusting 300-800 ms.

### Cited Findings
- All supporting facts are in sections 1, 3, 5 and 7: the band's documented link timing (15-50 ms interval, <=50 ms batching), HandCept's EKF handling of modality latency, the Mentra docs giving no latency number, and the EMG/IMU gesture literature.

### Inferences
- [INF] Trigger: EMG `grab`/`release` (ESP32-local decision). Fallback if EMG fails or is too noisy: band `double-tap` (documented) or a voice word through the band's mic (Deepgram, key from the organisers; LED locked blue while listening).
- [INF] Motion: band gyro/accel for flick/throw (a large burst; test thresholds on the team's own wrist), relative pointing only with a re-zero gesture.
- [INF] Position and target: glasses landmarks, applied to the past (`t_grab - delay`), smoothed (for example a One-Euro-type filter, from memory and not sourced here), and never in a closed loop.
- [INF] Veto/context: band `motion-stop` (documented: below 0.05 g for 2 s) is too slow for veto; use the band's own gyro-norm at 50-100 Hz instead (for a "hand is moving fast, ignore grab" rule). Camera "hand visible" is a second veto with its own lag.
- [INF] Status display: hub-controlled band LED (only while the mic is off) to show EMG armed / grabbed, since the glasses and the wrist have no other display. Remember the 15-50 ms command latency and the lock while the mic is on.

### Gaps
- Actual measured delays for every path are unknown; a first logging build (section 9) produces them.

---

## 9. Key question: sensible minimal architecture and de-risking order for a student team with a deadline

### Takeaway
Build the display effect and the hub first (no sensors needed), then each sensor path alone with logging, then the one measured link between them; fusion is optional and last. Every step has a fallback that still gives a demo.

### Cited Findings
- All supporting facts: the kit's pretend band works without hardware (`transport="sim"`, `SimTransport` can play motion, taps, loudness, link drops), so the hub can be developed before a real band is in hand; the kit warns that its own project thresholds are guesses and need tuning on a real wrist. — AGENTS.md "No band at hand"; projects/README.md

### Inferences (an ordering; durations are rough guesses)
1. **Day 0, ask the team for their band number** and write it once as a constant; keep the pretend band for development. Check the real band connects from the Mac hub with the library (double-tap, dashboard closed); stream 100 Hz motion and events; leave a log file running. Fallback: USB cable.
2. **Presentation first:** Mac captures one frame (ScreenCaptureKit), crumples it, sends the JPEG to the projector browser page, which plays the arrival. Trigger by keyboard. Fallback: the whole demo is Wizard-of-Oz with a keypress or the band's double-tap.
3. **Glasses path smoke test:** can frames reach the Mac at all (Mentra relay vs RTMP/SRT)? Run MediaPipe on the Mac, record frame arrival times. Then measure the delay with a visible event (a hand clap near the camera plus the band's mic-level or tap; a tap on a table with the band's `tap` event). Decide from the result whether the glasses may be used for anything beyond "hand present". Fallback: Mac webcam as the camera.
4. **EMG alone:** ESP32 ADC1 continuous at 1 kHz, envelope, calibrate rest and max, threshold with hysteresis, print on a serial plot; then stream `grab`/`release` to the hub. Measure false positives while typing, walking and waving. Fallback: band double-tap as the trigger.
5. **Band alone as a throw detector:** log 20 throws and 20 non-throws, pick a gyro-norm threshold. Do not attempt IMU pinch detection unless there is spare time (section 4 experiment).
6. **Clock check:** the hub already shares time with the band (library sets it). Add the ping-pong for the ESP32. Log all sources and verify with one clap or tap seen by all (band tap, EMG spike if the clap tenses the arm, video frame).
7. **Only then fusion:** buffered late-measurement correction of the camera position with IMU; otherwise leave the camera as a low-rate pointer and the band as event source.
8. Freeze features early; rehearse with the real network (the event Wi-Fi is shared with ~100 bands and many laptops), and keep a wired option (USB for the band and the ESP32, Ethernet for the projector machine) as a plan B.

### Gaps
- None of the steps has been tried on this team's hardware. The order is my judgement from the sources above, not an established method.

---

## Source list for the reader (local files read)
AGENTS.md; docs/api.md; docs/speech.md; docs/deepgram.md; docs/bluetooth-contract.md; contract/contract.md; projects/README.md; projects/gesture-trainer/README.md; projects/fall-alarm/README.md; projects/band-leash/README.md; projects/clap-lights/README.md; examples/README.md. Nothing in the repo was modified except this file.
