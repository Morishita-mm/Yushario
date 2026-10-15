// Same-frame reshoot comparisons extracted directly from preserved v7 and current sound MP4s.
import AppKit
import Foundation
let root = URL(fileURLWithPath: ".art-work/pv")
let output = root.appendingPathComponent("final/qa/comparison")
try FileManager.default.createDirectory(at: output, withIntermediateDirectories: true)
let old = root.appendingPathComponent("v7-backup/final")
let new = root.appendingPathComponent("final")
// Seven UI groups, including all town themes and the unchanged exact tagline boundary.
let groups: [(String, [Int])] = [
    ("town", [120, 150, 263, 308, 353, 398, 443]),
    ("church", [465, 495, 524]), ("inn", [525, 555, 584]),
    ("report", [735, 765, 855, 944]), ("level", [660, 675, 704]),
    ("party", [945, 1020, 1050, 1080, 1215, 1290]),
    ("logo", [1308, 1323, 1341, 1397, 1398, 1484]),
]
let frames = groups.flatMap { $0.1 }.sorted()
for variant in ["pv-ja-16x9", "pv-en-16x9", "pv-ja-1x1", "pv-en-1x1"] {
    let square = variant.hasSuffix("1x1")
    var directories: [URL] = []
    for (side, base) in [("v7", old), ("current", new)] {
        let directory = output.appendingPathComponent("frames/\(variant)/\(side)")
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/env")
        process.arguments = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", base.appendingPathComponent("\(variant).mp4").path,
            "-vf", "select='\(frames.map { "eq(n,\($0))" }.joined(separator: "+"))'", "-vsync", "0", directory.appendingPathComponent("%03d.png").path]
        try process.run(); process.waitUntilExit()
        precondition(process.terminationStatus == 0, "Completed-video frame extraction failed")
        directories.append(directory)
    }
    for (group, numbers) in groups {
        let cw: CGFloat = square ? 480 : 768, ch: CGFloat = square ? 480 : 432, gap: CGFloat = 20
        let width = cw * 2 + gap * 3, height = 112 + CGFloat(numbers.count) * (ch + 42)
        let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: Int(width), pixelsHigh: Int(height), bitsPerSample: 8,
            samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
        rep.size = NSSize(width: width, height: height)
        NSGraphicsContext.saveGraphicsState(); NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
        NSGraphicsContext.current!.imageInterpolation = .none
        NSColor(srgbRed: 13/255, green: 11/255, blue: 20/255, alpha: 1).setFill()
        NSBezierPath(rect: CGRect(x: 0, y: 0, width: width, height: height)).fill()
        func text(_ value: String, _ x: CGFloat, _ y: CGFloat) {
            (value as NSString).draw(at: CGPoint(x: x, y: height-y-28), withAttributes: [
                .font: NSFont.boldSystemFont(ofSize: 20), .foregroundColor: NSColor.white])
        }
        text("\(variant) / \(group) / exact completed-video frames", gap, 12)
        text("BEFORE / v7 / \(variant.contains("-en-") ? "English" : "Japanese") app", gap, 52)
        text("AFTER / current / \(variant.contains("-en-") ? "English" : "Japanese") app", cw + gap * 2, 52)
        for (row, frame) in numbers.enumerated() {
            let file = String(format: "%03d.png", frames.firstIndex(of: frame)! + 1)
            let y = 104 + CGFloat(row) * (ch + 42)
            for (column, directory) in directories.enumerated() {
                let bitmap = NSBitmapImageRep(data: try Data(contentsOf: directory.appendingPathComponent(file)))!
                let image = NSImage(cgImage: bitmap.cgImage!, size: NSSize(width: bitmap.pixelsWide, height: bitmap.pixelsHigh))
                let x = gap + CGFloat(column) * (cw + gap)
                image.draw(in: CGRect(x: x, y: height-y-ch, width: cw, height: ch), from: .zero, operation: .sourceOver, fraction: 1)
                text("f\(frame) / \(String(format: "%.3f", Double(frame)/30))s", x, y + ch + 4)
            }
        }
        NSGraphicsContext.restoreGraphicsState()
        try rep.representation(using: .png, properties: [:])!.write(to: output.appendingPathComponent("\(variant)-\(group).png"))
    }
}
print("28 comparison sheets: preserved v7 left, current app right; 32 identical timestamps per variant in seven UI groups.")
