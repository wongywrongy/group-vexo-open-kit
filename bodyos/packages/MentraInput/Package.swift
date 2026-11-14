// swift-tools-version: 5.9
import PackageDescription

// MentraInput: Mentra Live glasses -> "what is the wearer looking at?" (a TargetID).
// Owner: Mentra teammate. Depends on ProductCore for TargetID and TargetSource.
let package = Package(
    name: "MentraInput",
    platforms: [.iOS(.v17), .macOS(.v14)],
    products: [
        .library(name: "MentraInput", targets: ["MentraInput"]),
    ],
    dependencies: [
        .package(path: "../ProductCore"),
        // The glasses' software must be the same release (3.4.0). Change both together.
        .package(url: "https://github.com/Mentra-Community/mentra-bluetooth-sdk-ios.git", exact: "3.4.0"),
    ],
    targets: [
        .target(
            name: "MentraInput",
            dependencies: [
                "ProductCore",
                .product(name: "MentraBluetoothSDK", package: "mentra-bluetooth-sdk-ios"),
            ]
        ),
        .testTarget(name: "MentraInputTests", dependencies: ["MentraInput"]),
    ]
)
