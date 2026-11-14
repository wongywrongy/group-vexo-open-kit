import Foundation
import ProductCore

/// The real `TargetSource`: take a photo with the glasses, read the BodyOS QR marker nearest
/// the middle of it, return its `TargetID`.
///
/// Swap it in for `MockTargetSource` once the glasses work; nothing else in the app changes.
@MainActor
public final class MentraTargetSource: TargetSource {
    public let photos: PhotoSource
    public let decoder: MarkerDecoding
    public let log: CaptureLog?
    /// Photos to try per look before reporting "no marker" (each takes about a second on Wi-Fi).
    public var attempts: Int

    public init(photos: PhotoSource, decoder: MarkerDecoding = VisionMarkerDecoder(), log: CaptureLog? = CaptureLog(), attempts: Int = 2) {
        self.photos = photos
        self.decoder = decoder
        self.log = log
        self.attempts = attempts
    }

    public func captureTarget() async throws -> TargetID {
        var lastError: Error = MentraInputError.noMarker(seen: [])
        for attempt in 1...max(1, attempts) {
            var photo: CapturedPhoto?
            do {
                photo = try await photos.capturePhoto()
                let codes = try await decoder.decode(photo!.data)
                let chosen = TargetPicker.pick(codes)
                log?.add(photo: photo, attempt: attempt, target: chosen?.target?.rawValue,
                         payloads: codes.map(\.payload), error: nil)
                if let target = chosen?.target { return target }
                lastError = MentraInputError.noMarker(seen: codes.map(\.payload))
            } catch {
                log?.add(photo: photo, attempt: attempt, target: nil, payloads: [], error: error)
                lastError = error
                // Retrying cannot help these.
                if case MentraInputError.glassesNotReady = error { throw error }
                if error is CancellationError { throw error }
            }
        }
        throw lastError
    }
}
