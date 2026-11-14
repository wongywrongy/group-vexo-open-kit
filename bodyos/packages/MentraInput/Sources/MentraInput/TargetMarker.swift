import Foundation
import ProductCore

/// The five printed QR markers and the target each one stands for.
///
///     bodyos://device/mac               -> .mac
///     bodyos://device/external-display  -> .externalDisplay
///     bodyos://device/gimbal            -> .gimbal
///     bodyos://person/red               -> .personRed
///     bodyos://person/blue              -> .personBlue
public enum TargetMarker {
    public static let payloads: [String: TargetID] = [
        "bodyos://device/mac": .mac,
        "bodyos://device/external-display": .externalDisplay,
        "bodyos://device/gimbal": .gimbal,
        "bodyos://person/red": .personRed,
        "bodyos://person/blue": .personBlue,
    ]

    /// The QR text for a target (what to print), or nil for a target without a marker.
    public static func payload(for target: TargetID) -> String? {
        payloads.first { $0.value == target }?.key
    }

    /// The target a decoded QR text stands for, or nil for any other QR code.
    /// Only exact marker texts count; scheme and host are case-insensitive, spaces around are ignored.
    public static func target(for payload: String) -> TargetID? {
        let text = payload.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let url = URL(string: text),
              url.scheme?.lowercased() == "bodyos",
              let host = url.host?.lowercased(),
              url.query == nil, url.fragment == nil
        else { return nil }
        var path = url.path
        while path.hasSuffix("/") { path.removeLast() }
        return payloads["bodyos://\(host)\(path)"]
    }
}
