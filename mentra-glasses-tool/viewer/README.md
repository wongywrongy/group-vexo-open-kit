# Glasses Viewer

A desktop app (Electron + React) for the glasses: watch them **live**, and look at what
`mentra-glasses-tool` saved.

## Live: what the glasses send, as it happens

Mentra Live cannot connect to a Mac by Bluetooth: it pairs with your phone, and Mentra's Bluetooth
SDK only runs on phones. So the live path is:

    glasses --Bluetooth--> phone (MentraOS app) --> Mentra cloud --> recorder on this Mac --> this app

The **Live** page (top of the sidebar) shows:

- the status: *Recorder off*, *Waiting for glasses* or *Glasses connected*
- the newest photo the moment it is saved (or the newest video frame while video is on)
- the glasses' model, battery, head up/down and how many photos so far
- everything the glasses send (photos, button, touch, head, battery, video news), newest first
- **Start recorder** (tick *with video* to also receive video), **Stop**, and the recorder's output

**Receive from glasses** is the quickest route: it starts the Wi-Fi receiver (`npm run receive`) and shows the
*Media upload URL* (with a Copy button) to paste into Mentra's example app (Camera screen, **Use cloud server**).
Photos and clips the glasses send appear at once; tick **with live video** to also receive the live stream.
**Cloud recorder** is the older route through the MentraOS app and ngrok.

**Try demo glasses** starts pretend glasses (`npm run demo` in `mentra-glasses-tool`): photos and
events every few seconds, with no glasses, account or internet. Use it to check everything works.

The recorder sends the live feed on `http://127.0.0.1:3001` (this computer only; never through ngrok).
If you change `LIVE_PORT` in the recorder's `.env`, the app reads it from there.
A recorder started in a terminal (`npm start` or `npm run demo`) shows up here too.

## Saved recordings

- **Recordings**: play the video, see the frame screenshots, and while video is still coming in,
  a **LIVE** view of the newest frame (twice a second)
- **Photo sessions**: all photos in a grid; click one for full size, ← → to move, Esc to close
- **Events**: head up/down, button, touch, battery, photo and stream news, with filters

It picks up new photos and recordings by itself every 2 seconds. "Show in Finder" opens the file's folder.

## Run it

Needs Node 20.12 or newer. In `mentra-glasses-tool/viewer`:

```bash
npm install
```

```bash
npm start
```

`npm start` builds the page and opens the window. It reads `mentra-glasses-tool/data` unless you pick
another folder with the **Data folder** button (the choice is remembered), or start it with
`GLASSES_DATA_DIR=/path/to/data npm start`.

## Tested

- `npm test`: 9 tests (reading the folder, refusing files outside it, the live feed reader and reconnecting).
- The real app was driven under a virtual display: demo glasses started from the app showed
  *Glasses connected*, the newest photo, battery, head and the event list, and **Stop** left a saved session;
  the real recorder started from the app showed *Waiting for glasses*; a recorder started in a terminal was found;
  the receiver started from the app showed its upload URL, and a JPEG and an MP4 sent to it appeared and played at once.
- The real app was opened under a virtual display with sample data made by `scripts/record-video.sh`:
  the MP4 played and seeked, all photos loaded, the full-size view and the events table worked.
- Not tried on a Mac or with real glasses. Older `.mkv` recordings may not play; the app then shows the
  `ffmpeg` command that turns one into MP4.

## How it is built

- `electron/main.cjs`: the window, and the `media://` address that serves photos and videos to the page.
  Only image and video files inside the data folder are served (symlinks out of it are refused).
- `electron/library.cjs`: reads the data folder (no Electron in it, so it is tested with plain Node)
- `electron/live-client.cjs`: listens to the recorder's live feed and reconnects by itself
- `electron/processes.cjs`: starts and stops the recorder, the demo and the video receiver
- `electron/preload.cjs`: the things the page may ask for
- `src/App.jsx`, `src/styles.css`: the React screens
