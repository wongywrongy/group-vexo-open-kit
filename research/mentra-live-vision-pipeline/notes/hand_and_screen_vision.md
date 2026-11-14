# Hand and screen vision for a head-mounted camera (Mentra Live) driving a Mac cursor

Scope note for the report writer: research ran on 2026-11-14 in a sandbox whose network allowlist blocked several primary hosts (ai.google.dev, docs.opencv.org, arxiv.org, docs.mentraglass.com, gery.casiez.net all failed to resolve; developer.apple.com returned partial/404). Most citations are therefore search-result summaries of primary pages, not full reads. Where a claim comes from my own background knowledge and has no URL, it is placed under Inferences or Gaps and labelled unverified. No end-to-end benchmark of any hand model on Apple Silicon was found.

## (a) Hand, index fingertip and pinch detection from an egocentric ~1080p camera

### Takeaway
Use a 21-landmark 2D hand model (MediaPipe Hand Landmarker, Apache-2.0, or Apple Vision hand pose) as the real-time workhorse; both give wrist, thumb tip and index tip directly. 3D mesh models (HaMeR, WiLoR) are heavier, have licence friction (MANO) and are reported to flicker/struggle on egocentric fisheye footage, so they are not a first choice. No published egocentric-accuracy or Apple Silicon fps figure was found for MediaPipe or Apple Vision: benchmark on your own recorded glasses clips.

### Cited Findings
- MediaPipe repo is Apache-2.0 licensed; the repo page links a Python Tasks setup guide and lock files for Python 3.10-3.14. The page did not say whether the Hand Landmarker wheel supports macOS arm64 — [google-ai-edge/mediapipe](https://github.com/google-ai-edge/mediapipe)
- Practitioner guidance for egocentric MediaPipe: egocentric footage brings motion blur, occlusion, reflections and fast hand movement, causing landmark flicker; MediaPipe handedness labels are from the camera's perspective so are often flipped in egocentric video; community advice is VIDEO mode for temporal consistency and confidence thresholds around 0.3 for hard footage (community recommendation, not measured) — [Labellerr egocentric MediaPipe guide](https://www.labellerr.com/blog/mediapipe-hand-tracking-egocentric-video/)
- A figure of 30-60 fps for 1-2 hands on flagship mobile devices circulates; the source could not be verified and it says nothing about Macs — [Emergent Mind overview](https://www.emergentmind.com/topics/mediapipe-hands)
- A 2024 JMIR study tested MediaPipe 2D accuracy on touchscreen tracing (not egocentric) and noted 3D accuracy still needs validation — [JMIR Formative Research 2024](https://formative.jmir.org/2024/1/e56682/XML)
- Apple Vision: `VNDetectHumanHandPoseRequest` (macOS 11+/iOS 14+) and the newer Swift struct `DetectHumanHandPoseRequest` (macOS 15+/iOS 18+) detect hand pose; 21 joints per hand (wrist + 4 per finger incl. thumb) in joint groups thumb/indexFinger/etc. — [Apple docs](https://developer.apple.com/documentation/vision/detecthumanhandposerequest.md), [Create with Swift](https://www.createwithswift.com/detecting-hand-pose-with-the-vision-framework/), [WWDC20 notes](https://www.wwdcnotes.com/notes/wwdc20/10653/)
- Apple Vision tuning knob: `maximumHandCount` affects latency (third-party reference; set to 1 for a single pointing hand) — [Axiom Vision reference](https://charleswiltgen.github.io/Axiom/reference/vision-ref)
- No published fps/latency number for Apple Vision hand pose and no statement about Neural Engine use was found; an Apple forum post shows a CoreML model taking ~15 ms on live camera frames vs ~1 ms on synthetic buffers (not hand-specific) — [Apple Developer Forums](https://developer.apple.com/forums/thread/679909), [Apple forum search result](https://developer.apple.com/forums/thread/697585)
- Apple Vision forum threads include a memory leak report for `VNDetectHumanHandPoseRequest` (create the request/handler carefully in a long-running loop) — [Apple Developer Forums](https://developer.apple.com/forums/thread/665430)
- WiLoR (CVPR 2025): end-to-end 3D hand localisation + MANO reconstruction; its detector runs >130 fps (M) / up to 175 fps (S) per the paper (detector only, GPU; whole-pipeline slower) — [WiLoR arXiv 2409.12259](https://arxiv.org/abs/2409.12259v2)
- WiLoR licensing is unclear: the arXiv page is CC BY-NC-ND (paper only); a third-party MLX port (lyonsno/wilor-mlx) claims MIT for its code/weights and notes MANO is separately licensed by Max Planck — [WiLoR MLX port](https://huggingface.co/lyonsno/wilor-mlx)
- 2026 egocentric work: ViDiHand (June 2026 preprint) says WiLoR is sensitive to detection dropouts and shows frame-wise pose flicker, and leads it on HOT3D fisheye footage; EgoForce (May 2026) uses HaMeR as a baseline and calls HOT3D hard due to fisheye distortion and wide FOV; EgoHandICL (ICLR 2026) shows WiLoR with lower joint error than HaMeR on ARCTIC but degrading on bimanual cases — [HF paper 2606.30308](https://huggingface.co/papers/2606.30308.md), [EgoForce arXiv 2605.12498](https://arxiv.org/pdf/2605.12498), [HOT3D arXiv 2411.19167](https://arxiv.org/pdf/2411.19167)
- RTMPose: rtmlib runs RTMPose/RTMW without mmcv/mmpose and lists a 21-keypoint hand model; rtmlib reported Apache-2.0; a CoreML fork exists (Kinetix-ML/rtmlib-coreml). Hand-model weight licence and fps not verified — [rtmlib](https://github.com/Tau-J/rtmlib), [rtmlib-coreml](https://github.com/Kinetix-ML/rtmlib-coreml)
- Pinch detection practice: thumb tip (landmark 4) to index tip (8) distance, normalised by a hand-size reference (e.g. wrist(0) to middle MCP(9) distance); raw thresholds that work at one camera distance fail at others — [Neural Base gesture tutorial](https://theneuralbase.com/mediapipe/learn/intermediate/gesture-for-ui-control/), [DEV Community pinch post](https://dev.to/twistedtransistor/googles-hand-gesture-recognition-my-playground-4707)
- Ultraleap's pinch detector uses hysteresis: activate distance 0.025, deactivate 0.03 (Ultraleap convention, in metres in their SDK, not MediaPipe units) — [Ultraleap docs](https://docs.ultraleap.com/xr-and-tabletop/xr/unity/plugin/features/pinch-detector.html)
- Existing open-source pinch air-mice: Aircursor (thumb-index < 40 px = click), slastra/pointer (thumb to index PIP = click/drag, 3-frame debounce, One-Euro, MIT) — [Pythonpreran/Aircursor](https://github.com/Pythonpreran/Aircursor), [slastra/pointer](https://github.com/slastra/pointer)

### Inferences
- A 1080p frame should be downscaled before hand inference (the landmark models internally work on small crops; my background knowledge, not verified here). Running at 640-960 px wide, or cropping to the hand ROI from the previous frame, should cut cost with little loss in fingertip accuracy.
- Because Apple Vision is a system framework it should avoid wheel/ABI problems on macOS and likely uses the Neural Engine/GPU, but this is unconfirmed; MediaPipe is easier from Python. A pragmatic plan: prototype in Python with MediaPipe, switch to a small Swift helper using Vision only if latency or install pain demands it.
- Pinch from an egocentric view is partly self-occluded (the thumb often hides behind the index finger), so normalised-distance thresholds will need per-user calibration; use enter ~0.3 / exit ~0.4 of palm-size as a starting guess, held 2-3 frames (my suggestion, derived from the sources above, not a published value).
- For a pointing task 3D mesh models add cost and flicker without a clear gain over 2D landmarks; HaMeR/WiLoR are only worth it if you need metric 3D fingertip position.

### Gaps
- No measured MediaPipe or Apple Vision hand fps/latency on M-series MacBook Air found.
- No egocentric fingertip-accuracy numbers for MediaPipe or Apple Vision found.
- HaMeR code/weight licence and WiLoR official repo licence not verified; MANO licence is non-commercial per my background knowledge (unverified).
- MediaPipe official docs (ai.google.dev) and the Vision docs could not be read in full; "newest 2026 hand models" beyond the research preprints above were not systematically surveyed.
- Whether MediaPipe Hand Landmarker has a macOS arm64 GPU delegate is not confirmed; CPU is the safe assumption.

## (b) Finding the Mac screen and its exact corners

### Takeaway
The most robust approach is fiducials (ArUco/AprilTag) displayed by the Mac in the screen corners or edges, giving sub-pixel corners and a homography for free; OpenCV supports both families. Pure ML (YOLO "laptop"/"tv" boxes, SAM 2) gives a mask or a loose box, not exact corners, so it is better as a fallback; feature matching to a ScreenCaptureKit screenshot is a markerless alternative whose cost/robustness on emissive screens was not benchmarked here.

### Cited Findings
- OpenCV's aruco module (objdetect) supports square fiducial markers for pose estimation, can detect AprilTag-family markers, and offers `CORNER_REFINE_APRILTAG`; OpenCV 5 docs warn that AprilTag corner order differs from the ArUco order, which matters when mapping tag corners to screen positions — [OpenCV 4.x aruco](https://docs.opencv.org/4.x/de/d67/group__objdetect__aruco.html), [OpenCV 5.0 aruco](https://docs.opencv.org/5.0/main_modules/objdetect_aruco.html)
- Closest published egocentric system: Sight Guide (arXiv 2506.02676) warps the camera image to a screen-aligned frame with a homography from detected screen corners, tracks ORB features between frames to keep the homography when the hand occludes the corners, and takes the fingertip as the highest segmented hand pixel — [Sight Guide](https://arxiv.org/pdf/2506.02676)
- Roboflow (March 2026) egocentric blog uses a laptop-screen detector plus MediaPipe's 21 landmarks; it only uses the mask's top-left corner as origin and says a full projective transform from the corners would be more robust — [Roboflow egocentric blog](https://blog.roboflow.com/egocentric-hand-keypoint-detection/)
- Classic precedent: Microsoft Research's Visual Panel / "Transforming an Ordinary Screen into a Touch Screen" fix a homography from the four corners of a quadrilateral screen and add bilinear residual correction for non-flat screens — [MSR Visual Panel](https://microsoft.com/en-us/research/uploads/prod/2016/11/Vision-based-Interaction-with-Fingers-and-Papers.pdf), [MSR screen-to-touch](https://www.microsoft.com/en-us/research/uploads/prod/2016/12/Transforming-an-Ordinary-Screen-into-a-Touch-Screen.pdf)
- YOLO11 is trained on COCO's 80 classes (which include laptop, tv); YOLO11n is 39.5 mAP(50-95) at 640 px, 56.1 ms CPU ONNX, 1.5 ms on a T4 with TensorRT10. Official docs list CoreML export; no per-class AP for laptop/tv and no Apple Silicon timings were found — [Ultralytics YOLO11](https://docs.ultralytics.com/models/yolo11/)
- SAM 2: Apache-2.0 code and weights, Meta reports ~44 fps real-time video segmentation (GPU); official repo lists a tiny checkpoint at 91.2 fps in the SAM 2.1 table on its benchmark hardware. A Core ML conversion for Neural Engine exists; the SAM2 RT fork needs CUDA — [Meta SAM 2 blog](https://ai.meta.com/blog/segment-anything-2/), [facebookresearch/segment-anything-2](https://github.com/facebookresearch/segment-anything-2), [SAM2 RT](https://inference-models.roboflow.com/models/sam2-rt-video-tracking/)
- Feature matching: Efficient LoFTR ~40.1 ms per 640x480 pair (27.0 ms optimised) on the paper's GPU; LightGlue 16.9 ms (easy) to 32.3 ms (hard) per pair on a GPU, ~840 ms on an RK3588 embedded CPU in a 2026 ISPRS paper — [Efficient LoFTR](https://arxiv.org/pdf/2403.04765), [LightGlue ICCV 2023](https://openaccess.thecvf.com/content/ICCV2023/papers/Lindenberger_LightGlue_Local_Feature_Matching_at_Light_Speed_ICCV_2023_paper.pdf), [FastGlue ISPRS 2026](https://isprs-annals.copernicus.org/articles/XI-2-2026/45/2026/isprs-annals-XI-2-2026-45-2026.pdf)
- ScreenCaptureKit: `SCScreenshotManager` (macOS 14+) captures single frames, `SCStream` streams; PyObjC wrappers exist (`pyobjc-framework-ScreenCaptureKit`) but the completion-handler API is awkward from Python; first use triggers a Screen Recording permission prompt; `CGDisplayCreateImage` is deprecated in macOS 15+; a Go library claims sub-20 ms frame latency from a persistent stream, and an Apple forum thread asks why SCK was throttled to ~7 fps in some setups (cause not read) — [pyobjc issue 590](https://github.com/ronaldoussoren/pyobjc/issues/590), [PyPI pyobjc-framework-ScreenCaptureKit](https://pypi.org/project/pyobjc-framework-ScreenCaptureKit/), [sckit-go](https://pkg.go.dev/github.com/LocalKinAI/sckit-go@v0.3.1), [Apple forum 811300](https://developer.apple.com/forums/thread/811300)

### Inferences
- Recommended: show 4 ArUco/AprilTag markers (e.g. DICT_APRILTAG_36h11 or ARUCO_MIP_36h12, about 5-8% of screen height each) in the corners of a full-screen overlay window, detect them each frame, and compute homography camera-to-screen with `cv2.findHomography` on 4+ points (marker corner points give 16 correspondences, which is more stable than 4). Because the marker positions on the Mac screen are known in screen pixels, the mapping needs no calibration of camera intrinsics. If a corner tag is hidden by the finger, the other tags still give 12 points.
- Markers cost screen real estate and only work while the overlay is shown; for a "no marker" demo, run an ML detector (YOLO11 laptop/tv box or SAM 2 mask) once to find the screen ROI, then `cv2.approxPolyDP` / `minAreaRect` on the mask for corners, and track with optical flow/ORB (as Sight Guide does). Expect 5-10 px corner error at 1080p from mask-based corners (my estimate, not measured).
- Glare, moiré and motion blur: bright emissive screens saturate the sensor and moiré shows on fine screen content; high-contrast large markers are the most robust to this (my expectation; no source compared marker vs ML under glare). Use screen content that is not fine-grained at tag locations (solid white border + black tag).
- Matching camera frames to an SCK screenshot with SIFT/ORB/LightGlue/LoFTR is attractive (no markers, and real content), but screen content is repetitive (text, icons) and emissive, the camera sees perspective-warped and exposure-altered content, and the learned matchers' published timings are on GPUs. I would treat this as an experiment for later, with markers as the baseline.

### Gaps
- No source compared markers vs YOLO vs SAM vs feature matching on screens under glare/moiré/blur.
- YOLO-World, OWLv2, Grounding DINO, Florence-2 were not researched in this pass (searches not run); no screen-specific quad-detection model was found. Their licences (e.g. Grounding DINO Apache-2.0, OWLv2 Apache-2.0, Florence-2 MIT, YOLO11 AGPL-3.0) are from my background knowledge and unverified; note the AGPL on Ultralytics weights is a real constraint for the "permissive licence" requirement.
- No measured AprilTag/ArUco detection ms at 1080p on Apple Silicon found.
- Whether Mentra Live's camera has a rolling shutter, auto-exposure behaviour on screens, or lens distortion correction was not found; fisheye-like distortion is plausible with a 119-degree FOV (below) and would bend straight screen edges and degrade a plain homography.

## (c) Mapping the fingertip to screen coordinates (parallax, calibration, smoothing, click)

### Takeaway
A homography from the screen plane to the image maps a point on the screen plane correctly, but a fingertip that hovers in front of the screen projects onto the screen plane along the camera ray, not along the user's line of sight, so the cursor lands offset (parallax) by an amount that grows with finger-to-screen distance and with camera-to-eye offset. With a temple/glasses camera close to the eye the error is small for a finger near the screen and grows as the arm extends; a short per-user calibration absorbs most of it.

### Cited Findings
- Visual Panel and related work establish the pattern: 4 screen corners fix a homography to display coordinates, with a fingertip found by segmentation; the touch-screen paper adds bilinear residual correction for non-flat or imperfect surfaces — [MSR Visual Panel](https://microsoft.com/en-us/research/uploads/prod/2016/11/Vision-based-Interaction-with-Fingers-and-Papers.pdf), [MSR screen-to-touch](https://www.microsoft.com/en-us/research/uploads/prod/2016/12/Transforming-an-Ordinary-Screen-into-a-Touch-Screen.pdf)
- Sight Guide uses a homography to a screen frame with ORB tracking to survive corner occlusion and uses the fingertip in the warped screen image — [Sight Guide](https://arxiv.org/pdf/2506.02676)
- One Euro filter (Casiez, Roussel, Vogel, CHI 2012): adaptive low-pass; cutoff = mincutoff + beta * |filtered derivative|; dcutoff default 1 Hz. Tuning: set beta=0 and mincutoff ~1 Hz, move quickly and raise beta (try 0.001/0.0001, scale by 10x) until lag at speed disappears; lower mincutoff if jitter at rest is a problem. Implementations exist in many languages (PyPI `OneEuroFilter`, npm `1eurofilter`) — [Casiez 1euro page (via search)](https://cristal.univ-lille.fr/~casiez/1euro), [libavg filter.py](https://sources.debian.org/data/main/liba/libavg/1.8.1-1/src/python/filter.py), [PyPI OneEuroFilter](https://libraries.io/pypi/OneEuroFilter/0.2.0)
- slastra/pointer: One-Euro with runtime-tunable min-cutoff/beta, velocity-based prediction over brief occlusions, 3-frame gesture debounce, MIT — [slastra/pointer](https://github.com/slastra/pointer)
- airmouse (PyPI) uses dwell (hold still 0.8 s = left click) with pinch for drag — [PyPI airmouse](https://pypi.org/project/airmouse/)
- Ultraleap pinch uses different on/off distances (hysteresis) — [Ultraleap docs](https://docs.ultraleap.com/xr-and-tabletop/xr/unity/plugin/features/pinch-detector.html)

### Inferences
- Geometry (my derivation): if the camera is d_c (about 5-8 cm) from the eye laterally and the finger is Z cm in front of the screen plane at distance D from the screen, the parallax between the camera-ray hit point and the eye-ray hit point on the screen is about d_c * Z / (D - Z) (camera-to-eye offset scaled by the finger-to-plane gap over the finger-to-camera depth). For d_c=6 cm, D=60 cm, Z=10 cm this is about 1.2 cm, around 2-3 icon widths, so a precise point pick needs correction, while region picking (e.g. 3x3 grid, large buttons) is fine.
- Choices: (1) treat the fingertip as "pointing at" the camera-ray point and calibrate; (2) use a "touch" model where the click/pinch happens close to the screen plane (Z small), where parallax vanishes; (3) apply a 4-5 point calibration that fits an affine/homography correction from the raw homography output to the intended point (user points at 4 on-screen targets while tags are visible) which absorbs the average offset for the usual arm distance; (4) optionally scale by finger depth using hand size as a proxy (hand scale in pixels falls as the hand moves away from the camera, but the finger-to-screen gap is not measured by a monocular camera).
- A relative ("trackpad") mode, where fingertip motion in the screen-plane coordinates moves the cursor relative to its position and clutching is done with a pinch, avoids absolute parallax error entirely and matches how existing air mice behave (they use a tracking rectangle rather than the screen). Offer both: absolute for region picks, relative for fine pointing.
- Pipeline order: map the raw tip through the homography, then One Euro filter in screen pixels (mincutoff ~1 Hz, beta tuned at 0.005-0.05 range as a starting point; my guess), then a small dead zone, then send. Filter in screen space so tuning is in pixels, and drive the filter with real frame timestamps (stream jitter makes fixed-dt assumptions wrong).
- Laggy stream: use the frame's capture timestamp (if Mentra exposes one) rather than arrival time; for click detection use pinch state edges with hysteresis and require 2-3 consecutive frames; accept a one-frame latency penalty.

### Gaps
- No measured parallax error for a temple-mounted camera; the numbers above are a geometric estimate.
- No publication found evaluating homography-based fingertip pointing accuracy in an egocentric AR setting beyond the descriptive Sight Guide and Roboflow items.
- Mentra Live's exact camera placement (temple vs bridge) and lens distortion model were not found.
- No published recommended One Euro parameter values for fingertip pointing; values above are starting guesses.

## (d) Driving the Mac cursor and clicks

### Takeaway
Use Quartz CGEvent (via pyobjc-framework-Quartz) or pyautogui; either needs the Accessibility permission granted to the host app (Terminal/iTerm/IDE/Python launcher), and global coordinates span all displays. Prefer CGEvent for multi-display and for drag/press-hold control; pyautogui is simpler but is reported to be unreliable beyond the primary monitor.

### Cited Findings
- Synthetic mouse input on macOS requires the Accessibility permission so the OS knows the app is authorised to generate input; PyAutoGUI calls have no effect unless the program running the script is set as an accessibility application — [Al Sweigart, Automate the Boring Stuff ch. 20](https://automatetheboringstuff.com/2e/chapter20), [OpenLogi TCC note](https://instagit.com/AprilNEA/OpenLogi/macos-input-monitoring-accessibility-gate-tcc-permissions-openlogi.md)
- The grant applies to the host app (terminal) rather than the script, and an Apple forum thread notes Accessibility-checked apps stopped working after 10.14 until re-added — [Apple Developer Forums 103992](https://developer.apple.com/forums/thread/103992)
- Coordinates are global across displays (a second monitor can start at x=1440 etc. depending on arrangement); one source says PyAutoGUI is unreliable on a second monitor — [naisys macOS desktop controller source](https://app.unpkg.com/naisys@3.0.3/files/dist/computer-use/desktops/macosDesktop.js), [mac-mcp-server mouse tool](https://glama.ai/mcp/servers/@laststance/mac-mcp-server/blob/283f762237110aba06972f7f2d2ffa9389f8dbeb/src/tools/mouse.ts)
- Screen Recording permission is required (TCC prompt) the first time ScreenCaptureKit is used — [TechBloat PyObjC guide (via search)](https://www.techbloat.com/?p=1960117)
- Sources reported that `CGEventPost` does not always move the mouse on some macOS versions, and Apple's CGEventPost page returned 404 on the URL tried — [Stack Overflow mirror](https://kaweah.freedombox.rocks/kiwix/content/stackoverflow.com_en_all_2023-11/questions/45313432/cgeventpost-does-not-always-move-the-mouse-macos)

### Inferences
- Implementation outline (my knowledge, unverified here): post `kCGEventMouseMoved` (or `kCGEventLeftMouseDragged` while pinch held) with `CGEventCreateMouseEvent` at `kCGHIDEventTap`; for click post `LeftMouseDown`/`LeftMouseUp` with the same point; call `CGWarpMouseCursorPosition` only for absolute teleporting. Use the main display's global coordinate space (origin top-left of primary, points not pixels, so Retina scaling is already handled; map screen-pixel coordinates from the homography by dividing by the backing scale factor).
- Because the same Mac that is being captured by ScreenCaptureKit is the one the user looks at, homography target coordinates should be defined in points of the display that hosts the marker overlay (`NSScreen.frame`), not hard-coded to the primary display.
- Latency of posting an event is expected to be well below a millisecond to a few ms and not the bottleneck (my expectation; no number found).
- Always keep a kill switch: a hotkey or a pinch-and-hold "pause" state, and a dead-man cutoff if no hand is seen for N ms, to avoid a runaway cursor from stale frames.

### Gaps
- No measured CGEvent/pyautogui posting latency; pyautogui's built-in `PAUSE` (default 0.1 s) and `FAILSAFE` should be disabled/configured, per background knowledge, unverified here.
- Apple's primary CGEvent docs and the Accessibility API docs could not be read.

## Latency budget, frame rate, resolution and async design for an M-series MacBook Air

### Takeaway
No source gives a measured per-stage budget; the realistic bottlenecks are the glasses-to-laptop video stream (protocol, buffering, 1080p decode) and hand inference. Design for 640-960 px processing resolution, 20-30 fps effective, latest-frame-wins asynchronous inference, and timestamp-based filtering.

### Cited Findings
- Mentra Live: 119-degree FOV in landscape, 1080p video, 3264x2448 stills, 3 microphones, 43 g; a 12 MP sensor is claimed by reviews but not stated on the vendor spec sheet per one guide — [TechSpot](https://www.techspot.com/news/110955-new-mentra-live-smart-glasses-built-livestreaming-platforms.html?rand=98523), [iDevice guide](https://idevice.com/guide-text/mentra-live.md), [Engadget](https://www.engadget.com/wearables/mentras-first-smart-glasses-are-open-source-and-come-with-their-own-app-store-150021126.html)
- Mentra camera streaming: Bluetooth SDK `startStream`/`stopStream` take a stream URL and ID (WHIP example); RTMP, SRT or WebRTC streams are listed; keep-alives are sent automatically; the SDK and glasses software must be the same release (latest matching pair listed as 0.1.20 at search time); MentraOS cloud SDK `session.camera.startStream` takes an `rtmpUrl` and `startLivestream` is low-latency WebRTC by default — [Mentra camera streaming (SDK)](https://docs.mentraglass.com/bluetooth-sdk/camera-streaming), [Mentra Live camera streaming](https://docs.mentraglass.com/mentra-live/camera-streaming), [MentraOS RTMP guide](https://docs.mentra.glass/camera/rtmp-streaming)
- Docs state the camera light is always on while streaming — [Mentra camera streaming](https://docs.mentraglass.com/bluetooth-sdk/camera-streaming)
- Ultralytics reference CPU ONNX speed for the smallest YOLO11n at 640 px is 56.1 ms (CPU benchmark hardware not Apple Silicon) — [Ultralytics YOLO11](https://docs.ultralytics.com/models/yolo11/)
- Computer-use design targets from an engineering blog: perception under ~500 ms and model inference under ~2 s per step (blog recommendation, not measured) — [tianpan.co computer-use agents](https://tianpan.co/blog/2026-04-10-computer-use-agents-when-pixels-replace-apis)
- Apple forum: CoreML on live camera frames was ~15 ms vs ~1 ms synthetic, so live pipelines add overhead — [Apple Developer Forums](https://developer.apple.com/forums/thread/697585)

### Inferences
- Rough budget I would plan with (my estimate, to be measured): stream transport + decode 100-400 ms (dominant, WebRTC at the low end, RTMP at the high end; the Mentra latency was not found); resize + hand landmarks 8-25 ms; marker detection + homography 3-10 ms; filter + CGEvent <2 ms. Total motion-to-photon likely 150-500 ms, which is acceptable for region picks and dwell/pinch clicks but poor for fine free-hand pointing; a relative mode plus smoothing hides some of it.
- Async pattern: one thread reads/decodes the stream and keeps only the newest frame (drop old ones; never queue); a worker runs marker + hand inference on that frame and publishes (timestamp, tip, pinch state); a control thread consumes the latest result, applies One Euro with the capture timestamp, and posts events at a fixed 60-120 Hz using a short linear extrapolation or just holding the last value. If the stream stalls (> ~300 ms with no new frame), freeze the cursor and release any held button.
- Run markers every frame and hand landmarks every frame; the screen homography can be smoothed/held across frames since the head moves slowly relative to hand (update at lower rate or when tags are visible, reuse otherwise).
- Prefer the glasses' stream over per-photo capture; photo capture (3264x2448) is too slow for live pointing (my expectation).

### Gaps
- Real latency of Mentra Live streaming (WebRTC/RTMP/SRT) to a laptop not found; the Mentra docs could only be seen via search summaries.
- Whether the stream exposes capture timestamps and the actual frame rate (15 vs 30 fps) at 1080p not found.
- No Apple Silicon fps numbers for MediaPipe, Vision, ArUco or YOLO11.

## Existing open-source projects to reuse

### Takeaway
Many webcam air-mouse repos exist (MediaPipe + pyautogui), but they map a fixed rectangle of the webcam frame to the screen. None found does egocentric screen finding plus homography. Best reuse candidates: slastra/pointer (clean One-Euro + debounce, MIT but Linux/Wayland only) as a code reference for filtering and gestures, and the Sight Guide paper as the reference architecture for homography + occlusion handling.

### Cited Findings
- slastra/pointer: GTK4/Python, MediaPipe, One-Euro, thumb-to-PIP click, MIT; Wayland-only (zwlr virtual pointer), so the mouse backend must be replaced for macOS — [slastra/pointer](https://github.com/slastra/pointer)
- Aircursor: index fingertip moves cursor, thumb-index < 40 px left click, fist for scroll — [Pythonpreran/Aircursor](https://github.com/Pythonpreran/Aircursor)
- PyPI `airmouse` (Lumina): dwell click 0.8 s, pinch for drag — [PyPI airmouse](https://pypi.org/project/airmouse/)
- Others listed by search, not opened or licence-checked: rachts/Air-Mouse, monsterdove/airctrl, zunza5/handpointer (index-middle touch click), xn-coder/Hand-Tracking-Mouse, singharyans754/AI-Virtual-Mouse, wasifsohail5/virtual_mouse (pinch click, double-pinch double-click), reynaldichernando/pinch (Vision Pro style on Windows, per Gigazine) — [Gigazine article](https://www.gigazine.net/gsc_news/en/20241124-selfmade-apple-vision-pro-interface), [rachts/Air-Mouse](https://github.com/rachts/Air-Mouse)
- Hand-detection Flutter package `hand_detection` lists CompiledModel GPU/NPU with CPU fallback (not relevant to Mac Python, noted only) — [pub.dev hand_detection](https://pub.dev/documentation/hand_detection/3.5.0/)

### Inferences
- Reuse the structure (pinch state machine, One Euro, debounce) rather than any repo wholesale; most are tutorial-quality with no tests (I opened only slastra/pointer). Check licences before copying.
- Rather than pointing a webcam-style tracking rectangle at the screen, replace it with the homography output.

### Gaps
- Repos other than slastra/pointer were not opened; maintenance, licence and quality unverified.
- No open-source project found that does glasses-camera egocentric finger-to-screen pointing on macOS. I did not search GitHub for ARKit/visionOS-style or Meta Aria related pointing code.
- No gaze-pointing projects were surveyed.

## Using a vision-language model (Claude, Gemini, GPT) to pick a region of a screenshot

### Takeaway
A VLM is suitable for slow semantic choices (identify which UI element or region the user means, given a screenshot plus a coarse fingertip location) but is too slow, noisy and expensive for live cursor tracking. Use it at most once per pick, with the geometric pipeline supplying a candidate region.

### Cited Findings
- Engineering blog design targets: perception under ~500 ms, model inference under ~2 s per step; a fast grounding model matters for correctness because the screen can change between observation and click — [tianpan.co computer-use agents](https://tianpan.co/blog/2026-04-10-computer-use-agents-when-pixels-replace-apis)
- A common bug: model coordinates live in its resized image space and must be rescaled to native screen resolution before clicking — [tianpan.co GUI agent wrong screen](https://tianpan.co/blog/2026-05-18-gui-agent-right-button-wrong-screen)
- UiPath reports its grounding model placed predictions outside any UI element ~11% of the time and 53.6% on OSWorld with a two-stage design — [UiPath Screen Agent](https://www.uipath.com/ai/research/screen-agent)
- 2026 research notes the zoom-in-then-predict approach to GUI grounding needs an extra inference pass (latency) and proposes a single-pass alternative (InnerZoom); Desktop-Delta Bench (2026) argues grounding benchmarks miss the transition to end-to-end behaviour — [InnerZoom](https://huggingface.co/papers/2606.30084.md), [Desktop-Delta Bench](https://www.alphaxiv.org/abs/2607.26041.md)

### Inferences
- Good uses: "click the button I am pointing at": crop a ~400 px window of the screenshot around the filtered fingertip position, send crop + full screenshot, ask for the element's centre or label, then snap the cursor to it. Also useful for resolving ambiguity between neighbouring small controls, and for voice-plus-pointing commands.
- Bad uses: per-frame tracking (seconds of latency, cost), precise sub-10 px positioning from a raw full-screen screenshot (grounding errors, as UiPath's ~11% off-element figure suggests), anything needing a deterministic result.
- A cheaper alternative for snapping is the macOS Accessibility API element-at-point (`AXUIElementCopyElementAtPosition`), which returns the actual UI element under a point without a model (from my background knowledge, not verified in this research); use it first and the VLM as fallback for custom-drawn UI.

### Gaps
- No measured latency for Claude, Gemini or GPT image-grounding calls was found; the figures above are blog design targets.
- Model-specific grounding accuracy (ScreenSpot-Pro numbers for current Claude/Gemini/GPT models) not retrieved.

## Recommended concrete pipeline (synthesis; all inference)

1. Transport: Mentra Live stream to the Mac (WebRTC/WHIP or RTMP, whichever the SDK path gives the lowest latency), decode with PyAV/OpenCV, keep newest frame only.
2. Screen: full-screen Mac overlay shows 4 corner AprilTag/ArUco markers; OpenCV aruco detects them, `findHomography` gives camera-to-screen-points; reuse the last homography for a short period when tags are occluded; fall back to a YOLO/SAM screen mask + ORB tracking only if marker-free is required.
3. Hand: MediaPipe Hand Landmarker (num_hands=1, VIDEO mode) on a 640-960 px frame, optionally ROI crop; Apple Vision via a Swift helper as the alternative. Take index tip (8), thumb tip (4), wrist (0), middle MCP (9).
4. Map: index tip through homography to screen points; 4-5 point calibration for the parallax offset; One Euro filter in screen space using frame timestamps.
5. Click: normalised pinch d(4,8)/d(0,9) with enter/exit hysteresis and 2-3 frame debounce; dwell-click as an alternative; pinch-hold = drag.
6. Control: Quartz CGEvent via pyobjc; Accessibility permission for the host terminal; global multi-display coordinates; kill switch and stale-frame cutoff.
7. Optional: VLM or Accessibility element-at-point to snap a coarse pick to the intended UI element.
