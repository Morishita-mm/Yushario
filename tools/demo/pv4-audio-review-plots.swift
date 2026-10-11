// S8.8-M2 before/after 10ms RMS comparison; local evidence, not listening approval.
import AppKit
import Foundation
let root = URL(fileURLWithPath: CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : ".art-work/s88/audio/qa/m2")
let traces = try JSONSerialization.jsonObject(with: Data(contentsOf: root.appendingPathComponent("rms-10ms.json"))) as! [[String: Double]]
let evidence = try JSONSerialization.jsonObject(with: Data(contentsOf: root.appendingPathComponent("independent-analysis.json"))) as! [String: Any]
let gold = NSColor(srgbRed: 1,green: 0.8,blue: 0.3,alpha: 1)
let cyan = NSColor(srgbRed: 0.3,green: 0.9,blue: 1,alpha: 1)
let w: CGFloat = 1800, h: CGFloat = 850
let rep = NSBitmapImageRep(bitmapDataPlanes: nil,pixelsWide: Int(w),pixelsHigh: Int(h),bitsPerSample: 8,
    samplesPerPixel: 4,hasAlpha: true,isPlanar: false,colorSpaceName: .deviceRGB,bytesPerRow: 0,bitsPerPixel: 0)!
rep.size = NSSize(width: w,height: h)
func text(_ s: String,_ x: CGFloat,_ y: CGFloat,_ color: NSColor = .white,_ size: CGFloat = 20) {
    (s as NSString).draw(at: CGPoint(x: x,y: y),withAttributes: [.font: NSFont.monospacedSystemFont(ofSize: size,weight: .medium),.foregroundColor: color])
}
func line(_ x1: CGFloat,_ y1: CGFloat,_ x2: CGFloat,_ y2: CGFloat,_ color: NSColor) {
    color.setStroke(); let p=NSBezierPath();p.move(to: CGPoint(x: x1,y: y1));p.line(to: CGPoint(x: x2,y: y2));p.lineWidth=1;p.stroke()
}
func x(_ t: Double) -> CGFloat { 100+CGFloat((t-12.5)/4)*1600 }
func y(_ db: Double) -> CGFloat { 180+CGFloat((max(-80,min(-10,db))+80)/70)*530 }
NSGraphicsContext.saveGraphicsState(); NSGraphicsContext.current=NSGraphicsContext(bitmapImageRep: rep)
NSColor.black.setFill();NSBezierPath(rect: CGRect(x: 0,y: 0,width: w,height: h)).fill()
text("PV4a M2 / independent AAC decode / 10ms RMS",30,800,gold,28)
text("Before (gold) / After (cyan) / silence criterion < -70dBFS",30,755)
for db in stride(from: -80,through: -10,by: 10) {
    line(100,y(Double(db)),1700,y(Double(db)),NSColor.white.withAlphaComponent(0.2));text("\(db)",35,y(Double(db))-10)
}
for t in stride(from: 12.5,through: 16.5,by: 0.5) {
    line(x(t),180,x(t),710,NSColor.white.withAlphaComponent(0.2));text(String(format:"%.1fs",t),x(t)-25,140)
}
for (key,color) in [("before",gold),("after",cyan)] {
    let p=NSBezierPath();color.setStroke();p.lineWidth=2
    for (i,r) in traces.enumerated() { let pt=CGPoint(x: x(r["time"]!),y: y(r[key]!));if i==0 {p.move(to: pt)} else {p.line(to: pt)} }
    p.stroke()
}
line(x(14),180,x(14),710,gold);line(x(15.5),180,x(15.5),710,cyan)
text("3-beat walking exit / 14.0–15.5",x(14)+10,725,gold)
text("rest / 15.5",x(15.5)+10,725,cyan)
let delta=evidence["walkingExitDeltaDb"] as! Double
text(String(format:"Exit vs previous 1.5s window: %.2fdB; old two 300ms gaps removed.",delta),30,95)
text("Last ~140ms is the score's final rest/fade; no subjective listening approval.",30,50)
NSGraphicsContext.restoreGraphicsState()
try rep.representation(using: .png,properties: [:])!.write(to: root.appendingPathComponent("walking-rms-before-after.png"))
print("Independent 10ms RMS comparison rendered.")
