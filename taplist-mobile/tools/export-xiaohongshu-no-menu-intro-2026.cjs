const fs = require("fs");
const path = require("path");
const { createCanvas, loadImage, GlobalFonts } = require("@napi-rs/canvas");

const root = path.resolve(__dirname, "..");
const sourceDir = path.join(root, "output/xiaohongshu-intro-refresh/sources");
const outputDir = path.join(root, "output/xiaohongshu-intro-refresh/final");
const width = 1080;
const height = 1440;

const colors = {
  black: "#070806",
  panel: "#11120f",
  paper: "#f0ede6",
  muted: "#aaa294",
  gold: "#dda23d",
  softGold: "#c9aa70",
  line: "#3a3022",
};

GlobalFonts.registerFromPath("/System/Library/Fonts/Supplemental/Arial Unicode.ttf", "NoMenu Sans");
GlobalFonts.registerFromPath(
  path.join(root, "node_modules/@expo-google-fonts/bebas-neue/400Regular/BebasNeue_400Regular.ttf"),
  "Bebas Neue Local"
);

function roundedRect(ctx, x, y, w, h, radius) {
  const r = Math.min(radius, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawText(ctx, text, x, y, size, options = {}) {
  const {
    color = colors.paper,
    weight = 600,
    family = "NoMenu Sans",
    letterSpacing = 0,
  } = options;
  ctx.fillStyle = color;
  const canvasWeight = Number(weight) >= 600 ? "bold" : "normal";
  ctx.font = `${canvasWeight} ${size}px "${family}"`;
  ctx.textBaseline = "top";
  if (!letterSpacing) {
    ctx.fillText(text, x, y);
    return;
  }
  let cursor = x;
  for (const character of text) {
    ctx.fillText(character, cursor, y);
    cursor += ctx.measureText(character).width + letterSpacing;
  }
}

function drawBrand(ctx, text = "NO MENU") {
  drawText(ctx, text, 72, 65, 29, {
    color: colors.softGold,
    weight: 700,
    family: "Bebas Neue Local",
    letterSpacing: 5,
  });
}

function drawFrame(ctx) {
  ctx.strokeStyle = "rgba(221,162,61,.27)";
  ctx.lineWidth = 1;
  ctx.strokeRect(40.5, 40.5, 999, 1359);
}

function drawTexture(ctx) {
  ctx.strokeStyle = "rgba(255,255,255,.018)";
  ctx.lineWidth = 1;
  for (let y = 0; y <= height; y += 5) {
    ctx.beginPath();
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(width, y + 0.5);
    ctx.stroke();
  }
}

function drawOrbits(ctx, centerX, centerY) {
  for (const [radius, alpha] of [[350, .17], [445, .13], [545, .1], [660, .07]]) {
    ctx.strokeStyle = `rgba(201,170,112,${alpha})`;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawLeftVeil(ctx, veilWidth) {
  const gradient = ctx.createLinearGradient(0, 0, veilWidth, 0);
  gradient.addColorStop(0, colors.black);
  gradient.addColorStop(.56, colors.black);
  gradient.addColorStop(.78, "rgba(7,8,6,.86)");
  gradient.addColorStop(1, "rgba(7,8,6,0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, veilWidth, height);
}

function drawRoundedImage(ctx, image, x, y, w, h, options = {}) {
  const { radius = 28, rotation = 0, fit = "cover", focus = .35 } = options;
  ctx.save();
  ctx.translate(x + w / 2, y + h / 2);
  ctx.rotate(rotation * Math.PI / 180);
  const rx = -w / 2;
  const ry = -h / 2;

  ctx.fillStyle = "rgba(0,0,0,.48)";
  roundedRect(ctx, rx, ry + 18, w, h, radius);
  ctx.fill();

  roundedRect(ctx, rx, ry, w, h, radius);
  ctx.clip();
  ctx.fillStyle = colors.panel;
  ctx.fillRect(rx, ry, w, h);

  if (fit === "contain") {
    const scale = Math.min(w / image.width, h / image.height);
    const dw = image.width * scale;
    const dh = image.height * scale;
    ctx.drawImage(image, rx + (w - dw) / 2, ry + (h - dh) / 2, dw, dh);
  } else {
    const targetAspect = w / h;
    const imageAspect = image.width / image.height;
    let sx = 0;
    let sy = 0;
    let sw = image.width;
    let sh = image.height;
    if (imageAspect < targetAspect) {
      sh = image.width / targetAspect;
      sy = Math.max(0, Math.min(image.height - sh, image.height * focus - sh / 2));
    } else if (imageAspect > targetAspect) {
      sw = image.height * targetAspect;
      sx = (image.width - sw) / 2;
    }
    ctx.drawImage(image, sx, sy, sw, sh, rx, ry, w, h);
  }

  ctx.restore();
  ctx.save();
  ctx.translate(x + w / 2, y + h / 2);
  ctx.rotate(rotation * Math.PI / 180);
  ctx.strokeStyle = "rgba(201,170,112,.36)";
  ctx.lineWidth = 1.2;
  roundedRect(ctx, -w / 2, -h / 2, w, h, radius);
  ctx.stroke();
  ctx.restore();
}

function newSlide(draw) {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = colors.black;
  ctx.fillRect(0, 0, width, height);
  const glow = ctx.createRadialGradient(930, 40, 0, 930, 40, 420);
  glow.addColorStop(0, "rgba(92,67,28,.18)");
  glow.addColorStop(1, "rgba(92,67,28,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);
  draw(ctx);
  drawTexture(ctx);
  drawFrame(ctx);
  return canvas;
}

async function main() {
  fs.mkdirSync(outputDir, { recursive: true });
  const [home, mine, nearby, barDetail, recorded, report, merchant] = await Promise.all([
    "home.png", "mine.png", "nearby.png", "bar-detail.png", "recorded.png", "report.png", "merchant.png",
  ].map((name) => loadImage(path.join(sourceDir, name))));

  const slides = [
    ["01-no-menu.png", newSlide((ctx) => {
      drawOrbits(ctx, 1000, 60);
      drawBrand(ctx);
      drawText(ctx, "现在的", 72, 170, 103, { weight: 650, letterSpacing: -5 });
      drawText(ctx, "No Menu", 72, 285, 103, { weight: 650, color: colors.gold, letterSpacing: -4 });
      drawText(ctx, "看实时酒单，记录喝过的 TAP", 72, 416, 28, { color: colors.muted, weight: 400, letterSpacing: 1 });
      drawRoundedImage(ctx, home, 55, 500, 430, 930, { fit: "contain", rotation: -1.8 });
      drawRoundedImage(ctx, mine, 635, 560, 390, 844, { fit: "contain", rotation: 2 });
    })],
    ["02-nearby.png", newSlide((ctx) => {
      drawRoundedImage(ctx, nearby, 430, 60, 600, 1320, { radius: 30, rotation: .7, focus: .51 });
      drawLeftVeil(ctx, 650);
      drawBrand(ctx);
      drawText(ctx, "离今晚", 72, 205, 92, { weight: 650, letterSpacing: -5 });
      drawText(ctx, "更近一点", 72, 310, 92, { weight: 650, color: colors.gold, letterSpacing: -5 });
    })],
    ["03-live-tap.png", newSlide((ctx) => {
      drawRoundedImage(ctx, barDetail, 405, 55, 625, 1330, { radius: 30, rotation: -.65, focus: .48 });
      drawLeftVeil(ctx, 650);
      drawBrand(ctx);
      drawText(ctx, "酒吧实时", 72, 205, 87, { weight: 650, letterSpacing: -5 });
      drawText(ctx, "TAP", 72, 305, 87, { weight: 650, color: colors.gold, letterSpacing: -5 });
    })],
    ["04-recorded-tap.png", newSlide((ctx) => {
      drawBrand(ctx);
      drawText(ctx, "记录喝过的 TAP", 72, 170, 86, { weight: 650, letterSpacing: -5 });
      drawText(ctx, "按月份回看，仅自己可见", 72, 283, 25, { color: colors.muted, weight: 400, letterSpacing: 1 });
      drawRoundedImage(ctx, recorded, 55, 535, 485, 850, { rotation: -1.4, focus: .59 });
      drawRoundedImage(ctx, report, 555, 465, 475, 920, { rotation: 1.7, focus: .36 });
    })],
    ["05-for-bars.png", newSlide((ctx) => {
      drawRoundedImage(ctx, merchant, 405, 55, 625, 1330, { radius: 30, rotation: .8, focus: .45 });
      drawLeftVeil(ctx, 660);
      drawBrand(ctx, "NO MENU TONIGHT");
      drawText(ctx, "合作酒吧", 72, 220, 83, { weight: 650, letterSpacing: -5 });
      drawText(ctx, "自己更新酒单", 72, 316, 83, { weight: 650, color: colors.gold, letterSpacing: -5 });
    })],
    ["06-more-cities.png", newSlide((ctx) => {
      drawOrbits(ctx, 970, 60);
      drawBrand(ctx);
      drawText(ctx, "还想在哪座城市", 72, 195, 84, { weight: 650, letterSpacing: -5 });
      drawText(ctx, "看到 No Menu？", 72, 295, 84, { weight: 650, color: colors.gold, letterSpacing: -4 });
      const cities = ["上海", "北京", "天津", "青岛", "沈阳", "长春", "滨州", "西安", "更多..."];
      const gridX = 72;
      const gridY = 590;
      const columnWidth = 312;
      const rowHeight = 158;
      ctx.lineWidth = 1;
      ctx.strokeStyle = colors.line;
      cities.forEach((city, index) => {
        const column = index % 3;
        const row = Math.floor(index / 3);
        const x = gridX + column * columnWidth;
        const y = gridY + row * rowHeight;
        ctx.strokeRect(x + .5, y + .5, columnWidth, rowHeight);
        drawText(ctx, city, x + 27, y + 48, 43, {
          weight: 560,
          color: index === 0 ? colors.gold : colors.paper,
          letterSpacing: 2,
        });
      });
      ctx.strokeStyle = colors.gold;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(72, 1230);
      ctx.lineTo(830, 1230);
      ctx.stroke();
      drawText(ctx, "告诉我们城市和酒吧名字", 72, 1255, 34, { weight: 500, letterSpacing: 1 });
    })],
  ];

  for (const [filename, canvas] of slides) {
    fs.writeFileSync(path.join(outputDir, filename), canvas.toBuffer("image/png"));
  }
  console.log(`Rendered ${slides.length} PNG files to ${outputDir}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
