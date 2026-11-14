import CoreGraphics
import CoreImage
import ImageIO
import ProductCore
import UniformTypeIdentifiers
import XCTest
@testable import MentraInput

final class TargetMarkerTests: XCTestCase {
    func testEveryMarkerRoundTrips() {
        let all: [TargetID] = [.mac, .externalDisplay, .gimbal, .personRed, .personBlue]
        for target in all {
            let text = TargetMarker.payload(for: target)
            XCTAssertNotNil(text, "\(target) has no marker")
            XCTAssertEqual(TargetMarker.target(for: text!), target)
        }
    }

    func testExactTextsOnly() {
        XCTAssertEqual(TargetMarker.target(for: "  BODYOS://Device/mac \n"), .mac)
        XCTAssertEqual(TargetMarker.target(for: "bodyos://person/blue/"), .personBlue)
        XCTAssertNil(TargetMarker.target(for: "bodyos://person/green"))
        XCTAssertNil(TargetMarker.target(for: "bodyos://device/mac?x=1"))
        XCTAssertNil(TargetMarker.target(for: "https://device/mac"))
        XCTAssertNil(TargetMarker.target(for: "hello"))
    }
}

final class TargetPickerTests: XCTestCase {
    private func code(_ target: TargetID?, x: CGFloat, y: CGFloat, size: CGFloat = 0.1, text: String = "") -> DetectedCode {
        DetectedCode(payload: text.isEmpty ? (target.flatMap { TargetMarker.payload(for: $0) } ?? "other") : text,
                     target: target,
                     boundingBox: CGRect(x: x - size / 2, y: y - size / 2, width: size, height: size),
                     confidence: 1)
    }

    func testMarkerNearestTheMiddleWins() {
        let picked = TargetPicker.pick([code(.mac, x: 0.1, y: 0.1), code(.externalDisplay, x: 0.55, y: 0.5)])
        XCTAssertEqual(picked?.target, .externalDisplay)
    }

    func testClearlyBiggerMarkerWinsANearTie() {
        let picked = TargetPicker.pick([code(.personRed, x: 0.45, y: 0.5, size: 0.05), code(.personBlue, x: 0.6, y: 0.5, size: 0.5)])
        XCTAssertEqual(picked?.target, .personBlue)
    }

    func testUnknownCodesAreIgnored() {
        XCTAssertNil(TargetPicker.pick([code(nil, x: 0.5, y: 0.5, text: "https://example.com")]))
        XCTAssertNil(TargetPicker.pick([]))
        XCTAssertEqual(TargetPicker.pick([code(nil, x: 0.5, y: 0.5, text: "x"), code(.gimbal, x: 0.9, y: 0.9)])?.target, .gimbal)
    }
}

/// Real Vision decoding of generated markers: proves the decoder and picker without glasses.
final class VisionDecoderTests: XCTestCase {
    func testDecodesAGeneratedMarker() async throws {
        let jpeg = try Self.markerPhoto(["bodyos://person/blue"])
        let codes = try await VisionMarkerDecoder().decode(jpeg)
        XCTAssertEqual(codes.map(\.target), [.personBlue])
    }

    func testPicksTheMarkerInTheMiddle() async throws {
        // Left: mac. Middle: external display.
        let jpeg = try Self.markerPhoto(["bodyos://device/mac", "bodyos://device/external-display"], middleIndex: 1)
        let codes = try await VisionMarkerDecoder().decode(jpeg)
        XCTAssertEqual(Set(codes.compactMap(\.target)), [.mac, .externalDisplay])
        XCTAssertEqual(TargetPicker.pick(codes)?.target, .externalDisplay)
    }

    func testNotAPhotoIsAnError() async {
        do {
            _ = try await VisionMarkerDecoder().decode(Data("not a jpeg".utf8))
            XCTFail("expected an error")
        } catch {
            XCTAssertEqual(error as? MentraInputError, .unreadablePhoto)
        }
    }

    /// A 1600x900 white JPEG with QR codes: the one at `middleIndex` in the center, others at the left.
    static func markerPhoto(_ texts: [String], middleIndex: Int = 0) throws -> Data {
        let width = 1600, height = 900
        let context = CGContext(data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: 0,
                                space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)!
        context.setFillColor(CGColor(red: 1, green: 1, blue: 1, alpha: 1))
        context.fill(CGRect(x: 0, y: 0, width: width, height: height))
        let ci = CIContext()
        var leftSlot = 0
        for (i, text) in texts.enumerated() {
            let filter = CIFilter(name: "CIQRCodeGenerator")!
            filter.setValue(Data(text.utf8), forKey: "inputMessage")
            filter.setValue("M", forKey: "inputCorrectionLevel")
            let qr = filter.outputImage!.transformed(by: CGAffineTransform(scaleX: 8, y: 8))
            let image = ci.createCGImage(qr, from: qr.extent)!
            let side = CGFloat(image.width)
            let origin: CGPoint
            if i == middleIndex {
                origin = CGPoint(x: (CGFloat(width) - side) / 2, y: (CGFloat(height) - side) / 2)
            } else {
                origin = CGPoint(x: 40 + CGFloat(leftSlot) * (side + 40), y: 40)
                leftSlot += 1
            }
            context.interpolationQuality = .none
            context.draw(image, in: CGRect(origin: origin, size: CGSize(width: side, height: side)))
        }
        let output = NSMutableData()
        let destination = CGImageDestinationCreateWithData(output, UTType.jpeg.identifier as CFString, 1, nil)!
        CGImageDestinationAddImage(destination, context.makeImage()!, [kCGImageDestinationLossyCompressionQuality: 0.9] as CFDictionary)
        XCTAssertTrue(CGImageDestinationFinalize(destination))
        return output as Data
    }
}
