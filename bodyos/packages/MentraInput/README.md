# MentraInput

The Mentra part of BodyOS: **what is the wearer looking at?** Mentra Live takes a photo, the iPhone
reads the BodyOS QR marker nearest the middle of it, and returns a `TargetID`.

    LOOK + grab gesture --> captureTarget() --> photo from the glasses --> QR markers in it --> .mac / .personBlue / ...

It implements ProductCore's `TargetSource`, so the app swaps `MockTargetSource` for `MentraTargetSource`
and nothing else changes.

## Status: read this first

- **Never compiled.** It was written in a Linux container with no Swift toolchain. Expect a first round
  of small compile fixes in Xcode.
- The Mentra calls follow the **real `MentraBluetoothSDK` 3.4.0 source** (read from Mentra's repository at
  tag `3.4.0`), not guesses. The glasses must run Mentra Live software **3.4.0** too; update them with
  Mentra's example app.
- Never run against real glasses. The QR markers in `markers/` were checked with an independent decoder
  (OpenCV), at full size and shrunk and blurred.

## Where it goes in the-force

Copy this folder to `packages/MentraInput/`. It expects `packages/ProductCore` next to it, with the
shared types from the plan:

```swift
public enum TargetID: String, Codable { case mac, externalDisplay, gimbal, personRed, personBlue }
public protocol TargetSource { func captureTarget() async throws -> TargetID }
```

If ProductCore names them differently, change the `import ProductCore` users: `TargetMarker.swift`,
`TargetPicker.swift`, `MentraTargetSource.swift`, `MockTargetSource.swift`.

## Using it in the iOS app

```swift
import MentraInput

let glasses = MentraGlasses()                       // Bluetooth link; show glasses.status in the UI
let photos = MentraPhotoSource(glasses: glasses)     // photo -> this iPhone over Wi-Fi (Bluetooth fallback)
let targets: TargetSource = MentraTargetSource(photos: photos)   // or MockTargetSource() before hardware

// First run: glasses.scan(), show glasses.found, the person taps theirs: glasses.connect(device)
// Later runs: glasses.connectSaved()
// During the demo: photos.keepWarm()   (faster photos; costs battery)

let target = try await targets.captureTarget()      // .mac, .externalDisplay, .gimbal, .personRed, .personBlue
```

Pairing: glasses with no paired phone are in pairing mode after start-up; otherwise press the power
button **3 times** (2-minute window, the glasses say a 4-character code). `Device.pairingCode` holds that
code: show it in the list so the person picks the right glasses. The scan never connects by itself.

## Files

| File | What it does |
|---|---|
| `TargetMarker.swift` | QR text <-> `TargetID` for the five markers (exact texts only) |
| `MarkerDecoder.swift` | Finds QR codes in a photo with Apple Vision (`VNDetectBarcodesRequest`), on the device |
| `TargetPicker.swift` | Several markers in view: the one nearest the middle wins; a much bigger one wins a near-tie |
| `MentraGlasses.swift` | Scan, pick, connect, reconnect; publishes `status` (`disconnected` / `scanning` / `connecting` / `ready`) |
| `GlassesMediaReceiver.swift` | Small HTTP server on the iPhone (port 8787) the glasses upload photos and videos to |
| `PhotoSource.swift` | `MentraPhotoSource`: `requestPhoto` with this iPhone as the upload address; camera warm-up |
| `MentraTargetSource.swift` | The real `TargetSource`: photo, decode, pick; 2 photos before "no marker" |
| `CaptureLog.swift` | Saves every capture photo and what was read in it, in Documents/MentraCaptures; `hitRate()` for the 9/10 goal |
| `GlassesRecorder.swift` | Record a video clip on the glasses and bring it to the iPhone (rehearsal recordings) |
| `MockTargetSource.swift` | Scripted answers for the mocked product; `setNext(_:)`, `failNext()` for buttons |
| `MentraInputError.swift` | The errors, with messages written for the stage |
| `markers/*.png` | The five markers to print (QR with high error correction, label underneath) |

## How the photo gets to the iPhone

Bluetooth carries the command only. The glasses upload the JPEG **over Wi-Fi** to `GlassesMediaReceiver`
on the iPhone (`http://<iPhone's Wi-Fi address>:8787/upload`). If Wi-Fi does not work, the SDK brings the
photo over Bluetooth and this iPhone uploads it to itself: slower (a few seconds), but it still works.
So: put the glasses on the team's private router (Mentra's example app, System tab, Wi-Fi), same as the iPhone.

Mentra's SDK **3.5.0 dev** builds add `PhotoRequest(localFile: true)` (photo over Bluetooth straight to a
file, no receiver). 3.4.0 does not have it, so this package does not use it yet.

## The app's Info.plist (integration lead)

- `NSBluetoothAlwaysUsageDescription`: "Connect to your Mentra Live glasses."
- `NSLocalNetworkUsageDescription`: "Receive photos from your glasses on the local network."
- `NSAppTransportSecurity` → `NSAllowsLocalNetworking` = YES (the Bluetooth fallback uploads over plain http on the LAN)
- Optional, to see `MentraCaptures` in the Files app: `UIFileSharingEnabled` and `LSSupportsOpeningDocumentsInPlace` = YES

## Tests

`swift test` on a Mac (needs `../ProductCore`). `MarkerTests.swift` covers the marker texts, the picker,
and a real Vision decode of generated markers (no glasses needed). Not yet covered: the upload parser
and the receiver.

## Known limits

- QR markers must be big enough at stage distance: print each marker at least about 20 cm wide for
  3-4 m, and test with `CaptureLog.hitRate()`.
- A photo takes roughly a second on Wi-Fi with the camera warm, several seconds over the Bluetooth fallback.
  These are estimates: no timing was measured.
- Mentra Live gives no raw accelerometer or gyroscope (only head up/down), so motion comes from the Vexo band.
