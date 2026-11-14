import CoreGraphics
import Foundation
import ProductCore

/// Decides which marker the wearer is looking at when a photo shows one or more.
///
/// The glasses' camera points where the head points, so the marker nearest the middle of the
/// photo wins. A clearly bigger marker (closer to the wearer) wins a near-tie.
public enum TargetPicker {
    /// - Returns: the chosen marker, or nil when the photo has no known marker.
    public static func pick(_ codes: [DetectedCode]) -> DetectedCode? {
        let markers = codes.filter { $0.target != nil }
        return markers.min { score($0) < score($1) }
    }

    /// Lower is better: distance from the photo's center, made a little smaller for bigger markers.
    static func score(_ code: DetectedCode) -> CGFloat {
        let box = code.boundingBox
        let dx = box.midX - 0.5
        let dy = box.midY - 0.5
        let distance = (dx * dx + dy * dy).squareRoot()
        let size = max(box.width, box.height) // 0...1 of the photo
        return distance - 0.25 * size
    }
}
