import { mkdir, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const brandDir = join(root, 'assets', 'brand')

async function renderSvg(sourceName, outputName, width, options = {}) {
  const input = await readFile(join(brandDir, sourceName))
  let pipeline = sharp(input, { density: 288 }).resize({
    width,
    height: options.height ?? width,
    fit: options.fit ?? 'contain',
  })

  if (options.flatten) {
    pipeline = pipeline.flatten({ background: options.flatten })
  }

  await pipeline.png().toFile(join(root, outputName))
}

await mkdir(brandDir, { recursive: true })

await Promise.all([
  // Expo entry assets
  renderSvg('no-menu-tonight-icon.svg', 'assets/icon.png', 1024, { flatten: '#080808' }),
  renderSvg('no-menu-tonight-splash.svg', 'assets/splash-icon.png', 1024),
  renderSvg(
    'no-menu-tonight-adaptive-foreground.svg',
    'assets/android-icon-foreground.png',
    1024,
  ),
  renderSvg('no-menu-tonight-monochrome.svg', 'assets/android-icon-monochrome.png', 1024),
  renderSvg('no-menu-tonight-icon.svg', 'assets/favicon.png', 48, { flatten: '#080808' }),

  // Reusable brand exports
  renderSvg(
    'no-menu-tonight-primary-stacked-dark.svg',
    'assets/brand/no-menu-tonight-primary-stacked-dark.png',
    1600,
  ),
  renderSvg(
    'no-menu-tonight-primary-stacked-light.svg',
    'assets/brand/no-menu-tonight-primary-stacked-light.png',
    1600,
  ),
  renderSvg(
    'no-menu-tonight-primary-stacked-monochrome.svg',
    'assets/brand/no-menu-tonight-primary-stacked-monochrome.png',
    1600,
  ),
  renderSvg(
    'no-menu-tonight-horizontal-dark.svg',
    'assets/brand/no-menu-tonight-horizontal-dark.png',
    2400,
    { height: 900 },
  ),
  renderSvg(
    'no-menu-tonight-splash.svg',
    'assets/brand/no-menu-tonight-lockup.png',
    640,
  ),
])

await sharp({
  create: {
    width: 1024,
    height: 1024,
    channels: 3,
    background: '#080808',
  },
})
  .png()
  .toFile(join(root, 'assets/android-icon-background.png'))

for (const size of [16, 32, 48, 180, 512, 1024]) {
  await renderSvg(
    'no-menu-tonight-icon.svg',
    `assets/brand/no-menu-tonight-icon-${size}.png`,
    size,
    { flatten: '#080808' },
  )
}

const taplistIcon = await sharp(
  join(root, '..', 'taplist-mobile', 'assets', 'brand', 'no-menu-v3', 'no-menu-app-icon-nm.png'),
)
  .resize(400, 400)
  .png()
  .toBuffer()
const tonightIcon = await sharp(join(root, 'assets', 'icon.png'))
  .resize(400, 400)
  .png()
  .toBuffer()
const familyLabels = Buffer.from(`
  <svg width="1400" height="800" xmlns="http://www.w3.org/2000/svg">
    <style>
      .name { fill: #F5F1E8; font: 700 34px "Helvetica Neue", Helvetica, Arial, sans-serif; letter-spacing: 2px; }
      .role { fill: #A9A297; font: 400 22px "Helvetica Neue", Helvetica, Arial, sans-serif; letter-spacing: 1px; }
    </style>
    <text class="name" x="370" y="610" text-anchor="middle">NO MENU</text>
    <text class="role" x="370" y="650" text-anchor="middle">CONSUMER TAPLIST</text>
    <text class="name" x="1030" y="610" text-anchor="middle">NO MENU TONIGHT</text>
    <text class="role" x="1030" y="650" text-anchor="middle">BAR OPERATIONS</text>
  </svg>
`)

await sharp({
  create: {
    width: 1400,
    height: 800,
    channels: 3,
    background: '#111111',
  },
})
  .composite([
    { input: taplistIcon, left: 170, top: 120 },
    { input: tonightIcon, left: 830, top: 120 },
    { input: familyLabels, left: 0, top: 0 },
  ])
  .png()
  .toFile(join(brandDir, 'no-menu-brand-family.png'))

console.log('Generated No Menu Tonight brand assets.')
