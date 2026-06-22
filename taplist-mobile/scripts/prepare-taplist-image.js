#!/usr/bin/env node

const { execFileSync } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')

const presets = {
  bar: {
    width: 1600,
    height: 1200,
    quality: 82,
    suffix: 'bar-cover',
  },
  beer: {
    width: 1200,
    height: 1200,
    quality: 86,
    suffix: 'beer-artwork',
  },
}

function printHelp() {
  console.log(`
Prepare NO MENU tap list images.

Usage:
  npm run image:prepare -- --type bar --input ./source.jpg --out ./exports
  npm run image:prepare -- --type beer --input ./source.jpg --out ./exports --name hazy-ipa

Options:
  --type bar|beer          Required. bar = 4:3 cover, beer = 1:1 artwork.
  --input <path>           Required. Source image path.
  --out <path>             Output directory or .jpg/.jpeg file path. Default: ./exports/images
  --name <slug>            Output basename. Default: source filename + preset suffix.
  --position center|top|bottom|left|right
                           Crop focus. Default: center.
  --width <px>             Override output width.
  --height <px>            Override output height.
  --quality <1-100>        JPEG quality. Defaults: bar 82, beer 86.
  --format jpg|png         Output format. Default: jpg.
  --help                   Show this message.
`)
}

function parseArgs(argv) {
  const args = {}

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]
    if (!token.startsWith('--')) {
      throw new Error(`Unexpected argument: ${token}`)
    }

    const key = token.slice(2)
    if (key === 'help') {
      args.help = true
      continue
    }

    const value = argv[i + 1]
    if (!value || value.startsWith('--')) {
      throw new Error(`Missing value for --${key}`)
    }

    args[key] = value
    i += 1
  }

  return args
}

function requireSips() {
  try {
    execFileSync('sips', ['--version'], { stdio: 'ignore' })
  } catch {
    throw new Error('This tool requires macOS `sips`, which was not found on PATH.')
  }
}

function imageSize(input) {
  const output = execFileSync(
    'sips',
    ['-g', 'pixelWidth', '-g', 'pixelHeight', input],
    { encoding: 'utf8' },
  )
  const width = Number(output.match(/pixelWidth:\s*(\d+)/)?.[1])
  const height = Number(output.match(/pixelHeight:\s*(\d+)/)?.[1])

  if (!width || !height) {
    throw new Error(`Could not read image dimensions for ${input}`)
  }

  return { width, height }
}

function cropBox(source, targetRatio, position) {
  const sourceRatio = source.width / source.height
  let cropWidth = source.width
  let cropHeight = source.height

  if (sourceRatio > targetRatio) {
    cropWidth = Math.round(source.height * targetRatio)
  } else if (sourceRatio < targetRatio) {
    cropHeight = Math.round(source.width / targetRatio)
  }

  const horizontalSpace = source.width - cropWidth
  const verticalSpace = source.height - cropHeight

  let offsetX = Math.round(horizontalSpace / 2)
  let offsetY = Math.round(verticalSpace / 2)

  if (position === 'left') offsetX = 0
  if (position === 'right') offsetX = horizontalSpace
  if (position === 'top') offsetY = 0
  if (position === 'bottom') offsetY = verticalSpace

  return {
    width: cropWidth,
    height: cropHeight,
    offsetX,
    offsetY,
  }
}

function outputPath({ input, out, name, format, preset }) {
  const defaultName = `${path.basename(input, path.extname(input))}-${preset.suffix}`
  const baseName = name || defaultName
  const extension = format === 'png' ? 'png' : 'jpg'
  const target = out || path.join('exports', 'images')

  if (/\.(jpe?g|png)$/i.test(target)) {
    return target
  }

  return path.join(target, `${baseName}.${extension}`)
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    printHelp()
    return
  }

  const preset = presets[args.type]
  if (!preset) {
    throw new Error('Use --type bar or --type beer.')
  }

  if (!args.input) {
    throw new Error('Missing --input <path>.')
  }

  const input = path.resolve(args.input)
  if (!fs.existsSync(input)) {
    throw new Error(`Input file does not exist: ${input}`)
  }

  const position = args.position || 'center'
  if (!['center', 'top', 'bottom', 'left', 'right'].includes(position)) {
    throw new Error('Use --position center, top, bottom, left, or right.')
  }

  const width = args.width ? Number(args.width) : preset.width
  const height = args.height ? Number(args.height) : preset.height
  const quality = args.quality ? Number(args.quality) : preset.quality
  const format = args.format || 'jpg'

  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new Error('--width and --height must be positive integers.')
  }

  if (!Number.isInteger(quality) || quality < 1 || quality > 100) {
    throw new Error('--quality must be an integer from 1 to 100.')
  }

  if (!['jpg', 'png'].includes(format)) {
    throw new Error('--format must be jpg or png.')
  }

  requireSips()

  const source = imageSize(input)
  const crop = cropBox(source, width / height, position)
  const output = path.resolve(outputPath({
    input,
    out: args.out,
    name: args.name,
    format,
    preset,
  }))

  fs.mkdirSync(path.dirname(output), { recursive: true })

  const tmpCrop = path.join(
    os.tmpdir(),
    `no-menu-image-crop-${process.pid}-${Date.now()}.png`,
  )

  execFileSync('sips', [
    input,
    '--cropToHeightWidth',
    String(crop.height),
    String(crop.width),
    '--cropOffset',
    String(crop.offsetY),
    String(crop.offsetX),
    '--out',
    tmpCrop,
  ], { stdio: 'ignore' })

  const sipsArgs = [
    '-z',
    String(height),
    String(width),
    tmpCrop,
  ]

  sipsArgs.push(
    '--setProperty',
    'format',
    format === 'png' ? 'png' : 'jpeg',
  )

  if (format === 'jpg') {
    sipsArgs.push('--setProperty', 'formatOptions', String(quality))
  }

  sipsArgs.push('--out', output)
  try {
    execFileSync('sips', sipsArgs, { stdio: 'ignore' })
  } finally {
    fs.rmSync(tmpCrop, { force: true })
  }

  console.log(`Created ${output}`)
  console.log(`Preset: ${args.type} ${width}x${height}, crop ${crop.width}x${crop.height}+${crop.offsetX}+${crop.offsetY}`)
}

try {
  main()
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
