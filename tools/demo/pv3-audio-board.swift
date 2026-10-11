// Waveform review sheets; audio decoded from the final MP4, not invented beat graphics.
import AppKit
import Foundation
let root = URL(fileURLWithPath: CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : ".art-work/s87")
let dark = NSColor(srgbRed: 13/255, green: 11/255, blue: 20/255, alpha: 1)
let gold = NSColor(srgbRed: 1, green: 224/255, blue: 102/255, alpha: 1)
let muted = NSColor(srgbRed: 0.6, green: 0.6, blue: 0.7, alpha: 1)
let W: CGFloat = 1920, H: CGFloat = 1540
func text(_ s: String, _ x: CGFloat, _ y: CGFloat, _ size: CGFloat, _ color: NSColor = .white) {
    (s as NSString).draw(at: CGPoint(x: x, y: H-y-size*1.3), withAttributes: [.font: NSFont.boldSystemFont(ofSize: size), .foregroundColor: color])
}
func image(_ path: String, _ x: CGFloat, _ y: CGFloat, _ w: CGFloat, _ h: CGFloat) throws {
    let rep = NSBitmapImageRep(data: try Data(contentsOf: root.appendingPathComponent(path)))!
    NSImage(cgImage: rep.cgImage!, size: NSSize(width: rep.pixelsWide, height: rep.pixelsHigh)).draw(in: CGRect(x: x, y: H-y-h, width: w, height: h))
}
func line(_ x: CGFloat, _ top: CGFloat, _ bottom: CGFloat, _ color: NSColor, _ thickness: CGFloat = 1) {
    color.setStroke(); let p = NSBezierPath(); p.lineWidth = thickness
    p.move(to: CGPoint(x: x, y: H-top)); p.line(to: CGPoint(x: x, y: H-bottom)); p.stroke()
}
func render(_ name: String, _ draw: () throws -> Void) throws {
    let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: Int(W), pixelsHigh: Int(H), bitsPerSample: 8,
      samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
    rep.size = NSSize(width: W, height: H); NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
    dark.setFill(); NSBezierPath(rect: CGRect(x: 0, y: 0, width: W, height: H)).fill()
    try draw(); NSGraphicsContext.restoreGraphicsState()
    try rep.representation(using: .png, properties: [:])!.write(to: root.appendingPathComponent(name))
}
try render("audio-comparison.png") {
    text("MAOU DAMASHII / 3 source tracks / decoded waveform comparison", 60, 30, 36, gold)
    text("Source timing (not film timing). Numerical analysis only; human listening remains a user review.", 60, 88, 26)
    let tracks: [(String, String, CGFloat, [CGFloat])] = [
      ("06", "New World / ~158 BPM (79 half-time) / 99.60s", 99.60, [14, 22.78]),
      ("11", "bravery heart / ~180 BPM (90 half-time) / 98.48s / SELECTED", 98.48, [36.5, 38]),
      ("13", "New Land / ~120 BPM pulse / 141.93s", 141.93, [20, 22])]
    for (i, t) in tracks.enumerated() {
      let y: CGFloat = 170 + CGFloat(i)*440
      text("Fantasy \(t.0) / \(t.1)", 60, y, 29, gold)
      try image("audio/wave-fantasy\(t.0).png", 60, y+55, 1800, 290)
      for seconds in stride(from: 0, through: Int(t.2), by: 10) {
        let x = 60 + CGFloat(seconds)/t.2*1800; line(x, y+55, y+345, muted.withAlphaComponent(0.4))
        text("\(seconds)s", x, y+350, 21, muted)
      }
      for seconds in t.3 { let x = 60 + seconds/t.2*1800; line(x, y+55, y+345, gold, 2) }
    }
    text("40-second loudness-matched auditions: audio/maoudamashii-audition06.wav, audition11.wav, audition13.wav", 60, 1480, 23)
}
try render("audio-sync.png") {
    text("PV v3 / 39s / FINAL MP4 audio waveform + editorial timing", 60, 30, 36, gold)
    text("180 BPM: quarter=10 video frames; eighth=5 frames. Pitch/tempo unchanged. AAC verified separately.", 60, 88, 26)
    try image("audio/final-wave.png", 60, 190, 1800, 360)
    for seconds in stride(from: 0, through: 39, by: 1) {
      let x = 60 + CGFloat(seconds)/39*1800; line(x, 190, 550, muted.withAlphaComponent(0.3))
      if seconds%3 == 0 { text("\(seconds)s", x, 555, 22, muted) }
    }
    for (i, c) in [(2.0,"WORLD"),(6,"YOUR AGENTS"),(13,"PRAYER"),(15,"DOZE"),(19.5,"LEVEL"),(21,"BEYOND"),(24,"REVEAL"),(33,"TITLE")].enumerated() {
      let x = 60 + CGFloat(c.0)/39*1800; line(x, 170, 550, gold, 2)
      text(c.1, max(60,min(x-30,1700)), 605 + CGFloat(i%2)*40, 22, gold)
    }
    text("Climax / 28–34s / thin=quarter notes, white=cut, gold=contact/title cue", 60, 730, 29, gold)
    try image("audio/climax-wave.png", 60, 810, 1800, 360)
    for n in 0...18 { line(60 + CGFloat(n)/18*1800, 810, 1170, muted.withAlphaComponent(0.5)) }
    for seconds in 28...34 {
      let x = 60 + CGFloat(seconds-28)/6*1800; line(x, 800, 1170, .white, 2); text("\(seconds)s", x, 1180, 22)
    }
    for seconds in [29.5,30.5,31.5,33.0] { line(60 + CGFloat(seconds-28)/6*1800, 795, 1170, gold, 3) }
    text("Sword onset: 0.5 / 17 / 29.5 / 30.5 / 31.5s; level: 19.5s; flash: 33s; title jingle: 33.1s.", 60, 1280, 27)
    text("One title flash only, 3 video frames. No boss defeat or victory implied by the editorial jingle.", 60, 1340, 26)
    text("Music: Maou Damashii / maou.audio / No source audio distributed in Git or npm.", 60, 1460, 26, gold)
}
print("Audio comparison + completed-MP4 waveform/cut sync sheets written.")
