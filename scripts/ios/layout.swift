// CoreText line-break oracle: lays text out with a given font file, size and
// column width using Apple's own text engine (the same one UIKit/TextKit use)
// and prints the resulting lines. Usage:
//   layout <font file> <size> <width> < texts.json   (JSON array of strings)
// Output: JSON array of arrays of lines (blank lines omitted).
import Foundation
import CoreText

let a = CommandLine.arguments
guard a.count >= 4, let size = Double(a[2]), let width = Double(a[3]) else { fputs("usage: layout <font> <size> <width>\n", stderr); exit(2) }
let url = URL(fileURLWithPath: a[1])
guard let descs = CTFontManagerCreateFontDescriptorsFromURL(url as CFURL) as? [CTFontDescriptor], let desc = descs.first else { fputs("cannot read font\n", stderr); exit(2) }
var font = CTFontCreateWithFontDescriptor(desc, CGFloat(size), nil)
// Optional 4th arg: variation axes as "tag=value,..." with numeric tags
// (wght = 2003265652, opsz = 1869640570), or a bare number meaning wght.
if a.count >= 5 {
  var vars: [CFNumber: CFNumber] = [:]
  for kv in a[4].split(separator: ",") {
    let p = kv.split(separator: "=")
    if p.count == 2, let k = Int(p[0]), let v = Double(p[1]) { vars[k as CFNumber] = v as CFNumber } else if let w = Double(kv) { vars[2003265652 as CFNumber] = w as CFNumber }
  }
  let d2 = CTFontDescriptorCreateWithAttributes([kCTFontVariationAttribute: vars] as CFDictionary)
  font = CTFontCreateCopyWithAttributes(font, CGFloat(size), nil, d2)
}
let data = FileHandle.standardInput.readDataToEndOfFile()
// Input: JSON array of strings, or of {"t": text, "e": [[start, length], ...]} where
// the ranges (UTF-16) are link/mention runs. X styles those as separate attribute
// runs, and CoreText does not kern across run boundaries, so they matter.
guard let items = try? JSONSerialization.jsonObject(with: data) as? [Any] else { fputs("stdin must be a JSON array\n", stderr); exit(2) }
let blue = CGColor(red: 0.11, green: 0.61, blue: 0.94, alpha: 1)
var out: [[String]] = []
for item in items {
  let text: String
  var ranges: [[Int]] = []
  if let s = item as? String { text = s } else if let d = item as? [String: Any] { text = d["t"] as? String ?? ""; ranges = d["e"] as? [[Int]] ?? [] } else { text = "" }
  var base: [NSAttributedString.Key: Any] = [kCTFontAttributeName as NSAttributedString.Key: font]
  if let k = ProcessInfo.processInfo.environment["KERN"], let kv = Double(k) { base[kCTKernAttributeName as NSAttributedString.Key] = kv }
  let attr = NSMutableAttributedString(string: text, attributes: base)
  for r in ranges where r.count == 2 { attr.addAttribute(kCTForegroundColorAttributeName as NSAttributedString.Key, value: blue, range: NSRange(location: r[0], length: r[1])) }
  let setter = CTFramesetterCreateWithAttributedString(attr)
  let path = CGPath(rect: CGRect(x: 0, y: 0, width: width, height: 100000), transform: nil)
  let frame = CTFramesetterCreateFrame(setter, CFRangeMake(0, 0), path, nil)
  let lines = CTFrameGetLines(frame) as! [CTLine]
  let ns = text as NSString
  var rows: [String] = []
  for line in lines {
    let r = CTLineGetStringRange(line)
    let s = ns.substring(with: NSRange(location: r.location, length: r.length)).trimmingCharacters(in: .whitespacesAndNewlines)
    if !s.isEmpty { rows.append(s) }
  }
  out.append(rows)
}
let json = try! JSONSerialization.data(withJSONObject: out, options: [])
FileHandle.standardOutput.write(json)
