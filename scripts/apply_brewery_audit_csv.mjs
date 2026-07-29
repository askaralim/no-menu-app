#!/usr/bin/env node
/**
 * Apply approved brewery/brand audit to brewery_brand_web_verified.csv.
 * Usage: node scripts/apply_brewery_audit_csv.mjs
 */
import { readFileSync, writeFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const CSV_PATH = resolve(
  __dirname,
  '../taplist-mobile/tools/product-pool-audit/brewery_brand_web_verified.csv'
)
const TODAY = '2026-07-23'

function parseCsv(text) {
  const rows = []
  let row = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]
    const next = text[i + 1]
    if (inQuotes) {
      if (ch === '"' && next === '"') {
        field += '"'
        i += 1
      } else if (ch === '"') {
        inQuotes = false
      } else {
        field += ch
      }
      continue
    }
    if (ch === '"') inQuotes = true
    else if (ch === ',') {
      row.push(field)
      field = ''
    } else if (ch === '\n') {
      row.push(field)
      field = ''
      if (row.some((cell) => cell.trim() !== '')) rows.push(row)
      row = []
    } else if (ch !== '\r') field += ch
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field)
    if (row.some((cell) => cell.trim() !== '')) rows.push(row)
  }
  const [header, ...body] = rows
  return {
    header,
    rows: body.map((cells) =>
      Object.fromEntries(header.map((key, idx) => [key, (cells[idx] ?? '').trim()]))
    ),
  }
}

function csvEscape(value) {
  const s = value == null ? '' : String(value)
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function serializeCsv(header, rows) {
  const lines = [header.join(',')]
  for (const row of rows) {
    lines.push(header.map((key) => csvEscape(row[key] ?? '')).join(','))
  }
  return `${lines.join('\n')}\n`
}

function cityCountry(city, countryZh) {
  if (city && countryZh) return `${city}（${countryZh}）`
  if (city) return city
  if (countryZh) return countryZh
  return ''
}

function blankRow(header) {
  return Object.fromEntries(header.map((k) => [k, '']))
}

/** Upsert by source_name match (first), else append. */
function upsertBySource(rows, header, patch) {
  const key = (patch.source_name || '').trim()
  if (!key) throw new Error('patch missing source_name')
  const idx = rows.findIndex((r) => (r.source_name || '').trim() === key)
  if (idx >= 0) {
    rows[idx] = { ...rows[idx], ...patch }
    return 'updated'
  }
  rows.push({ ...blankRow(header), ...patch })
  return 'created'
}

/** Update all rows whose source_name or canonical_group is in keys. */
function updateMatching(rows, keys, patch) {
  const set = new Set(keys)
  let n = 0
  for (let i = 0; i < rows.length; i += 1) {
    if (set.has(rows[i].source_name) || set.has(rows[i].canonical_group)) {
      rows[i] = { ...rows[i], ...patch }
      n += 1
    }
  }
  return n
}

function company({
  source,
  group,
  zh,
  en,
  city = '',
  countryZh,
  code,
  entity = 'brewery_brand',
  status = 'verified',
  confidence = 'high',
  note = '',
  urls = '',
  aliasZh = '',
  aliasEn = '',
  raw = '',
  drinks = '',
  publicN = '',
  samples = '',
  uncertainty = '',
}) {
  return {
    source_name: source,
    canonical_group: group || zh || source,
    verified_name_zh: zh,
    verified_name_en: en,
    verified_city: city,
    verified_country: countryZh,
    country_code: code,
    city_country: cityCountry(city, countryZh),
    verified_entity_type: entity,
    verification_status: status,
    confidence,
    uncertainty_flag: uncertainty,
    operational_status: '',
    verification_note: note,
    source_urls: urls,
    verified_at: TODAY,
    original_candidate_zh: aliasZh,
    original_candidate_en: aliasEn,
    original_suggested_country: '',
    raw_country_values: raw || (city ? `${city}:1` : countryZh ? `${countryZh}:1` : ''),
    drink_count: drinks,
    public_visible_count: publicN,
    sample_drink_names: samples,
    original_review_note: 'audit_2026-07-23_approved',
  }
}

const { header, rows } = parseCsv(readFileSync(CSV_PATH, 'utf8'))
const stats = { updated: 0, created: 0, matched: 0 }

function apply(patch) {
  const action = upsertBySource(rows, header, patch)
  stats[action === 'updated' ? 'updated' : 'created'] += 1
}

// --- B: must-fix ---
stats.matched += updateMatching(rows, ['矛盾体'], {
  ...company({
    source: '矛盾体',
    group: '矛盾体',
    zh: '矛盾体',
    en: 'Halfway Crooks Beer',
    city: 'Atlanta, Georgia',
    countryZh: '美国',
    code: 'US',
    status: 'corrected',
    confidence: 'high',
    note: '审核纠正：矛盾体=Halfway Crooks（佐治亚），不是 Equilibrium。',
    urls: 'https://halfwaycrooks.beer/',
    samples: '亚特兰大出口|基数|法里纳|命令行编译|弧度',
    drinks: '5',
    publicN: '1',
    raw: '美国:1',
  }),
})

apply(
  company({
    source: '稳态',
    group: '稳态',
    zh: '稳态酒厂',
    en: 'Equilibrium Brewery',
    city: 'Middletown, New York',
    countryZh: '美国',
    code: 'US',
    note: '审核确认：稳态=Equilibrium；与矛盾体/Halfway Crooks 分列。',
    urls: 'https://www.eqbrew.com/',
    aliasZh: '稳态',
    samples: '螺旋|生化梦境',
    drinks: '2',
    publicN: '0',
  })
)

apply(
  company({
    source: '分支',
    group: '分支',
    zh: '分支酒厂',
    en: 'Offshoot Beer Co.',
    city: 'Placentia, California',
    countryZh: '美国',
    code: 'US',
    entity: 'brand',
    note: '审核确认：分支=Offshoot（The Bruery 子品牌），不是 Branch & Bone。',
    urls: 'https://www.thebruery.com/pages/offshoot-about-us',
    aliasZh: '分支',
    samples: '妲己',
    drinks: '1',
    publicN: '1',
  })
)

// --- upgrades of existing ---
stats.matched += updateMatching(rows, ['凡人'], {
  verified_name_en: 'Mortalis Brewing Company',
  confidence: 'high',
  verification_status: 'verified',
  verification_note: '审核确认 Avon, NY；英文全称 Mortalis Brewing Company。',
  verified_at: TODAY,
  original_review_note: 'audit_2026-07-23_approved',
})

stats.matched += updateMatching(rows, ['Stone Brewing'], {
  verified_name_zh: '巨石酒厂',
  canonical_group: '巨石酒厂 / Stone Brewing',
  verified_entity_type: 'brand',
  verification_status: 'verified_historical',
  confidence: 'medium',
  verification_note:
    '品牌源自 Escondido；2026 起生产向 Paso Robles / Kansas City 转移，城市为历史主锚点非永久唯一产地。',
  verified_at: TODAY,
  original_candidate_zh: '巨石',
  original_review_note: 'audit_2026-07-23_approved',
})

stats.matched += updateMatching(rows, ['Tree House'], {
  verified_name_zh: '树屋酒厂',
  canonical_group: '树屋酒厂 / Tree House',
  verification_note: '按主要酒厂 Charlton 填写；多地点运营。',
  verified_at: TODAY,
  original_candidate_zh: '树屋',
  original_review_note: 'audit_2026-07-23_approved',
})

stats.matched += updateMatching(rows, ['行空'], {
  canonical_group: '行空酒造',
  verified_name_zh: '行空酒造',
  verified_name_en: 'Xing Kong Artisan Ale',
  verified_city: '青岛',
  verified_country: '中国',
  country_code: 'CN',
  city_country: '青岛（中国）',
  verification_status: 'corrected',
  confidence: 'high',
  uncertainty_flag: '',
  verification_note: '公开中文名为行空酒造；「行空酿造」为别名。',
  verified_at: TODAY,
  original_candidate_zh: '行空|行空酿造',
  raw_country_values: '青岛:1',
  original_review_note: 'audit_2026-07-23_approved',
})

stats.matched += updateMatching(rows, ['田园酿造'], {
  verified_name_zh: '田园酿造',
  verified_name_en: 'FARMentation',
  verified_city: '云南',
  verified_country: '中国',
  country_code: 'CN',
  city_country: '云南（中国）',
  verified_entity_type: 'other',
  verification_status: 'partially_verified',
  confidence: 'medium',
  uncertainty_flag: 'city_unverified',
  verification_note: '云南农业发酵项目；具体城市待确认。',
  verified_at: TODAY,
  raw_country_values: '云南:1',
  original_review_note: 'audit_2026-07-23_approved',
})

stats.matched += updateMatching(rows, ['艾尔复兴'], {
  verified_name_zh: '艾尔复兴',
  verified_name_en: 'Re Ale Revival Brewing',
  verified_city: 'Cambridge, Maryland',
  verified_country: '美国',
  country_code: 'US',
  city_country: 'Cambridge, Maryland（美国）',
  verification_status: 'verified',
  confidence: 'high',
  uncertainty_flag: '',
  verification_note: '微信文案/审核：马里兰州剑桥；水果酸艾尔与酒花型。',
  verified_at: TODAY,
  original_review_note: 'audit_2026-07-23_approved',
})

stats.matched += updateMatching(rows, ['哈德逊河谷'], {
  verified_name_zh: '哈德逊河谷',
  verified_name_en: 'Hudson Valley Brewery',
  verified_country: '美国',
  country_code: 'US',
  city_country: '美国',
  verification_status: 'verified',
  confidence: 'high',
  uncertainty_flag: 'city_unverified',
  verification_note: '审核确认 Hudson Valley；城市暂空。',
  verified_at: TODAY,
  original_review_note: 'audit_2026-07-23_approved',
})

stats.matched += updateMatching(rows, ['长青工匠'], {
  verified_name_zh: '长青工匠',
  verified_name_en: 'Perennial Artisan Ales',
  verified_city: 'St. Louis, Missouri',
  verified_country: '美国',
  country_code: 'US',
  city_country: 'St. Louis, Missouri（美国）',
  verification_status: 'verified',
  confidence: 'high',
  uncertainty_flag: '',
  verification_note: '审核确认 Perennial Artisan Ales，圣路易斯。',
  verified_at: TODAY,
  original_review_note: 'audit_2026-07-23_approved',
})

stats.matched += updateMatching(rows, ['种子'], {
  verified_name_zh: '种子',
  verified_name_en: 'The Seed',
  verified_country: '美国',
  country_code: 'US',
  city_country: '美国',
  verification_status: 'verified',
  confidence: 'medium',
  uncertainty_flag: 'city_unverified',
  verification_note: '审核确认英文 The Seed；城市暂空（新泽西相关奖项见文案）。',
  verified_at: TODAY,
  original_review_note: 'audit_2026-07-23_approved',
})

stats.matched += updateMatching(rows, ['CLAG'], {
  canonical_group: 'CLAG / 亚洲小霸王',
  verified_name_zh: '亚洲小霸王',
  verification_note: 'CLAG Brewing；中文市场名亚洲小霸王。',
  verified_at: TODAY,
  original_candidate_zh: '亚洲小霸王|CLAG',
  original_review_note: 'audit_2026-07-23_approved',
})

// alias row for 亚洲小霸王 → CLAG group
apply(
  company({
    source: '亚洲小霸王',
    group: 'CLAG / 亚洲小霸王',
    zh: '亚洲小霸王',
    en: 'CLAG Brewing Company',
    city: 'Sandusky, Ohio',
    countryZh: '美国',
    code: 'US',
    note: '与 CLAG 同组；source alias。',
    urls: 'https://www.clagbrewingco.com/',
    samples: '轲斯拉大战金刚',
    drinks: '1',
    publicN: '1',
  })
)

// --- batch 1 creates ---
const creates = [
  company({
    source: '小荷',
    zh: '小荷酿造',
    en: 'Lotus Brewing',
    city: '合肥肥东',
    countryZh: '中国',
    code: 'CN',
    note: '合肥小荷啤酒酿造有限公司；Xiaohe 为搜索别名。',
    urls: 'https://www.bjbrew.com/exDetail.aspx?exid=285',
    aliasZh: '小荷',
    aliasEn: 'Xiaohe Brewing',
    samples: '黑羽|蜜瓜龙2.0|蜜瓜龙',
    drinks: '3',
    publicN: '2',
  }),
  company({
    source: '麒麟',
    zh: '麒麟啤酒',
    en: 'Kirin Brewery Company, Limited',
    countryZh: '日本',
    code: 'JP',
    entity: 'brand',
    status: 'partially_verified',
    confidence: 'medium',
    uncertainty: 'city_unverified',
    note: '大型跨地区品牌；城市不写死；中国市场部分产品或为珠海等地生产。',
    urls: 'https://www.kirinholdings.com/en/',
  }),
  company({
    source: '大九',
    zh: '大九酿造',
    en: 'MAHANINE BREWING',
    city: '呼和浩特',
    countryZh: '中国',
    code: 'CN',
    confidence: 'medium',
    note: 'Maha Nine 可作为拆分写法别名。',
    aliasEn: 'Maha Nine Brewing',
    samples: '降临',
    drinks: '1',
  }),
  company({
    source: '有什酿造',
    zh: '有什酿造',
    en: 'UTIME BREWING',
    countryZh: '中国',
    code: 'CN',
    status: 'partially_verified',
    confidence: 'low',
    uncertainty: 'city_unverified',
    note: '英文已确认；城市未核实，勿用消费城市推断。',
    aliasEn: 'Utime Brewing',
    samples: '酸味主义',
    drinks: '1',
    publicN: '1',
  }),
  company({
    source: '神话',
    zh: '神话酒厂',
    en: 'Epic Beer',
    city: 'Onehunga, Auckland',
    countryZh: '新西兰',
    code: 'NZ',
    note: '新西兰 Epic，不是美国同名 Epic Brewing。',
    aliasEn: 'Epic Brewing Company',
  }),
  company({
    source: '气泡实验室',
    zh: '气泡实验室',
    en: 'Bubble Lab',
    city: '武汉',
    countryZh: '中国',
    code: 'CN',
    status: 'partially_verified',
    confidence: 'low',
    uncertainty: 'city_unverified',
    note: '起源于武汉；常州有酒吧；当前批量生产工厂待复核。',
    samples: '酒花伞兵',
    drinks: '1',
  }),
  company({
    source: '未索之境',
    zh: '未索之境酿造',
    en: 'Unexplored Brewing',
    countryZh: '中国',
    code: 'CN',
    status: 'partially_verified',
    confidence: 'low',
    uncertainty: 'city_unverified',
    note: '中国 nano；城市未核实。',
    aliasZh: '未索之境',
    samples: '西西里橙|琥珀',
    drinks: '2',
    publicN: '2',
  }),
  company({
    source: '秦人造',
    zh: '秦人造',
    en: 'Qin Craft Beer',
    city: '西安',
    countryZh: '中国',
    code: 'CN',
    samples: '西安Summer|柑橘起源',
    drinks: '2',
    publicN: '1',
  }),
  company({
    source: '伊势角屋',
    zh: '伊势角屋麦酒',
    en: 'ISEKADO',
    city: '三重县伊势市',
    countryZh: '日本',
    code: 'JP',
    note: '品牌产地日本；越南合作生产不改 country。',
    urls: 'https://www.isekadoyabeer.com/',
    aliasEn: 'Ise Kadoya Beer',
  }),
  company({
    source: '云泥',
    zh: '云泥酿造',
    en: '',
    countryZh: '中国',
    code: 'CN',
    status: 'partially_verified',
    confidence: 'low',
    uncertainty: 'english_unverified | city_unverified',
    note: '英文留空；禁止自译 Cloud & Mud。',
    aliasZh: '云泥',
    samples: '浮柚|翠屿',
    drinks: '3',
    publicN: '2',
  }),
  company({
    source: '涧溪',
    zh: '涧溪',
    en: 'Braybrooke Beer Co.',
    city: 'Braybrooke Farm, Market Harborough',
    countryZh: '英国',
    code: 'GB',
    note: '涧溪为中国市场译名；专注拉格。',
    aliasZh: 'Braybrooke',
    samples: '窑臧拉格',
    drinks: '1',
    publicN: '1',
  }),
  company({
    source: '幻果实验室',
    group: '幻果实验室',
    zh: '幻果实验室',
    en: 'Elmeleven',
    city: 'Arlöv, Skåne',
    countryZh: '瑞典',
    code: 'SE',
    note: '合并幻果实验/幻果实验室。',
    aliasZh: '幻果实验',
    samples: '分形',
    drinks: '2',
  }),
  company({
    source: '幻果实验',
    group: '幻果实验室',
    zh: '幻果实验室',
    en: 'Elmeleven',
    city: 'Arlöv, Skåne',
    countryZh: '瑞典',
    code: 'SE',
    note: '与幻果实验室同组。',
  }),
  company({
    source: '小樽酿造',
    group: '小樽啤酒',
    zh: '小樽啤酒',
    en: 'Otaru Beer',
    city: '北海道小樽市',
    countryZh: '日本',
    code: 'JP',
    note: '小樽仓库 No.1；现场酿造啤酒馆。',
    aliasZh: '北海道小樽|小樽酿造',
    aliasEn: 'Otaru Soko No.1 Brewery',
    samples: '北海道哈密瓜',
    drinks: '1',
  }),
  company({
    source: '城市酿造',
    zh: '城市酿造',
    en: '',
    countryZh: '中国',
    code: 'CN',
    status: 'partially_verified',
    confidence: 'low',
    uncertainty: 'english_unverified | city_unverified',
    note: '英文留空；禁止译为 City Brewing（美国代工厂撞名）。',
    samples: '十月革命',
    drinks: '1',
    publicN: '1',
  }),
  company({
    source: '无邪酿造',
    zh: '无邪精酿',
    en: 'Wuxie',
    countryZh: '中国',
    code: 'CN',
    status: 'partially_verified',
    confidence: 'low',
    uncertainty: 'city_unverified',
    note: '主英文 Wuxie；Innocence Craft 为别名。',
    aliasZh: '无邪酿造',
    aliasEn: 'Innocence Craft',
  }),
  company({
    source: '百格波特',
    zh: '百格波特',
    en: 'Big Pot Brewery',
    city: 'Rostov-on-Don',
    countryZh: '俄罗斯',
    code: 'RU',
    entity: 'brand',
    confidence: 'medium',
    note: '俄罗斯契约型果泥/酸啤品牌；中文亦称大锅。',
    aliasZh: '大锅',
  }),
  company({
    source: '酸羽酿造',
    group: '酸羽精酿',
    zh: '酸羽精酿',
    en: 'Drinker Brewing',
    countryZh: '中国',
    code: 'CN',
    status: 'partially_verified',
    confidence: 'low',
    uncertainty: 'city_unverified',
    note: '合并酸羽/酸羽酿造；城市不填。',
    aliasZh: '酸羽|酸羽酿造',
    samples: '机械神明|原始恩赐',
    drinks: '2',
    publicN: '1',
  }),
  company({
    source: '酸羽',
    group: '酸羽精酿',
    zh: '酸羽精酿',
    en: 'Drinker Brewing',
    countryZh: '中国',
    code: 'CN',
    status: 'partially_verified',
    confidence: 'low',
    note: '与酸羽精酿同组。',
  }),
  company({
    source: '硬糖',
    zh: '硬糖西打酒',
    en: 'Hard Candy Cider',
    city: '南京',
    countryZh: '中国',
    code: 'CN',
    entity: 'cidery',
    note: '西打品牌，非传统啤酒厂。',
    samples: '桑葚葡萄',
    drinks: '1',
    publicN: '1',
  }),
  company({
    source: '野风筝',
    zh: '野风筝啤酒',
    en: 'Wild Kite Brewing',
    city: '北京',
    countryZh: '中国',
    code: 'CN',
    aliasEn: 'Wild Kite',
  }),
  company({
    source: '悠航',
    zh: '悠航鲜啤',
    en: 'Slow Boat Brewery',
    city: '北京',
    countryZh: '中国',
    code: 'CN',
    note: '标准英文 Slow Boat Brewery。',
    aliasEn: 'Slowboat Brewing',
    samples: '此刻是吾|猴拳',
    drinks: '2',
    publicN: '1',
  }),
  company({
    source: '捷克维诺',
    zh: '维诺拉第啤酒厂',
    en: 'Vinohradský Pivovar',
    city: 'Prague / Káraný',
    countryZh: '捷克',
    code: 'CZ',
    note: '捷克维诺为中国市场简称。',
    aliasZh: '捷克维诺|维诺',
    samples: '炫猫',
    drinks: '1',
    publicN: '1',
  }),
  company({
    source: '朗客',
    zh: '朗客熏啤',
    en: 'Schlenkerla',
    city: 'Bamberg, Bavaria',
    countryZh: '德国',
    code: 'DE',
    note: '品牌 Schlenkerla；法人 Heller-Trum 可作 legal alias。',
    urls: 'https://www.schlenkerla.de/indexe.html',
    aliasZh: '舒伦克拉',
    aliasEn: 'Brauerei Heller-Trum',
    samples: '烟熏啤',
    drinks: '1',
    publicN: '1',
  }),
  company({
    source: '焊接工厂',
    zh: '焊接工厂',
    en: 'WeldWerks Brewing Co.',
    city: 'Greeley, Colorado',
    countryZh: '美国',
    code: 'US',
    samples: '双倍爆汁',
    drinks: '1',
  }),
  company({
    source: '猫宁',
    zh: '猫宁',
    en: 'Morningcider',
    countryZh: '新西兰',
    code: 'NZ',
    entity: 'cidery',
    confidence: 'medium',
    uncertainty: 'city_unverified',
    note: '新西兰西打品牌；城市暂空。',
    samples: '玫红草莓',
    drinks: '1',
  }),
  company({
    source: '本末',
    group: '本末',
    zh: '本末',
    en: 'ROOT + BRANCH',
    countryZh: '美国',
    code: 'US',
    confidence: 'medium',
    uncertainty: 'city_unverified',
    note: 'ROOT + BRANCH；「本末·特伦」为合酿/展示写法，作 alias 不独立建厂。',
    aliasZh: '本末·特伦|本末特伦',
    samples: '劫尽|业劫|历史学会|本劫',
    drinks: '5',
    publicN: '2',
  }),
]

// WeChat article creates (skip ones already handled)
const wechatCreates = [
  company({
    source: '草原与风',
    zh: '草原与风',
    en: 'STEPPE & WIND',
    countryZh: '俄罗斯',
    code: 'RU',
    entity: 'meadery',
    confidence: 'medium',
    uncertainty: 'city_unverified',
    note: '俄罗斯蜂蜜酒厂；Bochet 风格强项。',
    aliasEn: 'STEPPE&WIND',
  }),
  company({
    source: '牌点',
    zh: '牌点',
    en: 'Pips Meadery',
    countryZh: '美国',
    code: 'US',
    entity: 'meadery',
    confidence: 'medium',
    uncertainty: 'city_unverified',
    note: '蜂蜜酒厂；城市暂空。',
  }),
  company({
    source: '愤怒的谷物',
    zh: '愤怒的谷物',
    en: 'Grains of Wrath Brewing',
    countryZh: '美国',
    code: 'US',
    confidence: 'medium',
    uncertainty: 'city_unverified',
    note: '西海岸 IPA 与拉格；城市暂空。',
  }),
  company({
    source: '乌托邦',
    zh: '乌托邦',
    en: 'Utopian Brewing',
    countryZh: '英国',
    code: 'GB',
    confidence: 'medium',
    uncertainty: 'city_unverified',
    note: '英国独立酒厂；拉格赛事表现突出。',
  }),
  company({
    source: '乐威',
    zh: '乐威',
    en: 'Lervig',
    countryZh: '挪威',
    code: 'NO',
    confidence: 'high',
    uncertainty: 'city_unverified',
    note: '挪威精酿；Mike Murphy 相关。',
  }),
  company({
    source: '众人之酒',
    zh: '众人之酒',
    en: 'Human People Beer',
    city: 'Seattle',
    countryZh: '美国',
    code: 'US',
    confidence: 'medium',
    note: '西雅图；主创曾供职 Modern Times。',
  }),
  company({
    source: '伯利橡树',
    zh: '伯利橡树',
    en: 'Burley Oak Brewing Company',
    countryZh: '美国',
    code: 'US',
    confidence: 'medium',
    uncertainty: 'city_unverified',
    note: '马里兰；JREAM 系列。',
  }),
  company({
    source: '啤匠',
    zh: '啤匠',
    en: 'Birrificio Italiano',
    countryZh: '意大利',
    code: 'IT',
    note: '意式皮尔森先驱。',
  }),
  company({
    source: '图乐',
    zh: '图乐',
    en: 'To Øl',
    countryZh: '丹麦',
    code: 'DK',
    uncertainty: 'city_unverified',
  }),
  company({
    source: '巧计',
    zh: '巧计',
    en: 'Ruse Brewing',
    countryZh: '美国',
    code: 'US',
    confidence: 'medium',
    uncertainty: 'city_unverified',
    note: '俄勒冈 / 波特兰一带。',
  }),
  company({
    source: '望月者',
    zh: '望月者',
    en: '',
    countryZh: '英国',
    code: 'GB',
    confidence: 'medium',
    uncertainty: 'english_unverified | city_unverified',
    note: '审核：英文暂空；文案称英国 Moonraker，待酒标确认后再填。',
  }),
  company({
    source: '托克索沃',
    zh: '托克索沃',
    en: '',
    city: '圣彼得堡',
    countryZh: '俄罗斯',
    code: 'RU',
    entity: 'cidery',
    confidence: 'medium',
    uncertainty: 'english_unverified',
    note: '审核：英文暂空；自然发酵西打。',
  }),
  company({
    source: '幽灵镇',
    zh: '幽灵镇',
    en: 'Ghost Town Brewing',
    city: 'Oakland, California',
    countryZh: '美国',
    code: 'US',
  }),
  company({
    source: '私人印社',
    zh: '私人印社',
    en: 'Private Press',
    countryZh: '美国',
    code: 'US',
    confidence: 'medium',
    uncertainty: 'city_unverified',
    note: '桶陈世涛/大麦酒；城市暂空。',
  }),
  company({
    source: '金兰姐妹',
    zh: '金兰姐妹',
    en: '',
    countryZh: '新西兰',
    code: 'NZ',
    confidence: 'low',
    uncertainty: 'english_unverified | city_unverified',
    note: '审核：英文暂空。',
  }),
  company({
    source: '黑猫酿造',
    zh: '黑猫酿造',
    en: 'Black Cat',
    countryZh: '俄罗斯',
    code: 'RU',
    confidence: 'medium',
    uncertainty: 'city_unverified',
  }),
  company({
    source: '希亚',
    zh: '希亚',
    en: 'Heater Allen',
    countryZh: '美国',
    code: 'US',
    confidence: 'high',
    uncertainty: 'city_unverified',
    note: '德式/捷克式拉格；与金点同体系分列。',
  }),
  company({
    source: '金点',
    zh: '金点',
    en: 'Gold Dot',
    countryZh: '美国',
    code: 'US',
    entity: 'brand',
    confidence: 'high',
    uncertainty: 'city_unverified',
    note: '与 Heater Allen 同体系平行品牌。',
  }),
  company({
    source: '伯多克',
    zh: '伯多克',
    en: 'Burdock Brewery',
    city: 'Toronto',
    countryZh: '加拿大',
    code: 'CA',
    confidence: 'medium',
  }),
]

for (const row of [...creates, ...wechatCreates]) {
  apply(row)
}

// Also upsert 行空酿造 as alias source row
apply(
  company({
    source: '行空酿造',
    group: '行空酒造',
    zh: '行空酒造',
    en: 'Xing Kong Artisan Ale',
    city: '青岛',
    countryZh: '中国',
    code: 'CN',
    status: 'corrected',
    note: '行空酿造→行空酒造 alias row。',
  })
)

writeFileSync(CSV_PATH, serializeCsv(header, rows), 'utf8')
console.log(JSON.stringify({ csv: CSV_PATH, ...stats, total_rows: rows.length }, null, 2))
