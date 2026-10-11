// Contact sheets from exact COMPLETED MP4 frames, including biome boundary details.
import AppKit
import Foundation
let root = URL(fileURLWithPath: CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : ".art-work/s88/video")
let edition = root.lastPathComponent == "final" ? "FINAL / B AUDIO" : "PV4 / SILENT"
let gold = NSColor(srgbRed: 1, green: 224/255, blue: 102/255, alpha: 1)
let dark = NSColor(srgbRed: 13/255, green: 11/255, blue: 20/255, alpha: 1)
let info = try JSONSerialization.jsonObject(with: Data(contentsOf: root.appendingPathComponent("video-info.json"))) as! [[String: Any]]
func load(_ path: String) throws -> NSImage {
    let rep = NSBitmapImageRep(data: try Data(contentsOf: root.appendingPathComponent(path)))!
    return NSImage(cgImage: rep.cgImage!, size: NSSize(width: rep.pixelsWide, height: rep.pixelsHigh))
}
func words(_ text: String, _ x: CGFloat, _ y: CGFloat, _ w: CGFloat, _ h: CGFloat, _ size: CGFloat) {
    (text as NSString).draw(in: CGRect(x: x, y: h-y-size*1.6, width: w, height: size*1.6), withAttributes: [
        .font: NSFont.boldSystemFont(ofSize: size), .foregroundColor: gold])
}
func sheet(_ title: String, _ labels: [String], _ images: [NSImage], _ square: Bool, _ filename: String) throws {
    let cw: CGFloat = square ? 360 : 560, ch: CGFloat = square ? 360 : 315, gap: CGFloat = 22
    let w = cw*3+gap*4, h = 110 + CGFloat((images.count+2)/3)*(ch+56) + 20
    let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: Int(w), pixelsHigh: Int(h), bitsPerSample: 8,
        samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
    rep.size = NSSize(width: w, height: h)
    NSGraphicsContext.saveGraphicsState(); NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
    dark.setFill(); NSBezierPath(rect: CGRect(x: 0, y: 0, width: w, height: h)).fill()
    NSGraphicsContext.current!.imageInterpolation = .none
    words("AGENT QUEST / \(edition) / 49.5s / \(title)", gap, 15, w-2*gap, h, 24)
    words("EXACT FRAMES FROM COMPLETED MP4 — NOT SOURCE ROUGHS", gap, 55, w-2*gap, h, 18)
    for (i, image) in images.enumerated() {
        let x = gap + CGFloat(i%3)*(cw+gap), y = 105 + CGFloat(i/3)*(ch+56)
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
        return "\(name) / f\(row["frame"]!)"
    } }
    for page in 0...1 {
        let cuts = page == 0 ? Array(1...13) : Array(14...25)
        let names = cuts.map { String(format: "s%02d", $0) }
        try sheet("\(variant) / cuts \(page+1)", labels(names), try names.map { try load(path($0)) }, square, "qa-boards-\(variant)-\(page+1).png")
    }
    let boundaries = ["port", "snow", "desert", "volcano"].flatMap { theme in ["before", "start", "after"].map { "biome-\(theme)-\($0)" } }
    try sheet("\(variant) / continuity", labels(boundaries), try boundaries.map { try load(path($0)) }, square, "qa-walk-\(variant).png")
    let rewards = ["chest-received", "chest-before-open", "chest-open", "chest-readable", "chest-end", "level-up"]
    try sheet("\(variant) / rewards", labels(rewards), try rewards.map { try load(path($0)) }, square, "qa-rewards-\(variant).png")
    let attacks = (1...5).flatMap { n in (n == 2 ? ["contact", "after"] : ["before", "contact", "after"]).map { "hit-\(n)-\($0)" } }
    try sheet("\(variant) / contacts", labels(attacks), try attacks.map { try load(path($0)) }, square, "qa-action-\(variant).png")
}
print("8 cut sheets + 4 continuity sheets + 4 reward sheets + 4 action sheets from completed \(edition) MP4s.")
