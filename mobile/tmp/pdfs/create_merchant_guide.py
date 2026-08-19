from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    Image,
    KeepTogether,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)


ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "output/pdf/no-menu-tonight-merchant-guide-v1.pdf"
LOGO = ROOT / "assets/brand/no-menu-tonight-horizontal-dark.png"
FONT = "/System/Library/Fonts/STHeiti Medium.ttc"

PAGE_W, PAGE_H = A4
BLACK = colors.HexColor("#0A0A0A")
INK = colors.HexColor("#191714")
GOLD = colors.HexColor("#D99A32")
GOLD_DARK = colors.HexColor("#9B6515")
CREAM = colors.HexColor("#F7F2E8")
SOFT = colors.HexColor("#EEE7DA")
MUTED = colors.HexColor("#6E675E")
GREEN = colors.HexColor("#2E7D55")
RED = colors.HexColor("#A94442")


def register_fonts():
    pdfmetrics.registerFont(TTFont("CN", FONT, subfontIndex=0))


register_fonts()


styles = getSampleStyleSheet()
styles.add(
    ParagraphStyle(
        name="CoverTitleCN",
        fontName="CN",
        fontSize=28,
        leading=38,
        textColor=colors.white,
        alignment=TA_LEFT,
        spaceAfter=8 * mm,
    )
)
styles.add(
    ParagraphStyle(
        name="CoverSubCN",
        fontName="CN",
        fontSize=13,
        leading=22,
        textColor=colors.HexColor("#D8D2C8"),
        alignment=TA_LEFT,
    )
)
styles.add(
    ParagraphStyle(
        name="H1CN",
        fontName="CN",
        fontSize=22,
        leading=30,
        textColor=INK,
        spaceAfter=6 * mm,
    )
)
styles.add(
    ParagraphStyle(
        name="H2CN",
        fontName="CN",
        fontSize=14,
        leading=21,
        textColor=INK,
        spaceBefore=3 * mm,
        spaceAfter=2 * mm,
    )
)
styles.add(
    ParagraphStyle(
        name="BodyCN",
        fontName="CN",
        fontSize=10.5,
        leading=17,
        textColor=INK,
        spaceAfter=2.5 * mm,
    )
)
styles.add(
    ParagraphStyle(
        name="SmallCN",
        fontName="CN",
        fontSize=8.5,
        leading=13,
        textColor=MUTED,
    )
)
styles.add(
    ParagraphStyle(
        name="CalloutCN",
        fontName="CN",
        fontSize=11,
        leading=18,
        textColor=INK,
        leftIndent=3 * mm,
        rightIndent=3 * mm,
    )
)
styles.add(
    ParagraphStyle(
        name="CenterCN",
        fontName="CN",
        fontSize=10,
        leading=15,
        textColor=INK,
        alignment=TA_CENTER,
    )
)
styles.add(
    ParagraphStyle(
        name="CoverMetaCN",
        fontName="CN",
        fontSize=9,
        leading=14,
        textColor=colors.HexColor("#E8E1D6"),
        alignment=TA_CENTER,
    )
)
styles.add(
    ParagraphStyle(
        name="TableHeadCN",
        fontName="CN",
        fontSize=10,
        leading=15,
        textColor=colors.white,
        alignment=TA_LEFT,
    )
)
styles.add(
    ParagraphStyle(
        name="TableCN",
        fontName="CN",
        fontSize=9.3,
        leading=14,
        textColor=INK,
    )
)


def p(text, style="BodyCN"):
    return Paragraph(text, styles[style])


def bullet(text):
    return Paragraph("•  " + text, styles["BodyCN"])


def callout(title, text, tone="gold"):
    bg = CREAM if tone == "gold" else colors.HexColor("#EAF4EE")
    border = GOLD if tone == "gold" else GREEN
    table = Table(
        [[p(f"<font color='{border.hexval()}'>{title}</font><br/>{text}", "CalloutCN")]],
        colWidths=[166 * mm],
    )
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), bg),
                ("BOX", (0, 0), (-1, -1), 0.8, border),
                ("LEFTPADDING", (0, 0), (-1, -1), 5 * mm),
                ("RIGHTPADDING", (0, 0), (-1, -1), 5 * mm),
                ("TOPPADDING", (0, 0), (-1, -1), 4 * mm),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4 * mm),
            ]
        )
    )
    return table


def section_title(kicker, title, intro=None):
    items = [p(f"<font color='{GOLD_DARK.hexval()}'>{kicker}</font>", "SmallCN"), p(title, "H1CN")]
    if intro:
        items.append(p(intro))
    return items


def two_col_cards(cards):
    rows = []
    for idx in range(0, len(cards), 2):
        row = []
        for title, body in cards[idx : idx + 2]:
            row.append(p(f"<font color='{GOLD_DARK.hexval()}'>{title}</font><br/>{body}", "CalloutCN"))
        while len(row) < 2:
            row.append("")
        rows.append(row)
    t = Table(rows, colWidths=[81 * mm, 81 * mm], hAlign="LEFT")
    t.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), CREAM),
                ("BOX", (0, 0), (-1, -1), 0.6, SOFT),
                ("INNERGRID", (0, 0), (-1, -1), 0.6, SOFT),
                ("LEFTPADDING", (0, 0), (-1, -1), 5 * mm),
                ("RIGHTPADDING", (0, 0), (-1, -1), 5 * mm),
                ("TOPPADDING", (0, 0), (-1, -1), 5 * mm),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5 * mm),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ]
        )
    )
    return t


def simple_table(headers, rows, widths):
    data = [[p(h, "TableHeadCN") for h in headers]]
    data.extend([[p(cell, "TableCN") for cell in row] for row in rows])
    t = Table(data, colWidths=widths, repeatRows=1, hAlign="LEFT")
    t.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), BLACK),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, CREAM]),
                ("GRID", (0, 0), (-1, -1), 0.45, SOFT),
                ("LEFTPADDING", (0, 0), (-1, -1), 3.5 * mm),
                ("RIGHTPADDING", (0, 0), (-1, -1), 3.5 * mm),
                ("TOPPADDING", (0, 0), (-1, -1), 3 * mm),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 3 * mm),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ]
        )
    )
    return t


def cover_page(canvas, doc):
    canvas.saveState()
    canvas.setFillColor(BLACK)
    canvas.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)
    canvas.setFillColor(GOLD)
    canvas.rect(0, 0, PAGE_W, 8 * mm, fill=1, stroke=0)
    canvas.restoreState()


def later_page(canvas, doc):
    canvas.saveState()
    canvas.setFillColor(colors.HexColor("#FBFAF7"))
    canvas.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)
    canvas.setStrokeColor(SOFT)
    canvas.line(22 * mm, PAGE_H - 16 * mm, PAGE_W - 22 * mm, PAGE_H - 16 * mm)
    canvas.setFont("CN", 7.5)
    canvas.setFillColor(MUTED)
    canvas.drawString(22 * mm, PAGE_H - 12 * mm, "NO MENU TONIGHT · 商家端使用指南")
    canvas.drawRightString(PAGE_W - 22 * mm, 11 * mm, f"{doc.page - 1}")
    canvas.restoreState()


def build_story():
    story = []

    # Cover
    story += [Spacer(1, 30 * mm)]
    story.append(Image(str(LOGO), width=166 * mm, height=62.25 * mm))
    story += [Spacer(1, 20 * mm)]
    story.append(p("商家端使用指南", "CoverTitleCN"))
    story.append(p("实时维护酒单、商品状态、门店资料、公开网页和门店二维码", "CoverSubCN"))
    story += [Spacer(1, 22 * mm)]
    story.append(
        Table(
            [[p("适合店主与员工", "CoverMetaCN"), p("iPhone App", "CoverMetaCN"), p("版本 1.0", "CoverMetaCN")]],
            colWidths=[52 * mm] * 3,
            style=TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#1B1916")),
                    ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#554B3C")),
                    ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#554B3C")),
                    ("TOPPADDING", (0, 0), (-1, -1), 4 * mm),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 4 * mm),
                ]
            ),
        )
    )
    story += [Spacer(1, 20 * mm), p("2026 年 8 月", "CoverSubCN"), PageBreak()]

    # Quick start
    story += section_title("先看这一页", "3 分钟快速上手", "No Menu Tonight 就是店里酒单的遥控器。先完成下面 5 步，就可以让顾客看到实时酒单。")
    steps = [
        ("1  登录门店", "使用 No Menu 提供的店主账号登录。员工点“我有邀请码”，填写手机号、初始密码和邀请码。"),
        ("2  填写门店资料", "进入“门店 → 基本信息”，填写店名、商圈、地址、简介和营业时间，然后保存。"),
        ("3  建立商品库", "进入“商品库 → 新增商品”，录入酒款名称、酒厂、风格和图片。杯型与价格可以以后再填。"),
        ("4  加入今晚酒单", "在商品库找到今天供应的酒，点“加入酒单”，选择状态和枪号。新开桶一般选“上新”。"),
        ("5  发布门店", "进入“门店 → 公开酒单”，选择“已公开”。网页、二维码和 No Menu 会同步展示。"),
    ]
    for title, body in steps:
        story.append(KeepTogether([p(title, "H2CN"), p(body)]))
    story += [Spacer(1, 3 * mm), callout("日常只需记住", "新开桶点“上新”，卖完点“售罄”，换酒时把旧酒移出、把新酒加入。门店保持“已公开”即可。", "green"), PageBreak()]

    # Core concepts
    story += section_title("三个主要页面", "先分清“仓库”和“今晚酒单”")
    story.append(
        two_col_cards(
            [
                ("酒单", "今天店里正在展示什么。每天换酒、售罄、改枪号，主要在这里操作。"),
                ("商品库", "店里使用过或以后可能使用的商品资料。酒卖完不必删除，下次进货可以直接再用。"),
                ("门店", "控制顾客看到的门店资料、价格、网页、二维码、活动和员工。"),
                ("预览", "站在顾客角度检查公开酒单。发布前和修改后都可以看一眼。"),
            ]
        )
    )
    story += [Spacer(1, 7 * mm)]
    story.append(callout("最重要的区别", "“商品库”像仓库；“酒单”像今晚吧台。商品在仓库里，不代表顾客已经能看到。必须加入酒单并设为公开。"))
    story += [Spacer(1, 7 * mm)]
    story.append(p("商家账号如何加入", "H2CN"))
    story.append(bullet("店主账号由 No Menu 开通。"))
    story.append(bullet("员工使用店主发来的手机号、初始密码和邀请码加入。"))
    story.append(bullet("没有门店权限时，请先向店主或 No Menu 确认，不要重复注册。"))
    story += [PageBreak()]

    # Product library
    story += section_title("商品库", "把商品资料准备好，以后换酒更快")
    story.append(p("进入“商品库 → 新增商品”，填写顾客需要了解的信息。建议至少填写商品名称、酒厂、风格和图片。"))
    story.append(
        simple_table(
            ["内容", "是否必须", "建议"],
            [
                ["商品名称", "建议填写", "使用顾客熟悉、容易搜索的名称。"],
                ["酒厂 / 风格", "建议填写", "能帮助顾客快速判断口味。"],
                ["图片", "建议上传", "清晰的酒标或罐身图更容易识别。"],
                ["酒精度等资料", "可选", "有资料就填，不必为了填满而猜测。"],
                ["规格 / 价格", "可选", "没有价格也可以保存并加入酒单。"],
            ],
            [42 * mm, 28 * mm, 96 * mm],
        )
    )
    story += [Spacer(1, 6 * mm)]
    story.append(p("商品库里的三个列表", "H2CN"))
    story.append(bullet("可用：可以随时加入酒单。"))
    story.append(bullet("已下架：暂时不用，但资料仍然保留。"))
    story.append(bullet("全部：查看所有商品。"))
    story += [Spacer(1, 4 * mm), callout("不要随便删除资料", "一款酒卖完后，通常只需要从酒单移出。以后再次进货时，可以直接从商品库重新加入。"), PageBreak()]

    # Taplist
    story += section_title("酒单", "每天最常用的页面")
    story.append(p("酒单页顶部会显示总计、上新、售罄和隐藏数量。可以使用筛选快速找到酒款，也可以点“预览”查看顾客实际看到的内容。"))
    story.append(
        simple_table(
            ["按钮", "什么时候用", "顾客看到什么"],
            [
                ["上新", "刚换上的新酒", "显示为最近上新的酒款。"],
                ["标为在售", "新酒进入稳定供应", "显示为正常供应。"],
                ["售罄", "酒已经卖完", "显示为售罄，避免顾客误会还能喝到。"],
                ["恢复在售", "售罄点错或重新供应", "重新显示为正常供应。"],
                ["移出", "不再属于当前酒单", "从当前酒单消失，但商品库仍保留。"],
                ["更多 …", "隐藏、即将上新、查看记录", "根据选择更新公开展示。"],
            ],
            [30 * mm, 58 * mm, 78 * mm],
        )
    )
    story += [Spacer(1, 6 * mm)]
    story.append(p("枪号怎么设置", "H2CN"))
    story.append(p("点击酒款左侧的“#”或现有枪号，选择新的号码。枪号用于让线上酒单与吧台位置保持一致。没有固定酒头的商品也可以不设置。"))
    story += [PageBreak()]

    # Status vs visibility
    story += section_title("状态与显示", "售罄、隐藏、移出、下架，区别在哪？")
    story.append(
        simple_table(
            ["操作", "它的意思", "以后还能找回吗"],
            [
                ["售罄", "酒卖完了，但保留最近供应过的信息。", "可以点“恢复在售”。"],
                ["酒单隐藏", "员工还能看到，顾客暂时看不到。", "可以随时“设为公开”。"],
                ["移出酒单", "不再属于今晚酒单。", "商品库仍保留，可再次加入。"],
                ["商品库下架", "这个商品暂时不再使用，同时离开酒单。", "在“已下架”里重新上架。"],
                ["门店未公开", "整家门店从网页、二维码和 No Menu 下线。", "店主可以重新发布。"],
            ],
            [33 * mm, 83 * mm, 50 * mm],
        )
    )
    story += [Spacer(1, 8 * mm)]
    story.append(callout("正常换酒不要关闭整家门店", "只想处理一款酒时，使用“售罄”“隐藏”或“移出”。“门店未公开”会让整个公开酒单都无法访问。"))
    story += [Spacer(1, 7 * mm)]
    story.append(p("“即将上新”适合什么情况？", "H2CN"))
    story.append(p("酒已经确定会来，但还没有正式开桶时，可以设为“即将上新”，提前告诉顾客下一款是什么。正式开桶后再改为“上新”。"))
    story += [PageBreak()]

    # Daily workflows
    story += section_title("照着做", "最常见的 5 个日常操作")
    routines = [
        ("新酒开桶", "商品库 → 找到酒款 → 加入酒单 → 选择枪号 → 状态选“上新” → 保存"),
        ("酒卖完", "酒单 → 找到酒款 → 售罄。点错时立即点“撤销”或“恢复在售”。"),
        ("同一枪位换酒", "旧酒先售罄或移出 → 商品库找到新酒 → 加入酒单 → 选择原枪号 → 上新"),
        ("暂时不展示", "酒单 → 更多“…” → 酒单隐藏。需要恢复时点“设为公开”。"),
        ("检查顾客页面", "酒单 → 预览。确认酒名、状态、枪号和价格是否正确。"),
    ]
    for title, body in routines:
        story.append(KeepTogether([p(title, "H2CN"), callout("操作路径", body, "green"), Spacer(1, 2 * mm)]))
    story += [PageBreak()]

    # Price and cup sizes
    story += section_title("杯型与价格", "可以设置，也可以暂时不填")
    story.append(p("编辑商品时，在“规格 / 价格”中填写杯型、容量和价格。例如：小杯 250ml / ¥38，大杯 400ml / ¥58。"))
    story.append(p("如果店里经常使用固定杯型，先进入“门店 → 常用杯型”设置名称和容量。以后编辑商品时可以一键填入，只修改价格。"))
    story += [Spacer(1, 4 * mm)]
    story.append(
        two_col_cards(
            [
                ("隐藏价格", "顾客看不到杯型和价格。这是门店的默认选择。"),
                ("展示价格", "顾客可以在公开酒单中看到杯型和价格。"),
            ]
        )
    )
    story += [Spacer(1, 7 * mm)]
    story.append(p("在哪里控制价格是否公开？", "H2CN"))
    story.append(p("进入“门店 → 价格展示”，选择“隐藏价格”或“展示价格”。这个设置对整家门店生效。"))
    story += [Spacer(1, 4 * mm)]
    story.append(callout("没有价格也能发布", "规格和价格不是必填项。未设置价格的商品仍然可以加入酒单并公开展示。"))
    story += [PageBreak()]

    # Publishing and QR
    story += section_title("公开酒单", "一次发布，网页、二维码和 No Menu 同步更新")
    story.append(p("酒单准备好后，进入“门店 → 公开酒单”，选择“已公开”。首次发布前，系统会检查门店资料与酒单是否完整；如果缺少内容，会直接告诉你需要补什么。"))
    story.append(p("门店已经公开后，修改酒款状态、枪号、价格或门店资料，不需要再次点击发布。保存后公开内容会同步更新。"))
    story += [Spacer(1, 4 * mm)]
    story.append(p("二维码与公开链接", "H2CN"))
    story.append(p("进入“门店 → 二维码 & 酒单链接”，可以："))
    story.append(bullet("在浏览器中打开公开酒单。"))
    story.append(bullet("复制公开酒单链接。"))
    story.append(bullet("保存高清二维码到相册。"))
    story.append(bullet("把二维码分享到微信群、朋友圈、公众号或活动海报。"))
    story += [Spacer(1, 4 * mm)]
    story.append(callout("二维码可以长期使用", "同一个门店二维码会一直指向最新酒单。换酒后不用重新制作二维码。门店未公开时，二维码可以先保存，但顾客暂时无法正常查看。", "green"))
    story += [PageBreak()]

    # Profile, events, staff
    story += section_title("门店管理", "资料、活动和员工放在一处")
    story.append(p("基本信息", "H2CN"))
    story.append(p("填写展示名、商圈、地址、简介、营业时间和标签。凌晨打烊可以直接填写跨夜时间，例如 17:00 开门、02:00 打烊。"))
    story.append(p("活动", "H2CN"))
    story.append(p("进入“门店 → 活动 → 新建活动”，上传海报并填写标题。可以填写开始和结束日期，也可以不填日期作为长期展示。公开后的活动会同步展示在公开网页和 No Menu。"))
    story.append(p("员工", "H2CN"))
    story.append(p("店主进入“门店 → 员工”，输入员工手机号生成邀请。请把系统显示的手机号、初始密码和邀请码一次性完整发给员工。"))
    story += [Spacer(1, 4 * mm)]
    story.append(
        simple_table(
            ["身份", "主要负责"],
            [
                ["店主", "门店发布、价格公开设置、员工管理，以及日常酒单维护。"],
                ["员工", "根据门店安排更新酒单、商品状态和日常公开内容。"],
            ],
            [35 * mm, 131 * mm],
        )
    )
    story += [PageBreak()]

    # Analytics & troubleshooting
    story += section_title("经营数据与排查", "需要复盘时再看，不必每天操作")
    story.append(p("“门店 → 经营数据”可以查看商品总数、公开商品、公开上新、本月售罄，以及酒款从上新到售罄经历了多久。它主要帮助店主了解酒单更新和售罄节奏。"))
    story.append(p("顾客为什么看不到某款酒？", "H2CN"))
    story.append(bullet("确认门店处于“已公开”。"))
    story.append(bullet("确认商品已经加入酒单。"))
    story.append(bullet("确认酒款没有被设为“酒单隐藏”。"))
    story.append(bullet("确认所属分类没有被关闭。"))
    story.append(bullet("打开“酒单 → 预览”检查顾客实际看到的内容。"))
    story.append(p("二维码打不开怎么办？", "H2CN"))
    story.append(p("先确认门店是否已经发布，再尝试“在浏览器中打开”。如果仍无法访问，请联系 No Menu 支持。"))
    story.append(p("修改后要重新发布吗？", "H2CN"))
    story.append(p("不需要。只要门店保持“已公开”，保存修改后就会同步更新。"))
    story += [Spacer(1, 4 * mm), callout("需要帮助", "访问 nomenuapp.com/support，选择使用帮助，并写清门店名称与遇到的问题。"), PageBreak()]

    # Final cheat sheet
    story += section_title("最后一页", "老板速查表")
    story.append(
        simple_table(
            ["我要做什么", "直接这样操作"],
            [
                ["新酒开桶", "商品库 → 加入酒单 → 选枪号 → 上新"],
                ["酒卖完", "酒单 → 售罄"],
                ["售罄点错", "酒单 → 恢复在售"],
                ["换枪号", "酒单 → 点击左侧 #枪号 → 选择新号码"],
                ["暂时隐藏一款酒", "酒单 → 更多“…” → 酒单隐藏"],
                ["把酒从今晚酒单移走", "酒单 → 移出"],
                ["查看顾客页面", "酒单 → 预览"],
                ["保存二维码", "门店 → 二维码 & 酒单链接 → 保存"],
                ["发布活动", "门店 → 活动 → 新建活动 → 保存并公开"],
                ["邀请员工", "门店 → 员工 → 生成邀请码"],
            ],
            [55 * mm, 111 * mm],
        )
    )
    story += [Spacer(1, 10 * mm)]
    story.append(callout("一句口诀", "商品先放进“商品库”，今天要卖的再“加入酒单”；新开桶点“上新”，卖完点“售罄”；门店保持“已公开”，网页、二维码和 No Menu 就会同步更新。", "green"))
    story += [Spacer(1, 15 * mm)]
    story.append(p("No Menu Tonight · 让顾客来之前就知道今天有什么", "CenterCN"))
    story.append(p("支持中心：nomenuapp.com/support", "CenterCN"))
    return story


def main():
    OUT.parent.mkdir(parents=True, exist_ok=True)
    doc = BaseDocTemplate(
        str(OUT),
        pagesize=A4,
        leftMargin=22 * mm,
        rightMargin=22 * mm,
        topMargin=22 * mm,
        bottomMargin=18 * mm,
        title="No Menu Tonight 商家端使用指南",
        author="No Menu",
        subject="酒吧实时酒单管理与发布",
    )
    cover_frame = Frame(22 * mm, 16 * mm, PAGE_W - 44 * mm, PAGE_H - 32 * mm, id="cover")
    body_frame = Frame(22 * mm, 18 * mm, PAGE_W - 44 * mm, PAGE_H - 40 * mm, id="body")
    doc.addPageTemplates(
        [
            PageTemplate(id="Cover", frames=[cover_frame], onPage=cover_page, autoNextPageTemplate="Body"),
            PageTemplate(id="Body", frames=[body_frame], onPage=later_page),
        ]
    )
    doc.build(build_story())
    print(OUT)


if __name__ == "__main__":
    main()
