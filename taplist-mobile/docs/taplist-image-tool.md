# Tap List Image Tool

Use this tool to prepare public image assets for NO MENU bar covers and beer artwork.

## Browser Tool

Open `tools/taplist-image-tool.html` in a browser to crop and export images visually.

The browser tool supports:

- Drag-and-drop image import
- `bar` and `beer` presets
- Crop focus controls
- JPG / PNG export
- Custom width, height, quality, and filename

## Requirements

- Bar cover images use `4:3`, matching `AtmosphereImage` in the home feed and bar detail hero.
- Beer images use `1:1`, matching beer row artwork and beer detail cover.
- Output should be real source photography or product/label imagery. Do not fabricate bars, beers, tasting notes, or metadata.

## Commands

```bash
npm run image:prepare -- --type bar --input ./source/bar.jpg --out ./exports
npm run image:prepare -- --type beer --input ./source/beer.jpg --out ./exports
```

Defaults:

- `bar`: `1600x1200`, JPEG quality `82`
- `beer`: `1200x1200`, JPEG quality `86`

## Crop Focus

The default crop is centered. Use `--position` when the subject is near an edge:

```bash
npm run image:prepare -- --type bar --input ./source/bar.jpg --out ./exports --position top
npm run image:prepare -- --type beer --input ./source/can.jpg --out ./exports --position bottom
```

Supported positions: `center`, `top`, `bottom`, `left`, `right`.

## Output Naming

```bash
npm run image:prepare -- --type beer --input ./source/can.jpg --out ./exports --name stone-ipa
```

This creates `./exports/stone-ipa.jpg`.

You can also pass a full output file path:

```bash
npm run image:prepare -- --type bar --input ./source/bar.jpg --out ./exports/bar-cover.jpg
```

## Overrides

```bash
npm run image:prepare -- --type beer --input ./source/can.jpg --out ./exports --width 800 --height 800 --quality 90
```

Use PNG only when you need lossless output:

```bash
npm run image:prepare -- --type beer --input ./source/label.png --out ./exports --format png
```
