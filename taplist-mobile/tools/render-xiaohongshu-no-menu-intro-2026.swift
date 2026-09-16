import AppKit
import Foundation

let canvasWidth: CGFloat = 1080
let canvasHeight: CGFloat = 1440

let root = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
let sourceDirectory = root.appendingPathComponent("output/xiaohongshu-intro-refresh/sources")
let outputDirectory = root.appendingPathComponent("output/xiaohongshu-intro-refresh")

let black = NSColor(calibratedRed: 7 / 255, green: 8 / 255, blue: 6 / 255, alpha: 1)
let panel = NSColor(calibratedRed: 17 / 255, green: 18 / 255, blue: 15 / 255, alpha: 1)
let paper = NSColor(calibratedRed: 240 / 255, green: 237 / 255, blue: 230 / 255, alpha: 1)
let muted = NSColor(calibratedRed: 170 / 255, green: 162 / 255, blue: 148 / 255, alpha: 1)
let gold = NSColor(calibratedRed: 221 / 255, green: 162 / 255, blue: 61 / 255, alpha: 1)
let softGold = NSColor(calibratedRed: 201 / 255, green: 170 / 255, blue: 112 / 255, alpha: 1)
let line = NSColor(calibratedRed: 58 / 255, green: 48 / 255, blue: 34 / 255, alpha: 1)

func topRect(_ x: CGFloat, _ y: CGFloat, _ width: CGFloat, _ height: CGFloat) -> NSRect {
  NSRect(x: x, y: canvasHeight - y - height, width: width, height: height)
}

func font(_ size: CGFloat, weight: NSFont.Weight = .regular) -> NSFont {
  NSFont(name: weight.rawValue >= NSFont.Weight.semibold.rawValue ? "PingFangSC-Semibold" : "PingFangSC-Regular", size: size)
    ?? NSFont.systemFont(ofSize: size, weight: weight)
}

func condensedFont(_ size: CGFloat) -> NSFont {
  NSFont(name: "Bebas Neue", size: size)
    ?? NSFont(name: "Arial Narrow Bold", size: size)
    ?? NSFont.systemFont(ofSize: size, weight: .bold)
}

func drawText(
  _ text: String,
  x: CGFloat,
  y: CGFloat,
  width: CGFloat,
  size: CGFloat,
  weight: NSFont.Weight = .regular,
  color: NSColor = paper,
  kern: CGFloat = 0,
  lineHeight: CGFloat? = nil,
  condensed: Bool = false
) {
  let paragraph = NSMutableParagraphStyle()
  paragraph.lineBreakMode = .byWordWrapping
  if let lineHeight {
    paragraph.minimumLineHeight = lineHeight
    paragraph.maximumLineHeight = lineHeight
  }
  let attributes: [NSAttributedString.Key: Any] = [
    .font: condensed ? condensedFont(size) : font(size, weight: weight),
    .foregroundColor: color,
    .kern: kern,
    .paragraphStyle: paragraph,
  ]
  let attributed = NSAttributedString(string: text, attributes: attributes)
  let measured = attributed.boundingRect(
    with: NSSize(width: width, height: 800),
    options: [.usesLineFragmentOrigin, .usesFontLeading]
  )
  attributed.draw(in: topRect(x, y, width, ceil(measured.height) + 10))
}

func drawBrand(_ text: String = "NO MENU") {
  drawText(text, x: 72, y: 65, width: 600, size: 29, weight: .bold, color: softGold, kern: 5, condensed: true)
}

func drawSection(_ text: String, x: CGFloat = 72, y: CGFloat) {
  drawText(text, x: x, y: y, width: 600, size: 24, weight: .bold, color: softGold, kern: 4, condensed: true)
}

func drawFrame() {
  let path = NSBezierPath(rect: topRect(40, 40, 1000, 1360))
  NSColor(calibratedRed: 221 / 255, green: 162 / 255, blue: 61 / 255, alpha: 0.27).setStroke()
  path.lineWidth = 1
  path.stroke()
}

func drawTexture() {
  NSColor(calibratedWhite: 1, alpha: 0.018).setStroke()
  for y in stride(from: CGFloat(0), through: canvasHeight, by: 5) {
    let path = NSBezierPath()
    path.move(to: NSPoint(x: 0, y: y))
    path.line(to: NSPoint(x: canvasWidth, y: y))
    path.lineWidth = 1
    path.stroke()
  }
}

func drawOrbits(centerX: CGFloat, topY: CGFloat) {
  for radius in [350, 445, 545, 660] as [CGFloat] {
    let rect = topRect(centerX - radius, topY - radius, radius * 2, radius * 2)
    let path = NSBezierPath(ovalIn: rect)
    NSColor(calibratedRed: 201 / 255, green: 170 / 255, blue: 112 / 255, alpha: radius == 350 ? 0.17 : 0.10).setStroke()
    path.lineWidth = 1.2
    path.stroke()
  }
}

func loadImage(_ name: String) -> NSImage {
  let url = sourceDirectory.appendingPathComponent(name)
  guard let image = NSImage(contentsOf: url) else {
    fatalError("Unable to load \(url.path)")
  }
  return image
}

func drawRoundedImage(
  _ image: NSImage,
  x: CGFloat,
  y: CGFloat,
  width: CGFloat,
  height: CGFloat,
  radius: CGFloat = 28,
  focusFromTop: CGFloat = 0.35
) {
  let target = topRect(x, y, width, height)

  let shadow = NSBezierPath(roundedRect: target.offsetBy(dx: 0, dy: -18), xRadius: radius, yRadius: radius)
  NSColor(calibratedWhite: 0, alpha: 0.48).setFill()
  shadow.fill()

  NSGraphicsContext.saveGraphicsState()
  let clip = NSBezierPath(roundedRect: target, xRadius: radius, yRadius: radius)
  clip.addClip()
  panel.setFill()
  target.fill()

  let imageSize = image.size
  let targetAspect = width / height
  let imageAspect = imageSize.width / imageSize.height
  var source = NSRect(origin: .zero, size: imageSize)

  if imageAspect < targetAspect {
    let sourceHeight = imageSize.width / targetAspect
    let top = max(0, min(imageSize.height - sourceHeight, imageSize.height * focusFromTop - sourceHeight / 2))
    source = NSRect(x: 0, y: imageSize.height - top - sourceHeight, width: imageSize.width, height: sourceHeight)
  } else if imageAspect > targetAspect {
    let sourceWidth = imageSize.height * targetAspect
    source = NSRect(x: (imageSize.width - sourceWidth) / 2, y: 0, width: sourceWidth, height: imageSize.height)
  }

  image.draw(
    in: target,
    from: source,
    operation: .sourceOver,
    fraction: 1,
    respectFlipped: true,
    hints: [.interpolation: NSImageInterpolation.high]
  )
  NSGraphicsContext.restoreGraphicsState()

  let border = NSBezierPath(roundedRect: target, xRadius: radius, yRadius: radius)
  NSColor(calibratedRed: 201 / 255, green: 170 / 255, blue: 112 / 255, alpha: 0.36).setStroke()
  border.lineWidth = 1.2
  border.stroke()
}

func drawLeftVeil(width: CGFloat) {
  let gradient = NSGradient(colorsAndLocations:
    (black, 0),
    (black, 0.56),
    (NSColor(calibratedRed: 7 / 255, green: 8 / 255, blue: 6 / 255, alpha: 0.86), 0.78),
    (NSColor(calibratedRed: 7 / 255, green: 8 / 255, blue: 6 / 255, alpha: 0), 1)
  )!
  gradient.draw(in: topRect(0, 0, width, canvasHeight), angle: 0)
}

func render(_ filename: String, draw: () -> Void) throws {
  guard let bitmap = NSBitmapImageRep(
    bitmapDataPlanes: nil,
    pixelsWide: Int(canvasWidth),
    pixelsHigh: Int(canvasHeight),
    bitsPerSample: 8,
    samplesPerPixel: 4,
    hasAlpha: false,
    isPlanar: false,
    colorSpaceName: .deviceRGB,
    bytesPerRow: 0,
    bitsPerPixel: 0
  ), let context = NSGraphicsContext(bitmapImageRep: bitmap) else {
    fatalError("Unable to create bitmap context")
  }

  NSGraphicsContext.saveGraphicsState()
  NSGraphicsContext.current = context
  context.imageInterpolation = .high
  black.setFill()
  NSRect(x: 0, y: 0, width: canvasWidth, height: canvasHeight).fill()
  draw()
  drawTexture()
  drawFrame()
  context.flushGraphics()
  NSGraphicsContext.restoreGraphicsState()

  guard let data = bitmap.representation(using: .png, properties: [:]) else {
    fatalError("Unable to encode PNG")
  }
  try data.write(to: outputDirectory.appendingPathComponent(filename), options: .atomic)
}

try FileManager.default.createDirectory(at: outputDirectory, withIntermediateDirectories: true)

let home = loadImage("home.png")
let mine = loadImage("mine.png")
let nearby = loadImage("nearby.png")
let barDetail = loadImage("bar-detail.png")
let recorded = loadImage("recorded.png")
let report = loadImage("report.png")
let merchant = loadImage("merchant.png")

try render("01-positioning.png") {
  drawOrbits(centerX: 1000, topY: 60)
  drawBrand()
  drawText("现在的", x: 72, y: 170, width: 900, size: 103, weight: .semibold, kern: -5)
  drawText("No Menu", x: 72, y: 285, width: 900, size: 103, weight: .semibold, color: gold, kern: -4)
  drawText("看实时酒单，也记录喝过的酒", x: 72, y: 416, width: 760, size: 28, color: muted, kern: 1)
  drawRoundedImage(home, x: 70, y: 550, width: 510, height: 810, radius: 28, focusFromTop: 0.29)
  drawRoundedImage(mine, x: 568, y: 610, width: 440, height: 750, radius: 28, focusFromTop: 0.32)
}

try render("02-nearby.png") {
  drawRoundedImage(nearby, x: 430, y: 60, width: 600, height: 1320, radius: 30, focusFromTop: 0.51)
  drawLeftVeil(width: 650)
  drawBrand()
  drawText("离今晚", x: 72, y: 205, width: 480, size: 92, weight: .semibold, kern: -5)
  drawText("更近一点", x: 72, y: 310, width: 520, size: 92, weight: .semibold, color: gold, kern: -5)
}

try render("03-live-taplist.png") {
  drawRoundedImage(barDetail, x: 405, y: 55, width: 625, height: 1330, radius: 30, focusFromTop: 0.48)
  drawLeftVeil(width: 650)
  drawBrand()
  drawText("酒吧现在", x: 72, y: 205, width: 520, size: 87, weight: .semibold, kern: -5)
  drawText("有什么酒", x: 72, y: 305, width: 520, size: 87, weight: .semibold, color: gold, kern: -5)
}

try render("04-my-tap.png") {
  drawBrand()
  drawSection("MY TAP", y: 145)
  drawText("记录喝过的酒", x: 72, y: 205, width: 850, size: 86, weight: .semibold, kern: -5)
  drawText("按月份回看，仅自己可见", x: 72, y: 318, width: 850, size: 25, color: muted, kern: 1)
  drawRoundedImage(recorded, x: 55, y: 535, width: 485, height: 850, radius: 28, focusFromTop: 0.59)
  drawRoundedImage(report, x: 555, y: 465, width: 475, height: 920, radius: 28, focusFromTop: 0.36)
}

try render("05-merchant.png") {
  drawRoundedImage(merchant, x: 405, y: 55, width: 625, height: 1330, radius: 30, focusFromTop: 0.45)
  drawLeftVeil(width: 660)
  drawBrand("NO MENU TONIGHT")
  drawText("合作酒吧", x: 72, y: 220, width: 520, size: 83, weight: .semibold, kern: -5)
  drawText("自己更新酒单", x: 72, y: 316, width: 570, size: 83, weight: .semibold, color: gold, kern: -5)
}

try render("06-more-cities.png") {
  drawOrbits(centerX: 970, topY: 60)
  drawBrand()
  drawText("还想在哪座城市", x: 72, y: 195, width: 900, size: 84, weight: .semibold, kern: -5)
  drawText("看到 No Menu？", x: 72, y: 295, width: 900, size: 84, weight: .semibold, color: gold, kern: -4)

  let cities = ["上海", "北京", "天津", "青岛", "沈阳", "长春", "滨州"]
  let gridX: CGFloat = 72
  let gridY: CGFloat = 590
  let columnWidth: CGFloat = 312
  let rowHeight: CGFloat = 158

  for index in 0..<9 {
    let column = index % 3
    let row = index / 3
    let rect = topRect(gridX + CGFloat(column) * columnWidth, gridY + CGFloat(row) * rowHeight, columnWidth, rowHeight)
    let path = NSBezierPath(rect: rect)
    line.setStroke()
    path.lineWidth = 1
    path.stroke()
    guard index < cities.count else { continue }
    drawText(
      cities[index],
      x: rect.minX + 27,
      y: gridY + CGFloat(row) * rowHeight + 48,
      width: columnWidth - 54,
      size: 43,
      weight: .medium,
      color: index == 0 ? gold : paper,
      kern: 2
    )
  }

  let inviteRule = NSBezierPath()
  inviteRule.move(to: NSPoint(x: 72, y: canvasHeight - 1230))
  inviteRule.line(to: NSPoint(x: 830, y: canvasHeight - 1230))
  gold.setStroke()
  inviteRule.lineWidth = 2
  inviteRule.stroke()
  drawText("告诉我们城市和酒吧名字", x: 72, y: 1255, width: 820, size: 34, weight: .medium, color: paper, kern: 1)
}

print("Rendered 6 images to \(outputDirectory.path)")
