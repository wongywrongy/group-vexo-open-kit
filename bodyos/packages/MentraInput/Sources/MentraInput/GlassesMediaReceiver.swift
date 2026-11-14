import Foundation
import Network

/// A file the glasses uploaded to the iPhone.
public struct ReceivedMedia: Sendable {
    public enum Kind: String, Sendable { case photo, video }
    public let kind: Kind
    public let requestId: String
    public let fileURL: URL
    public let byteCount: Int
    public let receivedAt: Date
}

/// A tiny HTTP server on the iPhone that Mentra Live uploads photos and videos to.
///
/// The glasses send `POST /upload` as multipart/form-data with a `photo` or `video` file and a
/// `requestId` field, straight over Wi-Fi, or (when Wi-Fi fails) over Bluetooth with the
/// SDK on this iPhone doing the upload. Nothing leaves the local network.
public final class GlassesMediaReceiver: @unchecked Sendable {
    public static let defaultPort: UInt16 = 8787
    static let maxUploadBytes = 200 * 1024 * 1024 // a few minutes of 720p video

    private let queue = DispatchQueue(label: "bodyos.mentra.media-receiver")
    private let directory: URL
    private var listener: NWListener?
    private var waiters: [String: CheckedContinuation<ReceivedMedia, Error>] = [:] // guarded by queue
    private var early: [String: ReceivedMedia] = [:] // uploads that arrived before anyone waited
    private var abandoned: Set<String> = [] // waits given up before they were registered
    public private(set) var port: UInt16 = 0

    /// Called on a background queue for every upload (for logging or a debug screen).
    public var onUpload: ((ReceivedMedia) -> Void)?

    public init(directory: URL? = nil) {
        self.directory = directory ?? FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("MentraUploads", isDirectory: true)
    }

    /// Start listening (once). Returns the port.
    @discardableResult
    public func start(port wanted: UInt16 = GlassesMediaReceiver.defaultPort) async throws -> UInt16 {
        if listener != nil { return port }
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        guard let nwPort = NWEndpoint.Port(rawValue: wanted) else { throw MentraInputError.receiverUnavailable("bad port \(wanted)") }
        let listener = try NWListener(using: .tcp, on: nwPort)
        self.listener = listener
        listener.newConnectionHandler = { [weak self] connection in self?.accept(connection) }
        try await withCheckedThrowingContinuation { (cont: CheckedContinuation<Void, Error>) in
            let once = OnceFlag() // the state handler runs on `queue`; resume only once
            listener.stateUpdateHandler = { state in
                guard !once.done else { return }
                switch state {
                case .ready:
                    once.done = true
                    cont.resume()
                case let .failed(error):
                    once.done = true
                    cont.resume(throwing: MentraInputError.receiverUnavailable(error.localizedDescription))
                default:
                    break
                }
            }
            listener.start(queue: queue)
        }
        port = listener.port?.rawValue ?? wanted
        return port
    }

    public func stop() {
        listener?.cancel()
        listener = nil
        queue.async {
            for (_, waiter) in self.waiters { waiter.resume(throwing: CancellationError()) }
            self.waiters.removeAll()
            self.early.removeAll()
        }
    }

    /// The address to give the glasses. Uses the iPhone's Wi-Fi address so both the glasses'
    /// direct Wi-Fi upload and the Bluetooth fallback (uploaded by this iPhone) can reach it.
    public var uploadURL: String {
        "http://\(LocalAddress.wifiIPv4() ?? "127.0.0.1"):\(port)/upload"
    }

    /// Wait for the upload with this request id (it may already have arrived).
    public func waitForUpload(requestId: String, timeout: TimeInterval) async throws -> ReceivedMedia {
        try await withThrowingTaskGroup(of: ReceivedMedia.self) { group in
            group.addTask {
                try await withCheckedThrowingContinuation { cont in
                    self.queue.async {
                        if self.abandoned.remove(requestId) != nil {
                            cont.resume(throwing: CancellationError())
                        } else if let media = self.early.removeValue(forKey: requestId) {
                            cont.resume(returning: media)
                        } else {
                            self.waiters[requestId] = cont
                        }
                    }
                }
            }
            group.addTask {
                try await Task.sleep(nanoseconds: UInt64(timeout * 1_000_000_000))
                throw MentraInputError.photoTimedOut(seconds: timeout)
            }
            defer { group.cancelAll() }
            do {
                let media = try await group.next()!
                return media
            } catch {
                queue.async {
                    if let waiter = self.waiters.removeValue(forKey: requestId) {
                        waiter.resume(throwing: error)
                    } else {
                        self.abandoned.insert(requestId) // its registration has not run yet
                    }
                }
                throw error
            }
        }
    }

    // MARK: - Connections (all on `queue`)

    private func accept(_ connection: NWConnection) {
        connection.start(queue: queue)
        read(connection, buffer: Data(), sentContinue: false)
    }

    private func read(_ connection: NWConnection, buffer: Data, sentContinue: Bool) {
        connection.receive(minimumIncompleteLength: 1, maximumLength: 256 * 1024) { [weak self] data, _, isComplete, error in
            guard let self else { return }
            if error != nil {
                connection.cancel()
                return
            }
            var buffer = buffer
            if let data { buffer.append(data) }
            var sentContinue = sentContinue
            if !sentContinue, let headers = HTTPUpload.headers(in: buffer),
               headers["expect"]?.lowercased().contains("100-continue") == true {
                connection.send(content: Data("HTTP/1.1 100 Continue\r\n\r\n".utf8), completion: .idempotent)
                sentContinue = true
            }
            do {
                if let request = try HTTPUpload.parse(buffer, maxBody: Self.maxUploadBytes) {
                    self.handle(request, on: connection)
                } else if isComplete {
                    self.respond(connection, status: 400, json: #"{"success":false,"error":"incomplete request"}"#)
                } else {
                    self.read(connection, buffer: buffer, sentContinue: sentContinue)
                }
            } catch {
                self.respond(connection, status: error as? UploadError == .tooLarge ? 413 : 400,
                             json: #"{"success":false,"error":"bad request"}"#)
            }
        }
    }

    private func handle(_ request: HTTPUpload, on connection: NWConnection) {
        if request.method == "GET", request.path == "/health" {
            respond(connection, status: 200, json: #"{"success":true}"#)
            return
        }
        guard request.method == "POST", request.path == "/upload",
              let boundary = Multipart.boundary(from: request.headers["content-type"])
        else {
            respond(connection, status: 404, json: #"{"success":false,"error":"not found"}"#)
            return
        }
        let parts = Multipart.parse(request.body, boundary: boundary)
        guard let file = parts.first(where: { ["photo", "video", "file"].contains($0.name) && !$0.data.isEmpty }) else {
            respond(connection, status: 400, json: #"{"success":false,"error":"no photo or video file"}"#)
            return
        }
        let fieldId = parts.first { $0.name == "requestId" }.map { String(decoding: $0.data, as: UTF8.self) }
        let requestId = (fieldId?.trimmingCharacters(in: .whitespacesAndNewlines)).flatMap { $0.isEmpty ? nil : $0 }
            ?? "upload-\(Int(Date().timeIntervalSince1970 * 1000))"
        let kind: ReceivedMedia.Kind = file.name == "video" || (file.contentType ?? "").hasPrefix("video/") ? .video : .photo
        let ext = kind == .video ? "mp4" : "jpg"
        // The request id comes from the network: only safe characters go into the file name.
        let safeId = String(requestId.unicodeScalars.filter { CharacterSet.alphanumerics.contains($0) || "-_".unicodeScalars.contains($0) }.prefix(80))
        let fileURL = directory.appendingPathComponent("\(safeId.isEmpty ? "upload" : safeId)-\(UUID().uuidString.prefix(8)).\(ext)")
        do {
            try file.data.write(to: fileURL, options: .atomic)
        } catch {
            respond(connection, status: 500, json: #"{"success":false,"error":"could not save"}"#)
            return
        }
        let media = ReceivedMedia(kind: kind, requestId: requestId, fileURL: fileURL, byteCount: file.data.count, receivedAt: Date())
        respond(connection, status: 200, json: #"{"success":true,"requestId":"\#(safeId)","bytes":\#(file.data.count)}"#)
        onUpload?(media)
        if let waiter = waiters.removeValue(forKey: requestId) {
            waiter.resume(returning: media)
        } else {
            early[requestId] = media
            if early.count > 50, let oldest = early.min(by: { $0.value.receivedAt < $1.value.receivedAt })?.key {
                early.removeValue(forKey: oldest)
            }
        }
    }

    private func respond(_ connection: NWConnection, status: Int, json: String) {
        let body = Data(json.utf8)
        let head = "HTTP/1.1 \(status) \(status == 200 ? "OK" : "Error")\r\nContent-Type: application/json\r\nContent-Length: \(body.count)\r\nConnection: close\r\n\r\n"
        connection.send(content: Data(head.utf8) + body, completion: .contentProcessed { _ in connection.cancel() })
    }
}

/// Touched only on the receiver's serial queue.
private final class OnceFlag: @unchecked Sendable {
    var done = false
}

/// The iPhone's own address on the Wi-Fi network.
enum LocalAddress {
    static func wifiIPv4() -> String? {
        var list: UnsafeMutablePointer<ifaddrs>?
        guard getifaddrs(&list) == 0, let first = list else { return nil }
        defer { freeifaddrs(list) }
        var fallback: String?
        for pointer in sequence(first: first, next: { $0.pointee.ifa_next }) {
            let entry = pointer.pointee
            guard let addr = entry.ifa_addr, addr.pointee.sa_family == UInt8(AF_INET),
                  (entry.ifa_flags & UInt32(IFF_UP)) != 0, (entry.ifa_flags & UInt32(IFF_LOOPBACK)) == 0
            else { continue }
            var host = [CChar](repeating: 0, count: Int(NI_MAXHOST))
            guard getnameinfo(addr, socklen_t(addr.pointee.sa_len), &host, socklen_t(host.count), nil, 0, NI_NUMERICHOST) == 0 else { continue }
            let ip = String(cString: host)
            if String(cString: entry.ifa_name) == "en0" { return ip } // Wi-Fi on iPhone
            fallback = fallback ?? ip
        }
        return fallback
    }
}
