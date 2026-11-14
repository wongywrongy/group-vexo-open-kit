# mentra-glasses-tool

Records what Mentra Live glasses can send to your Mac: **screenshots, video, and events**
(head up/down, button, touch, battery). It has a door for **accelerometer and gyroscope** samples,
but see "The IMU gap" first: the glasses' SDK does not give you those today.

Nothing here is committed or pushed anywhere. Recordings go to `data/` (git-ignored).

## Quickest way: photos and videos straight from the glasses (no cloud)

Mentra Live sends photos and video clips over **your Wi-Fi** to an address you give it; Bluetooth only
carries the commands. `npm run receive` is that address, on this computer:

1. Connect the glasses in **Mentra's example app** (Mentra's TestFlight build, on an Apple silicon Mac or an
   iPhone; see Mentra's "Update Mentra Live" page). Put the glasses on the **same Wi-Fi** as this computer.
2. Here: `npm run receive` (or **Receive from glasses** in the viewer app). It prints a *Media upload URL*
   such as `http://192.168.1.20:8787/upload`.
3. In Mentra's app: **Camera** screen, turn on **Use cloud server**, paste that URL into **Media upload URL**,
   then take photos or record video. Each photo lands in `data/<time>_mentra-app/photos/`, each clip in
   `data/video/<time>_<id>/recording.mp4`, and both show up at once in the viewer.
4. Live video: also run `npm run video`, and paste the printed RTMP address into Mentra's **Stream** screen.

Tested here by sending a real JPEG and a real MP4 the way the glasses do (multipart `photo` / `video` plus
`requestId`, the format of Mentra's own receiver). **Not yet tried with real glasses.** Notes:
- Port 8787 is the same one Mentra's own receiver uses; run only one of them (or set `RECEIVER_PORT`).
- While it runs, anyone on the same Wi-Fi can send it files (only JPEG/PNG/WebP photos and MP4 videos are
  kept, up to 300 MB). Set `UPLOAD_TOKEN` to require a token if the app you use sends one, and stop it with
  Ctrl+C when you are done.
- macOS may ask whether Node may accept incoming connections: allow it, or the glasses cannot reach it.

The rest of this page is the older route through the Mentra cloud (MentraOS app + ngrok).

## What is tested and what is not

| Part | Status |
|---|---|
| Saving events, photos, IMU samples; settings checks; photo/video logic; the live feed; the Wi-Fi receiver | Tested here (`npm test`, 23 tests) |
| Video receiver (`scripts/record-video.sh`) | Tested here with a fake RTMP push: it made `recording.mp4`, frame screenshots and `latest.jpg` |
| `/imu` endpoint on the real MentraOS SDK server | Tested here: wrong token refused, good samples saved |
| **Real glasses end to end** (app registration, the tunnel, photos, the stream) | **Not tested.** No glasses were available. The SDK calls were checked against the installed `@mentra/sdk` 2.1.29 type files, not run against a pair of glasses |

Expect to fix small things on first contact with real glasses.

## The IMU gap (accelerometer and gyroscope)

I read both Mentra SDKs as published on npm:

- `@mentra/sdk` 2.1.29 (the one this tool uses): the only motion event is **head up / head down**.
  There is no raw accelerometer or gyroscope stream.
- `@mentra/bluetooth-sdk` 3.4.0: has a setting `setImuEnabled(true)` and a settings field `imu_enabled`,
  but its documented event list has **no event that carries IMU numbers**. Whether Mentra Live has an IMU at all
  is unconfirmed (the docs only expose a `hasIMU` capability flag, and this tool logs the glasses' capabilities
  at the start of each session in `events.jsonl` so you can read the answer).

So today this tool records the head up/down events and nothing more. To get real accel/gyro you would need
one of: a newer SDK or firmware that exposes it, Mentra's support or Discord, or a sensor of your own
(for example the Vexo band on the wrist). The `/imu` door below takes samples from any of those.

## Setup

You need: Node 20.12 or newer, `ffmpeg` (video only; macOS: `brew install ffmpeg`), an
[ngrok](https://ngrok.com) account with a static domain, the MentraOS phone app with the glasses paired.

1. In `mentra-glasses-tool/`: `npm install`
2. At [console.mentra.glass](https://console.mentra.glass) create an app: a unique package name such as
   `com.yourname.glassesrecorder`, Public URL = your ngrok static URL, and add the **camera** permission
   (the exact permission name was not checked: see Mentra's Permissions guide). Copy the app's API key.
3. `cp .env.example .env`, then fill in `PACKAGE_NAME` and `MENTRAOS_API_KEY`. The key lives only in `.env`.
   Never paste it into a chat or commit it.
4. `ngrok http --url=<your-static-domain> 3000` (the command's flags change between ngrok versions)
5. `npm start`, then open the app on the glasses (from the MentraOS phone app).

### Screenshots

Default: one photo every 10 seconds (`PHOTO_INTERVAL_SEC`), plus one on every short button press.
Each photo takes seconds over Bluetooth, so this is for snapshots, not a live feed. Photos are in
`data/<time>_<user>/photos/`.

### Video

Photos and video share one camera, so with `VIDEO=1` photos switch off and screenshots come from the video.

1. Set `VIDEO=1` in `.env`.
2. Terminal A: `npm run video` (waits for the glasses).
3. Terminal B: `npm start`, then open the app on the glasses.

The glasses push RTMP straight to this Mac, so **they must be on the same Wi-Fi as the Mac**
(RTMP from glasses to a local address is documented as possible but was not tried here).
The Mac's address is found automatically; set `RTMP_URL` if it picks the wrong one.
You get `data/video/<time>/recording.mp4`, `frames/` (one screenshot per second) and `latest.jpg`
(newest frame, twice a second): point your vision model at `latest.jpg`.
Only one stream can run at a time. If the app says the camera is busy, stop other Mentra apps.

### IMU samples from any source

Set `INGEST_TOKEN` (a long random value) in `.env`. Then any program can send samples:

```bash
curl -X POST http://localhost:3000/imu \
  -H "Content-Type: application/json" -H "X-Ingest-Token: $INGEST_TOKEN" \
  -d '{"ax":0,"ay":0,"az":1,"gx":0,"gy":0,"gz":0,"t":12345}'
```

A list of samples (up to 500) is accepted too. They land in `imu.jsonl` of the open glasses session.
The ngrok address is public, so keep the token secret; with `INGEST_TOKEN` empty the door is closed.

## See it live, and the photos and recordings

`viewer/` is a desktop app for that: `cd viewer`, `npm install`, `npm start`. See `viewer/README.md`.
Its **Live** page shows what the glasses send as it arrives, and can start and stop the recorder.
The recorder sends it a live feed on `http://127.0.0.1:3001` (`LIVE_PORT`; this computer only, never through ngrok).

No glasses yet? `npm run demo` runs pretend glasses through the same recording code: photos and events
every few seconds into `data/`, and into the viewer's Live page. No account, key or internet needed.

## What gets saved

```
data/<time>_<user>/
  events.jsonl   one JSON per line: session_start (with the glasses' capabilities), head_position,
                 button, touch, battery, photo, photo_error, stream_status, session_end
  imu.jsonl      raw samples, only if something sent them
  photos/        photo_000001_<ms>.jpg ...
data/video/<time>/
  recording.mp4  frames/  latest.jpg
```

Every record has `time` in milliseconds since 1970 (the Mac's clock when it arrived).
Line this up with other devices by measuring the delay yourself; none was measured here.

## Privacy

The camera light is on while photos or video are taken. Tell people near you before you record, and stop when
they ask. Recordings can contain faces and screens: keep `data/` off shared drives and out of git.

## Files

- `src/server.mjs`: the app server and the `/imu` door
- `src/recording.mjs`: records one session and passes its events to the live feed
- `src/live.mjs`: the live feed for the viewer (127.0.0.1 only)
- `src/demo.mjs`: pretend glasses (`npm run demo`)
- `src/receiver.mjs`: takes photos and videos straight from the glasses over Wi-Fi (`npm run receive`)
- `src/session.mjs`: photos, events and video for one glasses session
- `src/store.mjs`: writes the files, checks IMU samples, keeps names safe
- `src/config.mjs`: reads and checks `.env`
- `scripts/record-video.sh`: the video receiver
- `test/`: `npm test`
- `viewer/`: the desktop app to look at the recordings
