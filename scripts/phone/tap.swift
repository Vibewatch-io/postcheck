import Foundation
import CoreGraphics
// usage: tap x y | drag x1 y1 x2 y2 [steps] | key <keycode>
let a = CommandLine.arguments
func post(_ e: CGEvent?) { e?.post(tap: .cghidEventTap); usleep(30_000) }
if a[1] == "tap" {
  let p = CGPoint(x: Double(a[2])!, y: Double(a[3])!)
  post(CGEvent(mouseEventSource: nil, mouseType: .mouseMoved, mouseCursorPosition: p, mouseButton: .left))
  usleep(100_000)
  post(CGEvent(mouseEventSource: nil, mouseType: .leftMouseDown, mouseCursorPosition: p, mouseButton: .left))
  post(CGEvent(mouseEventSource: nil, mouseType: .leftMouseUp, mouseCursorPosition: p, mouseButton: .left))
} else if a[1] == "drag" {
  let p1 = CGPoint(x: Double(a[2])!, y: Double(a[3])!), p2 = CGPoint(x: Double(a[4])!, y: Double(a[5])!)
  let steps = a.count > 6 ? Int(a[6])! : 20
  post(CGEvent(mouseEventSource: nil, mouseType: .mouseMoved, mouseCursorPosition: p1, mouseButton: .left))
  usleep(100_000)
  post(CGEvent(mouseEventSource: nil, mouseType: .leftMouseDown, mouseCursorPosition: p1, mouseButton: .left))
  for i in 1...steps {
    let t = Double(i) / Double(steps)
    let p = CGPoint(x: p1.x + (p2.x - p1.x) * t, y: p1.y + (p2.y - p1.y) * t)
    post(CGEvent(mouseEventSource: nil, mouseType: .leftMouseDragged, mouseCursorPosition: p, mouseButton: .left))
  }
  usleep(150_000)
  post(CGEvent(mouseEventSource: nil, mouseType: .leftMouseUp, mouseCursorPosition: p2, mouseButton: .left))
} else if a[1] == "scroll" {
  // scroll x y dy  (dy>0 scrolls content down)
  let p = CGPoint(x: Double(a[2])!, y: Double(a[3])!)
  post(CGEvent(mouseEventSource: nil, mouseType: .mouseMoved, mouseCursorPosition: p, mouseButton: .left))
  let dy = Int32(a[4])!
  for _ in 0..<abs(Int(dy)) { post(CGEvent(scrollWheelEvent2Source: nil, units: .line, wheelCount: 1, wheel1: dy > 0 ? -3 : 3, wheel2: 0, wheel3: 0)) }
}
