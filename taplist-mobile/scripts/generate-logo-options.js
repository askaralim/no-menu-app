const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const outDir = path.join(__dirname, '..', 'assets', 'images', 'logo-options');
const size = 1024;
const scale = 3;
const W = size * scale;

const colors = {
  black: '#080808',
  panel: '#111111',
  bgSoft: '#1B1A17',
  cream: '#F5F1E6',
  muted: '#B8B0A2',
  amber: '#FFB44C',
  gold: '#C89435',
  copper: '#B56A3C',
  olive: '#A8C23F',
  line: '#28251F',
};

function hexToRgb(hex) {
  const value = hex.replace('#', '');
  return {
    r: Number.parseInt(value.slice(0, 2), 16),
    g: Number.parseInt(value.slice(2, 4), 16),
    b: Number.parseInt(value.slice(4, 6), 16),
  };
}

function blendPixel(data, x, y, color, alpha = 1) {
  if (x < 0 || y < 0 || x >= W || y >= W) return;
  const idx = (y * W + x) * 4;
  const src = hexToRgb(color);
  const a = Math.max(0, Math.min(1, alpha));
  data[idx] = Math.round(src.r * a + data[idx] * (1 - a));
  data[idx + 1] = Math.round(src.g * a + data[idx + 1] * (1 - a));
  data[idx + 2] = Math.round(src.b * a + data[idx + 2] * (1 - a));
  data[idx + 3] = 255;
}

function fillRect(data, x, y, w, h, color, alpha = 1) {
  const sx = Math.round(x * scale);
  const sy = Math.round(y * scale);
  const sw = Math.round(w * scale);
  const sh = Math.round(h * scale);
  for (let py = sy; py < sy + sh; py += 1) {
    for (let px = sx; px < sx + sw; px += 1) {
      blendPixel(data, px, py, color, alpha);
    }
  }
}

function fillCircle(data, cx, cy, r, color, alpha = 1) {
  const scx = cx * scale;
  const scy = cy * scale;
  const sr = r * scale;
  const minX = Math.floor(scx - sr);
  const maxX = Math.ceil(scx + sr);
  const minY = Math.floor(scy - sr);
  const maxY = Math.ceil(scy + sr);
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const dx = x + 0.5 - scx;
      const dy = y + 0.5 - scy;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const coverage = Math.max(0, Math.min(1, sr + 0.75 - distance));
      if (coverage > 0) blendPixel(data, x, y, color, alpha * coverage);
    }
  }
}

function strokeCircle(data, cx, cy, r, width, color, alpha = 1) {
  const scx = cx * scale;
  const scy = cy * scale;
  const sr = r * scale;
  const sw = width * scale;
  const minX = Math.floor(scx - sr - sw);
  const maxX = Math.ceil(scx + sr + sw);
  const minY = Math.floor(scy - sr - sw);
  const maxY = Math.ceil(scy + sr + sw);
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const dx = x + 0.5 - scx;
      const dy = y + 0.5 - scy;
      const d = Math.sqrt(dx * dx + dy * dy);
      const edge = Math.abs(d - sr);
      const coverage = Math.max(0, Math.min(1, sw / 2 + 0.75 - edge));
      if (coverage > 0) blendPixel(data, x, y, color, alpha * coverage);
    }
  }
}

function line(data, x1, y1, x2, y2, width, color, alpha = 1) {
  const sx1 = x1 * scale;
  const sy1 = y1 * scale;
  const sx2 = x2 * scale;
  const sy2 = y2 * scale;
  const sw = width * scale;
  const minX = Math.floor(Math.min(sx1, sx2) - sw);
  const maxX = Math.ceil(Math.max(sx1, sx2) + sw);
  const minY = Math.floor(Math.min(sy1, sy2) - sw);
  const maxY = Math.ceil(Math.max(sy1, sy2) + sw);
  const lx = sx2 - sx1;
  const ly = sy2 - sy1;
  const len2 = lx * lx + ly * ly;
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const t = Math.max(0, Math.min(1, ((x - sx1) * lx + (y - sy1) * ly) / len2));
      const px = sx1 + t * lx;
      const py = sy1 + t * ly;
      const dx = x - px;
      const dy = y - py;
      const d = Math.sqrt(dx * dx + dy * dy);
      const coverage = Math.max(0, Math.min(1, sw / 2 + 0.75 - d));
      if (coverage > 0) blendPixel(data, x, y, color, alpha * coverage);
    }
  }
}

function downsample(high) {
  const low = new PNG({ width: size, height: size });
  const samples = scale * scale;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const idx = (y * size + x) * 4;
      let r = 0;
      let g = 0;
      let b = 0;
      for (let yy = 0; yy < scale; yy += 1) {
        for (let xx = 0; xx < scale; xx += 1) {
          const src = ((y * scale + yy) * W + x * scale + xx) * 4;
          r += high.data[src];
          g += high.data[src + 1];
          b += high.data[src + 2];
        }
      }
      low.data[idx] = Math.round(r / samples);
      low.data[idx + 1] = Math.round(g / samples);
      low.data[idx + 2] = Math.round(b / samples);
      low.data[idx + 3] = 255;
    }
  }
  return low;
}

function render(name, draw) {
  const png = new PNG({ width: W, height: W });
  fillRect(png.data, 0, 0, size, size, colors.black);
  draw(png.data);
  const small = downsample(png);
  fs.writeFileSync(path.join(outDir, `${name}.png`), PNG.sync.write(small));
}

render('no-menu-logo-01-vinyl-menu', (data) => {
  fillCircle(data, 512, 512, 390, colors.panel);
  strokeCircle(data, 512, 512, 350, 3, colors.gold, 0.42);
  strokeCircle(data, 512, 512, 282, 2, colors.cream, 0.12);
  strokeCircle(data, 512, 512, 218, 2, colors.cream, 0.08);
  fillCircle(data, 512, 512, 116, colors.black);
  strokeCircle(data, 512, 512, 116, 16, colors.amber);
  fillCircle(data, 512, 512, 20, colors.cream);
  fillRect(data, 262, 379, 340, 24, colors.cream);
  fillRect(data, 262, 458, 250, 24, colors.muted);
  fillRect(data, 262, 537, 318, 24, colors.muted);
  fillRect(data, 262, 616, 202, 24, colors.muted);
  line(data, 675, 295, 675, 705, 28, colors.amber);
  line(data, 675, 295, 748, 375, 28, colors.amber);
  fillCircle(data, 675, 705, 52, colors.copper);
});

render('no-menu-logo-02-tap-seal', (data) => {
  fillCircle(data, 512, 512, 398, colors.bgSoft);
  strokeCircle(data, 512, 512, 352, 30, colors.line);
  strokeCircle(data, 512, 512, 306, 8, colors.gold, 0.8);
  fillRect(data, 430, 254, 164, 356, colors.amber);
  fillRect(data, 372, 240, 280, 86, colors.cream);
  fillRect(data, 394, 610, 236, 54, colors.copper);
  fillRect(data, 470, 656, 84, 118, colors.copper);
  fillCircle(data, 512, 411, 54, colors.black, 0.95);
  strokeCircle(data, 512, 411, 72, 10, colors.cream, 0.7);
  fillRect(data, 332, 748, 360, 22, colors.cream);
  fillRect(data, 382, 794, 260, 18, colors.muted);
  fillRect(data, 432, 838, 160, 18, colors.muted);
});

render('no-menu-logo-03-night-pull', (data) => {
  fillCircle(data, 512, 512, 382, colors.black);
  strokeCircle(data, 512, 512, 360, 18, colors.gold);
  strokeCircle(data, 512, 512, 292, 2, colors.cream, 0.16);
  line(data, 358, 284, 666, 284, 34, colors.cream);
  line(data, 512, 286, 512, 652, 42, colors.amber);
  fillCircle(data, 512, 652, 112, colors.copper);
  fillCircle(data, 512, 652, 58, colors.black);
  fillCircle(data, 512, 652, 18, colors.cream);
  line(data, 335, 780, 690, 780, 20, colors.muted);
  line(data, 398, 826, 626, 826, 16, colors.muted);
  line(data, 454, 872, 570, 872, 14, colors.olive);
});

render('no-menu-logo-04-quiet-monogram', (data) => {
  fillCircle(data, 512, 512, 394, colors.panel);
  strokeCircle(data, 512, 512, 344, 5, colors.gold, 0.72);
  strokeCircle(data, 512, 512, 246, 2, colors.cream, 0.12);
  line(data, 344, 292, 344, 732, 44, colors.cream);
  line(data, 344, 292, 512, 732, 44, colors.amber);
  line(data, 512, 732, 680, 292, 44, colors.copper);
  line(data, 680, 292, 680, 732, 44, colors.cream);
  fillCircle(data, 512, 512, 42, colors.black);
  strokeCircle(data, 512, 512, 42, 8, colors.gold, 0.85);
});

render('no-menu-logo-05-editorial-list', (data) => {
  fillCircle(data, 512, 512, 384, colors.black);
  strokeCircle(data, 512, 512, 348, 3, colors.gold, 0.55);
  line(data, 312, 294, 712, 294, 22, colors.cream);
  line(data, 312, 392, 620, 392, 18, colors.muted, 0.86);
  line(data, 312, 490, 700, 490, 18, colors.muted, 0.86);
  line(data, 312, 588, 578, 588, 18, colors.muted, 0.86);
  line(data, 312, 686, 654, 686, 18, colors.muted, 0.86);
  fillCircle(data, 738, 392, 28, colors.amber);
  fillCircle(data, 738, 490, 28, colors.copper);
  fillCircle(data, 738, 588, 28, colors.olive);
  fillCircle(data, 738, 686, 28, colors.gold);
  line(data, 260, 808, 764, 808, 8, colors.line);
});

render('no-menu-logo-06-night-label', (data) => {
  fillCircle(data, 512, 512, 390, colors.bgSoft);
  strokeCircle(data, 512, 512, 352, 6, colors.gold, 0.72);
  fillRect(data, 304, 278, 416, 468, colors.black, 0.96);
  strokeCircle(data, 512, 512, 190, 2, colors.cream, 0.08);
  line(data, 382, 388, 642, 388, 24, colors.cream);
  line(data, 382, 468, 584, 468, 18, colors.muted);
  line(data, 382, 548, 672, 548, 18, colors.muted);
  line(data, 382, 628, 536, 628, 18, colors.muted);
  fillCircle(data, 642, 468, 22, colors.amber);
  fillCircle(data, 726, 278, 54, colors.copper);
  fillCircle(data, 726, 278, 22, colors.black);
});

render('no-menu-logo-07-after-hours-mark', (data) => {
  fillCircle(data, 512, 512, 380, colors.black);
  strokeCircle(data, 512, 512, 340, 20, colors.gold);
  strokeCircle(data, 512, 512, 238, 2, colors.cream, 0.14);
  fillCircle(data, 512, 512, 98, colors.panel);
  strokeCircle(data, 512, 512, 98, 12, colors.amber);
  line(data, 512, 228, 512, 350, 24, colors.cream);
  line(data, 512, 674, 512, 796, 24, colors.muted);
  line(data, 228, 512, 350, 512, 24, colors.muted);
  line(data, 674, 512, 796, 512, 24, colors.cream);
  line(data, 310, 310, 396, 396, 18, colors.copper);
  line(data, 628, 628, 714, 714, 18, colors.copper);
  line(data, 714, 310, 628, 396, 18, colors.olive);
  line(data, 396, 628, 310, 714, 18, colors.olive);
  fillCircle(data, 512, 512, 26, colors.cream);
});
