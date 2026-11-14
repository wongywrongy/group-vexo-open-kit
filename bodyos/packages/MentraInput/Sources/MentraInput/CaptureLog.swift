import Foundation

/// What happened on one "look": kept with the photo so misses can be checked afterwards.
public struct CaptureRecord: Codable, Identifiable, Sendable {
    public let id: String
    public let time: Date
    public let attempt: Int
    /// The target picked, as its raw value (`personBlue`), or nil.
    public let target: String?
    /// Every QR text seen in the photo.
    public let payloads: [String]
    /// Photo file name inside the log folder.
    public let photoFile: String?
    /// From asking for the photo to having it on the iPhone.
    public let photoMilliseconds: Int?
    public let error: String?
}

/// Saves every capture photo (the glasses' "screenshot") and what was decoded in it, in the
/// app's Documents/MentraCaptures folder. Shows in the Files app when the app enables file sharing.
/// Use it to check the 9/10 marker-reading goal at stage distance.
@MainActor
public final class CaptureLog: ObservableObject {
    @Published public private(set) var records: [CaptureRecord] = []
    public let folder: URL
    public var keep: Int

    public init(folder: URL? = nil, keep: Int = 300) {
        self.folder = folder ?? FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("MentraCaptures", isDirectory: true)
        self.keep = keep
        try? FileManager.default.createDirectory(at: self.folder, withIntermediateDirectories: true)
    }

    /// Save a photo (if any) and its result. Never throws: logging must not break a demo.
    @discardableResult
    public func add(photo: CapturedPhoto?, attempt: Int, target: String?, payloads: [String], error: Error?) -> CaptureRecord {
        let id = photo?.requestId ?? "fail-\(UUID().uuidString.prefix(8).lowercased())"
        let stamp = Self.stamp.string(from: Date())
        var photoFile: String?
        if let photo {
            let name = "\(stamp)_\(id).jpg"
            if (try? photo.data.write(to: folder.appendingPathComponent(name), options: .atomic)) != nil { photoFile = name }
        }
        let record = CaptureRecord(
            id: id, time: Date(), attempt: attempt, target: target, payloads: payloads,
            photoFile: photoFile, photoMilliseconds: photo?.milliseconds,
            error: error.map { ($0 as? LocalizedError)?.errorDescription ?? String(describing: $0) }
        )
        if let json = try? Self.encoder.encode(record) {
            try? json.write(to: folder.appendingPathComponent("\(stamp)_\(id).json"), options: .atomic)
        }
        records.append(record)
        if records.count > 100 { records.removeFirst(records.count - 100) }
        prune()
        return record
    }

    /// Where a record's photo is, for showing it.
    public func photoURL(_ record: CaptureRecord) -> URL? {
        record.photoFile.map { folder.appendingPathComponent($0) }
    }

    /// Share of the last `n` looks that found a marker (for the 9/10 check).
    public func hitRate(last n: Int = 10) -> Double? {
        let recent = records.suffix(n)
        guard !recent.isEmpty else { return nil }
        return Double(recent.filter { $0.target != nil }.count) / Double(recent.count)
    }

    private func prune() {
        guard let files = try? FileManager.default.contentsOfDirectory(at: folder, includingPropertiesForKeys: nil)
            .filter({ ["jpg", "json"].contains($0.pathExtension) })
            .sorted(by: { $0.lastPathComponent < $1.lastPathComponent }),
            files.count > keep * 2
        else { return }
        for file in files.prefix(files.count - keep * 2) { try? FileManager.default.removeItem(at: file) }
    }

    private static let stamp: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "en_US_POSIX")
        f.dateFormat = "yyyyMMdd-HHmmss-SSS"
        return f
    }()

    private static let encoder: JSONEncoder = {
        let e = JSONEncoder()
        e.outputFormatting = [.prettyPrinted, .sortedKeys]
        e.dateEncodingStrategy = .iso8601
        return e
    }()
}
