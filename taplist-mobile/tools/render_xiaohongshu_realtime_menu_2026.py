from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps


WIDTH = 1080
HEIGHT = 1440
ROOT = Path(__file__).resolve().parent.parent
CAMPAIGN_DIR = ROOT / "output" / "xiaohongshu-realtime-menu-2026-10-08"
SOURCE_DIR = CAMPAIGN_DIR / "sources"
OUTPUT_DIR = CAMPAIGN_DIR / "final"

PAPER = "#f3efe6"
INK = "#171713"
MUTED = "#6c675e"
GOLD = "#b77b20"
WHITE = "#fffdf8"

CHINESE_FONT = "/System/Library/Fonts/Hiragino Sans GB.ttc"
LATIN_FONT = ROOT / "node_modules/@expo-google-fonts/bebas-neue/400Regular/BebasNeue_400Regular.ttf"


def font(size, latin=False):
    return ImageFont.truetype(str(LATIN_FONT if latin else CHINESE_FONT), size, index=0 if latin else 2)


def text(image, value, xy, size, fill=INK, anchor="la", latin=False):
    ImageDraw.Draw(image).text(xy, value, font=font(size, latin=latin), fill=fill, anchor=anchor)


def base_slide():
    image = Image.new("RGB", (WIDTH, HEIGHT), PAPER)
    draw = ImageDraw.Draw(image)
    for y in range(0, HEIGHT, 8):
        draw.line((0, y, WIDTH, y), fill="#f0eadf", width=1)
    return image


def header(image, title, subtitle=None):
    text(image, "NO MENU", (56, 48), 24, fill=GOLD, latin=True)
    text(image, title, (56, 95), 62)
    if subtitle:
        text(image, subtitle, (58, 178), 25, fill=MUTED)


def rounded_crop(image, source, box, radius=24, centering=(0.5, 0.45)):
    x, y, width, height = box
    fitted = ImageOps.fit(
        source.convert("RGB"),
        (width, height),
        method=Image.Resampling.LANCZOS,
        centering=centering,
    )
    mask = Image.new("L", (width, height), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, width - 1, height - 1), radius=radius, fill=255)
    image.paste(fitted, (x, y), mask)
    ImageDraw.Draw(image).rounded_rectangle(
        (x, y, x + width - 1, y + height - 1), radius=radius, outline="#bdb3a4", width=2
    )


def rounded_contain(image, source, box, radius=24, background=WHITE):
    x, y, width, height = box
    panel = Image.new("RGB", (width, height), background)
    contained = ImageOps.contain(source.convert("RGB"), (width, height), method=Image.Resampling.LANCZOS)
    panel.paste(contained, ((width - contained.width) // 2, (height - contained.height) // 2))
    mask = Image.new("L", (width, height), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, width - 1, height - 1), radius=radius, fill=255)
    image.paste(panel, (x, y), mask)
    ImageDraw.Draw(image).rounded_rectangle(
        (x, y, x + width - 1, y + height - 1), radius=radius, outline="#bdb3a4", width=2
    )


def cover_box(source, box, fill):
    covered = source.convert("RGB").copy()
    ImageDraw.Draw(covered).rectangle(box, fill=fill)
    return covered


def save(image, name):
    image.save(OUTPUT_DIR / name, format="PNG", optimize=True)


def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    mini_consumer = Image.open(SOURCE_DIR / "01-mini-consumer.png")
    menu_white = cover_box(Image.open(SOURCE_DIR / "02-menu-white.jpg"), (690, 1755, 830, 1905), "#ffffff")
    menu_black = cover_box(Image.open(SOURCE_DIR / "03-menu-black.jpg"), (690, 1755, 830, 1905), "#0d0d0d")
    generate_white = cover_box(
        Image.open(SOURCE_DIR / "05-generate-white.png"), (960, 1985, 1090, 2145), "#ffffff"
    )
    generate_black = cover_box(
        Image.open(SOURCE_DIR / "06-generate-black.png"), (960, 1985, 1090, 2145), "#0b0b0a"
    )
    merchant = Image.open(SOURCE_DIR / "07-merchant.png")
    app_consumer = Image.open(SOURCE_DIR / "08-app-consumer.png")

    image = base_slide()
    text(image, "NO MENU", (54, 42), 24, fill=GOLD, latin=True)
    text(image, "酒吧更新酒单后", (54, 84), 70)
    text(image, "顾客马上就能看到", (54, 166), 70, fill=GOLD)
    text(image, "用户端 · 酒吧端 · 酒单图片", (58, 270), 24, fill=MUTED)
    text(image, "顾客看到的酒单", (52, 326), 27)
    text(image, "酒吧管理页面", (550, 326), 27)
    rounded_crop(image, app_consumer, (52, 374, 470, 986), centering=(0.5, 0.36))
    rounded_crop(image, merchant, (550, 374, 478, 476), centering=(0.5, 0.16))
    text(image, "生成的酒单图片", (550, 891), 27)
    rounded_contain(image, menu_white, (550, 932, 228, 428), background=WHITE)
    rounded_contain(image, menu_black, (800, 932, 228, 428), background="#11110f")
    save(image, "01-cover.png")

    image = base_slide()
    header(image, "到店前，先看现在有什么", "酒款、酒厂、风格、ABV、杯型和公开价格")
    text(image, "用户端", (52, 225), 27)
    text(image, "当前酒单", (552, 225), 27, fill=GOLD)
    rounded_crop(image, app_consumer, (52, 270, 476, 1102), centering=(0.5, 0.36))
    rounded_crop(image, mini_consumer, (552, 270, 476, 1102), centering=(0.5, 0.32))
    save(image, "02-consumer.png")

    image = base_slide()
    header(image, "酒吧直接在手机上改酒单", "上酒、替换、售罄、即将上新")
    text(image, "酒吧端", (72, 225), 27, fill=GOLD)
    rounded_crop(image, merchant, (72, 270, 936, 1102), centering=(0.5, 0.30))
    save(image, "03-merchant.png")

    image = base_slide()
    header(image, "选好样式，直接生成酒单", "黑色或白色 · 单栏或双栏 · 分页或长图")
    text(image, "白色酒单", (52, 225), 27)
    text(image, "黑色酒单", (552, 225), 27, fill=GOLD)
    rounded_crop(image, generate_white, (52, 270, 476, 1102), centering=(0.5, 0.42))
    rounded_crop(image, generate_black, (552, 270, 476, 1102), centering=(0.5, 0.42))
    save(image, "04-generate.png")

    image = base_slide()
    header(image, "生成后，直接保存或分享", "以下都是同一家店的实际生成效果")
    rounded_contain(image, menu_white, (52, 244, 476, 1128), background=WHITE)
    rounded_contain(image, menu_black, (552, 244, 476, 1128), background="#11110f")
    save(image, "05-qr.png")

    image = base_slide()
    header(image, "一份酒单，多渠道同时更新", "酒吧改完，顾客看到的就是最新酒单")
    text(image, "用户端", (52, 225), 27)
    text(image, "当前酒单", (552, 225), 27, fill=GOLD)
    rounded_crop(image, app_consumer, (52, 270, 476, 1020), centering=(0.5, 0.36))
    rounded_crop(image, mini_consumer, (552, 270, 476, 1020), centering=(0.5, 0.32))
    text(image, "不用分别维护两份酒单。", (540, 1351), 26, fill=MUTED, anchor="ma")
    save(image, "06-sync.png")


if __name__ == "__main__":
    main()
