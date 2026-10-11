// Contact sheets from COMPLETED MP4 extractions, never storyboard/source stills.
import AppKit
import Foundation
let fm = FileManager.default
let base = URL(fileURLWithPath: fm.currentDirectoryPath)
let output = base.appendingPathComponent(CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : ".art-work/s86")
let gold = NSColor(srgbRed: 1, green: 224/255, blue: 102/255, alpha: 1)
let dark = NSColor(srgbRed: 13/255, green: 11/255, blue: 20/255, alpha: 1)
func load(_ path: String) throws -> NSImage {
    let rep = NSBitmapImageRep(data: try Data(contentsOf: output.appendingPathComponent(path)))!
    return NSImage(cgImage: rep.cgImage!, size: NSSize(width: rep.pixelsWide, height: rep.pixelsHigh))
}
func words(_ value: String, _ x: CGFloat, _ y: CGFloat, _ W: CGFloat, _ H: CGFloat, _ size: CGFloat, _ color: NSColor) {
    (value as NSString).draw(in: CGRect(x: x, y: H-y-size*1.6, width: W, height: size*1.6), withAttributes: [
        .font: NSFont.boldSystemFont(ofSize: size), .foregroundColor: color])
}
func sheet(_ name: String, _ labels: [String], _ images: [NSImage], _ square: Bool, _ filename: String) throws {
    let cw: CGFloat = square ? 360 : 560, ch: CGFloat = square ? 360 : 315, gap: CGFloat = 22
    let W = cw*3+gap*4, H = 110 + CGFloat((images.count+2)/3)*(ch+56) + 20
    let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: Int(W), pixelsHigh: Int(H), bitsPerSample: 8,
        samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
    rep.size = NSSize(width: W, height: H)
    NSGraphicsContext.saveGraphicsState(); NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
    dark.setFill(); NSBezierPath(rect: CGRect(x: 0, y: 0, width: W, height: H)).fill()
    NSGraphicsContext.current!.imageInterpolation = .none
    words("AGENT QUEST / PV v2 / 30s / 120 BPM / \(name)", gap, 15, W-2*gap, H, 26, gold)
    words("EXTRACTED FROM COMPLETED MP4 — NOT STORYBOARD ROUGHS", gap, 55, W-2*gap, H, 20, .white)
    for (i, image) in images.enumerated() {
        let x = gap + CGFloat(i%3)*(cw+gap), y = 105 + CGFloat(i/3)*(ch+56)
        image.draw(in: CGRect(x: x, y: H-y-ch, width: cw, height: ch), from: .zero, operation: .sourceOver, fraction: 1)
        words(labels[i], x, y+ch+7, cw, H, 20, gold)
    }
    NSGraphicsContext.restoreGraphicsState()
    try rep.representation(using: .png, properties: [:])!.write(to: output.appendingPathComponent(filename))
}
let times = ["0–1", "1–2", "2–4", "4–6", "6–7", "7–8", "8–8.5", "8.5–10", "10–10.5", "10.5–12", "12–14", "14–15", "15–16", "16–18", "18–19", "19–20", "20–21", "21–22", "22–23", "23–24", "24–26", "26–30"]
for lang in ["ja", "en"] { for ratio in ["16x9", "1x1"] {
    let variant = "pv2-\(lang)-\(ratio)", square = ratio == "1x1"
    for page in 0...1 {
        let cuts = page == 0 ? Array(1...12) : Array(13...22)
        let frames = try cuts.map { try load(String(format: "qa/%@/s%02d.png", variant, $0)) }
        let labels = cuts.map { String(format: "S%02d / %@s", $0, times[$0-1]) }
        try sheet("\(lang.uppercased()) / \(ratio) / \(page+1)", labels, frames, square, "qa-boards-\(lang)-\(ratio)-\(page+1).png")
    }
    let names = (1...4).flatMap { n in ["hit-\(n)-before", "hit-\(n)-contact", "hit-\(n)-after"] }
    try sheet("\(lang.uppercased()) / \(ratio) / ACTION", names, try names.map { try load("qa/\(variant)/\($0).png") }, square, "qa-action-\(lang)-\(ratio).png")
} }
print("8 cut contact sheets + 4 action contact sheets from completed movies.")
