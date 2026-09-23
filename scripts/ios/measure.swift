import Foundation
import CoreText
let a = CommandLine.arguments
let url = URL(fileURLWithPath: a[1]); let size = Double(a[2])!
let desc = (CTFontManagerCreateFontDescriptorsFromURL(url as CFURL) as! [CTFontDescriptor]).first!
var font = CTFontCreateWithFontDescriptor(desc, CGFloat(size), nil)

if a.count > 3 { var vars: [CFNumber: CFNumber] = [:]; for kv in a[3].split(separator: ",") { let p = kv.split(separator: "="); vars[Int(p[0])! as CFNumber] = Double(p[1])! as CFNumber }; let d2 = CTFontDescriptorCreateWithAttributes([kCTFontVariationAttribute: vars] as CFDictionary); font = CTFontCreateCopyWithAttributes(font, CGFloat(size), nil, d2) }
let texts = try! JSONSerialization.jsonObject(with: FileHandle.standardInput.readDataToEndOfFile()) as! [String]
var attrs: [NSAttributedString.Key: Any] = [kCTFontAttributeName as NSAttributedString.Key: font]
if let k = ProcessInfo.processInfo.environment["KERN"], let kv = Double(k) { attrs[kCTKernAttributeName as NSAttributedString.Key] = kv }
var out: [Double] = []
for t in texts { let line = CTLineCreateWithAttributedString(NSAttributedString(string: t, attributes: attrs)); out.append(CTLineGetTypographicBounds(line, nil, nil, nil)) }
print(String(data: try! JSONSerialization.data(withJSONObject: out), encoding: .utf8)!)
