import Foundation
import MentraBluetoothSDK

/// Records video on Mentra Live and brings the clip to this iPhone when it stops.
/// For rehearsal recordings and the backup demo run; not part of the targeting flow.
@MainActor
public final class GlassesRecorder: ObservableObject {
    @Published public private(set) var recordingId: String?
    public let glasses: MentraGlasses
    public let receiver: GlassesMediaReceiver
    public let folder: URL

    public init(glasses: MentraGlasses, receiver: GlassesMediaReceiver, folder: URL? = nil) {
        self.glasses = glasses
        self.receiver = receiver
        self.folder = folder ?? FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("MentraCaptures/videos", isDirectory: true)
    }

    /// Start recording. `maxMinutes` stops it by itself as a safety net.
    public func start(width: Int = 1280, height: Int = 720, fps: Int = 30, maxMinutes: Int = 5) async throws {
        guard glasses.isReady else { throw MentraInputError.glassesNotReady }
        guard recordingId == nil else { return }
        let id = "bodyos-video-\(UUID().uuidString.prefix(8).lowercased())"
        do {
            _ = try await glasses.sdk.startVideoRecording(VideoRecordingRequest(
                requestId: id, save: true, sound: false, width: width, height: height, fps: fps,
                maxRecordingTimeMinutes: maxMinutes
            ))
            recordingId = id
        } catch {
            throw MentraInputError.recordingFailed(error.localizedDescription)
        }
    }

    /// Stop, wait for the upload, and return the saved video file. The clip also stays on the
    /// glasses (`save: true`), so a failed upload does not lose it.
    public func stop(uploadTimeout: TimeInterval = 180) async throws -> URL {
        guard let id = recordingId else { throw MentraInputError.recordingFailed("not recording") }
        recordingId = nil
        try await receiver.start()
        let receiver = receiver
        async let upload = receiver.waitForUpload(requestId: id, timeout: uploadTimeout)
        do {
            _ = try await glasses.sdk.stopVideoRecording(requestId: id, webhookUrl: receiver.uploadURL)
        } catch {
            throw MentraInputError.recordingFailed(error.localizedDescription)
        }
        let media = try await upload
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        let destination = folder.appendingPathComponent("\(id).mp4")
        try? FileManager.default.removeItem(at: destination)
        try FileManager.default.moveItem(at: media.fileURL, to: destination)
        return destination
    }
}
