// Review sheets made only from exact frames extracted from completed sound MP4s.
import AppKit
import Foundation
let root = URL(fileURLWithPath: ".art-work/pv/final")
let gold = NSColor(srgbRed: 1, green: 224/255, blue: 102/255, alpha: 1)
let dark = NSColor(srgbRed: 13/255, green: 11/255, blue: 20/255, alpha: 1)
let info = try JSONSerialization.jsonObject(with: Data(contentsOf: root.appendingPathComponent("video-info.json"))) as! [[String: Any]]
func load(_ path: String) throws -> NSImage {
    let rep = NSBitmapImageRep(data: try Data(contentsOf: root.appendingPathComponent(path)))!
    return NSImage(cgImage: rep.cgImage!, size: NSSize(width: rep.pixelsWide, height: rep.pixelsHigh))
}
func words(_ text: String, _ x: CGFloat, _ y: CGFloat, _ w: CGFloat, _ h: CGFloat, _ size: CGFloat) {
    var fitted = size
    while fitted > 9 && (text as NSString).size(withAttributes: [.font: NSFont.boldSystemFont(ofSize: fitted)]).width > w { fitted -= 1 }
    (text as NSString).draw(in: CGRect(x: x, y: h-y-fitted*1.6, width: w, height: fitted*1.6), withAttributes: [
        .font: NSFont.boldSystemFont(ofSize: fitted), .foregroundColor: gold])
}
func sheet(_ title: String, _ labels: [String], _ images: [NSImage], _ square: Bool, _ filename: String, _ columns: Int = 3) throws {
    let dense = filename.hasPrefix("fix-")
    let cw: CGFloat = dense ? (square ? 240 : 320) : (square ? 360 : 560)
    let ch: CGFloat = dense ? (square ? 240 : 180) : (square ? 360 : 315), gap: CGFloat = 22
    let w = cw*CGFloat(columns)+gap*CGFloat(columns+1), h = 110 + CGFloat((images.count+columns-1)/columns)*(ch+56) + 20
    let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: Int(w), pixelsHigh: Int(h), bitsPerSample: 8,
        samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
    rep.size = NSSize(width: w, height: h)
    NSGraphicsContext.saveGraphicsState(); NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
    dark.setFill(); NSBezierPath(rect: CGRect(x: 0, y: 0, width: w, height: h)).fill()
    NSGraphicsContext.current!.imageInterpolation = .none
    words("YUSHARIO / FINAL B / 49.5s / \(title)", gap, 15, w-2*gap, h, 24)
    words("EXACT COMPLETED-VIDEO FRAMES / 30fps / labels include frame and time", gap, 55, w-2*gap, h, 18)
    for (i, image) in images.enumerated() {
        let x = gap + CGFloat(i%columns)*(cw+gap), y = 105 + CGFloat(i/columns)*(ch+56)
        image.draw(in: CGRect(x: x, y: h-y-ch, width: cw, height: ch), from: .zero, operation: .sourceOver, fraction: 1)
        words(labels[i], x, y+ch+7, cw, h, 18)
    }
    NSGraphicsContext.restoreGraphicsState()
    try rep.representation(using: .png, properties: [:])!.write(to: root.appendingPathComponent(filename))
}
for record in info {
    let variant = record["name"] as! String, square = variant.hasSuffix("1x1")
    let samples = record["extractions"] as! [[String: Any]]
    func path(_ label: String) -> String { "qa/\(variant)/\(label).png" }
    func labels(_ names: [String]) -> [String] { names.map { name in
        let row = samples.first { ($0["file"] as! String) == path(name) }!
        let time = String(format: "%.3f", (row["frame"] as! NSNumber).doubleValue / 30)
        return name.hasPrefix("fix-f") ? "f\(row["frame"]!) / \(time)s" : "\(name) / f\(row["frame"]!) / \(time)s"
    } }
    // Include every town appearance and both halves of the treasure scene.
    let scenes = (1...25).flatMap { n -> [String] in
        if n == 6 { return ["village", "port", "snow", "desert", "volcano"].map { "biome-\($0)-mid" } }
        if n == 13 { return ["chest-received", "chest-readable"] }
        return [String(format: "s%02d", n)]
    }
    try sheet("\(variant) / ALL 30 SCENES", labels(scenes), try scenes.map { try load(path($0)) }, square, "all-scenes-\(variant).png", 4)
    for page in 0...1 {
        let names = Array(scenes[(page*15)..<(page*15+15)])
        try sheet("\(variant) / scenes \(page+1)", labels(names), try names.map { try load(path($0)) }, square, "qa-boards-\(variant)-\(page+1).png")
    }
    let boundaries = ["port", "snow", "desert", "volcano"].flatMap { theme in ["before", "start", "theme-held", "after"].map { "biome-\(theme)-\($0)" } }
    try sheet("\(variant) / town continuity", labels(boundaries), try boundaries.map { try load(path($0)) }, square, "qa-walk-\(variant).png", 4)
    let interiors = [465, 480, 495, 510, 522, 525, 540, 555, 570, 582].map { String(format: "fix-f%04d", $0) }
    try sheet("\(variant) / current church and inn", labels(interiors), try interiors.map { try load(path($0)) }, square, "qa-interiors-\(variant).png", 5)
    let rewards = ["chest-received", "chest-before-open", "chest-open", "chest-readable", "chest-end", "level-up"]
    try sheet("\(variant) / actual report", labels(rewards), try rewards.map { try load(path($0)) }, square, "qa-rewards-\(variant).png")
    let attacks = (1...5).flatMap { n in ["before", "contact", "after"].map { "hit-\(n)-\($0)" } }
    try sheet("\(variant) / sword contacts", labels(attacks), try attacks.map { try load(path($0)) }, square, "qa-action-\(variant).png")
    let corrected = samples.filter { ($0["file"] as! String).contains("/fix-f") }.map {
        URL(fileURLWithPath: $0["file"] as! String).deletingPathExtension().lastPathComponent
    }
    for offset in stride(from: 0, to: corrected.count, by: 25) {
        let names = Array(corrected[offset..<min(offset+25, corrected.count)])
        try sheet("\(variant) / 0.1s corrected scenes / \(offset/25+1)", labels(names), try names.map { try load(path($0)) }, square,
            "fix-\(variant)-\(offset/25+1).png", 5)
    }
    let ending = ["flash-1", "flash-2", "flash-3", "flash-end", "wipe-mid", "wipe-end", "cta-on",
        "tagline-before", "tagline-on", "tagline-held", "last"]
    try sheet("\(variant) / title continuity", labels(ending), try ending.map { try load(path($0)) }, square, "qa-title-\(variant).png")
}
print("Review sheets refreshed from all four completed sound videos including every 0.1s across the corrected scenes.")
