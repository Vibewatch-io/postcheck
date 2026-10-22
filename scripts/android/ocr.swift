// Read the text rows in one region of a screenshot with macOS Vision, top to bottom.
// Usage: swift scripts/android/ocr.swift <png> <x> <y> <w> <h>   (capture pixels)
// Prints JSON: [{ "text": "...", "x": .., "y": .., "w": .., "h": .. }], one entry per recognized row.
// recapture.mjs uses it only to find where each row breaks; the characters come from the app's text node.
import AppKit
import Vision

let a = CommandLine.arguments
guard a.count == 6, let image = NSImage(contentsOfFile: a[1]),
      let cg = image.cgImage(forProposedRect: nil, context: nil, hints: nil),
      let x = Int(a[2]), let y = Int(a[3]), let w = Int(a[4]), let h = Int(a[5]),
      let crop = cg.cropping(to: CGRect(x: x, y: y, width: w, height: h)) else {
  FileHandle.standardError.write("usage: ocr.swift <png> <x> <y> <w> <h>\n".data(using: .utf8)!)
  exit(2)
}
let request = VNRecognizeTextRequest()
request.recognitionLevel = .accurate
request.usesLanguageCorrection = false
request.recognitionLanguages = ["en-US", "ja-JP", "ar-SA", "he-IL", "th-TH", "hi-IN"]
try VNImageRequestHandler(cgImage: crop, options: [:]).perform([request])
var rows: [[String: Any]] = []
for o in request.results ?? [] {
  guard let t = o.topCandidates(1).first else { continue }
  let b = o.boundingBox  // normalized, origin bottom-left
  rows.append(["text": t.string, "x": x + Int(b.minX * CGFloat(w)), "y": y + Int((1 - b.maxY) * CGFloat(h)),
               "w": Int(b.width * CGFloat(w)), "h": Int(b.height * CGFloat(h))])
}
rows.sort { ($0["y"] as! Int) < ($1["y"] as! Int) }
let data = try JSONSerialization.data(withJSONObject: rows, options: [])
print(String(data: data, encoding: .utf8)!)
