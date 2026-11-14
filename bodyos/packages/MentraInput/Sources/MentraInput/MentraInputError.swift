import Foundation

/// Everything that can go wrong between "grab" and a TargetID. Messages are written for the stage.
public enum MentraInputError: LocalizedError, Equatable {
    case glassesNotReady
    case receiverUnavailable(String)
    case photoFailed(String)
    case photoTimedOut(seconds: Double)
    case unreadablePhoto
    /// The photo had no BodyOS marker. `seen` lists any other QR texts that were found.
    case noMarker(seen: [String])
    case recordingFailed(String)

    public var errorDescription: String? {
        switch self {
        case .glassesNotReady:
            return "Mentra Live is not connected and ready."
        case let .receiverUnavailable(why):
            return "The iPhone could not receive photos from the glasses: \(why)"
        case let .photoFailed(why):
            return "The glasses could not take or send the photo: \(why)"
        case let .photoTimedOut(seconds):
            return "No photo from the glasses after \(Int(seconds)) seconds."
        case .unreadablePhoto:
            return "The photo from the glasses could not be read."
        case let .noMarker(seen):
            return seen.isEmpty
                ? "No BodyOS marker in view. Look straight at the marker and try again."
                : "Only unknown QR codes in view (\(seen.joined(separator: ", ")))."
        case let .recordingFailed(why):
            return "Video recording failed: \(why)"
        }
    }
}
