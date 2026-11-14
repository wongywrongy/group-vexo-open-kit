# Lights and devices: detecting lamps/screens in smart-glasses video, selecting by pointing, controlling real lights from code

Scope note: research run 2026-11-14. WebSearch worked; WebFetch could not resolve docs.ultralytics.com, developers.home-assistant.io or arxiv.org in this session (host not on the network allowlist). So every cited finding below comes from search-result summaries, not from reading the full primary pages. Items marked "secondary" were not checked against the primary source. Numbers from different papers/benchmarks are not comparable with each other.

## (a) Vision: finding lamps/lights/screens and telling on vs off in first-person video

### Takeaway
COCO's 80 detection classes include tv and laptop but no lamp, so lamps need an open-vocabulary detector (YOLO-World / YOLOE are the real-time options; OWLv2, Grounding DINO and Florence-2 are more accurate/flexible but slower) or a fine-tuned small YOLO. On/off state is best decided from the pixels inside the detected box (clipped-highlight fraction, brightness relative to the scene), with camera exposure locked or compensated; I found no published source specific to lamp on/off from auto-exposure video, so that part is inference.

### Cited Findings
- COCO object detection has 80 classes; "tv" and "laptop" are in the list, "lamp" is not. Nearby household classes are chair, couch, potted plant, bed, dining table, vase, clock. Roboflow's guide says custom data/fine-tuning is the route for missing classes. — [Roboflow COCO classes](https://blog.roboflow.com/microsoft-coco-classes/)
- YOLO-World (CVPR 2024): zero-shot LVIS 35.4 AP at 52.0 FPS on a V100 (the authors' measurement; other hardware will differ). — [YOLO-World arXiv](https://arxiv.org/abs/2401.17270v1); [CVPR open access](https://openaccess.thecvf.com/content/CVPR2024/html/Cheng_YOLO-World_Real-Time_Open-Vocabulary_Object_Detection_CVPR_2024_paper.html)
- Ultralytics docs describe YOLO-World as YOLOv8-based, real-time open-vocabulary; the shipped checkpoints default to COCO categories as offline vocabulary, so you set your own class list (for example "lamp", "ceiling light", "monitor") with the custom-classes call. — [Ultralytics YOLO-World docs](https://docs.ultralytics.com/models/yolo-world) (search summary only; the page itself could not be fetched)
- YOLOE (ICCV 2025) supports text prompts, visual prompts (give an example image/box) and prompt-free mode (built-in vocabulary of 4,585 names). The paper says YOLOE-v8s beats YOLO-Worldv2-S by 3.5 AP with 1.4x inference speed. Reported numbers: YOLOE-v8-S 27.9 LVIS AP text-prompted, 305.8 FPS on a T4 with PyTorch; prompt-free 21.0 AP, 95.8 FPS (T4 TensorRT; iPhone 12 CoreML also measured). — [YOLOE ICCV page](https://iccv.thecvf.com/virtual/2025/poster/205); [Ultralytics YOLOE docs](https://docs.ultralytics.com/models/yoloe); [EmergentMind summary](https://api.emergentmind.com/papers/2503.07465) (secondary)
- A later YOLOE-26 paper reports 40.6 AP (LVIS minival, text prompts) for the largest model and keeps the three modes. — [arXiv 2606.03748](https://arxiv.org/pdf/2606.03748) (via search summary)
- Ultralytics usage caveat: prompt-free checkpoints (`*-seg-pf.pt`) cannot have classes set (AssertionError); use a `*-seg.pt` checkpoint for your own text prompts. — [Ultralytics YOLOE docs](https://docs.ultralytics.com/models/yoloe) (search summary)
- YOLOE visual prompts matter here: you could register a lamp by giving the model an example box of that lamp rather than relying on the word "lamp". — [YOLOE ICCV page](https://iccv.thecvf.com/virtual/2025/poster/205)
- OWLv2 is in Hugging Face Transformers (`Owlv2Processor`, `Owlv2ForObjectDetection`, e.g. `google/owlv2-base-patch16-ensemble`) and adds an objectness head to OWL-ViT. LVIS rare-class AP rose from 31.2% to 44.6% with self-training (rare classes only, not overall AP); sources list other figures (44.6, 51.3 with fine-tuning and extra data) without clear definitions. No latency numbers found; Roboflow advises the base ensemble for speed, large for accuracy. — [OWLv2 HF docs](https://huggingface.co/docs/transformers/model_doc/owlv2); [Roboflow OWLv2](https://inference-models.roboflow.com/models/owlv2/); [Papers With Code](https://www.paperswithcode.com/paper/scaling-open-vocabulary-object-detection-1)
- Grounding DINO speed: original model 1.1 FPS on Jetson Orin NX; Grounding DINO 1.5 Edge 10.7 FPS at 640x640 on Orin NX (5.5 FPS at 800x1333), and 21.7 / 111.6 FPS on A100 (PyTorch / TensorRT). Authors' own comparison; YOLO-Worldv2-M listed at 42.7 FPS on A100 TensorRT. — [Grounding DINO 1.5 paper](https://arxiv.org/pdf/2405.10300); [DeepLearning.AI summary](https://www.deeplearning.ai/the-batch/grounding-dino-1-5-an-edge-device-model-built-for-faster-smarter-object-detection)
- Florence-2: no reliable independent FPS found. One comparison site lists about 4 FPS vs YOLO-World 52-74 FPS without naming hardware (unverified). — [Roboflow Playground comparison](https://playground.roboflow.com/models/compare/florence-2-vs-yolo-world)
- Fine-tuning guidance (Ultralytics, written for YOLOv5, still the main reference found): at least 1500 images per class, one version says at least 10000 labelled instances per class, label every object tightly, images should match deployment conditions, 0-10% background images to cut false positives, train with defaults first. — [Ultralytics training tips](https://docs.ultralytics.com/yolov5/tutorials/tips-for-best-training-results)
- Public "bulb" datasets exist on Roboflow Universe (usable as a starting point; quality unchecked). — [Roboflow Universe bulb dataset](https://universe.roboflow.com/tanmay-singh-g3brk/bulb-sqljc/dataset/)
- On/off from pixels: a Raspberry Pi desk-lamp project thresholds mean brightness; an oven tutorial uses HSV to find a red indicator circle; a brake-light patent classifies lights on/off in HSV (day) or LAB (night) and checks region area and intensity. — [Hackster Pi desk lamp](https://www.hackster.io/news/this-raspberry-pi-powered-light-control-system-uses-computer-vision-to-adjust-a-desk-lamp-4e3a343c6b3f); [Oven on/off OpenCV](https://www.besthub.dev/articles/detect-your-oven-s-on-off-state-with-python-and-opencv-312ee148c12b); [Brake light patent](https://uspto.report/patent/grant/11,386,673)
- Pretrained cloud classifiers for "is the lamp on" exist (Nyckel) with two labels, lamp on / lamp off (cloud service, so not local). — [Nyckel](https://nyckel.com/pretrained-classifiers/if-the-lamp-is-on)
- Mentra Live camera (the target glasses): docs list 1080p video with streaming; stills up to 3264x2448 per third-party coverage, about 119 degree field of view; photo via `requestPhoto`; streaming modes include WebRTC, and local endpoints via SRT/RTMP/WHIP; docs example uses 1280x720 at 30 fps; capture light is always on. — [Mentra Live hardware docs](https://docs.mentraglass.com/mentra-live/hardware); [Mentra camera streaming](https://docs.mentraglass.com/bluetooth-sdk/camera-streaming); [TechSpot](https://www.techspot.com/news/110955-new-mentra-live-smart-glasses-built-livestreaming-platforms.html)

### Inferences
- Most practical hackathon path: run YOLOE (or YOLO-World) text-prompted with a short list ("lamp", "ceiling light", "monitor", "laptop", "tv") on a laptop GPU/Apple silicon fed by the glasses' RTMP/WebRTC/SRT stream; fall back to COCO `tv`/`laptop` classes which need no prompting. Treat "lamp" detection as noisy (LVIS-type vocabularies are trained on photos where lamps are often unlit furniture) and expect false positives on windows, monitors and reflections.
- Because the demo has only a few known lamps, a one-time registration (box or visual prompt per lamp) removes the need for the detector to recognise "lamp" generically. A 1500-image fine-tune is unnecessary for a demo; a few dozen images of your own lamps in your own room (about 50-200 labelled) is a cheaper start, but I found no source quantifying that.
- On/off heuristic (my own reasoning, not from a source): inside the box (or a small ring around the bulb), measure fraction of near-saturated pixels and mean V in HSV, compare with a per-lamp baseline captured when known off and known on (the app knows the state because it sets it). Auto-exposure will cancel brightness differences between frames, so compare against the same scene's surroundings (ratio of lamp-box brightness to the median frame brightness) and keep a per-lamp calibrated threshold. The most reliable signal is probably not vision at all: the program that toggles the lamp already knows the state (Hue/HA report it), so vision only needs to pick the lamp.
- Bright lamps: a lit bulb often saturates and blooms, so box-edge detection can degrade while "a very bright blob" becomes easy to find by plain thresholding. A hybrid (threshold blobs for lit lamps, detector for unlit shades) is plausible but untested.
- Glasses video is low-resolution at distance and motion-blurred; run detection only on a still crop from a pinch moment rather than on every frame.

### Gaps
- No primary-page read of Ultralytics YOLO-World/YOLOE docs (host blocked); exact current model names, per-size mAP and CPU/edge speeds not verified.
- No measured YOLO-World/YOLOE/OWLv2/Florence-2 accuracy on the specific classes "lamp" or "ceiling light"; no independent on-device latency for OWLv2 or Florence-2.
- No source found on lamp on/off detection under auto-exposure or HDR, nor on how many images a lamp-specific fine-tune needs.
- No data on Mentra Live's actual video latency, exposure behaviour or motion blur.

## (b) Selecting a light by pointing, and telling lamps apart

### Takeaway
Three workable ways to know which physical lamp was selected: user-registered positions/appearance, a visual marker next to each lamp, or active identification (blink the lamp and watch for it). Sources show these ideas in research and hobby projects, but I found no packaged off-the-shelf tool that blink-matches bulbs from camera video.

### Cited Findings
- IRIS (UIST 2024, University of Washington): a camera ring; the user points at a device and gestures; images are streamed to a phone that runs YOLO and DINOv2. Secondary reports: 95 to 98 percent device-instance classification accuracy, latency as low as 112 ms, 3.4 fps while streaming; no dedicated pointing-accuracy figure found. Setup is described as no more than normal device installation. — [IRIS arXiv](https://arxiv.org/html/2407.18141v1); [Hackster summary](https://www.hackster.io/news/point-and-click-for-the-real-world-747a0932edc3); [Moonlight review](https://themoonlight.io/review/iris-wireless-ring-for-vision-based-smart-home-interaction)
- AprilTag 3 has improved small-tag detection and pose estimation (needs tag size and camera intrinsics); OpenCV's ArUco module can also detect AprilTag families, with a different corner order; lowering `quad_decimate` helps find small tags but costs speed; a thesis found AprilTag slightly better than ArUco for pose with fewer false positives. — [AprilTag 3 docs](https://docsearch.algolia.com/mcp/docs/repo/aprilrobotics/apriltag); [OpenCV ArUco docs](https://docs.opencv.org/5.0/main_modules/objdetect_aruco.html); [Thesis](https://trepo.tuni.fi/handle/10024/225800)
- Active identification hooks exist on the control side: Zigbee has an Identify cluster that flashes the light; Home Assistant exposes an identify action for some lights (for example Elgato); Hue, LIFX etc. have identify/blink functions. The search found no camera tool that matches a blink to a bulb, only academic work on bulb "fingerprints" (UCSD EffiSenseSee). — [Zigbee Identify cluster](https://medium.com/@omaslyuchenko/hello-zigbee-part-22-identify-cluster-90cf12680306); [HA Elgato identify](https://www.home-assistant.io/actions/elgato.identify/); [UCSD paper](https://escholarship.org/content/qt1dx2w3m0/qt1dx2w3m0.pdf?t=roshca)
- A hobby "point and snap" project uses a webcam and Node-RED to toggle Hue and Sonoff devices. — [Pinch of Intelligence](https://www.pinchofintelligence.com/point-and-snap-for-my-smart-home/)

### Inferences
- Simplest robust demo: pinch selects whichever detected lamp box contains (or is nearest to) the image centre / the pointing ray; each lamp box is pre-registered once ("look at this lamp, press register, pick which Hue/WLED entity it is"), stored as a visual-prompt embedding plus a rough room-position/heading. This avoids markers.
- AprilTags give a deterministic ID with no model; a printed tag of about 5-8 cm per lamp should be readable at a few metres at 1080p, but I did not find a source for read range, so test it. Tags also fix the "which lamp is which" problem when two identical lamps exist.
- Active blink identification is the most hands-off (no tapping, no tags): command one candidate lamp to pulse, diff frames, find the blob. It is slow (each lamp costs a second or more, rate-limited by Hue's bridge), so use it only for registration, not on every pinch. This design is my own; no source demonstrates it end to end.
- Pointing: the glasses' camera gives head/gaze direction (centre of frame), not finger direction; hand-based pointing would need a hand-landmark model on the same video (not researched here, other researchers may cover).

### Gaps
- IRIS primary evaluation numbers (host blocked), no pointing-angle accuracy figures found.
- No source on AprilTag read distance for small tags with a glasses camera.
- No existing open-source camera-blink lamp-registration tool found.

## (c) Controlling lights from code (what is cheapest and quickest)

### Takeaway
Everything below works locally with no cloud: Hue via the bridge's HTTPS CLIP v2 (needs a bridge and an app key), Home Assistant REST as a single uniform front door to many brands, Shelly/Tasmota via plain HTTP, WLED via HTTP/JSON, python-kasa/Tapo with caveats. For a hackathon the fastest is a single HTTP call to WLED or Tasmota/Shelly (no pairing, no bridge) or Home Assistant if the team already runs it.

### Cited Findings
- Hue CLIP v2: local on the bridge IP; requests need the `hue-application-key` header; lights are controlled by PUT to `/clip/v2/resource/light/<id>` with `on`, `dimming`, `color_temperature`, `color` (colour as CIE xy); rooms/zones use `grouped_light`. Lights differ in capabilities. — [Hue getting started (mirror)](https://unpkg.com/node-red-contrib-knx-ultimate@4.0.24/tutorial/HUEApiV2/developers.meethue.com/develop/hue-api-v2/getting-started/index.html); [openHAB Hue v2 binding docs](https://www.openhab.org/addons/bindings/hue/doc/readme_v2.html)
- Hue rate limits are not confirmed from Signify: one guide says about 10 light commands/s per light and 1/s per group; an openHAB post says 20 requests/s for the bridge. — [openHAB forum thread](https://community.openhab.org/t/philips-hue-clip-2-api-v2-discussion-thread/142111?page=19) (conflicting, unofficial)
- Hue v2 has a server-sent-events stream at `/eventstream/clip/v2` for state changes (use for knowing the real on/off state). Entertainment API (DTLS/UDP) is the low-latency path, one area at a time, needs bridge v2; reported rates conflict (20 Hz vs about 50 Hz). — [Hue API v2 events (ComfortClick)](https://support.comfortclick.com/communities/4/topics/10569-philips-hue-api-v2-events-server-side-events); [Hue Entertainment pykit](https://pypi.org/project/hue-entertainment-pykit/0.9.0)
- Home Assistant REST: long-lived access token in `Authorization: Bearer`, `POST /api/services/light/turn_on` with JSON `entity_id` and optional `brightness` (and other light fields); token shown once at creation. Sources were community mirrors (Mintlify copy is the closest to official); official page not fetched. — [HA REST mirror](https://mintlify.com/home-assistant/core/api/rest-api); [Community forum](https://community.home-assistant.io/t/rest-api-invalid-authentication/482539)
- Shelly Gen2+: local RPC, `GET http://<ip>/rpc/Switch.Set?id=0&on=true` or POST `/rpc/Switch.Set` with `{"id":0,"on":true}`; response includes `was_on`; state via `Switch.GetStatus`. Authentication, when enabled, uses digest and some integrations do not support it. — [Shelly API docs](https://shelly-api-docs.shelly.cloud/gen2/0.14/ComponentsAndServices/Switch); [RPC channels](https://shelly-api-docs.shelly.cloud/gen2/General/RPCChannels/)
- Tasmota: `http://<ip>/cm?cmnd=Power%20On` (also Off/Toggle, replies `{"POWER":"ON"}`), optional `user`/`password` params; MQTT via `cmnd/<topic>/POWER`. — [Tasmota commands](https://tasmota.github.io/docs/Commands/); [Tasmota MQTT](https://github.com/tasmota/docs/blob/development/docs/MQTT.md)
- Kasa/Tapo: python-kasa controls them locally (KP115 listed); newer Kasa/Tapo devices still need TP-Link cloud credentials for local authentication; Tapo P115 may only work unofficially; some devices need Third-Party Compatibility enabled in the app. — [python-kasa](https://github.com/rytilahti/python-kasa); [PyPI](https://pypi.org/project/python-kasa/0.7.3); [HA TP-Link docs](https://home-assistant.io/components/tplink/)
- WLED: JSON API at `/json/state` (POST with `{"on":true}`; `"t"` toggles; `bri`, `seg` with colours); also HTTP request API, MQTT and WebSocket; community recommends JSON API for new work. Forum pitfalls: wrong Content-Type typo and sending `"on":"true"` as string. — [WLED JSON API](https://kno.wled.ge/interfaces/json-api/); [WLED HTTP API](https://kno.wled.ge/interfaces/http-api/); [WLED forum](https://wled.discourse.group/t/cannot-call-json-request/2201)
- Matter: python-matter-server is a controller exposing a WebSocket API; On/Off is cluster 6; commissioning needs the pairing code and Thread/Wi-Fi credentials set first; the project describes itself as early-stage. — [python-matter-server](https://pypi.org/project/python-matter-server/)
- Govee has a developer API (used in a Quest 3 light demo, cloud-based). — [Mixed-news Quest 3 smart home](https://mixed-news.com/en/this-meta-quest-3-app-can-visualize-and-control-smart-home-devices-in-mixed-reality/)

### Inferences
- Latency: no source gave measured end-to-end numbers for any of these. My expectation (unverified) is tens to low hundreds of milliseconds for LAN HTTP to Shelly/Tasmota/WLED, with Zigbee bulbs through the Hue bridge adding a Zigbee hop; cloud routes add network round trips and are best avoided.
- Ranking by hackathon speed (my judgement): (1) WLED or Tasmota/Shelly relay: one curl, no account, no pairing. (2) Home Assistant REST if it is already running (one API for Hue, Matter, Kasa, WLED, Shelly) and it also gives state. (3) Hue if the team already owns a bridge: needs button-press app key creation and HTTPS with the bridge's self-signed cert. (4) Matter / HomeKit are the slowest to set up (commissioning, controller software); skip for a hackathon. I did not find HomeKit control information (HAP-python search returned nothing).
- Keep a small adapter layer in code: `set_light(id, on/dim/colour)` with one backend per brand, so lamp registration only stores a backend + address.

### Gaps
- No measured latency for Hue, HA, Shelly, Tasmota, WLED or Matter.
- Official Hue developer docs (needs developer-portal login) and official HA docs not read; Hue rate limits unconfirmed.
- No information on HomeKit/HAP-python control from code.
- Whether the Tapo P115 works with python-kasa is unconfirmed.

## (d) ESP32 as the demo lamp (relay or LED strip)

### Takeaway
For a demo "lamp", flash WLED on an ESP32 with an addressable LED strip (control it over HTTP/JSON, MQTT or UDP); use Tasmota or ESPHome for a relay-driven mains lamp. Both avoid writing firmware.

### Cited Findings
- WLED is described as much simpler to set up than ESPHome, supports MQTT and HTTP/JSON, and can now handle a relay; ESPHome with FastLED/NeoPixelBus is considered more basic for addressable strips unless you need many sensors. — [Home Assistant guide to WLED](https://home-assistant-guide.com/guide/what-is-wled-and-why-is-everyone-excited-by-it); [HA community on ESPHome LED strip](https://community.home-assistant.io/t/esphome-esp32-led-strip-controller/203658?page=2)
- FastLED is the choice for fine per-LED control from custom firmware; WLED is the plug-and-play option with effects. — [Microcontrollerslab WLED controllers](https://microcontrollerslab.com/?p=48017)
- WLED can be driven by an ESP-NOW remote (pairing process); ESP-NOW and Wi-Fi share one channel, so one ESP acting as both Wi-Fi client and ESP-NOW gateway has limits. — [WLED ESP-NOW remote guide](https://smarthomeshopuk.com/blogs/smart-home-shop/how-to-set-up-a-wled-digital-led-controller-esp32-with-the-wled-wifi-remote); [HA community ESP-NOW with ESPHome](https://community.home-assistant.io/t/esp-now-with-esp-home/536006/14)
- Tasmota exposes `cmnd/<topic>/POWER` over MQTT and `/cm?cmnd=Power%20On` over HTTP, so a relay on a Tasmota ESP is controllable the same way as a Sonoff. — [Tasmota commands](https://tasmota.github.io/docs/Commands/)

### Inferences
- Lowest-risk demo: ESP32 + WS2812 strip with WLED, joined to the same Wi-Fi as the laptop; toggle with `POST /json/state {"on":"t"}`. Avoid wiring mains: drive a relay only with low-voltage loads or a commercial, certified relay/smart plug for any real mains lamp (safety judgement, not from a source).
- Over a hackathon venue's Wi-Fi, client isolation often blocks device-to-device traffic; a phone hotspot or own router is a safer local network (general experience, not sourced). ESP-NOW avoids the router but needs a second ESP as bridge.

### Gaps
- No source on exact WLED HTTP latency; no tested ESP32 relay wiring reference.

## (e) Other devices in view (TVs, projectors, other MacBooks) and "the Mac I am using"

### Takeaway
COCO-pretrained YOLO models already detect `tv` and `laptop`; open-vocabulary prompts can add "monitor", "projector screen". I found no source that separates one Mac from another; marker/screen-content approaches are my own suggestions.

### Cited Findings
- COCO includes `tv` and `laptop` among its 80 classes (no separate "monitor", "projector" or "macbook"). — [Roboflow COCO classes](https://blog.roboflow.com/microsoft-coco-classes/)
- YOLOE visual prompts and text prompts, and YOLO-World custom vocabularies, allow adding classes such as "monitor" or "macbook" without training. — [YOLOE docs](https://docs.ultralytics.com/models/yoloe); [YOLO-World docs](https://docs.ultralytics.com/models/yolo-world)
- IRIS reports high instance-level device recognition (95 to 98 percent, secondary) using DINOv2 features, relevant to telling two similar devices apart. — [Hackster IRIS summary](https://www.hackster.io/news/point-and-click-for-the-real-world-747a0932edc3)
- ArUco/AprilTag tags give unambiguous IDs and pose. — [OpenCV ArUco docs](https://docs.opencv.org/5.0/main_modules/objdetect_aruco.html)

### Inferences
- "The Mac I am using" (my own ideas, untested): (1) have the Mac display a full-screen or corner AprilTag/QR code carrying its hostname when asked (the host program on that Mac controls it; the glasses read it); (2) screen-content matching: the Mac sends a unique colour/pattern flash or a short code on screen, and the glasses' video is checked for it (same idea as lamp blink identification); (3) a sticker tag on the lid. Option 1/2 need the Mac to be running the helper, which fits "the Mac I am using" since it is the one connected to the glasses pipeline.
- Other Macs vs this Mac by appearance alone (DINOv2 embeddings) will likely fail for identical models; do not rely on it.
- For TVs/projector screens, "on" detection can reuse the same brightness-in-box approach; screens are easy to confuse with bright windows.

### Gaps
- No source or benchmark on distinguishing identical laptops, or on screen-content matching from egocentric video.
- No measured detection accuracy for "macbook" or "projector screen" prompts.

## (f) Existing projects: point at a device to control it, gesture control of lights

### Takeaway
Research and commercial prototypes exist (IRIS ring, ShAIdes glasses, Quest 3 apps, a Google AR-camera patent, a webcam "point and snap" project), but I found no turnkey open-source repo for smart-glasses point-and-pinch lamp toggling.

### Cited Findings
- IRIS (UIST 2024): ring camera plus phone-side YOLO/DINOv2; compared favourably with voice in speed and preference (secondary). — [IRIS project](https://iris.cs.washington.edu/); [arXiv](https://arxiv.org/html/2407.18141v1)
- ShAIdes: AI glasses with a frame-mounted camera and a Jetson Nano; code at github.com/nickbild/shaides; whether it controls smart-home devices was not confirmed. — [Hackster ShAIdes](https://www.hackster.io/nickbild/shaides-1ab6f1)
- Point and Snap: webcam plus Node-RED toggling Hue and Sonoff. — [Pinch of Intelligence](https://www.pinchofintelligence.com/point-and-snap-for-my-smart-home/)
- Quest 3: the Immersive Home beta app (look and point at smart-home devices, switch lights with hand gestures); a separate demo controls Govee lights through Govee's API; a Reddit author's mixed-reality interface relies on Home Assistant for automation. — [Mixed News](https://mixed-news.com/en/this-meta-quest-3-app-can-visualize-and-control-smart-home-devices-in-mixed-reality/); [Inverse](https://inverse.com/tech/mixed-reality-quest-3-demo-ar-smart-home); [Reddit thread mirror](https://lr.us.psf.lt/r/selfhosted/comments/1cjfw0j/showcase_of_my_mixed_reality_interface_for_home)
- A Google patent covers pairing an AR camera device with IoT devices where the device pointed at is selected (patent, not a product). — [US12260061B2](https://patents.google.com/patent/US12260061)
- Older work: Insight (Boldu et al., 2017) and PointGrab gesture-controlled home automation are listed in search results. — [Insight paper](https://haimoz.github.io/assets/papers/boldu2017insight.pdf); [Digital Trends PointGrab](https://digitaltrends.com/home/pointgrabs-gesture-controlled-home-automation-system)

### Inferences
- IRIS is the closest published architecture to the planned pipeline (egocentric camera, detector + embedding model for instance ID, phone/laptop-side inference, gesture to act). Reading its evaluation section (not accessible here) is worth doing for latency and failure cases.
- The prior art argues for registering lamps rather than relying on generic "lamp" detection, and for using Home Assistant or a similar hub as the control layer (Quest 3 reports and Point and Snap both did).

### Gaps
- Could not read the IRIS paper, the ShAIdes repo or the Immersive Home app details; none was verified to be open-source or reusable.
- No GitHub repository found for Mentra/smart-glasses point-to-control; a direct GitHub search (for example "pointing gesture IoT", "Home Assistant gesture") was not run.
