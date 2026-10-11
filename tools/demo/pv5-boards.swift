// Local diagnostic curves/contact sheets. AppKit is provided by macOS.
import AppKit
import Foundation
let root=URL(fileURLWithPath:CommandLine.arguments.count>1 ? CommandLine.arguments[1] : ".art-work/s89/qa")
func read(_ name:String) throws -> Any { try JSONSerialization.jsonObject(with:Data(contentsOf:root.appendingPathComponent(name))) }
let curves=try read("curves.json") as! [String:[String:[[String:Double]]]]
let plots=try read("plots.json") as! [[String:Any]]
let colors:[String:NSColor]=["v4":NSColor(srgbRed:1,green:0.72,blue:0.22,alpha:1),"A":NSColor(srgbRed:0.3,green:0.88,blue:1,alpha:1),"B":NSColor(srgbRed:0.95,green:0.4,blue:0.7,alpha:1)]
func text(_ s:String,_ x:CGFloat,_ y:CGFloat,_ size:CGFloat=18,_ color:NSColor = .white) {
    (s as NSString).draw(at:CGPoint(x:x,y:y),withAttributes:[.font:NSFont.monospacedSystemFont(ofSize:size,weight:.medium),.foregroundColor:color])
}
func line(_ x:CGFloat,_ y:CGFloat,_ xx:CGFloat,_ yy:CGFloat,_ color:NSColor,_ width:CGFloat=1) {
    color.setStroke();let p=NSBezierPath();p.move(to:CGPoint(x:x,y:y));p.line(to:CGPoint(x:xx,y:yy));p.lineWidth=width;p.stroke()
}
func image(_ name:String,_ w:Int,_ h:Int,_ draw:()->Void) throws {
    let rep=NSBitmapImageRep(bitmapDataPlanes:nil,pixelsWide:w,pixelsHigh:h,bitsPerSample:8,samplesPerPixel:4,hasAlpha:true,isPlanar:false,colorSpaceName:.deviceRGB,bytesPerRow:0,bitsPerPixel:0)!
    rep.size=NSSize(width:w,height:h)
    NSGraphicsContext.saveGraphicsState();NSGraphicsContext.current=NSGraphicsContext(bitmapImageRep:rep)
    NSColor(srgbRed:0.035,green:0.045,blue:0.06,alpha:1).setFill();NSBezierPath(rect:CGRect(x:0,y:0,width:w,height:h)).fill()
    draw();NSGraphicsContext.restoreGraphicsState()
    try rep.representation(using:.png,properties:[:])!.write(to:root.appendingPathComponent(name))
}
func chart(_ start:Double,_ end:Double,_ file:String) throws {
    try image(file,1800,1600) {
        text("PV5 A/B vs v4a | whole-program matched -15.85 LUFS",30,1550,27)
        for (i,v) in ["v4","A","B"].enumerated(){text(v,30+CGFloat(i)*140,1510,24,colors[v]!)}
        text("Signal measurements only; no subjective listening approval",490,1515,18)
        let panels:[(String,String,Double,Double)]=[("bgm","BGM / 400ms RMS dBFS",-50,-10),("aac","Completed AAC / 400ms RMS dBFS",-50,-10),("low","BGM 70-250Hz / Hann 100ms power dBFS",-55,-10),("density","Rendered onsets/sec / 1.5s window",0,45)]
        for (i,panel) in panels.enumerated() {
            let (key,label,minY,maxY)=panel,base=CGFloat(1120-i*335)
            func x(_ t:Double)->CGFloat {100+CGFloat((t-start)/(end-start))*1640}
            func y(_ v:Double)->CGFloat {base+CGFloat((max(minY,min(maxY,v))-minY)/(maxY-minY))*255}
            text(label,100,base+270,20)
            for d in stride(from:minY,through:maxY,by:10) {
                line(100,y(d),1740,y(d),NSColor.white.withAlphaComponent(0.15));text(String(format:"%.0f",d),35,y(d)-9,16)
            }
            for t in stride(from:ceil(start/5)*5,through:end,by:5) {
                line(x(t),base,x(t),base+255,NSColor.white.withAlphaComponent(0.10));text(String(format:"%.0fs",t),x(t)-12,base-25,16)
            }
            for (t,label) in [(31.5,"wait"),(34.5,"party"),(37.5,"drive"),(40.5,"climax"),(43.6,"title")] where t>=start && t<=end {
                line(x(t),base,x(t),base+255,NSColor.white.withAlphaComponent(0.4));text(label,x(t)+3,base+239,13)
            }
            for v in ["v4","A","B"] {
                let p=NSBezierPath();p.lineWidth=1.8;colors[v]!.setStroke();var began=false
                for row in curves[key]![v]! where row["time"]!>=start && row["time"]!<=end {
                    let point=CGPoint(x:x(row["time"]!),y:y(row["value"]!));if !began{p.move(to:point);began=true}else{p.line(to:point)}
                }
                p.stroke()
            }
        }
        text("Title vs drive AAC: v4 +0.69dB / A +2.72dB / B +2.56dB",30,65,19)
        text("Reveal low occupancy: unchanged 80%; title 93.3%. Density is not perceived excitement.",30,28,18)
    }
}
try chart(2,49.5,"comparison-full.png");try chart(31,49.5,"comparison-climax.png")
for variant in ["A","B"] {
    let waves=plots.filter{($0["variant"] as! String)==variant && ($0["kind"] as! String)=="wave" && !(($0["name"] as! String).hasPrefix("full"))}
    for first in stride(from:0,to:waves.count,by:8) {
        let chunk=Array(waves[first..<min(first+8,waves.count)]),file="\(variant.lowercased())/zoom-sheet-\(first/8+1).png"
        try image(file,1800,1480) {
            text("PV5 \(variant) / AAC join + SE waveforms / seconds label each tile",25,1430,24,colors[variant]!)
            for (i,row) in chunk.enumerated() {
                let x=CGFloat(20+i%2*890),y=CGFloat(1070-i/2*345),name=row["name"] as! String,s=row["start"] as! Double,e=row["end"] as! Double
                text(String(format:"%@ | %.3f-%.3fs",name,s,e),x,y+270,16)
                NSImage(contentsOfFile:row["file"] as! String)!.draw(in:CGRect(x:x,y:y+20,width:860,height:240),from:.zero,operation:.sourceOver,fraction:1)
            }
            text("Amplitude auto-scaled per tile: compare timing/shape, NOT absolute loudness.",25,18,18)
        }
    }
    let spectra=plots.filter{($0["variant"] as! String)==variant && ($0["kind"] as! String)=="spectrum"}
    for first in stride(from:0,to:spectra.count,by:4) {
        let chunk=Array(spectra[first..<min(first+4,spectra.count)])
        try image("\(variant.lowercased())/spectrum-sheet-\(first/4+1).png",1800,1360) {
            text("PV5 \(variant) / fixed-gain log spectra / AAC + matched BGM",25,1310,24,colors[variant]!)
            for (i,row) in chunk.enumerated() {
                let x=CGFloat(20+i%2*890),y=CGFloat(680-i/2*620),name=row["name"] as! String
                text(name,x,y+570,17)
                NSImage(contentsOfFile:row["file"] as! String)!.draw(in:CGRect(x:x,y:y+25,width:860,height:530),from:.zero,operation:.sourceOver,fraction:1)
            }
        }
    }
}
print("Comparison curves and all AAC waveform/spectrum sheets rendered.")
