import Foundation

/// A complete HTTP/1.1 request read from a socket. Only what the glasses' uploader sends:
/// a request line, headers and a Content-Length body (no chunked encoding).
struct HTTPUpload: Equatable {
    let method: String
    let path: String
    let headers: [String: String] // lower-cased names
    let body: Data

    static let headerEnd = Data("\r\n\r\n".utf8)

    /// Just the headers, once they have arrived (to answer `Expect: 100-continue` early).
    static func headers(in buffer: Data) -> [String: String]? {
        guard let end = buffer.range(of: headerEnd) else { return nil }
        let text = String(decoding: buffer[buffer.startIndex..<end.lowerBound], as: UTF8.self)
        return parseHeaderLines(text.components(separatedBy: "\r\n").dropFirst())
    }

    /// The request once all of it has arrived, else nil (keep reading).
    /// Throws when the request can never be valid.
    static func parse(_ buffer: Data, maxBody: Int) throws -> HTTPUpload? {
        guard let end = buffer.range(of: headerEnd) else {
            if buffer.count > 16 * 1024 { throw UploadError.headersTooLarge }
            return nil
        }
        let text = String(decoding: buffer[buffer.startIndex..<end.lowerBound], as: UTF8.self)
        let lines = text.components(separatedBy: "\r\n")
        let parts = lines.first?.split(separator: " ") ?? []
        guard parts.count >= 2 else { throw UploadError.badRequestLine }
        let headers = parseHeaderLines(lines.dropFirst())
        if headers["transfer-encoding"]?.lowercased().contains("chunked") == true { throw UploadError.chunkedNotSupported }
        let length = Int(headers["content-length"] ?? "0") ?? -1
        guard length >= 0 else { throw UploadError.badContentLength }
        guard length <= maxBody else { throw UploadError.tooLarge }
        let bodyStart = end.upperBound
        guard buffer.count - (bodyStart - buffer.startIndex) >= length else { return nil }
        let path = String(parts[1]).components(separatedBy: "?").first ?? "/"
        return HTTPUpload(
            method: String(parts[0]).uppercased(),
            path: path,
            headers: headers,
            body: buffer.subdata(in: bodyStart..<(bodyStart + length))
        )
    }

    private static func parseHeaderLines<S: Sequence>(_ lines: S) -> [String: String] where S.Element == String {
        var headers: [String: String] = [:]
        for line in lines {
            guard let colon = line.firstIndex(of: ":") else { continue }
            let name = line[..<colon].trimmingCharacters(in: .whitespaces).lowercased()
            let value = line[line.index(after: colon)...].trimmingCharacters(in: .whitespaces)
            headers[name] = value
        }
        return headers
    }
}

enum UploadError: Error, Equatable {
    case headersTooLarge, badRequestLine, chunkedNotSupported, badContentLength, tooLarge, notMultipart
}

/// One part of a multipart/form-data body.
struct FormPart: Equatable {
    let name: String
    let filename: String?
    let contentType: String?
    let data: Data
}

enum Multipart {
    /// The boundary from a `Content-Type: multipart/form-data; boundary=...` header.
    static func boundary(from contentType: String?) -> String? {
        guard let contentType, contentType.lowercased().hasPrefix("multipart/form-data") else { return nil }
        for piece in contentType.split(separator: ";") {
            let item = piece.trimmingCharacters(in: .whitespaces)
            if item.lowercased().hasPrefix("boundary=") {
                let value = item.dropFirst("boundary=".count).trimmingCharacters(in: CharacterSet(charactersIn: "\""))
                return value.isEmpty ? nil : value
            }
        }
        return nil
    }

    static func parse(_ body: Data, boundary: String) -> [FormPart] {
        let delimiter = Data("--\(boundary)".utf8)
        let nextDelimiter = Data("\r\n--\(boundary)".utf8)
        let headerEnd = Data("\r\n\r\n".utf8)
        var parts: [FormPart] = []
        guard var cursor = body.range(of: delimiter)?.upperBound else { return [] }

        while cursor < body.endIndex {
            // "--" right after a delimiter ends the body.
            if body[cursor...].starts(with: Data("--".utf8)) { break }
            // Skip the line break after the delimiter.
            if body[cursor...].starts(with: Data("\r\n".utf8)) { cursor += 2 }
            guard let headersEnd = body.range(of: headerEnd, in: cursor..<body.endIndex),
                  let partEnd = body.range(of: nextDelimiter, in: headersEnd.upperBound..<body.endIndex)
            else { break }
            let headerText = String(decoding: body[cursor..<headersEnd.lowerBound], as: UTF8.self)
            var name: String?
            var filename: String?
            var contentType: String?
            for line in headerText.components(separatedBy: "\r\n") {
                let lower = line.lowercased()
                if lower.hasPrefix("content-disposition:") {
                    name = quoted("name", in: line)
                    filename = quoted("filename", in: line)
                } else if lower.hasPrefix("content-type:") {
                    contentType = line.dropFirst("content-type:".count).trimmingCharacters(in: .whitespaces)
                }
            }
            if let name {
                parts.append(FormPart(name: name, filename: filename, contentType: contentType,
                                      data: body.subdata(in: headersEnd.upperBound..<partEnd.lowerBound)))
            }
            cursor = partEnd.upperBound
        }
        return parts
    }

    /// The value of `key="..."` in a header line (`name` must not match inside `filename`).
    private static func quoted(_ key: String, in line: String) -> String? {
        let pattern = "(?:^|[;\\s])" + NSRegularExpression.escapedPattern(for: key) + "=\"([^\"]*)\""
        guard let regex = try? NSRegularExpression(pattern: pattern, options: [.caseInsensitive]),
              let match = regex.firstMatch(in: line, range: NSRange(line.startIndex..., in: line)),
              let range = Range(match.range(at: 1), in: line)
        else { return nil }
        return String(line[range])
    }
}
