// Label completed-file waveform diagnostics; all source data remains local/private.
import AppKit
import Foundation
let root = URL(fileURLWithPath: CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : ".art-work/s88/audio")
let proof = try JSONSerialization.jsonObject(with: Data(contentsOf: root.appendingPathComponent("audio-proof.json"))) as! [String: Any]
let qa = try JSONSerialization.jsonObject(with: Data(contentsOf: root.appendingPathComponent("qa/qa-proof.json"))) as! [String: Any]
let cues = try JSONSerialization.jsonObject(with: Data(contentsOf: root.appendingPathComponent("../video/cues.json"))) as! [String: Any]
let scenes = cues["scenes"] as! [[String: Any]], effects = proof["effects"] as! [[String: Any]], groups = proof["groups"] as! [[String: Any]]
let gold = NSColor(srgbRed: 1, green: 0.8, blue: 0.3, alpha: 1)
let cyan = NSColor(srgbRed: 0.3, green: 0.9, blue: 1, alpha: 1)
let violet = NSColor(srgbRed: 0.6, green: 0.5, blue: 0.8, alpha: 0.65)
func text(_ s: String, _ x: CGFloat, _ y: CGFloat, _ color: NSColor, _ size: CGFloat = 16) {
    (s as NSString).draw(at: CGPoint(x: x, y: y), withAttributes: [.font: NSFont.monospacedSystemFont(ofSize: size, weight: .medium), .foregroundColor: color])
}
func line(_ x: CGFloat, _ y: CGFloat, _ h: CGFloat, _ color: NSColor) {
    color.setStroke(); let p = NSBezierPath(); p.move(to: CGPoint(x: x, y: y)); p.line(to: CGPoint(x: x, y: y+h)); p.lineWidth = 1; p.stroke()
}
for plot in qa["plots"] as! [[String: Any]] where (plot["kind"] as! String) == "wave" {
    let filename = plot["file"] as! String, start = plot["start"] as! Double, duration = plot["duration"] as! Double
    let source = NSBitmapImageRep(data: try Data(contentsOf: URL(fileURLWithPath: filename)))!
    let image = NSImage(cgImage: source.cgImage!, size: NSSize(width: source.pixelsWide, height: source.pixelsHigh))
    let w = source.pixelsWide, h = source.pixelsHigh+180
    let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: w, pixelsHigh: h, bitsPerSample: 8,
        samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
    rep.size = NSSize(width: w, height: h)
    NSGraphicsContext.saveGraphicsState(); NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
    NSColor.black.setFill(); NSBezierPath(rect: CGRect(x: 0, y: 0, width: w, height: h)).fill()
    image.draw(in: CGRect(x: 0, y: 100, width: w, height: source.pixelsHigh))
    text("PV4 AUDIO / \(plot["name"]!) / \(String(format:"%.3f",start))–\(String(format:"%.3f",start+duration))s", 20, CGFloat(h-35), gold, 20)
    text("Local PCM (final/joins/impacts=AAC decoded); gold=music, cyan=impact, violet=cut. No listening approval.", 20, CGFloat(h-65), .white)
    func x(_ t: Double) -> CGFloat { CGFloat((t-start)/duration)*CGFloat(w) }
    for (i, s) in scenes.enumerated() {
        let t=s["start"] as! Double
        if t>=start && t<=start+duration { line(x(t),100,CGFloat(source.pixelsHigh),violet); text("\(s["id"]!) \(t)",min(CGFloat(w-150),max(0,x(t)+3)),CGFloat(10+(i%3)*22),violet,13) }
    }
    for g in groups {
        let t=g["start"] as! Double
        if t>=start && t<=start+duration { line(x(t),100,CGFloat(source.pixelsHigh),gold);text(g["name"] as! String,min(CGFloat(w-100),max(0,x(t)+3)),75,gold,14) }
    }
    for e in effects {
        let t=e["time"] as! Double
        if t>=start && t<=start+duration { line(x(t),100,CGFloat(source.pixelsHigh),cyan);text("\(e["id"]!) @\(t)",min(CGFloat(w-220),max(0,x(t)+3)),CGFloat(h-95),cyan,14) }
    }
    NSGraphicsContext.restoreGraphicsState()
    let target=URL(fileURLWithPath: filename).deletingPathExtension().appendingPathExtension("labelled.png")
    try rep.representation(using: .png, properties: [:])!.write(to: target)
}
// Review sheets retain all zooms; original 1800px labelled images remain available.
let wavePlots = (qa["plots"] as! [[String: Any]]).filter { ($0["kind"] as! String) == "wave" && !($0["name"] as! String).hasPrefix("processed-") }
for page in 0..<((wavePlots.count+7)/8) {
    let batch = Array(wavePlots.dropFirst(page*8).prefix(8)), w = 1800, h = 60+360*((batch.count+1)/2)
    let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: w, pixelsHigh: h, bitsPerSample: 8,
        samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
    rep.size = NSSize(width: w, height: h)
    NSGraphicsContext.saveGraphicsState(); NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
    NSColor.black.setFill(); NSBezierPath(rect: CGRect(x: 0,y: 0,width: w,height: h)).fill()
    text("PV4 AUDIO / ALL ZOOMS / page \(page+1)", 20, CGFloat(h-35), gold, 22)
    for (i, plot) in batch.enumerated() {
        let file = URL(fileURLWithPath: plot["file"] as! String).deletingPathExtension().appendingPathExtension("labelled.png")
        let source = NSBitmapImageRep(data: try Data(contentsOf: file))!
        let image = NSImage(cgImage: source.cgImage!, size: NSSize(width: source.pixelsWide,height: source.pixelsHigh))
        let x = CGFloat(i%2)*900, y = CGFloat(h-60-(i/2+1)*360)
        image.draw(in: CGRect(x: x,y: y+20,width: 900,height: 290))
        text(plot["name"] as! String,x+15,y+325,gold,20)
    }
    NSGraphicsContext.restoreGraphicsState()
    try rep.representation(using: .png,properties: [:])!.write(to: root.appendingPathComponent("qa/zoom-sheet-\(page+1).png"))
}
print("Annotated full waveforms, every musical/biome join and impact; generated all-zoom review sheets.")
