# Glasses Viewer

A desktop app (Electron + React) to look at what `mentra-glasses-tool` saved:

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

- `npm test`: 6 tests for reading the folder and for refusing files outside it.
- The real app was opened under a virtual display with sample data made by `scripts/record-video.sh`:
  the MP4 played and seeked, all photos loaded, the full-size view and the events table worked.
- Not tried on a Mac or with real glasses. Older `.mkv` recordings may not play; the app then shows the
  `ffmpeg` command that turns one into MP4.

## How it is built

- `electron/main.cjs`: the window, and the `media://` address that serves photos and videos to the page.
  Only image and video files inside the data folder are served (symlinks out of it are refused).
- `electron/library.cjs`: reads the data folder (no Electron in it, so it is tested with plain Node)
- `electron/preload.cjs`: the four things the page may ask for
- `src/App.jsx`, `src/styles.css`: the React screens
