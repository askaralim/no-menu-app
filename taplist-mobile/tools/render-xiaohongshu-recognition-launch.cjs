const fs = require('fs')
const path = require('path')
const sharp = require('../../mobile/node_modules/sharp')

const WIDTH = 1080
const HEIGHT = 1440

const colors = {
  bg: '#080808',
  panel: '#11110f',
  text: '#f4f1ea',
  muted: '#aaa194',
  faint: '#6f695f',
  gold: '#dda23d',
  line: '#3e301b',
}

const attachments = [
  '/var/folders/jv/fmrvl4sd0md1qfdbzwx3dqpm0000gn/T/codex-clipboard-73b553b3-dd83-4629-a636-4b0875f76b57.png',
  '/var/folders/jv/fmrvl4sd0md1qfdbzwx3dqpm0000gn/T/codex-clipboard-7b012053-dca4-402b-afab-581af94762c6.png',
  '/var/folders/jv/fmrvl4sd0md1qfdbzwx3dqpm0000gn/T/codex-clipboard-0710561f-4492-407c-a34c-8bb2b5e0eb95.png',
  '/var/folders/jv/fmrvl4sd0md1qfdbzwx3dqpm0000gn/T/codex-clipboard-bfadc2e5-18de-4dfe-801f-42d8415b9878.png',
  '/var/folders/jv/fmrvl4sd0md1qfdbzwx3dqpm0000gn/T/codex-clipboard-9f79633f-294f-45cf-9f85-5c236366e465.png',
  '/var/folders/jv/fmrvl4sd0md1qfdbzwx3dqpm0000gn/T/codex-clipboard-4eede392-05c6-4946-ab95-3972d1e6b996.png',
  '/var/folders/jv/fmrvl4sd0md1qfdbzwx3dqpm0000gn/T/codex-clipboard-6302a27c-a076-4cf3-a437-a9a5cfa43db2.png',
]

const root = path.resolve(__dirname, '..')
const outputRoot = path.join(root, 'output/xiaohongshu-recognition-launch-20261024')
const sourceDir = path.join(outputRoot, 'sources')
const finalDir = path.join(outputRoot, 'final')

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function text(x, y, value, size, options = {}) {
  const {
    color = colors.text,
    weight = 700,
    anchor = 'start',
    letterSpacing = 0,
  } = options
  return `<text x="${x}" y="${y}" fill="${color}" font-family="STHeiti, 'Heiti SC', 'Arial Unicode MS', sans-serif" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}" letter-spacing="${letterSpacing}">${escapeXml(value)}</text>`
}

function multiline(x, y, lines, size, options = {}) {
  const lineHeight = options.lineHeight ?? Math.round(size * 1.18)
  return lines.map((line, index) => text(x, y + index * lineHeight, line, size, options)).join('')
}

function headerSvg(titleLines, subtitle, options = {}) {
  const titleSize = options.titleSize ?? 82
  const lineHeight = options.lineHeight ?? 92
  const titleTop = options.titleTop ?? 128
  const subtitleTop = titleTop + titleLines.length * lineHeight + 12
  const accent = options.drawAccent === false
    ? ''
    : `<rect x="72" y="${subtitleTop + 35}" width="68" height="4" rx="2" fill="${colors.gold}"/>`
  const titleParts = titleLines.map((line, index) => {
    const color = options.goldLine === index ? colors.gold : colors.text
    return text(70, titleTop + index * lineHeight, line, titleSize, { color, weight: 700 })
  }).join('')
  return `${titleParts}
    ${subtitle ? text(72, subtitleTop, subtitle, 27, { color: colors.muted, weight: 400 }) : ''}
    ${accent}`
}

function heroText(y, value, size, color = colors.text) {
  return `<text x="540" y="${y}" fill="${color}" stroke="#050505" stroke-width="14" paint-order="stroke" font-family="STHeiti, 'Heiti SC', 'Arial Unicode MS', sans-serif" font-size="${size}" font-weight="700" text-anchor="middle">${escapeXml(value)}</text>`
}

function aiRecognitionHero(y) {
  return `<text x="540" y="${y}" fill="${colors.gold}" stroke="#050505" stroke-width="14" paint-order="stroke" font-size="98" text-anchor="middle"><tspan font-family="'Arial Black', 'Helvetica Neue', Arial, sans-serif" font-weight="900">AI</tspan><tspan dx="18" font-family="STHeiti, 'Heiti SC', 'Arial Unicode MS', sans-serif" font-weight="700">识图</tspan></text>`
}

function overlaySvg(content) {
  return Buffer.from(`<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">${content}</svg>`)
}

async function roundedImage(input, width, height, options = {}) {
  const radius = options.radius ?? 30
  let image = sharp(input).rotate()
  if (options.extract) image = image.extract(options.extract)
  image = image.resize(width, height, {
    fit: options.fit ?? 'cover',
    position: options.position ?? 'centre',
    background: colors.panel,
  })
  const mask = Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><rect width="${width}" height="${height}" rx="${radius}" fill="#fff"/></svg>`)
  return image.png().composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer()
}

function frame(x, y, width, height, radius = 30) {
  return `<rect x="${x + 0.5}" y="${y + 0.5}" width="${width - 1}" height="${height - 1}" rx="${radius}" fill="none" stroke="${colors.line}" stroke-width="1.5"/>`
}

async function render(filename, images, overlay) {
  const layers = []
  for (const image of images) {
    layers.push({ input: await roundedImage(image.input, image.width, image.height, image), left: image.x, top: image.y })
  }
  layers.push({ input: overlaySvg(overlay), left: 0, top: 0 })
  await sharp({
    create: {
      width: WIDTH,
      height: HEIGHT,
      channels: 4,
      background: colors.bg,
    },
  }).composite(layers).png({ compressionLevel: 9 }).toFile(path.join(finalDir, filename))
}

async function main() {
  for (const attachment of attachments) {
    if (!fs.existsSync(attachment)) throw new Error(`Missing source image: ${attachment}`)
  }
  fs.mkdirSync(sourceDir, { recursive: true })
  fs.mkdirSync(finalDir, { recursive: true })

  const sourceNames = [
    '01-entry.png',
    '02-recognizing.png',
    '03-result.png',
    '04-saved-tap.png',
    '05-edit.png',
    '06-consumer-menu.png',
    '07-drink-log.png',
  ]
  attachments.forEach((source, index) => fs.copyFileSync(source, path.join(sourceDir, sourceNames[index])))
  const sources = sourceNames.map((name) => path.join(sourceDir, name))

  await render('01-cover.png', [
    {
      input: sources[0], x: 0, y: 0, width: WIDTH, height: HEIGHT, radius: 0,
      position: 'centre',
    },
  ], `<rect width="${WIDTH}" height="${HEIGHT}" fill="#000" opacity="0.56"/>
    ${heroText(310, '我们给', 74)}
    ${heroText(445, '精酿酒吧', 108, colors.gold)}
    ${heroText(575, '做了一个更快的上酒方式', 58)}
    ${aiRecognitionHero(720)}`)

  await render('02-upload-and-recognize.png', [
    {
      input: sources[1], x: 100, y: 340, width: 880, height: 1040, radius: 32,
      extract: { left: 40, top: 420, width: 1090, height: 1660 },
      fit: 'contain',
    },
  ], `${headerSvg(['上传海报，自动识别'], '酒名、酒厂、风格、酒精度自动识别', { titleSize: 82 })}
    ${frame(100, 340, 880, 1040, 32)}`)

  await render('03-confirm-result.png', [
    {
      input: sources[2], x: 100, y: 340, width: 880, height: 1040, radius: 32,
      extract: { left: 20, top: 260, width: 1130, height: 1790 },
      fit: 'contain',
    },
  ], `${headerSvg(['识别结果先确认'], '有问题可以换图，确认前不会改酒单', { titleSize: 88 })}
    ${frame(100, 340, 880, 1040, 32)}`)

  await render('04-review-and-save.png', [
    {
      input: sources[4], x: 100, y: 390, width: 880, height: 990, radius: 32,
      extract: { left: 0, top: 110, width: 1170, height: 1500 },
      fit: 'contain',
    },
  ], `${headerSvg(['识别确认信息，', '自动带入编辑页面'], '', { titleSize: 72, lineHeight: 84, goldLine: 1 })}
    ${frame(100, 390, 880, 990, 32)}`)

  await render('05-save-to-tap.png', [
    {
      input: sources[3], x: 70, y: 390, width: 940, height: 990, radius: 32,
      extract: { left: 25, top: 145, width: 1120, height: 1700 },
    },
  ], `${headerSvg(['保存成功，', '酒款直接发布到对应酒头'], '', { titleSize: 72, lineHeight: 84, goldLine: 1 })}
    ${frame(70, 390, 940, 990, 32)}`)

  await render('06-consumer-features.png', [
    {
      input: sources[5], x: 45, y: 390, width: 485, height: 990, radius: 28,
      extract: { left: 0, top: 560, width: 1170, height: 1970 },
      fit: 'contain',
    },
    {
      input: sources[6], x: 550, y: 390, width: 485, height: 990, radius: 28,
      extract: { left: 0, top: 90, width: 1170, height: 2240 },
      fit: 'contain',
    },
  ], `${headerSvg(['用户端', '我们也做了两个优化'], '', { titleSize: 72, lineHeight: 80, goldLine: 1, drawAccent: false })}
    <circle cx="78" cy="282" r="6" fill="${colors.gold}"/>
    ${text(98, 290, '酒吧的酒单列表，', 24, { color: colors.muted, weight: 400 })}
    ${text(98, 324, '标出了喝过的酒', 24, { color: colors.muted, weight: 400 })}
    <circle cx="580" cy="282" r="6" fill="${colors.gold}"/>
    ${text(600, 290, 'TAP记录更清楚', 24, { color: colors.muted, weight: 400 })}
    ${frame(45, 390, 485, 990, 28)}
    ${frame(550, 390, 485, 990, 28)}`)

  console.log(`Rendered 6 images to ${finalDir}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
