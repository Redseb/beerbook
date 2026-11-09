// Makes the demo beers' stickers: each photo in a folder becomes assets/demo/NN-sticker.png
// where Vision finds a subject, cut out exactly as the app's Swift module cuts a picked photo
// (modules/apple/Stickers.swift, copied below). The photos themselves are not kept; shrink the
// stickers after (`sips -Z 600 assets/demo/*-sticker.png`).
//   swift tools/demo-stickers.swift ~/Desktop/beer assets/demo
import CoreImage
import Foundation
import ImageIO
import UniformTypeIdentifiers
import Vision

enum Failure: Error { case unsupported, unreadable, nothingFound, unwritable }

enum Stickers {
    static let workingSize = 1600

    static func cut(_ source: URL, to target: URL) throws -> (Int, Int) {
        guard #available(iOS 17.0, macOS 14.0, *) else { throw Failure.unsupported }
        guard let image = CGImageSourceCreateWithURL(source as CFURL, nil),
              let upright = CGImageSourceCreateThumbnailAtIndex(image, 0, [
                  kCGImageSourceCreateThumbnailFromImageAlways: true,
                  kCGImageSourceCreateThumbnailWithTransform: true, // EXIF orientation applied
                  kCGImageSourceThumbnailMaxPixelSize: workingSize,
              ] as CFDictionary) else { throw Failure.unreadable }

        let request = VNGenerateForegroundInstanceMaskRequest()
        let handler = VNImageRequestHandler(cgImage: upright)
        // The Simulator has no model for it: a thrown error is "unsupported" here.
        do { try handler.perform([request]) } catch { throw Failure.unsupported }
        guard let found = request.results?.first, !found.allInstances.isEmpty else { throw Failure.nothingFound }
        let lifted = try found.generateMaskedImage(ofInstances: found.allInstances, from: handler, croppedToInstancesExtent: true)
        return try write(sticker(from: CIImage(cvPixelBuffer: lifted)), to: target)
    }

    /// The subject over its white die-cut edge over a soft shadow, on a clear canvas.
    static func sticker(from subject: CIImage) -> CIImage {
        let size = subject.extent.size
        let edge = max(14, (max(size.width, size.height) * 0.055).rounded())
        let pad = edge * 2.5
        let placed = subject.transformed(by: CGAffineTransform(translationX: pad - subject.extent.minX, y: pad - subject.extent.minY))
        let canvas = CGRect(x: 0, y: 0, width: size.width + pad * 2, height: size.height + pad * 2)

        // The silhouette grown by `edge` (in two passes: the filter's radius is bounded),
        // its alpha made solid, since Vision's mask fades at the subject's edge and a faded
        // edge reads as a halo, then softened a hair so the cut isn't jagged.
        let grown = placed
            .applyingFilter("CIMorphologyMaximum", parameters: [kCIInputRadiusKey: edge / 2])
            .applyingFilter("CIMorphologyMaximum", parameters: [kCIInputRadiusKey: edge / 2])
            .applyingFilter("CIColorMatrix", parameters: [
                "inputAVector": CIVector(x: 0, y: 0, z: 0, w: 6),
                "inputBiasVector": CIVector(x: 0, y: 0, z: 0, w: -0.6),
            ])
            .applyingFilter("CIColorClamp")
            .applyingGaussianBlur(sigma: 1.5)
            .cropped(to: canvas)
        let white = grown.applyingFilter("CIColorMatrix", parameters: [
            "inputRVector": CIVector(x: 0, y: 0, z: 0, w: 0),
            "inputGVector": CIVector(x: 0, y: 0, z: 0, w: 0),
            "inputBVector": CIVector(x: 0, y: 0, z: 0, w: 0),
            "inputAVector": CIVector(x: 0, y: 0, z: 0, w: 1),
            "inputBiasVector": CIVector(x: 1, y: 1, z: 1, w: 0),
        ])
        // The same shape in a translucent brown, blurred and dropped a little (Core Image's y is up).
        let shadow = grown.applyingFilter("CIColorMatrix", parameters: [
            "inputRVector": CIVector(x: 0, y: 0, z: 0, w: 0),
            "inputGVector": CIVector(x: 0, y: 0, z: 0, w: 0),
            "inputBVector": CIVector(x: 0, y: 0, z: 0, w: 0),
            "inputAVector": CIVector(x: 0, y: 0, z: 0, w: 0.28),
            "inputBiasVector": CIVector(x: 0.22, y: 0.14, z: 0.06, w: 0),
        ])
        .applyingGaussianBlur(sigma: edge * 0.45)
        .transformed(by: CGAffineTransform(translationX: 0, y: -edge * 0.35))

        return placed.composited(over: white.composited(over: shadow)).cropped(to: canvas)
    }

    static func write(_ image: CIImage, to target: URL) throws -> (Int, Int) {
        try FileManager.default.createDirectory(at: target.deletingLastPathComponent(), withIntermediateDirectories: true)
        let context = CIContext()
        guard let space = CGColorSpace(name: CGColorSpace.sRGB),
              let cg = context.createCGImage(image, from: image.extent, format: .RGBA8, colorSpace: space),
              let out = CGImageDestinationCreateWithURL(target as CFURL, UTType.png.identifier as CFString, 1, nil) else {
            throw Failure.unwritable
        }
        CGImageDestinationAddImage(out, cg, nil)
        guard CGImageDestinationFinalize(out) else { throw Failure.unwritable }
        return (cg.width, cg.height)
    }
}

let args = CommandLine.arguments
let from = URL(fileURLWithPath: (args[1] as NSString).expandingTildeInPath)
let to = URL(fileURLWithPath: args[2])
let photos = try FileManager.default.contentsOfDirectory(at: from, includingPropertiesForKeys: nil)
    .filter { ["jpg", "jpeg", "png", "heic"].contains($0.pathExtension.lowercased()) }
    .sorted { $0.lastPathComponent < $1.lastPathComponent }
for (i, photo) in photos.enumerated() {
    let stem = String(format: "%02d", i)
    do {
        let (w, h) = try Stickers.cut(photo, to: to.appendingPathComponent("\(stem)-sticker.png"))
        print("\(stem) \(photo.lastPathComponent): sticker \(w)×\(h)")
    } catch {
        print("\(stem) \(photo.lastPathComponent): no sticker (\(error))")
    }
}
