-- Materialize the frozen V1.2 style localization on canonical Product Pool
-- products. Provisional venue drinks intentionally remain untranslated.

CREATE SCHEMA IF NOT EXISTS nomenu_i18n;
REVOKE ALL ON SCHEMA nomenu_i18n FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS nomenu_i18n.style_localization_v12 (
  raw_style text PRIMARY KEY,
  display_en text,
  style_key text NOT NULL,
  consumer_delivery_tier text NOT NULL CHECK (
    consumer_delivery_tier IN ('localized_display', 'style_key_safe_fallback', 'hold_for_manual_review')
  ),
  version text NOT NULL DEFAULT 'style-localization-v1.2'
);

REVOKE ALL ON TABLE nomenu_i18n.style_localization_v12 FROM PUBLIC, anon, authenticated;

-- Generated verbatim from the frozen style-localization-v1.2.json. For
-- style_key_safe_fallback rows display_en is already resolved to the approved
-- 84-key English label; no runtime keyword inference is performed.
INSERT INTO nomenu_i18n.style_localization_v12
  (raw_style, display_en, style_key, consumer_delivery_tier, version)
VALUES
  ('“香水”西打', 'Cider', 'cider.generic', 'localized_display', 'style-localization-v1.2'),
  ('0苦度值帝国浑浊IPA', 'Imperial Hazy IPA', 'ipa.hazy', 'localized_display', 'style-localization-v1.2'),
  ('0糖皮尔森', 'Zero-Sugar Pilsner', 'pilsner.generic', 'localized_display', 'style-localization-v1.2'),
  ('0糖香槟啤酒', NULL, 'unknown', 'hold_for_manual_review', 'style-localization-v1.2'),
  ('4倍干投三倍浑浊IPA', 'Triple Dry-Hopped Hazy IPA', 'ipa.hazy', 'localized_display', 'style-localization-v1.2'),
  ('艾尔', 'Ale', 'unknown', 'localized_display', 'style-localization-v1.2'),
  ('爱尔兰艾尔', 'Ale', 'unknown', 'localized_display', 'style-localization-v1.2'),
  ('爱尔兰干世涛', 'Irish Stout', 'stout.dry', 'localized_display', 'style-localization-v1.2'),
  ('爱尔兰红色艾尔', 'Ale', 'amber_red_brown.red', 'localized_display', 'style-localization-v1.2'),
  ('奥地利式淡色拉格', 'Lager', 'lager.generic', 'localized_display', 'style-localization-v1.2'),
  ('澳大利亚拉格', 'Lager', 'lager.generic', 'localized_display', 'style-localization-v1.2'),
  ('澳式拉格', 'Lager', 'lager.generic', 'localized_display', 'style-localization-v1.2'),
  ('巴伐利亚皮尔森', 'German Pilsner', 'pilsner.german', 'localized_display', 'style-localization-v1.2'),
  ('巴伐利亚清凉拉格', 'Lager', 'lager.generic', 'localized_display', 'style-localization-v1.2'),
  ('巴伐利亚清亮拉格', 'Lager', 'lager.generic', 'localized_display', 'style-localization-v1.2'),
  ('巴伐利亚小麦', 'Wheat Beer', 'wheat.generic', 'localized_display', 'style-localization-v1.2'),
  ('巴伐利亚小麦博克', 'Weizenbock', 'bock.weizen', 'localized_display', 'style-localization-v1.2'),
  ('芭乐/水蜜桃/茉莉花茶/伏特加', 'Tea', 'unknown', 'localized_display', 'style-localization-v1.2'),
  ('芭乐古斯', 'Gose', 'sour.gose', 'localized_display', 'style-localization-v1.2'),
  ('芭乐古斯风味酸啤酒', 'Gose', 'sour.gose', 'localized_display', 'style-localization-v1.2'),
  ('芭乐莓莓雪葩果泥西打', 'Cider', 'cider.generic', 'localized_display', 'style-localization-v1.2'),
  ('耙耙柑古斯', 'Fruited Gose', 'sour.gose', 'localized_display', 'style-localization-v1.2'),
  ('白葡萄/花香/白葡萄酒', 'Fruited Wine', 'unknown', 'localized_display', 'style-localization-v1.2'),
  ('白葡萄海盐酒花酸拉格', 'Fruited Hoppy Sour Lager', 'unknown', 'localized_display', 'style-localization-v1.2'),
  ('白葡萄柠檬酸苹果酒', 'Fruited Sour Cider', 'cider.generic', 'localized_display', 'style-localization-v1.2'),
  ('白葡萄汁海盐酸艾尔', 'Fruited Sour', 'sour.fruited', 'localized_display', 'style-localization-v1.2'),
  ('白桃凤梨百香果西打', 'Fruited Cider', 'cider.generic', 'localized_display', 'style-localization-v1.2'),
  ('白桃石榴蜂蜜西打果酒', 'Fruited Honey Cider', 'cider.generic', 'localized_display', 'style-localization-v1.2'),
  ('百香果热带酸艾尔', 'Fruited Sour', 'sour.fruited', 'localized_display', 'style-localization-v1.2'),
  ('柏林酸小麦', 'Berliner Weisse', 'sour.berliner_weisse', 'localized_display', 'style-localization-v1.2'),
  ('薄荷', NULL, 'unknown', 'hold_for_manual_review', 'style-localization-v1.2'),
  ('薄荷荆芥苹果酒', 'Cider', 'cider.generic', 'localized_display', 'style-localization-v1.2'),
  ('宝宝ipa', 'IPA', 'ipa.generic', 'localized_display', 'style-localization-v1.2'),
  ('饱和干投酒花烈性艾尔', 'Dry-Hopped Hoppy Ale', 'unknown', 'localized_display', 'style-localization-v1.2'),
  ('饱和酒花艾尔', 'Hoppy Ale', 'unknown', 'localized_display', 'style-localization-v1.2'),
  ('饱和酒花浑浊IPA', 'Hazy IPA', 'ipa.hazy', 'localized_display', 'style-localization-v1.2'),
  ('饱和型酒花艾尔', 'Hoppy Ale', 'unknown', 'localized_display', 'style-localization-v1.2'),
  ('爆汁水蜜桃大红袍风味西打', 'Cider', 'cider.generic', 'localized_display', 'style-localization-v1.2'),
  ('北德风格皮尔森', 'German Pilsner', 'pilsner.german', 'localized_display', 'style-localization-v1.2'),
  ('北极拉格', 'Lager', 'lager.generic', 'localized_display', 'style-localization-v1.2'),
  ('北境IPA', 'IPA', 'ipa.generic', 'localized_display', 'style-localization-v1.2'),
  ('北欧风格拉格', 'Lager', 'lager.generic', 'localized_display', 'style-localization-v1.2'),
  ('比利时淡色艾尔', 'Pale Ale', 'pale_ale.generic', 'localized_display', 'style-localization-v1.2'),
  ('比利时风格拉格', 'Lager', 'lager.generic', 'localized_display', 'style-localization-v1.2'),
  ('比利时金色艾尔', 'Belgian Blond Ale', 'belgian.blond', 'localized_display', 'style-localization-v1.2'),
  ('比利时金色烈性艾尔', 'Belgian Golden Strong Ale', 'unknown', 'localized_display', 'style-localization-v1.2'),
  ('比利时酒花型塞松', 'Saison', 'saison.saison', 'localized_display', 'style-localization-v1.2'),
  ('比利时烈性艾尔', 'Ale', 'unknown', 'localized_display', 'style-localization-v1.2'),
  ('比利时皮尔森', 'Pilsner', 'pilsner.generic', 'localized_display', 'style-localization-v1.2'),
  ('比利时三料', 'Belgian Tripel', 'belgian.tripel', 'localized_display', 'style-localization-v1.2'),
  ('比利时双料', 'Belgian Dubbel', 'belgian.dubbel', 'localized_display', 'style-localization-v1.2'),
  ('比利时小麦', 'Witbier', 'wheat.witbier', 'localized_display', 'style-localization-v1.2'),
  ('比利时IPA', 'Belgian IPA', 'ipa.belgian', 'localized_display', 'style-localization-v1.2'),
  ('冰茶风味西打果酒', 'Tea Cider', 'cider.generic', 'localized_display', 'style-localization-v1.2'),
  ('冰激凌果泥酸艾尔', 'Fruited Smoothie / Pastry Sour', 'sour.smoothie', 'localized_display', 'style-localization-v1.2'),
  ('冰桔西打', 'Cider', 'cider.generic', 'localized_display', 'style-localization-v1.2'),
  ('冰溜世涛', 'Stout', 'stout.generic', 'localized_display', 'style-localization-v1.2'),
  ('冰淇淋果泥西打', 'Fruited Cider', 'cider.generic', 'localized_display', 'style-localization-v1.2'),
  ('冰淇淋酸艾尔', 'Sour Ale', 'sour.generic', 'localized_display', 'style-localization-v1.2'),
  ('冰沙酸艾尔', 'Smoothie / Pastry Sour', 'sour.smoothie', 'localized_display', 'style-localization-v1.2'),
  ('冰爽ipa', 'IPA', 'ipa.generic', 'localized_display', 'style-localization-v1.2'),
  ('波本帝国世涛', 'Imperial Stout', 'stout.imperial', 'localized_display', 'style-localization-v1.2'),
  ('波本桶陈帝国世涛', 'Barrel-Aged Imperial Stout', 'stout.imperial', 'localized_display', 'style-localization-v1.2'),
  ('波本桶帝国世涛', 'Imperial Stout', 'stout.imperial', 'localized_display', 'style-localization-v1.2'),
  ('波兰烟熏啤酒', 'Smoked Rauchbier', 'unknown', 'localized_display', 'style-localization-v1.2'),
  ('波兰烟熏小麦', 'Smoked Grodziskie', 'wheat.generic', 'localized_display', 'style-localization-v1.2'),
  ('波兰烟熏小麦啤酒', 'Smoked Grodziskie', 'wheat.generic', 'localized_display', 'style-localization-v1.2'),
  ('波罗的海波特', 'Baltic Porter', 'porter.baltic', 'localized_display', 'style-localization-v1.2'),
  ('波特', 'Porter', 'porter.generic', 'localized_display', 'style-localization-v1.2'),
  ('波西米亚拉格', 'Lager', 'lager.generic', 'localized_display', 'style-localization-v1.2'),
  ('波西米亚皮尔森', 'Czech Pilsner', 'pilsner.czech', 'localized_display', 'style-localization-v1.2'),
  ('钵扎风格酸IPA', 'Sour IPA', 'ipa.sour', 'localized_display', 'style-localization-v1.2'),
  ('博克', 'Bock', 'bock.generic', 'localized_display', 'style-localization-v1.2'),
  ('餐桌啤酒', 'Table Beer', 'unknown', 'localized_display', 'style-localization-v1.2'),
  ('藏式花木苹果酒', 'Cider', 'cider.generic', 'localized_display', 'style-localization-v1.2'),
  ('藏式香料Mead', 'Mead', 'mead.generic', 'localized_display', 'style-localization-v1.2'),
  ('草本古斯', 'Herbal Gose', 'sour.gose', 'localized_display', 'style-localization-v1.2'),
  ('草本赛松', 'Herbal Saison', 'saison.saison', 'localized_display', 'style-localization-v1.2'),
  ('草本酸艾尔', 'Herbal Sour Ale', 'sour.generic', 'localized_display', 'style-localization-v1.2'),
  ('草本檀香橄榄酸IPA', 'Herbal Sour IPA', 'ipa.sour', 'localized_display', 'style-localization-v1.2'),
  ('草莓·酸梅·铁观音·黑皮诺（红葡萄酒）', 'Fruited Sour Wine', 'unknown', 'localized_display', 'style-localization-v1.2'),
  ('草莓艾尔', 'Fruited Ale', 'unknown', 'localized_display', 'style-localization-v1.2'),
  ('草莓风味西打酒', 'Fruited Cider', 'cider.generic', 'localized_display', 'style-localization-v1.2'),
  ('草莓凤凰单枞果泥西打', 'Fruited Cider', 'cider.generic', 'localized_display', 'style-localization-v1.2'),
  ('草莓红茶酸艾尔', 'Tea Fruited Sour', 'sour.fruited', 'localized_display', 'style-localization-v1.2'),
  ('草莓火龙果思慕雪', NULL, 'unknown', 'hold_for_manual_review', 'style-localization-v1.2'),
  ('草莓拉格', 'Fruited Lager', 'lager.generic', 'localized_display', 'style-localization-v1.2'),
  ('草莓罗勒冰激凌酸艾尔', 'Fruited Smoothie / Pastry Sour', 'sour.smoothie', 'localized_display', 'style-localization-v1.2'),
  ('草莓迷迭香古斯', 'Fruited Gose', 'sour.gose', 'localized_display', 'style-localization-v1.2'),
  ('草莓树莓西打', 'Fruited Cider', 'cider.generic', 'localized_display', 'style-localization-v1.2'),
  ('草莓酸艾尔', 'Fruited Sour', 'sour.fruited', 'localized_display', 'style-localization-v1.2'),
  ('草莓酸奶冰淇淋西打', 'Fruited Sour Cider', 'cider.generic', 'localized_display', 'style-localization-v1.2'),
  ('草莓樱桃巧克力酸艾尔', 'Fruited Sour', 'sour.fruited', 'localized_display', 'style-localization-v1.2'),
  ('测试', NULL, 'unknown', 'hold_for_manual_review', 'style-localization-v1.2'),
  ('茶色波特', 'Tea Porter', 'porter.generic', 'localized_display', 'style-localization-v1.2'),
  ('茶香小麦', 'Tea Wheat Beer', 'wheat.generic', 'localized_display', 'style-localization-v1.2'),
  ('昌盛花草茶苹果机', 'Fruited Herbal Tea', 'unknown', 'localized_display', 'style-localization-v1.2'),
  ('昌盛花草茶苹果酒', 'Tea Herbal Cider', 'cider.generic', 'localized_display', 'style-localization-v1.2'),
  ('超饱和酒花艾尔', 'Hoppy Ale', 'unknown', 'localized_display', 'style-localization-v1.2'),
  ('超淡色艾尔', 'Pale Ale', 'pale_ale.generic', 'localized_display', 'style-localization-v1.2'),
  ('超淡色艾尔 / Extra Pale Ale', 'Pale Ale', 'pale_ale.generic', 'localized_display', 'style-localization-v1.2'),
  ('超干淡色艾尔', 'Pale Ale', 'pale_ale.generic', 'localized_display', 'style-localization-v1.2'),
  ('超干德式皮尔森', 'German Pilsner', 'pilsner.german', 'localized_display', 'style-localization-v1.2'),
  ('超干酒花皮尔森', 'Hoppy Pilsner', 'pilsner.generic', 'localized_display', 'style-localization-v1.2'),
  ('超干美式淡艾', 'American Pale Ale', 'pale_ale.american', 'localized_display', 'style-localization-v1.2'),
  ('超干皮尔森', 'Pilsner', 'pilsner.generic', 'localized_display', 'style-localization-v1.2'),
  ('超干社交美式淡艾', 'Session American Pale Ale', 'pale_ale.american', 'localized_display', 'style-localization-v1.2'),
  ('超级淡色艾尔', 'Pale Ale', 'pale_ale.generic', 'localized_display', 'style-localization-v1.2'),
  ('超深烘超苦黑拉格', 'Dark Lager', 'lager.dark', 'localized_display', 'style-localization-v1.2'),
  ('潮汕黄皮黄桃酸艾尔', 'Fruited Sour', 'sour.fruited', 'localized_display', 'style-localization-v1.2'),
  ('车厘子法兰德斯酸', 'Cherry Flanders Sour', 'unknown', 'localized_display', 'style-localization-v1.2'),
  ('陈皮裸麦IPA', 'Fruited Rye IPA', 'ipa.rye', 'localized_display', 'style-localization-v1.2'),
  ('陈桶野菌拉格', 'Wild-Fermented Lager', 'unknown', 'localized_display', 'style-localization-v1.2'),
  ('橙柚摩卡咖啡古斯', 'Coffee Gose', 'sour.gose', 'localized_display', 'style-localization-v1.2'),
  ('出口世涛', 'Foreign Extra Stout', 'stout.foreign_extra', 'localized_display', 'style-localization-v1.2'),
  ('传统法式苹果酒', 'Cider', 'cider.generic', 'localized_display', 'style-localization-v1.2'),
  ('传统贵兹', 'Gueuze', 'wild.gueuze', 'localized_display', 'style-localization-v1.2'),
  ('传统拉格', 'Lager', 'lager.generic', 'localized_display', 'style-localization-v1.2'),
  ('传统兰比克', 'Lambic', 'wild.lambic', 'localized_display', 'style-localization-v1.2'),
  ('传统苹果酒', 'Cider', 'cider.generic', 'localized_display', 'style-localization-v1.2'),
  ('传统西海岸双倍IPA', 'Double West Coast IPA', 'ipa.west_coast', 'localized_display', 'style-localization-v1.2'),
  ('传统西海岸IPA', 'West Coast IPA', 'ipa.west_coast', 'localized_display', 'style-localization-v1.2'),
  ('春季博克', NULL, 'bock.generic', 'hold_for_manual_review', 'style-localization-v1.2'),
  ('春季拉格', 'Lager', 'lager.generic', 'localized_display', 'style-localization-v1.2'),
  ('纯甜型苹果酒', 'Cider', 'cider.generic', 'localized_display', 'style-localization-v1.2'),
  ('刺梨蜂蜜干型西打', 'Fruited Honey Cider', 'cider.generic', 'localized_display', 'style-localization-v1.2'),
  ('刺梨木姜子柠檬拉德勒', 'Fruited Radler / Shandy', 'unknown', 'localized_display', 'style-localization-v1.2'),
  ('刺梨柠檬木姜子西打', 'Fruited Cider', 'cider.generic', 'localized_display', 'style-localization-v1.2'),
  ('刺梨薰衣草蜂蜜酒', 'Fruited Mead', 'mead.generic', 'localized_display', 'style-localization-v1.2'),
  ('脆柿雪花梨霞多丽', NULL, 'unknown', 'hold_for_manual_review', 'style-localization-v1.2'),
  ('大米酒花拉格', 'Rice Hoppy Lager', 'lager.generic', 'localized_display', 'style-localization-v1.2'),
  ('大米拉格', 'Rice Lager', 'lager.rice', 'localized_display', 'style-localization-v1.2'),
  ('大米冷IPA', 'Rice Cold IPA', 'ipa.cold', 'localized_display', 'style-localization-v1.2'),
  ('大米酸艾尔', 'Rice Sour Ale', 'sour.generic', 'localized_display', 'style-localization-v1.2'),
  ('大西洋苦啤', 'English Bitter', 'english.bitter', 'localized_display', 'style-localization-v1.2'),
  ('傣风味古斯', 'Gose', 'sour.gose', 'localized_display', 'style-localization-v1.2'),
  ('玳玳花油柑增味西打', 'Cider', 'cider.generic', 'localized_display', 'style-localization-v1.2'),
  ('单一赤霞珠酸艾尔', 'Sour Ale', 'sour.generic', 'localized_display', 'style-localization-v1.2'),
  ('单一酒花冷IPA', 'Cold IPA', 'ipa.cold', 'localized_display', 'style-localization-v1.2'),
  ('单一酒花皮尔森', 'Hoppy Pilsner', 'pilsner.generic', 'localized_display', 'style-localization-v1.2'),
  ('单一酒花皮尔森2.0啤酒', 'Hoppy Pilsner', 'pilsner.generic', 'localized_display', 'style-localization-v1.2'),
  ('单一卡莉斯塔DDH极干IPA', 'DDH IPA', 'ipa.generic', 'localized_display', 'style-localization-v1.2'),
  ('单一马赛克西海岸IPA', 'West Coast IPA', 'ipa.west_coast', 'localized_display', 'style-localization-v1.2'),
  ('单一莫图伊卡酒花皮尔森', 'Hoppy Pilsner', 'pilsner.generic', 'localized_display', 'style-localization-v1.2'),
  ('单一尼尔森浑浊 IPA', 'Hazy IPA', 'ipa.hazy', 'localized_display', 'style-localization-v1.2'),
  ('单一尼尔森酒花拉格', 'Hoppy Lager', 'lager.hoppy', 'localized_display', 'style-localization-v1.2'),
  ('单一尼尔森双倍干投浑浊IPA', 'DDH Hazy IPA', 'ipa.hazy', 'localized_display', 'style-localization-v1.2'),
  ('单一品种纯甜型苹果酒', 'Cider', 'cider.generic', 'localized_display', 'style-localization-v1.2'),
  ('单一石锤酒花冷IPA', 'Cold IPA', 'ipa.cold', 'localized_display', 'style-localization-v1.2'),
  ('单一世纪酒花 西海岸IPA', 'West Coast IPA', 'ipa.west_coast', 'localized_display', 'style-localization-v1.2'),
  ('单一世纪酒花西海岸IPA', 'West Coast IPA', 'ipa.west_coast', 'localized_display', 'style-localization-v1.2'),
  ('单一西楚双倍浑浊IPA', 'Double Hazy IPA', 'ipa.hazy', 'localized_display', 'style-localization-v1.2'),
  ('单一西楚四倍浑浊IPA', 'Hazy IPA', 'ipa.hazy', 'localized_display', 'style-localization-v1.2'),
  ('单一夏洛浑浊 IPA', 'Hazy IPA', 'ipa.hazy', 'localized_display', 'style-localization-v1.2'),
  ('淡艾', 'Pale Ale', 'pale_ale.generic', 'localized_display', 'style-localization-v1.2'),
  ('淡色艾尔', 'Pale Ale', 'pale_ale.generic', 'localized_display', 'style-localization-v1.2'),
  ('淡色拉格', 'Lager', 'lager.generic', 'localized_display', 'style-localization-v1.2'),
  ('氮气波特', 'Nitro Porter', 'porter.generic', 'localized_display', 'style-localization-v1.2'),
  ('氮气改造版黑拉格', 'Nitro Dark Lager', 'lager.dark', 'localized_display', 'style-localization-v1.2'),
  ('氮气红色艾尔', 'Nitro Ale', 'amber_red_brown.red', 'localized_display', 'style-localization-v1.2'),
  ('氮气咖啡世涛', 'Nitro Coffee Stout', 'stout.generic', 'localized_display', 'style-localization-v1.2'),
  ('氮气世涛', 'Nitro Stout', 'stout.generic', 'localized_display', 'style-localization-v1.2'),
  ('氮气Pub Ale', 'Nitro Ale', 'unknown', 'localized_display', 'style-localization-v1.2'),
  ('德式传统格鲁特啤酒', 'Gruit', 'unknown', 'localized_display', 'style-localization-v1.2'),
  ('德式淡色艾尔', 'Pale Ale', 'pale_ale.generic', 'localized_display', 'style-localization-v1.2'),
  ('德式淡色拉格', 'Lager', 'lager.generic', 'localized_display', 'style-localization-v1.2'),
  ('德式古斯', 'Gose', 'sour.gose', 'localized_display', 'style-localization-v1.2'),
  ('德式过桶拉格', 'Barrel-Aged Lager', 'lager.generic', 'localized_display', 'style-localization-v1.2'),
  ('德式黑拉格', 'Dark Lager', 'lager.dark', 'localized_display', 'style-localization-v1.2'),
  ('德式黑啤', 'German Dark Beer', 'unknown', 'localized_display', 'style-localization-v1.2'),
  ('德式琥珀艾尔', 'Amber Ale', 'amber_red_brown.amber', 'localized_display', 'style-localization-v1.2'),
  ('德式窖藏拉格 Kellerbier', 'Kellerbier / Zwickelbier', 'lager.kellerbier', 'localized_display', 'style-localization-v1.2'),
  ('德式窖藏啤酒', 'Kellerbier / Zwickelbier', 'unknown', 'localized_display', 'style-localization-v1.2'),
  ('德式拉格', 'Lager', 'lager.generic', 'localized_display', 'style-localization-v1.2'),
  ('德式皮尔森', 'German Pilsner', 'pilsner.german', 'localized_display', 'style-localization-v1.2'),
  ('德式清亮拉格', 'Munich Helles', 'lager.helles', 'localized_display', 'style-localization-v1.2'),
  ('德式清亮拉格 Helles', 'Munich Helles', 'lager.helles', 'localized_display', 'style-localization-v1.2'),
  ('德式清亮啤酒', 'Munich Helles', 'lager.helles', 'localized_display', 'style-localization-v1.2'),
  ('德式清亮啤酒(60天熟成版)', 'Munich Helles', 'lager.helles', 'localized_display', 'style-localization-v1.2'),
  ('德式庆典拉格', 'Lager', 'lager.generic', 'localized_display', 'style-localization-v1.2'),
  ('德式深色拉格', 'Dark Lager', 'lager.dark', 'localized_display', 'style-localization-v1.2'),
  ('德式橡木桶熟成拉格', 'Lager', 'lager.generic', 'localized_display', 'style-localization-v1.2'),
  ('德式小麦', 'Wheat Beer', 'wheat.generic', 'style_key_safe_fallback', 'style-localization-v1.2'),
  ('德式小麦 Wheat', 'Wheat Beer', 'wheat.generic', 'style_key_safe_fallback', 'style-localization-v1.2'),
  ('德式小麦啤酒', 'Wheat Beer', 'wheat.generic', 'style_key_safe_fallback', 'style-localization-v1.2'),
  ('地层西楚大耳朵浑浊IPA', 'Hazy IPA', 'ipa.hazy', 'localized_display', 'style-localization-v1.2'),
  ('低糖拉格', 'Lager', 'lager.generic', 'localized_display', 'style-localization-v1.2'),
  ('帝国超级世涛 双桶桶陈', 'Barrel-Aged Imperial Stout', 'stout.imperial', 'localized_display', 'style-localization-v1.2'),
  ('帝国大米世涛', 'Rice Imperial Stout', 'stout.imperial', 'localized_display', 'style-localization-v1.2'),
  ('帝国古斯', 'Imperial Gose', 'sour.gose', 'localized_display', 'style-localization-v1.2'),
  ('帝国浑浊IPA', 'Imperial Hazy IPA', 'ipa.hazy', 'localized_display', 'style-localization-v1.2'),
  ('帝国咖啡世涛', 'Coffee Imperial Stout', 'stout.imperial', 'localized_display', 'style-localization-v1.2'),
  ('帝国奶昔酸IPA', 'Imperial Milkshake Sour IPA', 'ipa.sour', 'localized_display', 'style-localization-v1.2'),
  ('帝国世涛', 'Imperial Stout', 'stout.imperial', 'localized_display', 'style-localization-v1.2'),
  ('帝国水果酸艾尔', 'Imperial Fruited Sour', 'sour.fruited', 'localized_display', 'style-localization-v1.2'),
  ('帝国四倍水果古斯', 'Imperial Fruited Gose', 'sour.gose', 'localized_display', 'style-localization-v1.2'),
  ('帝国酸IPA', 'Imperial Sour IPA', 'ipa.sour', 'localized_display', 'style-localization-v1.2'),
  ('帝国甜点世涛', 'Pastry Imperial Stout', 'stout.imperial', 'localized_display', 'style-localization-v1.2'),
  ('帝国西海岸IPA', 'Imperial West Coast IPA', 'ipa.west_coast', 'localized_display', 'style-localization-v1.2'),
  ('帝国新英格兰IPA', 'Imperial Hazy IPA', 'ipa.hazy', 'localized_display', 'style-localization-v1.2'),
  ('帝国燕麦世涛', 'Imperial Oatmeal Stout', 'stout.imperial', 'localized_display', 'style-localization-v1.2'),
  ('帝国棕色艾尔', 'Imperial Ale', 'amber_red_brown.brown', 'localized_display', 'style-localization-v1.2'),
  ('帝国IPA', 'Imperial IPA', 'ipa.generic', 'localized_display', 'style-localization-v1.2'),
  ('滇橄榄古斯', 'Gose', 'sour.gose', 'localized_display', 'style-localization-v1.2'),
  ('滇红酸角风味西打果酒', 'Sour Cider', 'cider.generic', 'localized_display', 'style-localization-v1.2'),
  ('东北玉米拉格', 'Rice Lager', 'lager.generic', 'localized_display', 'style-localization-v1.2'),
  ('冬瓜小黄姜寿眉白茶霞多丽', 'Tea', 'unknown', 'localized_display', 'style-localization-v1.2'),
  ('冻柠茶西打', 'Tea Cider', 'cider.generic', 'localized_display', 'style-localization-v1.2'),
  ('杜塞尔多夫', NULL, 'unknown', 'hold_for_manual_review', 'style-localization-v1.2'),
  ('杜塞尔多夫老啤酒', 'Altbier', 'unknown', 'localized_display', 'style-localization-v1.2'),
  ('杜松子赛松', 'Saison', 'saison.saison', 'localized_display', 'style-localization-v1.2'),
  ('杜松子西柚海盐古斯', 'Fruited Gose', 'sour.gose', 'localized_display', 'style-localization-v1.2'),
  ('多倍干投西海岸IPA（五周年版）', 'Dry-Hopped West Coast IPA', 'ipa.west_coast', 'localized_display', 'style-localization-v1.2'),
  ('多特蒙德出口拉格', 'Dortmunder / German Helles Exportbier', 'lager.dortmunder_export', 'localized_display', 'style-localization-v1.2'),
  ('多特蒙德出口型拉格', 'Dortmunder / German Helles Exportbier', 'lager.dortmunder_export', 'localized_display', 'style-localization-v1.2'),
  ('多特蒙德拉格', 'Dortmunder / German Helles Exportbier', 'lager.dortmunder_export', 'localized_display', 'style-localization-v1.2'),
  ('多汁艾尔', 'Ale', 'unknown', 'localized_display', 'style-localization-v1.2'),
  ('俄罗斯拉格', 'Lager', 'lager.generic', 'localized_display', 'style-localization-v1.2'),
  ('二次糖化三倍干投三倍IPA', 'Triple TDH IPA', 'ipa.generic', 'localized_display', 'style-localization-v1.2'),
  ('二次糖化双倍干投三倍浑浊IPA', 'Triple DDH Hazy IPA', 'ipa.hazy', 'localized_display', 'style-localization-v1.2'),
  ('发泡酒', NULL, 'unknown', 'hold_for_manual_review', 'style-localization-v1.2'),
  ('法兰德斯红艾尔', 'Flanders Red Ale', 'sour.flanders_red', 'localized_display', 'style-localization-v1.2'),
  ('法兰德斯红色艾尔', 'Flanders Red Ale', 'sour.flanders_red', 'localized_display', 'style-localization-v1.2'),
  ('法式餐桌啤酒', 'Table Beer', 'unknown', 'localized_display', 'style-localization-v1.2'),
  ('法式淡拉格', 'Lager', 'lager.generic', 'localized_display', 'style-localization-v1.2'),
  ('法式酒花拉格', 'Hoppy Lager', 'lager.hoppy', 'localized_display', 'style-localization-v1.2'),
  ('法式酒花皮尔森', 'Hoppy Pilsner', 'pilsner.generic', 'localized_display', 'style-localization-v1.2'),
  ('法式拉格', 'Lager', 'lager.generic', 'localized_display', 'style-localization-v1.2'),
  ('法式皮尔森', 'Pilsner', 'pilsner.generic', 'localized_display', 'style-localization-v1.2'),
  ('法式苹果酒', 'Cider', 'cider.generic', 'localized_display', 'style-localization-v1.2'),
  ('法式赛松', 'Saison', 'saison.saison', 'localized_display', 'style-localization-v1.2'),
  ('番茄百香果菠萝酸艾', 'Fruited Sour', 'sour.fruited', 'localized_display', 'style-localization-v1.2'),
  ('番茄百香果菠萝酸艾尔', 'Fruited Sour', 'sour.fruited', 'localized_display', 'style-localization-v1.2'),
  ('番茄古斯', 'Gose', 'sour.gose', 'localized_display', 'style-localization-v1.2'),
  ('番荔枝白色艾尔', 'Ale', 'unknown', 'localized_display', 'style-localization-v1.2'),
  ('粉芭乐柠檬茉莉花茶西达', 'Fruited Tea Cider', 'cider.generic', 'localized_display', 'style-localization-v1.2'),
  ('粉红柠檬拉德乐', 'Fruited Radler / Shandy', 'unknown', 'localized_display', 'style-localization-v1.2'),
  ('粉红柠檬拉德勒', 'Fruited Radler / Shandy', 'unknown', 'localized_display', 'style-localization-v1.2'),
  ('粉色水果西打', 'Fruited Cider', 'cider.generic', 'localized_display', 'style-localization-v1.2'),
  ('风味西打果酒', 'Cider', 'cider.generic', 'localized_display', 'style-localization-v1.2'),
  ('枫糖香草咖啡帝国世涛', 'Coffee Imperial Stout', 'stout.imperial', 'localized_display', 'style-localization-v1.2'),
  ('蜂蜜酒', 'Mead', 'mead.generic', 'localized_display', 'style-localization-v1.2'),
  ('蜂蜜拉格', 'Honey Lager', 'lager.generic', 'localized_display', 'style-localization-v1.2'),
  ('蜂蜜酸IPA', 'Honey Sour IPA', 'ipa.sour', 'localized_display', 'style-localization-v1.2'),
  ('凤梨柠檬霞多丽青苹果百香果橙花蜜酒', 'Fruited Mead', 'mead.generic', 'localized_display', 'style-localization-v1.2'),
  ('凤梨乌龙康普茶西打', 'Fruited Tea Cider', 'unknown', 'localized_display', 'style-localization-v1.2'),
  ('凤县大红袍花椒啤酒', NULL, 'unknown', 'hold_for_manual_review', 'style-localization-v1.2'),
  ('弗兰克拉格', 'Lager', 'lager.generic', 'localized_display', 'style-localization-v1.2'),
  ('弗兰肯拉格', 'Lager', 'lager.generic', 'localized_display', 'style-localization-v1.2'),
  ('弗兰肯农舍拉格', NULL, 'lager.generic', 'hold_for_manual_review', 'style-localization-v1.2'),
  ('佛手柑朦胧科隆', 'Fruited Hazy Kölsch', 'kolsch.generic', 'localized_display', 'style-localization-v1.2'),
  ('佛手姜极干酸赛松', 'Sour Saison', 'saison.saison', 'localized_display', 'style-localization-v1.2'),
  ('佛手姜极干算赛松', NULL, 'saison.saison', 'hold_for_manual_review', 'style-localization-v1.2'),
  ('福橘脐橙苹果西打', 'Cider', 'cider.generic', 'localized_display', 'style-localization-v1.2'),
  ('复古谷物皮尔森', 'Pilsner', 'pilsner.generic', 'localized_display', 'style-localization-v1.2'),
  ('复古赛松', 'Saison', 'saison.saison', 'localized_display', 'style-localization-v1.2'),
  ('复古西海岸IPA', 'West Coast IPA', 'ipa.west_coast', 'localized_display', 'style-localization-v1.2'),
  ('复合芒果果泥酸艾尔', 'Fruited Smoothie / Pastry Sour', 'sour.smoothie', 'localized_display', 'style-localization-v1.2'),
  ('覆盆子酸塞松', 'Fruited Sour Saison', 'saison.saison', 'localized_display', 'style-localization-v1.2'),
  ('甘蔗马蹄余甘子西打', 'Cider', 'cider.generic', 'localized_display', 'style-localization-v1.2'),
  ('干世涛', 'Irish Stout', 'stout.dry', 'localized_display', 'style-localization-v1.2'),
  ('干投酒花皮尔森', 'Dry-Hopped Hoppy Pilsner', 'pilsner.generic', 'localized_display', 'style-localization-v1.2'),
  ('干投酒花西打酒', 'Dry-Hopped Cider', 'cider.generic', 'localized_display', 'style-localization-v1.2'),
  ('干投农舍淡艾', 'Dry-Hopped Farmhouse Pale Ale', 'pale_ale.generic', 'localized_display', 'style-localization-v1.2'),
  ('干西打', 'Cider', 'cider.generic', 'localized_display', 'style-localization-v1.2'),
  ('干型饼干裸麦艾尔', 'Rye Ale', 'unknown', 'localized_display', 'style-localization-v1.2'),
  ('干型浑浊IPA', 'Hazy IPA', 'ipa.hazy', 'localized_display', 'style-localization-v1.2'),
  ('干型拉格', 'Lager', 'lager.generic', 'localized_display', 'style-localization-v1.2'),
  ('干型西打', 'Cider', 'cider.generic', 'localized_display', 'style-localization-v1.2'),
  ('港式冻柠茶西打', 'Tea Cider', 'cider.generic', 'localized_display', 'style-localization-v1.2'),
  ('高乐高酸艾尔', 'Sour Ale', 'sour.generic', 'localized_display', 'style-localization-v1.2'),
  ('高密度酒花充注IPA', 'IPA', 'ipa.generic', 'localized_display', 'style-localization-v1.2'),
  ('高温蒸汽拉格', 'Lager', 'lager.generic', 'localized_display', 'style-localization-v1.2'),
  ('格尔利茨皮尔森', 'Pilsner', 'pilsner.generic', 'localized_display', 'style-localization-v1.2'),
  ('格尔利茨皮尔斯', 'Pilsner', 'pilsner.generic', 'localized_display', 'style-localization-v1.2'),
  ('格鲁特', 'Gruit', 'unknown', 'localized_display', 'style-localization-v1.2'),
  ('格鲁特IPA', 'Gruit IPA', 'ipa.generic', 'localized_display', 'style-localization-v1.2'),
  ('古斯', 'Gose', 'sour.gose', 'localized_display', 'style-localization-v1.2'),
  ('贵兹兰比克', 'Gueuze', 'wild.gueuze', 'localized_display', 'style-localization-v1.2'),
  ('桂花米酒混酿柏林酸', 'Mixed-Fermentation Berliner Weisse', 'unknown', 'localized_display', 'style-localization-v1.2'),
  ('桂花小麦艾尔', 'Wheat Beer', 'wheat.generic', 'localized_display', 'style-localization-v1.2'),
  ('桂子油/柠檬/薄荷槟郎爆米花威士忌酸', NULL, 'unknown', 'hold_for_manual_review', 'style-localization-v1.2'),
  ('果泥', NULL, 'unknown', 'hold_for_manual_review', 'style-localization-v1.2'),
  ('果泥/甜点酸艾尔', 'Fruited Smoothie / Pastry Sour', 'sour.smoothie', 'localized_display', 'style-localization-v1.2'),
  ('果泥艾尔', 'Fruited Ale', 'unknown', 'localized_display', 'style-localization-v1.2'),
  ('果泥古斯', 'Fruited Gose', 'sour.gose', 'localized_display', 'style-localization-v1.2'),
  ('果泥水果酸艾尔', 'Fruited Smoothie / Pastry Sour', 'sour.smoothie', 'localized_display', 'style-localization-v1.2'),
  ('果泥思慕雪酸艾尔', 'Fruited Smoothie / Pastry Sour', 'sour.smoothie', 'localized_display', 'style-localization-v1.2'),
  ('果泥酸艾', 'Fruited Smoothie / Pastry Sour', 'sour.smoothie', 'localized_display', 'style-localization-v1.2'),
  ('果泥酸艾尔', 'Fruited Smoothie / Pastry Sour', 'sour.smoothie', 'localized_display', 'style-localization-v1.2'),
  ('果泥西打', 'Fruited Cider', 'cider.generic', 'localized_display', 'style-localization-v1.2'),
  ('果泥Cider', 'Fruited Cider', 'cider.generic', 'localized_display', 'style-localization-v1.2'),
  ('果啤', 'Fruit Beer', 'unknown', 'localized_display', 'style-localization-v1.2'),
  ('果味IPA', 'Fruited IPA', 'ipa.generic', 'localized_display', 'style-localization-v1.2'),
  ('果汁西打', 'Cider', 'cider.generic', 'localized_display', 'style-localization-v1.2'),
  ('过邦穹桶野菌艾尔', 'Barrel-Aged Wild Ale', 'wild.generic', 'localized_display', 'style-localization-v1.2'),
  ('过波本桶帝国世涛', 'Barrel-Aged Imperial Stout', 'stout.imperial', 'localized_display', 'style-localization-v1.2'),
  ('过干白葡萄酒桶帝国古斯', 'Imperial Barrel-Aged Gose', 'sour.gose', 'localized_display', 'style-localization-v1.2'),
  ('过红酒桶酸艾尔', 'Barrel-Aged Sour Ale', 'sour.generic', 'localized_display', 'style-localization-v1.2'),
  ('过桶陈酿四料', 'Barrel-Aged Belgian Quadrupel', 'belgian.quad', 'localized_display', 'style-localization-v1.2'),
  ('过桶帝国世涛', 'Barrel-Aged Imperial Stout', 'stout.imperial', 'localized_display', 'style-localization-v1.2'),
  ('过桶生熟咖啡豆大麦烈艾尔', 'Barrel-Aged Coffee Barleywine', 'strong_ale.barleywine', 'localized_display', 'style-localization-v1.2'),
  ('过桶野菌柏林酸', 'Barrel-Aged Wild-Fermented Berliner Weisse', 'unknown', 'localized_display', 'style-localization-v1.2'),
  ('哈密瓜百花Mead', 'Fruited Mead', 'mead.generic', 'localized_display', 'style-localization-v1.2'),
  ('哈密瓜椰子橙子香草百花蜜酒', 'Fruited Mead', 'mead.generic', 'localized_display', 'style-localization-v1.2'),
  ('海盐古斯', 'Gose', 'sour.gose', 'localized_display', 'style-localization-v1.2'),
  ('海盐古斯酸啤', 'Gose', 'sour.gose', 'localized_display', 'style-localization-v1.2'),
  ('海盐拉格', 'Lager', 'lager.generic', 'localized_display', 'style-localization-v1.2'),
  ('海盐柠檬菠萝古斯', 'Fruited Gose', 'sour.gose', 'localized_display', 'style-localization-v1.2'),
  ('海盐酸艾尔', 'Sour Ale', 'sour.generic', 'localized_display', 'style-localization-v1.2'),
  ('黑加仑芒果葡萄果泥酸艾尔', 'Smoothie Sour', 'unknown', 'localized_display', 'style-localization-v1.2'),
  ('黑拉格', 'Dark Lager', 'lager.dark', 'localized_display', 'style-localization-v1.2'),
  ('黑麦IPA', 'Rye IPA', 'ipa.rye', 'localized_display', 'style-localization-v1.2'),
  ('黑莓覆盆子酸艾尔', 'Fruited Sour', 'sour.fruited', 'localized_display', 'style-localization-v1.2'),
  ('黑莓农舍艾尔', 'Fruited Farmhouse Ale', 'saison.farmhouse', 'localized_display', 'style-localization-v1.2'),
  ('黑啤', 'Dark Beer', 'unknown', 'localized_display', 'style-localization-v1.2'),
  ('黑啤世涛胶囊', 'Stout', 'stout.generic', 'localized_display', 'style-localization-v1.2'),
  ('黑色白啤', 'Wheat Beer', 'wheat.generic', 'localized_display', 'style-localization-v1.2'),
  ('黑色IPA', 'Black IPA', 'ipa.black', 'localized_display', 'style-localization-v1.2'),
  ('红艾尔', 'Red Ale', 'unknown', 'localized_display', 'style-localization-v1.2'),
  ('红茶西打', 'Tea Cider', 'cider.generic', 'localized_display', 'style-localization-v1.2'),
  ('红醋栗樱桃桶陈蜂蜜酒', 'Barrel-Aged Fruited Mead', 'mead.generic', 'localized_display', 'style-localization-v1.2'),
  ('红米拉格', 'Rice Lager', 'lager.rice', 'localized_display', 'style-localization-v1.2'),
  ('红色艾尔', 'Red Ale', 'amber_red_brown.red', 'localized_display', 'style-localization-v1.2'),
  ('红色裸麦IPA', 'Red Rye IPA', 'ipa.rye', 'localized_display', 'style-localization-v1.2'),
  ('红色双倍IPA', 'Double Red IPA', 'ipa.red', 'localized_display', 'style-localization-v1.2'),
  ('红色酸艾尔', 'Sour Ale', 'sour.generic', 'localized_display', 'style-localization-v1.2'),
  ('红颜草莓·酸梅·铁观音·黑皮诺', NULL, 'unknown', 'hold_for_manual_review', 'style-localization-v1.2'),
  ('红柚水果拉德勒', 'Fruited Radler / Shandy', 'unknown', 'localized_display', 'style-localization-v1.2'),
  ('红IPA', 'Red IPA', 'ipa.red', 'localized_display', 'style-localization-v1.2'),
  ('胡椒菠芒硬苏打PRO', 'Hard Seltzer', 'hard_seltzer.generic', 'localized_display', 'style-localization-v1.2'),
  ('琥珀艾尔', 'Amber Ale', 'amber_red_brown.amber', 'localized_display', 'style-localization-v1.2'),
  ('琥珀博克', 'Bock', 'bock.generic', 'localized_display', 'style-localization-v1.2'),
  ('琥珀窖藏拉格', 'Lager', 'lager.kellerbier', 'localized_display', 'style-localization-v1.2'),
  ('琥珀拉格', 'Amber Lager', 'lager.amber', 'localized_display', 'style-localization-v1.2'),
  ('花草茶昌盛苹果酒', 'Tea Herbal Cider', 'cider.generic', 'localized_display', 'style-localization-v1.2'),
  ('花椒增味农舍艾尔:塞松', 'Saison', 'saison.saison', 'localized_display', 'style-localization-v1.2'),
  ('花椒增味农舍艾尔：塞松', 'Saison', 'saison.saison', 'localized_display', 'style-localization-v1.2'),
  ('花生酱帝国世涛', 'Imperial Stout', 'stout.imperial', 'localized_display', 'style-localization-v1.2'),
  ('黄米拉格', 'Rice Lager', 'lager.generic', 'localized_display', 'style-localization-v1.2'),
  ('黄皮古斯', 'Fruited Gose', 'sour.gose', 'localized_display', 'style-localization-v1.2'),
  ('黄皮果杏皮水果波特', 'Fruited Porter', 'porter.generic', 'localized_display', 'style-localization-v1.2'),
  ('黄皮增味野菌艾尔', 'Fruited Wild Ale', 'wild.generic', 'localized_display', 'style-localization-v1.2'),
  ('黄色水果酸艾尔', 'Fruited Sour', 'sour.fruited', 'localized_display', 'style-localization-v1.2'),
  ('黄桃白杏酸小麦', 'Fruited Sour Wheat Ale', 'sour.wheat', 'localized_display', 'style-localization-v1.2'),
  ('黄桃凤梨罐头西打果酒', 'Fruited Cider', 'cider.generic', 'localized_display', 'style-localization-v1.2'),
  ('黄桃花魁冰美式水果咖啡西打', 'Coffee Fruited Cider', 'cider.generic', 'localized_display', 'style-localization-v1.2'),
  ('黄桃烤椰酸艾尔', 'Fruited Sour', 'sour.fruited', 'localized_display', 'style-localization-v1.2'),
  ('黄桃柠檬美式酸IPL', 'Fruited Sour Hoppy Lager', 'lager.hoppy', 'localized_display', 'style-localization-v1.2'),
  ('黄桃西打', 'Fruited Cider', 'cider.generic', 'localized_display', 'style-localization-v1.2'),
  ('黄小米荞麦拉格', 'Lager', 'lager.generic', 'localized_display', 'style-localization-v1.2'),
  ('黄杏柑橘西打果泥', 'Fruited Cider', 'cider.generic', 'localized_display', 'style-localization-v1.2'),
  ('黄樱桃酸IPA', 'Fruited Sour IPA', 'ipa.sour', 'localized_display', 'style-localization-v1.2'),
  ('浑浊 IPA', 'Hazy IPA', 'ipa.hazy', 'localized_display', 'style-localization-v1.2'),
  ('浑浊/新英格兰IPA', 'Hazy IPA', 'ipa.hazy', 'localized_display', 'style-localization-v1.2'),
  ('浑浊淡色艾尔', 'Hazy Pale Ale', 'pale_ale.generic', 'localized_display', 'style-localization-v1.2'),
  ('浑浊三倍IPA', 'Triple Hazy IPA', 'ipa.hazy', 'localized_display', 'style-localization-v1.2'),
  ('浑浊双倍IPA', 'Double Hazy IPA', 'ipa.hazy', 'localized_display', 'style-localization-v1.2'),
  ('浑浊型德式小麦', 'Hazy Wheat Beer', 'wheat.generic', 'localized_display', 'style-localization-v1.2'),
  ('浑浊IPA', 'Hazy IPA', 'ipa.hazy', 'localized_display', 'style-localization-v1.2'),
  ('浑浊IPA 酒花果汁', 'Hazy IPA', 'ipa.hazy', 'localized_display', 'style-localization-v1.2'),
  ('混合发酵浑浊IPA', 'Mixed-Fermentation Hazy IPA', 'ipa.hazy', 'localized_display', 'style-localization-v1.2'),
  ('混合发酵赛松', 'Mixed-Fermentation Saison', 'saison.saison', 'localized_display', 'style-localization-v1.2'),
  ('混合发酵酸IPA', 'Mixed-Fermentation Sour IPA', 'ipa.sour', 'localized_display', 'style-localization-v1.2'),
  ('混合发酵野菌塞松', 'Mixed-Fermentation Wild-Fermented Saison', 'saison.saison', 'localized_display', 'style-localization-v1.2'),
  ('混合莓果西打', 'Fruited Cider', 'cider.generic', 'localized_display', 'style-localization-v1.2'),
  ('混酿香槟IPA', 'Mixed-Fermentation Brut IPA', 'ipa.generic', 'localized_display', 'style-localization-v1.2'),
  ('混酿野菌艾尔', 'Mixed-Fermentation Wild Ale', 'wild.generic', 'localized_display', 'style-localization-v1.2'),
  ('混酿野菌酸塞松', 'Mixed-Fermentation Wild-Fermented Sour Saison', 'saison.saison', 'localized_display', 'style-localization-v1.2'),
  ('混浊淡色艾尔', 'Hazy Pale Ale', 'pale_ale.generic', 'localized_display', 'style-localization-v1.2'),
  ('混浊IPA', 'Hazy IPA', 'ipa.hazy', 'localized_display', 'style-localization-v1.2'),
  ('火麻仁草本拉格', 'Herbal Lager', 'lager.generic', 'localized_display', 'style-localization-v1.2'),
  ('机打鸡尾酒', 'Cocktail', 'unknown', 'localized_display', 'style-localization-v1.2'),
  ('极干东海岸IPA', 'IPA', 'ipa.generic', 'localized_display', 'style-localization-v1.2'),
  ('极干柠檬草酒花塞松', 'Fruited Saison', 'saison.saison', 'localized_display', 'style-localization-v1.2'),
  ('极干双倍IPA', 'Double IPA', 'ipa.generic', 'localized_display', 'style-localization-v1.2'),
  ('极干西海岸IPA', 'West Coast IPA', 'ipa.west_coast', 'localized_display', 'style-localization-v1.2'),
  ('极限酒花艾尔', 'Hoppy Ale', 'unknown', 'localized_display', 'style-localization-v1.2'),
  ('季节艾尔', 'Ale', 'unknown', 'localized_display', 'style-localization-v1.2'),
  ('加州蒸汽拉格', 'California Common', 'lager.california_common', 'localized_display', 'style-localization-v1.2'),
  ('加州蒸汽啤酒', 'California Common', 'lager.california_common', 'localized_display', 'style-localization-v1.2'),
  ('坚果榛子深色拉格', 'Dark Lager', 'lager.dark', 'localized_display', 'style-localization-v1.2'),
  ('姜汁菠萝硬苏打', 'Fruited Hard Seltzer', 'hard_seltzer.generic', 'localized_display', 'style-localization-v1.2'),
  ('浆果玫瑰酸艾尔', 'Fruited Sour', 'sour.fruited', 'localized_display', 'style-localization-v1.2'),
  ('窖藏博克', 'Bock', 'bock.generic', 'localized_display', 'style-localization-v1.2'),
  ('窖藏拉格', 'Kellerbier', 'lager.kellerbier', 'localized_display', 'style-localization-v1.2'),
  ('窖藏慕尼黑深色拉格', 'Dark Lager', 'lager.dark', 'localized_display', 'style-localization-v1.2'),
  ('窖藏皮尔森', 'Pilsner', 'pilsner.generic', 'localized_display', 'style-localization-v1.2'),
  ('窖藏皮尔森 / Aged Pilsner', 'Pilsner', 'pilsner.generic', 'localized_display', 'style-localization-v1.2'),
  ('窖藏啤酒', NULL, 'unknown', 'hold_for_manual_review', 'style-localization-v1.2'),
  ('酵母悬浮型小麦', 'Wheat Beer', 'wheat.generic', 'localized_display', 'style-localization-v1.2'),
  ('接骨木苹果Cider', 'Cider', 'cider.generic', 'localized_display', 'style-localization-v1.2'),
  ('接骨木起泡酒', NULL, 'unknown', 'hold_for_manual_review', 'style-localization-v1.2'),
  ('节庆拉格-2026', 'Lager', 'lager.generic', 'localized_display', 'style-localization-v1.2'),
  ('节日拉格', 'Lager', 'lager.generic', 'localized_display', 'style-localization-v1.2'),
  ('节日啤酒', NULL, 'unknown', 'hold_for_manual_review', 'style-localization-v1.2'),
  ('桔子辣椒 Cider', 'Fruited Cider', 'cider.generic', 'localized_display', 'style-localization-v1.2'),
  ('捷克淡色拉格', 'Lager', 'lager.generic', 'style_key_safe_fallback', 'style-localization-v1.2'),
  ('捷克风格皮尔森', 'Czech Pilsner', 'pilsner.czech', 'localized_display', 'style-localization-v1.2'),
  ('捷克琥珀拉格', 'Czech Amber Lager', 'lager.czech_amber', 'localized_display', 'style-localization-v1.2'),
  ('捷克经典拉格', 'Lager', 'lager.generic', 'style_key_safe_fallback', 'style-localization-v1.2'),
  ('捷克拉格', 'Lager', 'lager.generic', 'style_key_safe_fallback', 'style-localization-v1.2'),
  ('捷克皮尔森', 'Czech Pilsner', 'pilsner.czech', 'localized_display', 'style-localization-v1.2'),
  ('捷克轻盈拉格', 'Lager', 'lager.generic', 'style_key_safe_fallback', 'style-localization-v1.2'),
  ('捷克深色拉格', 'Dark Lager', 'lager.dark', 'style_key_safe_fallback', 'style-localization-v1.2'),
  ('捷克优质淡色拉格', 'Lager', 'lager.generic', 'style_key_safe_fallback', 'style-localization-v1.2'),
  ('捷克优质浅色拉格', 'Lager', 'lager.generic', 'style_key_safe_fallback', 'style-localization-v1.2'),
  ('金桂乌龙秋月梨西打', 'Cider', 'cider.generic', 'localized_display', 'style-localization-v1.2'),
  ('金桔芒果酸艾尔', 'Fruited Sour', 'sour.fruited', 'localized_display', 'style-localization-v1.2'),
  ('金桔茉莉花酸艾尔', 'Fruited Sour', 'sour.fruited', 'localized_display', 'style-localization-v1.2'),
  ('金酒/汤力水/黄柠/青柠', NULL, 'unknown', 'hold_for_manual_review', 'style-localization-v1.2'),
  ('金麦', NULL, 'unknown', 'hold_for_manual_review', 'style-localization-v1.2'),
  ('金色艾尔', 'Blonde / Golden Ale', 'pale_ale.blonde', 'localized_display', 'style-localization-v1.2'),
  ('金色窖藏拉格', 'Kellerbier', 'lager.kellerbier', 'localized_display', 'style-localization-v1.2'),
  ('金色窑臧拉格', 'Lager', 'lager.generic', 'localized_display', 'style-localization-v1.2'),
  ('京味凉糕佐酸乌梅果干西打', 'Sour Cider', 'cider.generic', 'localized_display', 'style-localization-v1.2'),
  ('经典捷克拉格', 'Lager', 'lager.generic', 'style_key_safe_fallback', 'style-localization-v1.2'),
  ('经典农舍赛松', 'Saison', 'saison.saison', 'localized_display', 'style-localization-v1.2'),
  ('九窨茉莉浓香白酒酸', NULL, 'unknown', 'hold_for_manual_review', 'style-localization-v1.2'),
  ('酒花饱和艾尔', 'Hoppy Ale', 'unknown', 'localized_display', 'style-localization-v1.2'),
  ('酒花大米拉格', 'Hoppy Rice Lager', 'lager.rice', 'localized_display', 'style-localization-v1.2'),
  ('酒花帝国西打', 'Imperial Cider', 'cider.generic', 'localized_display', 'style-localization-v1.2'),
  ('酒花干投日式大米拉格', 'Dry-Hopped Hoppy Rice Lager', 'lager.rice', 'localized_display', 'style-localization-v1.2'),
  ('酒花干西打', 'Cider', 'cider.generic', 'localized_display', 'style-localization-v1.2'),
  ('酒花干型苹果酒', 'Cider', 'cider.generic', 'localized_display', 'style-localization-v1.2'),
  ('酒花科隆', 'Kölsch', 'kolsch.generic', 'localized_display', 'style-localization-v1.2'),
  ('酒花拉格', 'Hoppy Lager', 'lager.hoppy', 'localized_display', 'style-localization-v1.2'),
  ('酒花拉格 清爽脆口，柑橘花香', 'Hoppy Lager', 'lager.hoppy', 'localized_display', 'style-localization-v1.2'),
  ('酒花硫醇拉格', 'Thiolized Hoppy Lager', 'lager.generic', 'localized_display', 'style-localization-v1.2'),
  ('酒花柠檬拉德勒 / Hoppy Lemon Radler', 'Fruited Hoppy Radler / Shandy', 'unknown', 'localized_display', 'style-localization-v1.2'),
  ('酒花农舍艾尔', 'Hoppy Farmhouse Ale', 'saison.farmhouse', 'localized_display', 'style-localization-v1.2'),
  ('酒花皮尔森', 'Hoppy Pilsner', 'pilsner.generic', 'localized_display', 'style-localization-v1.2'),
  ('酒花皮尔森 Pilsner', 'Hoppy Pilsner', 'pilsner.generic', 'localized_display', 'style-localization-v1.2'),
  ('酒花酸拉格', 'Hoppy Sour Lager', 'unknown', 'localized_display', 'style-localization-v1.2'),
  ('酒花小麦', 'Wheat Beer', 'wheat.generic', 'localized_display', 'style-localization-v1.2'),
  ('橘子柠檬茉莉花茶西达', 'Fruited Tea Cider', 'cider.generic', 'localized_display', 'style-localization-v1.2'),
  ('巨峰葡萄酸艾尔', 'Fruited Sour', 'sour.fruited', 'localized_display', 'style-localization-v1.2'),
  ('巨峰葡萄西打', 'Fruited Cider', 'cider.generic', 'localized_display', 'style-localization-v1.2'),
  ('巨峰葡萄硬苏打', 'Fruited Hard Seltzer', 'hard_seltzer.generic', 'localized_display', 'style-localization-v1.2'),
  ('咖啡+伏特加', NULL, 'unknown', 'hold_for_manual_review', 'style-localization-v1.2'),
  ('咖啡波特', 'Coffee Porter', 'porter.generic', 'localized_display', 'style-localization-v1.2'),
  ('咖啡帝国世涛', 'Coffee Imperial Stout', 'stout.imperial', 'localized_display', 'style-localization-v1.2'),
  ('咖啡黑麦艾尔', 'Coffee Rye Ale', 'unknown', 'localized_display', 'style-localization-v1.2'),
  ('咖啡梅果巧克力酸世涛', 'Coffee Sour Stout', 'unknown', 'localized_display', 'style-localization-v1.2'),
  ('咖啡日式拉格', 'Lager', 'lager.generic', 'style_key_safe_fallback', 'style-localization-v1.2'),
  ('咖啡世涛', 'Coffee Stout', 'stout.generic', 'localized_display', 'style-localization-v1.2'),
  ('咖啡水果西打', 'Coffee Fruited Cider', 'cider.generic', 'localized_display', 'style-localization-v1.2'),
  ('咖啡糖酸艾尔', 'Coffee Sour Ale', 'sour.generic', 'localized_display', 'style-localization-v1.2'),
  ('卡塔琳娜酸啤', 'Sour Ale', 'sour.generic', 'localized_display', 'style-localization-v1.2'),
  ('康普茶', 'Tea Kombucha', 'kombucha.generic', 'localized_display', 'style-localization-v1.2'),
  ('科隆', 'Kölsch', 'kolsch.generic', 'localized_display', 'style-localization-v1.2'),
  ('科隆 / Kölsch', 'Kölsch', 'kolsch.generic', 'localized_display', 'style-localization-v1.2'),
  ('科隆淡啤', 'Kölsch', 'kolsch.generic', 'localized_display', 'style-localization-v1.2'),
  ('科隆风格艾尔', 'Kölsch', 'kolsch.generic', 'localized_display', 'style-localization-v1.2'),
  ('科隆风格啤酒', 'Kölsch', 'kolsch.generic', 'localized_display', 'style-localization-v1.2'),
  ('科隆啤酒', 'Kölsch', 'kolsch.generic', 'localized_display', 'style-localization-v1.2'),
  ('可可深色拉格', 'Dark Lager', 'lager.dark', 'localized_display', 'style-localization-v1.2'),
  ('苦丁茶艾尔', 'Tea Ale', 'unknown', 'localized_display', 'style-localization-v1.2'),
  ('苦啤', 'English Bitter', 'english.bitter', 'localized_display', 'style-localization-v1.2'),
  ('拉德勒', 'Radler / Shandy', 'unknown', 'localized_display', 'style-localization-v1.2'),
  ('拉格', 'Lager', 'lager.generic', 'localized_display', 'style-localization-v1.2'),
  ('兰比克', 'Lambic', 'wild.lambic', 'localized_display', 'style-localization-v1.2'),
  ('蓝靛果岩茶西打', 'Tea Cider', 'cider.generic', 'localized_display', 'style-localization-v1.2'),
  ('蓝莓莓果玫瑰乌龙茶电解质西打', 'Fruited Tea Cider', 'cider.generic', 'localized_display', 'style-localization-v1.2'),
  ('蓝莓桃子酸IPA', 'Fruited Sour IPA', 'ipa.sour', 'localized_display', 'style-localization-v1.2'),
  ('朗格多克葡萄酒混酿比利时酸艾尔', 'Mixed-Fermentation Fruited Sour Ale', 'sour.fruited', 'localized_display', 'style-localization-v1.2'),
  ('老艾尔', 'Old Ale', 'strong_ale.old', 'localized_display', 'style-localization-v1.2'),
  ('老啤酒', NULL, 'unknown', 'hold_for_manual_review', 'style-localization-v1.2'),
  ('冷IPA', 'Cold IPA', 'ipa.cold', 'localized_display', 'style-localization-v1.2'),
  ('梨子西打果酒', 'Cider', 'cider.generic', 'localized_display', 'style-localization-v1.2'),
  ('荔枝·玫瑰·黑皮诺（红葡萄酒）', 'Fruited Wine', 'unknown', 'localized_display', 'style-localization-v1.2'),
  ('荔枝接骨木西打', 'Fruited Cider', 'cider.generic', 'localized_display', 'style-localization-v1.2'),
  ('荔枝酸IPA', 'Fruited Sour IPA', 'ipa.sour', 'localized_display', 'style-localization-v1.2'),
  ('荔枝铁观音艾尔啤酒', 'Fruited Ale', 'unknown', 'localized_display', 'style-localization-v1.2'),
  ('栗子风味帝国世涛', 'Imperial Stout', 'stout.imperial', 'localized_display', 'style-localization-v1.2'),
  ('栗子奶昔世涛', 'Milkshake Stout', 'stout.generic', 'localized_display', 'style-localization-v1.2'),
  ('莲雾苹果梨伯爵茶西打', 'Tea Cider', 'cider.generic', 'localized_display', 'style-localization-v1.2'),
  ('莲雾柚子香茅酸艾', 'Fruited Sour', 'sour.fruited', 'localized_display', 'style-localization-v1.2'),
  ('列幸苦啤', 'English Bitter', 'english.bitter', 'localized_display', 'style-localization-v1.2'),
  ('烈性果味啤酒', NULL, 'unknown', 'hold_for_manual_review', 'style-localization-v1.2'),
  ('烈性浑浊IPA', 'Hazy IPA', 'ipa.hazy', 'localized_display', 'style-localization-v1.2'),
  ('烈性苦啤', 'Strong Bitter / ESB', 'english.esb', 'localized_display', 'style-localization-v1.2'),
  ('烈性老啤酒', 'Old Ale', 'unknown', 'localized_display', 'style-localization-v1.2'),
  ('零糖科隆', 'Zero-Sugar Kölsch', 'kolsch.generic', 'localized_display', 'style-localization-v1.2'),
  ('零糖茉莉花茶科隆', 'Zero-Sugar Tea Kölsch', 'kolsch.generic', 'localized_display', 'style-localization-v1.2'),
  ('零糖皮尔森', 'Zero-Sugar Pilsner', 'pilsner.generic', 'localized_display', 'style-localization-v1.2'),
  ('零糖现代西海岸IPA', 'Zero-Sugar West Coast IPA', 'ipa.west_coast', 'localized_display', 'style-localization-v1.2'),
  ('流体果泥', NULL, 'unknown', 'hold_for_manual_review', 'style-localization-v1.2'),
  ('硫醇浑浊IPA', 'Thiolized Hazy IPA', 'ipa.hazy', 'localized_display', 'style-localization-v1.2'),
  ('硫醇IPA', 'Thiolized IPA', 'ipa.generic', 'localized_display', 'style-localization-v1.2'),
  ('柳橙酸艾尔', 'Fruited Sour', 'sour.fruited', 'localized_display', 'style-localization-v1.2'),
  ('柳橙酸艾尔 / Orange Sour Ale', 'Fruited Sour', 'sour.fruited', 'localized_display', 'style-localization-v1.2'),
  ('柳橙酸艾尔啤酒', 'Fruited Sour', 'sour.fruited', 'localized_display', 'style-localization-v1.2'),
  ('龙蒿羊角蜜硬苏打', 'Hard Seltzer', 'hard_seltzer.generic', 'localized_display', 'style-localization-v1.2'),
  ('龙眼莲雾白玉兰西打', 'Cider', 'cider.generic', 'localized_display', 'style-localization-v1.2'),
  ('绿茶酸艾尔', 'Tea Sour Ale', 'sour.generic', 'localized_display', 'style-localization-v1.2'),
  ('绿豆蔻盐渍菠萝古斯', 'Fruited Gose', 'sour.gose', 'localized_display', 'style-localization-v1.2'),
  ('罗勒柠檬古斯', 'Fruited Gose', 'sour.gose', 'localized_display', 'style-localization-v1.2'),
  ('麦芽实验啤酒', 'Experimental Malt Beer', 'unknown', 'localized_display', 'style-localization-v1.2'),
  ('蔓延黑生', NULL, 'unknown', 'hold_for_manual_review', 'style-localization-v1.2'),
  ('芒果帝国IPA', 'Imperial Fruited IPA', 'ipa.generic', 'localized_display', 'style-localization-v1.2'),
  ('芒果柑橘酸艾尔', 'Fruited Sour', 'sour.fruited', 'localized_display', 'style-localization-v1.2'),
  ('芒果黄桃酸艾尔', 'Fruited Sour', 'sour.fruited', 'localized_display', 'style-localization-v1.2'),
  ('芒果蜜杏橙花蜜酒', 'Fruited Mead', 'mead.generic', 'localized_display', 'style-localization-v1.2'),
  ('芒果糯米饭酸艾尔', 'Fruited Sour', 'sour.fruited', 'localized_display', 'style-localization-v1.2'),
  ('芒果椰子果泥酸艾尔', 'Fruited Smoothie / Pastry Sour', 'sour.smoothie', 'localized_display', 'style-localization-v1.2'),
  ('芒果椰子酸艾尔', 'Fruited Sour', 'sour.fruited', 'localized_display', 'style-localization-v1.2'),
  ('没事淡拉格', 'Lager', 'lager.generic', 'localized_display', 'style-localization-v1.2'),
  ('玫瑰红茶蜂蜜酒', 'Tea Mead', 'mead.generic', 'localized_display', 'style-localization-v1.2'),
  ('玫瑰树莓葡萄酸艾尔', 'Fruited Sour', 'sour.fruited', 'localized_display', 'style-localization-v1.2'),
  ('玫珑蜜瓜/椰子水/伏特加/金酒', NULL, 'unknown', 'hold_for_manual_review', 'style-localization-v1.2'),
  ('莓果 Cider', 'Fruited Cider', 'cider.generic', 'localized_display', 'style-localization-v1.2'),
  ('莓果布朗尼酸艾尔', 'Fruited Sour Ale', 'sour.fruited', 'localized_display', 'style-localization-v1.2'),
  ('莓果大红袍 硬冰茶', 'Fruited Hard Tea', 'unknown', 'localized_display', 'style-localization-v1.2'),
  ('莓果大红袍冰淇淋果泥西打果酒', 'Cider', 'cider.generic', 'localized_display', 'style-localization-v1.2'),
  ('莓果冻柠茶西打', 'Fruited Tea Cider', 'cider.generic', 'localized_display', 'style-localization-v1.2'),
  ('莓果古斯艾尔', 'Fruited Gose', 'sour.gose', 'localized_display', 'style-localization-v1.2'),
  ('莓果果汁西打', 'Fruited Cider', 'cider.generic', 'localized_display', 'style-localization-v1.2'),
  ('莓果椒树花 Mead', 'Fruited Mead', 'mead.generic', 'localized_display', 'style-localization-v1.2'),
  ('莓果酸艾尔', 'Fruited Sour', 'sour.fruited', 'localized_display', 'style-localization-v1.2'),
  ('莓果岩茶西打', 'Fruited Tea Cider', 'cider.generic', 'localized_display', 'style-localization-v1.2'),
  ('莓果岩茶西大', 'Fruited Tea Cider', 'cider.generic', 'localized_display', 'style-localization-v1.2'),
  ('美式波特', 'Porter', 'porter.generic', 'localized_display', 'style-localization-v1.2'),
  ('美式淡艾', 'American Pale Ale', 'pale_ale.american', 'localized_display', 'style-localization-v1.2'),
  ('美式淡拉格', 'Lager', 'lager.generic', 'localized_display', 'style-localization-v1.2'),
  ('美式淡啤', 'American Pale Beer', 'unknown', 'localized_display', 'style-localization-v1.2'),
  ('美式淡色艾尔', 'American Pale Ale', 'pale_ale.american', 'localized_display', 'style-localization-v1.2'),
  ('美式淡色艾尔 / American Pale Ale', 'American Pale Ale', 'pale_ale.american', 'localized_display', 'style-localization-v1.2'),
  ('美式淡色拉格', 'Lager', 'lager.generic', 'localized_display', 'style-localization-v1.2'),
  ('美式金色艾尔 酒花饱满', 'Blonde / Golden Ale', 'pale_ale.blonde', 'localized_display', 'style-localization-v1.2'),
  ('美式拉格', 'Lager', 'lager.generic', 'localized_display', 'style-localization-v1.2'),
  ('美式皮尔森', 'Pilsner', 'pilsner.generic', 'localized_display', 'style-localization-v1.2'),
  ('美式双倍IPA', 'Double American IPA', 'ipa.american', 'localized_display', 'style-localization-v1.2'),
  ('美式西海岸', NULL, 'unknown', 'hold_for_manual_review', 'style-localization-v1.2'),
  ('美式西海岸IPA', 'West Coast IPA', 'ipa.west_coast', 'localized_display', 'style-localization-v1.2'),
  ('美式小麦', 'Wheat Beer', 'wheat.generic', 'localized_display', 'style-localization-v1.2'),
  ('美式小麦 / Wheat', 'Wheat Beer', 'wheat.generic', 'localized_display', 'style-localization-v1.2'),
  ('美式野菌艾尔', 'Wild Ale', 'wild.generic', 'localized_display', 'style-localization-v1.2'),
  ('美式野菌酸艾尔', 'Sour Wild Ale', 'wild.generic', 'localized_display', 'style-localization-v1.2'),
  ('美式棕色艾尔', 'Brown Ale', 'amber_red_brown.brown', 'localized_display', 'style-localization-v1.2'),
  ('美式IPA', 'American IPA', 'ipa.american', 'localized_display', 'style-localization-v1.2'),
  ('猕猴桃西打', 'Cider', 'cider.generic', 'localized_display', 'style-localization-v1.2'),
  ('米酒', 'Rice Wine', 'unknown', 'localized_display', 'style-localization-v1.2'),
  ('米酒皮尔森', 'Pilsner', 'pilsner.generic', 'localized_display', 'style-localization-v1.2'),
  ('蜜瓜白桃冰浆西达', 'Fruited Cider', 'cider.generic', 'localized_display', 'style-localization-v1.2'),
  ('蜜瓜龙双倍干投单一酒花IPA', 'DDH Fruited IPA', 'ipa.generic', 'localized_display', 'style-localization-v1.2'),
  ('蜜瓜酸艾尔', 'Fruited Sour', 'sour.fruited', 'localized_display', 'style-localization-v1.2'),
  ('蜜酒', 'Mead', 'mead.generic', 'localized_display', 'style-localization-v1.2'),
  ('蜜桃黄皮果泥西打', 'Fruited Cider', 'cider.generic', 'localized_display', 'style-localization-v1.2'),
  ('蜜桃紫苏绿茶酸塞松', 'Tea Sour Saison', 'saison.saison', 'localized_display', 'style-localization-v1.2'),
  ('闽南酸梅调料波特', 'Sour Porter', 'porter.generic', 'localized_display', 'style-localization-v1.2'),
  ('摩登深色拉格', 'Dark Lager', 'lager.dark', 'localized_display', 'style-localization-v1.2'),
  ('摩登西海岸 IPA', 'West Coast IPA', 'ipa.west_coast', 'localized_display', 'style-localization-v1.2'),
  ('摩登西海岸IPA', 'West Coast IPA', 'ipa.west_coast', 'localized_display', 'style-localization-v1.2'),
  ('摩登IPA', 'IPA', 'ipa.generic', 'localized_display', 'style-localization-v1.2'),
  ('摩卡咖啡帝国世涛', 'Coffee Imperial Stout', 'stout.imperial', 'localized_display', 'style-localization-v1.2'),
  ('抹茶冰激凌西打', 'Pastry Tea Cider', 'cider.generic', 'localized_display', 'style-localization-v1.2'),
  ('抹茶果泥', 'Fruited Tea', 'unknown', 'localized_display', 'style-localization-v1.2'),
  ('抹茶西打', 'Tea Cider', 'cider.generic', 'localized_display', 'style-localization-v1.2'),
  ('茉莉蜂蜜啤酒', NULL, 'unknown', 'hold_for_manual_review', 'style-localization-v1.2'),
  ('茉莉花茶拉格', 'Tea Lager', 'lager.generic', 'localized_display', 'style-localization-v1.2'),
  ('茉莉花茶小麦', 'Tea Wheat Beer', 'wheat.generic', 'localized_display', 'style-localization-v1.2'),
  ('茉莉花小麦', 'Wheat Beer', 'wheat.generic', 'localized_display', 'style-localization-v1.2'),
  ('茉莉香米拉格', 'Rice Lager', 'lager.rice', 'localized_display', 'style-localization-v1.2'),
  ('茉莉小麦', 'Wheat Beer', 'wheat.generic', 'localized_display', 'style-localization-v1.2'),
  ('墨西哥拉格', 'Mexican Lager', 'lager.mexican', 'localized_display', 'style-localization-v1.2'),
  ('墨西哥深色拉格', 'Dark Lager', 'lager.dark', 'localized_display', 'style-localization-v1.2'),
  ('墨西哥玉米拉格', 'Rice Lager', 'lager.generic', 'localized_display', 'style-localization-v1.2'),
  ('木姜子黑莓酸樱桃', NULL, 'unknown', 'hold_for_manual_review', 'style-localization-v1.2'),
  ('木姜子黑莓酸樱桃酸艾', 'Fruited Sour', 'sour.fruited', 'localized_display', 'style-localization-v1.2'),
  ('慕尼黑节庆拉格', 'Lager', 'lager.generic', 'localized_display', 'style-localization-v1.2'),
  ('慕尼黑清亮拉格', 'Munich Helles', 'lager.helles', 'localized_display', 'style-localization-v1.2'),
  ('慕尼黑清亮拉格 / Munich Helles', 'Munich Helles', 'lager.helles', 'localized_display', 'style-localization-v1.2'),
  ('慕尼黑深色拉格', 'Dark Lager', 'lager.dark', 'localized_display', 'style-localization-v1.2'),
  ('奶昔酸艾尔', 'Milkshake Smoothie / Pastry Sour', 'sour.smoothie', 'localized_display', 'style-localization-v1.2'),
  ('奶油水果果昔酸艾尔', 'Fruited Sour Ale', 'sour.fruited', 'localized_display', 'style-localization-v1.2'),
  ('奶油水果奶昔酸艾尔', 'Fruited Milkshake Smoothie / Pastry Sour', 'sour.smoothie', 'localized_display', 'style-localization-v1.2'),
  ('南瓜艾尔', 'Ale', 'unknown', 'localized_display', 'style-localization-v1.2'),
  ('南加州IPA', 'IPA', 'ipa.generic', 'localized_display', 'style-localization-v1.2'),
  ('柠檬磅蛋糕酸艾尔', 'Fruited Sour Ale', 'sour.fruited', 'localized_display', 'style-localization-v1.2'),
  ('柠檬草和热带酸角大王西打', 'Fruited Sour Cider', 'cider.generic', 'localized_display', 'style-localization-v1.2'),
  ('柠檬茶西打', 'Fruited Tea Cider', 'cider.generic', 'localized_display', 'style-localization-v1.2'),
  ('柠檬拉德勒', 'Fruited Radler / Shandy', 'unknown', 'localized_display', 'style-localization-v1.2'),
  ('柠檬拉格', 'Fruited Lager', 'lager.generic', 'localized_display', 'style-localization-v1.2'),
  ('柠檬皮尔森', 'Fruited Pilsner', 'pilsner.generic', 'localized_display', 'style-localization-v1.2'),
  ('柠檬苹果汁', 'Fruited Juice', 'unknown', 'localized_display', 'style-localization-v1.2'),
  ('牛奶世涛', 'Milk Stout', 'stout.milk', 'localized_display', 'style-localization-v1.2'),
  ('牛奶甜点世涛', 'Pastry Milk Stout', 'stout.milk', 'localized_display', 'style-localization-v1.2'),
  ('纽伦堡红啤', 'Franconian Rotbier', 'unknown', 'localized_display', 'style-localization-v1.2'),
  ('农舍艾尔', 'Farmhouse Ale', 'saison.farmhouse', 'localized_display', 'style-localization-v1.2'),
  ('农舍艾尔：塞松', 'Saison', 'saison.saison', 'localized_display', 'style-localization-v1.2'),
  ('农舍艾尔塞松', 'Saison', 'saison.saison', 'localized_display', 'style-localization-v1.2'),
  ('农舍气泡西打', 'Farmhouse Sparkling Cider', 'unknown', 'localized_display', 'style-localization-v1.2'),
  ('农舍塞松', 'Saison', 'saison.saison', 'localized_display', 'style-localization-v1.2'),
  ('农舍酸艾尔', 'Sour Farmhouse Ale', 'saison.farmhouse', 'localized_display', 'style-localization-v1.2'),
  ('农舍小麦艾尔', NULL, 'wheat.generic', 'hold_for_manual_review', 'style-localization-v1.2'),
  ('农舍硬苏打', 'Hard Seltzer', 'hard_seltzer.generic', 'style_key_safe_fallback', 'style-localization-v1.2'),
  ('农舍棕色酸艾尔', 'Sour Farmhouse Ale', 'saison.farmhouse', 'localized_display', 'style-localization-v1.2'),
  ('农舍IPA', 'IPA', 'ipa.generic', 'style_key_safe_fallback', 'style-localization-v1.2'),
  ('浓苦啤', NULL, 'english.bitter', 'hold_for_manual_review', 'style-localization-v1.2'),
  ('暖甜红枣牛奶世涛', 'Milk Stout', 'stout.milk', 'localized_display', 'style-localization-v1.2'),
  ('糯香清茶西打', 'Tea Cider', 'cider.generic', 'localized_display', 'style-localization-v1.2'),
  ('欧式拉格', 'Lager', 'lager.generic', 'localized_display', 'style-localization-v1.2'),
  ('蟠桃草莓番石榴奶昔古斯', 'Fruited Milkshake Gose', 'sour.gose', 'localized_display', 'style-localization-v1.2'),
  ('蟠桃酸IPA', 'Sour IPA', 'ipa.sour', 'localized_display', 'style-localization-v1.2'),
  ('皮尔森', 'Pilsner', 'pilsner.generic', 'localized_display', 'style-localization-v1.2'),
  ('皮尔斯', 'Pilsner', 'pilsner.generic', 'localized_display', 'style-localization-v1.2'),
  ('枇杷酸IPA', 'Fruited Sour IPA', 'ipa.sour', 'localized_display', 'style-localization-v1.2'),
  ('片仔癀草西打', 'Cider', 'cider.generic', 'localized_display', 'style-localization-v1.2'),
  ('苹果', NULL, 'unknown', 'hold_for_manual_review', 'style-localization-v1.2'),
  ('苹果酒', 'Cider', 'cider.generic', 'localized_display', 'style-localization-v1.2'),
  ('苹果茉莉冰茶西打果酒', 'Tea Cider', 'cider.generic', 'localized_display', 'style-localization-v1.2'),
  ('苹果西打', 'Cider', 'cider.generic', 'localized_display', 'style-localization-v1.2'),
  ('苹果香杏乌龙茶西打', 'Tea Cider', 'cider.generic', 'localized_display', 'style-localization-v1.2'),
  ('苹果芝兰香硬冰茶', 'Fruited Hard Tea', 'unknown', 'localized_display', 'style-localization-v1.2'),
  ('葡萄艾尔啤酒 果味突出 入门零压力', 'Fruited Ale', 'unknown', 'localized_display', 'style-localization-v1.2'),
  ('葡萄冰淇淋古斯', 'Fruited Gose', 'sour.gose', 'localized_display', 'style-localization-v1.2'),
  ('葡萄酒陈桶 北法窖藏', 'Fruited Wine', 'unknown', 'localized_display', 'style-localization-v1.2'),
  ('葡萄巧克力酸艾尔', 'Fruited Sour', 'sour.fruited', 'localized_display', 'style-localization-v1.2'),
  ('葡萄西打', 'Fruited Cider', 'cider.generic', 'localized_display', 'style-localization-v1.2'),
  ('祁门红茶橙花蜜酒', 'Tea Mead', 'mead.generic', 'localized_display', 'style-localization-v1.2'),
  ('起泡蜂蜜酒', 'Mead', 'mead.generic', 'localized_display', 'style-localization-v1.2'),
  ('起泡酒', NULL, 'unknown', 'hold_for_manual_review', 'style-localization-v1.2'),
  ('气泡西打酒', 'Cider', 'cider.generic', 'localized_display', 'style-localization-v1.2'),
  ('浅色佛兰德酸艾尔', 'Sour Ale', 'sour.generic', 'localized_display', 'style-localization-v1.2'),
  ('荞麦红茶荞麦科隆', 'Tea Kölsch', 'kolsch.generic', 'localized_display', 'style-localization-v1.2'),
  ('巧克力黑生', NULL, 'unknown', 'hold_for_manual_review', 'style-localization-v1.2'),
  ('巧克力世涛', 'Stout', 'stout.generic', 'localized_display', 'style-localization-v1.2'),
  ('秦岭稻米拉格', 'Rice Lager', 'lager.rice', 'localized_display', 'style-localization-v1.2'),
  ('青橄榄&茉莉花苹果酒', 'Cider', 'cider.generic', 'localized_display', 'style-localization-v1.2'),
  ('青瓜薄荷柏林酸小麦', 'Berliner Weisse', 'sour.berliner_weisse', 'localized_display', 'style-localization-v1.2'),
  ('青瓜椒树花 Mead', 'Mead', 'mead.generic', 'localized_display', 'style-localization-v1.2'),
  ('青瓜科隆', 'Kölsch', 'kolsch.generic', 'localized_display', 'style-localization-v1.2'),
  ('青瓜抹茶半干型西打', 'Tea Cider', 'cider.generic', 'localized_display', 'style-localization-v1.2'),
  ('青橘西打', 'Fruited Cider', 'cider.generic', 'localized_display', 'style-localization-v1.2'),
  ('青芒生椰优格酸奶果昔艾尔', 'Fruited Sour Ale', 'unknown', 'localized_display', 'style-localization-v1.2'),
  ('青芒杨桃沃柑西打', 'Cider', 'cider.generic', 'localized_display', 'style-localization-v1.2'),
  ('青梅蜂蜜酒', 'Fruited Mead', 'mead.generic', 'localized_display', 'style-localization-v1.2'),
  ('青梅皮尔森', 'Fruited Pilsner', 'pilsner.generic', 'localized_display', 'style-localization-v1.2'),
  ('青柠风格墨西哥拉格', 'Mexican Lager', 'lager.mexican', 'localized_display', 'style-localization-v1.2'),
  ('青柠海盐拉格', 'Lager', 'lager.generic', 'localized_display', 'style-localization-v1.2'),
  ('青柠拉格', 'Lager', 'lager.generic', 'localized_display', 'style-localization-v1.2'),
  ('青柠皮尔森', 'Pilsner', 'pilsner.generic', 'localized_display', 'style-localization-v1.2'),
  ('青苹果/白梨/伏特加', NULL, 'unknown', 'hold_for_manual_review', 'style-localization-v1.2'),
  ('青提百花蜜酒', 'Fruited Mead', 'mead.generic', 'localized_display', 'style-localization-v1.2'),
  ('青提风味西打', 'Fruited Cider', 'cider.generic', 'localized_display', 'style-localization-v1.2'),
  ('青提黄皮油柑果昔艾尔', 'Fruited Ale', 'unknown', 'localized_display', 'style-localization-v1.2'),
  ('青提青苹果西打', 'Fruited Cider', 'cider.generic', 'localized_display', 'style-localization-v1.2'),
  ('青提乌龙茶西打', 'Fruited Tea Cider', 'cider.generic', 'localized_display', 'style-localization-v1.2'),
  ('青提乌龙Cider', 'Fruited Cider', 'cider.generic', 'localized_display', 'style-localization-v1.2'),
  ('青提仙人掌栀子乌龙茶西打', 'Fruited Tea Cider', 'cider.generic', 'localized_display', 'style-localization-v1.2'),
  ('青提竹香梨西打', 'Fruited Cider', 'cider.generic', 'localized_display', 'style-localization-v1.2'),
  ('青岩玫瑰红茶蜂蜜酒', 'Tea Mead', 'mead.generic', 'localized_display', 'style-localization-v1.2'),
  ('青柚酸白IPA', 'Sour White IPA', 'ipa.sour', 'localized_display', 'style-localization-v1.2'),
  ('轻脆浑浊IPA', 'Hazy IPA', 'ipa.hazy', 'localized_display', 'style-localization-v1.2'),
  ('轻果泥西打', 'Fruited Cider', 'cider.generic', 'localized_display', 'style-localization-v1.2'),
  ('轻硫醇皮尔森', 'Thiolized Pilsner', 'pilsner.generic', 'localized_display', 'style-localization-v1.2'),
  ('轻硫醇皮尔森 / Thiol Pilsner', 'Thiolized Pilsner', 'pilsner.generic', 'localized_display', 'style-localization-v1.2'),
  ('清酒酒粕果泥酸艾尔', 'Fruited Smoothie Sour', 'unknown', 'localized_display', 'style-localization-v1.2'),
  ('清亮博克', 'Helles Bock', 'bock.generic', 'localized_display', 'style-localization-v1.2'),
  ('清亮拉格', 'Lager', 'lager.generic', 'localized_display', 'style-localization-v1.2'),
  ('清亮型拉格', 'Lager', 'lager.generic', 'localized_display', 'style-localization-v1.2'),
  ('清香柚子科隆', 'Kölsch', 'kolsch.generic', 'localized_display', 'style-localization-v1.2'),
  ('热带风格淡色拉格', 'Lager', 'lager.generic', 'localized_display', 'style-localization-v1.2'),
  ('热带融合浑浊IPA', 'Hazy IPA', 'ipa.hazy', 'localized_display', 'style-localization-v1.2'),
  ('热带酸浑浊IPA', 'Sour Hazy IPA', 'ipa.sour', 'localized_display', 'style-localization-v1.2'),
  ('日本大米拉格', 'Rice Lager', 'lager.rice', 'localized_display', 'style-localization-v1.2'),
  ('日本煎茶桂花浑浊IPA', 'Hazy IPA', 'ipa.hazy', 'style_key_safe_fallback', 'style-localization-v1.2'),
  ('日本经典拉格', 'Lager', 'lager.generic', 'style_key_safe_fallback', 'style-localization-v1.2'),
  ('日本柚子拉格', 'Lager', 'lager.generic', 'style_key_safe_fallback', 'style-localization-v1.2'),
  ('日式大米拉格', 'Rice Lager', 'lager.rice', 'localized_display', 'style-localization-v1.2'),
  ('日式大米皮尔森', 'Rice Pilsner', 'pilsner.generic', 'localized_display', 'style-localization-v1.2'),
  ('日式酒花拉格', 'Hoppy Lager', 'lager.hoppy', 'style_key_safe_fallback', 'style-localization-v1.2'),
  ('日式拉格', 'Lager', 'lager.generic', 'style_key_safe_fallback', 'style-localization-v1.2'),
  ('日式米香酒花拉格', 'Hoppy Lager', 'lager.hoppy', 'style_key_safe_fallback', 'style-localization-v1.2'),
  ('日式生啤', 'Japanese Draft Beer', 'unknown', 'localized_display', 'style-localization-v1.2'),
  ('日式玄米拉格', 'Rice Lager', 'lager.generic', 'localized_display', 'style-localization-v1.2'),
  ('日式柚子拉格', 'Lager', 'lager.generic', 'style_key_safe_fallback', 'style-localization-v1.2'),
  ('熔岩黑巧蛋糕帝国世涛', 'Imperial Stout', 'stout.imperial', 'localized_display', 'style-localization-v1.2'),
  ('熔岩黑巧蛋糕风味帝国世涛', 'Imperial Stout', 'stout.imperial', 'localized_display', 'style-localization-v1.2'),
  ('熔岩黑巧蛋糕石涛', 'Stout', 'stout.generic', 'localized_display', 'style-localization-v1.2'),
  ('融合型IPA', 'IPA', 'ipa.generic', 'localized_display', 'style-localization-v1.2'),
  ('汝拉帝国世涛', 'Imperial Stout', 'stout.imperial', 'localized_display', 'style-localization-v1.2'),
  ('乳酸菌水果啤酒', 'Sour Fruit Beer', 'unknown', 'localized_display', 'style-localization-v1.2'),
  ('萨克森未过滤拉格', 'Unfiltered Lager', 'lager.generic', 'localized_display', 'style-localization-v1.2'),
  ('塞松', 'Saison', 'saison.saison', 'localized_display', 'style-localization-v1.2'),
  ('赛松', 'Saison', 'saison.saison', 'localized_display', 'style-localization-v1.2'),
  ('三杯干投双倍浑浊IPA', 'Double Dry-Hopped Hazy IPA', 'ipa.hazy', 'localized_display', 'style-localization-v1.2'),
  ('三倍帝国酒花拉格', 'Triple Imperial Hoppy Lager', 'lager.hoppy', 'localized_display', 'style-localization-v1.2'),
  ('三倍干头三倍浑浊IPA', 'Triple Hazy IPA', 'ipa.hazy', 'localized_display', 'style-localization-v1.2'),
  ('三倍干投帝国浑浊', 'Imperial TDH Hazy Beer', 'unknown', 'localized_display', 'style-localization-v1.2'),
  ('三倍干投帝国浑浊IPA', 'Imperial TDH Hazy IPA', 'ipa.hazy', 'localized_display', 'style-localization-v1.2'),
  ('三倍干投帝国新英格兰帝国IPA', 'Imperial TDH Hazy IPA', 'ipa.hazy', 'localized_display', 'style-localization-v1.2'),
  ('三倍干投帝国IPA', 'Imperial TDH IPA', 'ipa.generic', 'localized_display', 'style-localization-v1.2'),
  ('三倍干投浑浊 IPA', 'TDH Hazy IPA', 'ipa.hazy', 'localized_display', 'style-localization-v1.2'),
  ('三倍干投浑浊IPA', 'TDH Hazy IPA', 'ipa.hazy', 'localized_display', 'style-localization-v1.2'),
  ('三倍干投酒花三倍IPA', 'Triple TDH IPA', 'ipa.generic', 'localized_display', 'style-localization-v1.2'),
  ('三倍干投摩登西海岸', NULL, 'unknown', 'hold_for_manual_review', 'style-localization-v1.2'),
  ('三倍干投摩登西海岸IPA', 'TDH West Coast IPA', 'ipa.west_coast', 'localized_display', 'style-localization-v1.2'),
  ('三倍干投摩登西海岸IPA / TDH Modern West Coast IPA', 'TDH West Coast IPA', 'ipa.west_coast', 'localized_display', 'style-localization-v1.2'),
  ('三倍干投三倍浑浊', 'Triple TDH Hazy Beer', 'unknown', 'localized_display', 'style-localization-v1.2'),
  ('三倍干投三倍浑浊IPA', 'Triple TDH Hazy IPA', 'ipa.hazy', 'localized_display', 'style-localization-v1.2'),
  ('三倍干投三倍新英格兰IPA', 'Triple TDH Hazy IPA', 'ipa.hazy', 'localized_display', 'style-localization-v1.2'),
  ('三倍干投社交浑浊IPA', 'Session TDH Hazy IPA', 'ipa.hazy', 'localized_display', 'style-localization-v1.2'),
  ('三倍干投双倍浑浊 IPA', 'Double TDH Hazy IPA', 'ipa.hazy', 'localized_display', 'style-localization-v1.2'),
  ('三倍干投双倍浑浊IPA', 'Double TDH Hazy IPA', 'ipa.hazy', 'localized_display', 'style-localization-v1.2'),
  ('三倍干投双倍浑浊IPA 热带风味浓郁，酒体饱满绵密', 'Double TDH Hazy IPA', 'ipa.hazy', 'localized_display', 'style-localization-v1.2'),
  ('三倍干投双倍浑浊IPA（澳大利亚酒花版', 'Double TDH Hazy IPA', 'ipa.hazy', 'localized_display', 'style-localization-v1.2'),
  ('三倍干投双倍西海岸', NULL, 'unknown', 'hold_for_manual_review', 'style-localization-v1.2'),
  ('三倍干投双倍西海岸IPA', 'Double TDH West Coast IPA', 'ipa.west_coast', 'localized_display', 'style-localization-v1.2'),
  ('三倍干投双倍燕麦奶油浑浊IPA', 'Double TDH Hazy IPA', 'ipa.hazy', 'localized_display', 'style-localization-v1.2'),
  ('三倍干投西海岸', NULL, 'unknown', 'hold_for_manual_review', 'style-localization-v1.2'),
  ('三倍干投西海岸IPA', 'TDH West Coast IPA', 'ipa.west_coast', 'localized_display', 'style-localization-v1.2'),
  ('三倍浑浊', 'Triple Hazy Beer', 'unknown', 'localized_display', 'style-localization-v1.2'),
  ('三倍浑浊 IPA', 'Triple Hazy IPA', 'ipa.hazy', 'localized_display', 'style-localization-v1.2'),
  ('三倍浑浊ipa', 'Triple Hazy IPA', 'ipa.hazy', 'localized_display', 'style-localization-v1.2'),
  ('三倍浑浊IPA', 'Triple Hazy IPA', 'ipa.hazy', 'localized_display', 'style-localization-v1.2'),
  ('三倍酒花饱和艾尔', 'Triple Hoppy Ale', 'unknown', 'localized_display', 'style-localization-v1.2'),
  ('三倍酸IPA', 'Triple Sour IPA', 'ipa.sour', 'localized_display', 'style-localization-v1.2'),
  ('三倍西海岸 IPA', 'Triple West Coast IPA', 'ipa.west_coast', 'localized_display', 'style-localization-v1.2'),
  ('三倍西海岸IPA', 'Triple West Coast IPA', 'ipa.west_coast', 'localized_display', 'style-localization-v1.2'),
  ('三倍西海岸IPA / 3x West Coast IPA', 'Triple West Coast IPA', 'ipa.west_coast', 'localized_display', 'style-localization-v1.2'),
  ('三倍新英格兰帝国IPA', 'Triple Imperial Hazy IPA', 'ipa.hazy', 'localized_display', 'style-localization-v1.2'),
  ('三倍新英格兰IPA', 'Triple Hazy IPA', 'ipa.hazy', 'localized_display', 'style-localization-v1.2'),
  ('三倍IPA', 'Triple IPA', 'ipa.generic', 'localized_display', 'style-localization-v1.2'),
  ('三倍NEIPA', 'Triple Hazy IPA', 'ipa.hazy', 'localized_display', 'style-localization-v1.2'),
  ('三华李桑葚果泥柏林酸小麦', 'Fruited Berliner Weisse', 'sour.berliner_weisse', 'localized_display', 'style-localization-v1.2'),
  ('三柠爆珠乌龙西打', 'Cider', 'cider.generic', 'localized_display', 'style-localization-v1.2'),
  ('三月节日啤酒', NULL, 'unknown', 'hold_for_manual_review', 'style-localization-v1.2'),
  ('三月拉格', 'Märzen', 'lager.marzen', 'localized_display', 'style-localization-v1.2'),
  ('三月啤酒', 'Märzen', 'lager.marzen', 'localized_display', 'style-localization-v1.2'),
  ('山地IPA', 'IPA', 'ipa.generic', 'localized_display', 'style-localization-v1.2'),
  ('山楂话梅乌梅陈皮古斯', 'Fruited Gose', 'sour.gose', 'localized_display', 'style-localization-v1.2'),
  ('山楂洛神酸艾尔', 'Fruited Sour', 'sour.fruited', 'localized_display', 'style-localization-v1.2'),
  ('陕南大米酒花拉格', 'Rice Hoppy Lager', 'lager.generic', 'localized_display', 'style-localization-v1.2'),
  ('上海大米拉格', 'Rice Lager', 'lager.rice', 'localized_display', 'style-localization-v1.2'),
  ('社交浑浊IPA', 'Session Hazy IPA', 'ipa.hazy', 'localized_display', 'style-localization-v1.2'),
  ('社交苦啤', 'Session English Bitter', 'english.bitter', 'localized_display', 'style-localization-v1.2'),
  ('社交冷IPA', 'Session Cold IPA', 'ipa.cold', 'localized_display', 'style-localization-v1.2'),
  ('社交美式IPA', 'Session American IPA', 'ipa.american', 'localized_display', 'style-localization-v1.2'),
  ('社交西海岸IP', NULL, 'unknown', 'hold_for_manual_review', 'style-localization-v1.2'),
  ('社交西海岸IPA', 'Session West Coast IPA', 'ipa.west_coast', 'localized_display', 'style-localization-v1.2'),
  ('社交鲜脆IPA', 'Session IPA', 'ipa.generic', 'localized_display', 'style-localization-v1.2'),
  ('社交英式苦啤', 'Session English Bitter', 'english.bitter', 'localized_display', 'style-localization-v1.2'),
  ('社交IPA', 'Session IPA', 'ipa.generic', 'localized_display', 'style-localization-v1.2'),
  ('社交IPA 果香清爽', 'Session IPA', 'ipa.generic', 'localized_display', 'style-localization-v1.2'),
  ('麝香葡萄增味野菌艾尔', 'Wild Ale', 'wild.generic', 'localized_display', 'style-localization-v1.2'),
  ('深色艾尔', 'Dark Ale', 'unknown', 'localized_display', 'style-localization-v1.2'),
  ('深色淡味啤酒', 'Dark Mild Ale', 'english.mild', 'localized_display', 'style-localization-v1.2'),
  ('深色混酿野菌艾尔', 'Mixed-Fermentation Dark Wild Ale', 'wild.generic', 'localized_display', 'style-localization-v1.2'),
  ('深色拉格', 'Dark Lager', 'lager.dark', 'localized_display', 'style-localization-v1.2'),
  ('深色水果西打', 'Fruited Dark Cider', 'cider.generic', 'localized_display', 'style-localization-v1.2'),
  ('生啤', 'Draft Beer', 'unknown', 'localized_display', 'style-localization-v1.2'),
  ('生巧提拉米苏帝国世涛', 'Imperial Stout', 'stout.imperial', 'localized_display', 'style-localization-v1.2'),
  ('十月节啤酒古典版', 'Oktoberfest-Style Beer', 'unknown', 'localized_display', 'style-localization-v1.2'),
  ('十月拉格', 'Lager', 'lager.generic', 'localized_display', 'style-localization-v1.2'),
  ('石榴奇兰乌龙酸艾尔', 'Fruited Sour', 'sour.fruited', 'localized_display', 'style-localization-v1.2'),
  ('石涛', 'Stout', 'stout.generic', 'localized_display', 'style-localization-v1.2'),
  ('石子馍清凉拉格', 'Lager', 'lager.generic', 'localized_display', 'style-localization-v1.2'),
  ('世涛', 'Stout', 'stout.generic', 'localized_display', 'style-localization-v1.2'),
  ('手工艾尔', 'Ale', 'unknown', 'localized_display', 'style-localization-v1.2'),
  ('手工淡艾', 'Pale Ale', 'pale_ale.generic', 'localized_display', 'style-localization-v1.2'),
  ('手工格瓦斯', 'Kvass', 'unknown', 'localized_display', 'style-localization-v1.2'),
  ('手工清酒', 'Sake', 'sake.generic', 'localized_display', 'style-localization-v1.2'),
  ('树番茄古斯', 'Gose', 'sour.gose', 'localized_display', 'style-localization-v1.2'),
  ('树番茄青梅话梅古斯', 'Fruited Gose', 'sour.gose', 'localized_display', 'style-localization-v1.2'),
  ('树莓艾尔', 'Fruited Ale', 'unknown', 'localized_display', 'style-localization-v1.2'),
  ('树莓桶陈野菌农舍艾尔', 'Barrel-Aged Wild-Fermented Fruited Farmhouse Ale', 'saison.farmhouse', 'localized_display', 'style-localization-v1.2'),
  ('双倍/帝国浑浊IPA', 'Double Hazy IPA', 'ipa.hazy', 'localized_display', 'style-localization-v1.2'),
  ('双倍干投单色艾尔', 'DDH Ale', 'unknown', 'localized_display', 'style-localization-v1.2'),
  ('双倍干投单一酒花西海岸IPA', 'DDH West Coast IPA', 'ipa.west_coast', 'localized_display', 'style-localization-v1.2'),
  ('双倍干投淡色艾尔', 'DDH Pale Ale', 'pale_ale.generic', 'localized_display', 'style-localization-v1.2'),
  ('双倍干投帝国浑浊IPA', 'Imperial DDH Hazy IPA', 'ipa.hazy', 'localized_display', 'style-localization-v1.2'),
  ('双倍干投帝国浑浊IPA / DDH Imperial Hazy IPA', 'Imperial DDH Hazy IPA', 'ipa.hazy', 'localized_display', 'style-localization-v1.2'),
  ('双倍干投帝国新英格兰IPA', 'Imperial DDH Hazy IPA', 'ipa.hazy', 'localized_display', 'style-localization-v1.2'),
  ('双倍干投帝国IPA', 'Imperial DDH IPA', 'ipa.generic', 'localized_display', 'style-localization-v1.2'),
  ('双倍干投浑浊 IPA', 'DDH Hazy IPA', 'ipa.hazy', 'localized_display', 'style-localization-v1.2'),
  ('双倍干投浑浊淡色艾尔', 'DDH Hazy Pale Ale', 'pale_ale.generic', 'localized_display', 'style-localization-v1.2'),
  ('双倍干投浑浊双倍IPA', 'Double DDH Hazy IPA', 'ipa.hazy', 'localized_display', 'style-localization-v1.2'),
  ('双倍干投浑浊IPA', 'DDH Hazy IPA', 'ipa.hazy', 'localized_display', 'style-localization-v1.2'),
  ('双倍干投酒花酸IPA', 'DDH Sour IPA', 'ipa.sour', 'localized_display', 'style-localization-v1.2'),
  ('双倍干投酒花IPA', 'DDH IPA', 'ipa.generic', 'localized_display', 'style-localization-v1.2'),
  ('双倍干投冷IPA', 'DDH Cold IPA', 'ipa.cold', 'localized_display', 'style-localization-v1.2'),
  ('双倍干投美式IPA', 'DDH American IPA', 'ipa.american', 'localized_display', 'style-localization-v1.2'),
  ('双倍干投三倍浑浊IPA', 'Triple DDH Hazy IPA', 'ipa.hazy', 'localized_display', 'style-localization-v1.2'),
  ('双倍干投三倍IPA', 'Triple DDH IPA', 'ipa.generic', 'localized_display', 'style-localization-v1.2'),
  ('双倍干投社交IPA', 'Session DDH IPA', 'ipa.generic', 'localized_display', 'style-localization-v1.2'),
  ('双倍干投双倍浑浊	DDH IPA', 'Double DDH Hazy IPA', 'ipa.hazy', 'localized_display', 'style-localization-v1.2'),
  ('双倍干投双倍浑浊IPA', 'Double DDH Hazy IPA', 'ipa.hazy', 'localized_display', 'style-localization-v1.2'),
  ('双倍干投双倍西海岸', NULL, 'unknown', 'hold_for_manual_review', 'style-localization-v1.2'),
  ('双倍干投双倍西海岸IPA', 'Double DDH West Coast IPA', 'ipa.west_coast', 'localized_display', 'style-localization-v1.2'),
  ('双倍干投双倍燕麦奶油浑浊IPA', 'Double DDH Hazy IPA', 'ipa.hazy', 'localized_display', 'style-localization-v1.2'),
  ('双倍干投双倍IPA', 'Double DDH IPA', 'ipa.generic', 'localized_display', 'style-localization-v1.2'),
  ('双倍干投酸浑浊IPA', 'DDH Sour Hazy IPA', 'ipa.sour', 'localized_display', 'style-localization-v1.2'),
  ('双倍干投西海岸', NULL, 'unknown', 'hold_for_manual_review', 'style-localization-v1.2'),
  ('双倍干投西海岸淡色艾尔', 'DDH West Coast Pale Ale', 'pale_ale.generic', 'localized_display', 'style-localization-v1.2'),
  ('双倍干投西海岸IPA', 'DDH West Coast IPA', 'ipa.west_coast', 'localized_display', 'style-localization-v1.2'),
  ('双倍干投新英格兰IPA', 'DDH Hazy IPA', 'ipa.hazy', 'localized_display', 'style-localization-v1.2'),
  ('双倍干投IPA', 'DDH IPA', 'ipa.generic', 'localized_display', 'style-localization-v1.2'),
  ('双倍浑浊', 'Double Hazy Beer', 'unknown', 'localized_display', 'style-localization-v1.2'),
  ('双倍浑浊 IPA', 'Double Hazy IPA', 'ipa.hazy', 'localized_display', 'style-localization-v1.2'),
  ('双倍浑浊干投IPA', 'Double Dry-Hopped Hazy IPA', 'ipa.hazy', 'localized_display', 'style-localization-v1.2'),
  ('双倍浑浊新英格兰IPA', 'Double Hazy IPA', 'ipa.hazy', 'localized_display', 'style-localization-v1.2'),
  ('双倍浑浊ipa', 'Double Hazy IPA', 'ipa.hazy', 'localized_display', 'style-localization-v1.2'),
  ('双倍浑浊IPA', 'Double Hazy IPA', 'ipa.hazy', 'localized_display', 'style-localization-v1.2'),
  ('双倍酒花皮尔森', 'Double Hoppy Pilsner', 'pilsner.generic', 'localized_display', 'style-localization-v1.2'),
  ('双倍酸IPA', 'Double Sour IPA', 'ipa.sour', 'localized_display', 'style-localization-v1.2'),
  ('双倍西海岸', NULL, 'unknown', 'hold_for_manual_review', 'style-localization-v1.2'),
  ('双倍西海岸 IPA', 'Double West Coast IPA', 'ipa.west_coast', 'localized_display', 'style-localization-v1.2'),
  ('双倍西海岸ipa', 'Double West Coast IPA', 'ipa.west_coast', 'localized_display', 'style-localization-v1.2'),
  ('双倍西海岸IPA', 'Double West Coast IPA', 'ipa.west_coast', 'localized_display', 'style-localization-v1.2'),
  ('双倍鲜花ipa', 'Double IPA', 'ipa.generic', 'localized_display', 'style-localization-v1.2'),
  ('双倍香草拿铁帝国世涛', 'Double Imperial Stout', 'stout.imperial', 'localized_display', 'style-localization-v1.2'),
  ('双倍新西兰IPA', 'Double IPA', 'ipa.generic', 'localized_display', 'style-localization-v1.2'),
  ('双倍新英格兰IPA', 'Double Hazy IPA', 'ipa.hazy', 'localized_display', 'style-localization-v1.2'),
  ('双倍印度淡色艾尔', 'Double IPA', 'ipa.generic', 'localized_display', 'style-localization-v1.2'),
  ('双倍英式波特', 'Double English Porter', 'porter.english', 'localized_display', 'style-localization-v1.2'),
  ('双倍IPA', 'Double IPA', 'ipa.generic', 'localized_display', 'style-localization-v1.2'),
  ('双柑西打', 'Cider', 'cider.generic', 'localized_display', 'style-localization-v1.2'),
  ('双料博克', 'Doppelbock', 'bock.doppel', 'localized_display', 'style-localization-v1.2'),
  ('双料小麦博克', 'Weizenbock', 'bock.weizen', 'localized_display', 'style-localization-v1.2'),
  ('双芒西打', 'Fruited Cider', 'cider.generic', 'localized_display', 'style-localization-v1.2'),
  ('双莓古斯', 'Gose', 'sour.gose', 'localized_display', 'style-localization-v1.2'),
  ('双拼葡萄冰淇淋果泥古斯', 'Fruited Gose', 'sour.gose', 'localized_display', 'style-localization-v1.2'),
  ('双葡西打', 'Cider', 'cider.generic', 'localized_display', 'style-localization-v1.2'),
  ('双柚龙眼西打', 'Cider', 'cider.generic', 'localized_display', 'style-localization-v1.2'),
  ('双柚龙眼西打果酒', 'Cider', 'cider.generic', 'localized_display', 'style-localization-v1.2'),
  ('双重葡萄咖啡酸艾尔', 'Coffee Fruited Sour', 'sour.fruited', 'localized_display', 'style-localization-v1.2'),
  ('双重煮出法拉格', 'Lager', 'lager.generic', 'localized_display', 'style-localization-v1.2'),
  ('水果艾尔', 'Fruited Ale', 'unknown', 'localized_display', 'style-localization-v1.2'),
  ('水果柏林酸小麦', 'Fruited Berliner Weisse', 'sour.berliner_weisse', 'localized_display', 'style-localization-v1.2'),
  ('水果冰淇淋酸艾尔', 'Fruited Sour Ale', 'sour.fruited', 'localized_display', 'style-localization-v1.2'),
  ('水果蜂蜜酒', 'Fruited Mead', 'mead.generic', 'localized_display', 'style-localization-v1.2'),
  ('水果古斯', 'Fruited Gose', 'sour.gose', 'localized_display', 'style-localization-v1.2'),
  ('水果古斯啤酒', 'Fruited Gose', 'sour.gose', 'localized_display', 'style-localization-v1.2'),
  ('水果咖啡酸艾尔', 'Coffee Fruited Sour', 'sour.fruited', 'localized_display', 'style-localization-v1.2'),
  ('水果拉比克', 'Fruited Lambic', 'wild.lambic', 'localized_display', 'style-localization-v1.2'),
  ('水果拉格', 'Fruited Lager', 'lager.generic', 'localized_display', 'style-localization-v1.2'),
  ('水果兰比克', 'Fruited Lambic', 'wild.lambic', 'localized_display', 'style-localization-v1.2'),
  ('水果奶昔IPA', 'Fruited Milkshake IPA', 'ipa.generic', 'localized_display', 'style-localization-v1.2'),
  ('水果啤酒', 'Fruit Beer', 'unknown', 'localized_display', 'style-localization-v1.2'),
  ('水果苏打', 'Fruited Soda', 'unknown', 'localized_display', 'style-localization-v1.2'),
  ('水果酸艾', 'Fruited Sour', 'sour.fruited', 'localized_display', 'style-localization-v1.2'),
  ('水果酸艾尔', 'Fruited Sour', 'sour.fruited', 'localized_display', 'style-localization-v1.2'),
  ('水果酸赛松', 'Fruited Sour Saison', 'saison.saison', 'localized_display', 'style-localization-v1.2'),
  ('水果酸IPA', 'Fruited Sour IPA', 'ipa.sour', 'localized_display', 'style-localization-v1.2'),
  ('水果西打', 'Fruited Cider', 'cider.generic', 'localized_display', 'style-localization-v1.2'),
  ('水果硬苏打', 'Fruited Hard Seltzer', 'hard_seltzer.generic', 'localized_display', 'style-localization-v1.2'),
  ('水果增味苹果…', NULL, 'unknown', 'hold_for_manual_review', 'style-localization-v1.2'),
  ('水果增味苹果西打', 'Fruited Cider', 'cider.generic', 'localized_display', 'style-localization-v1.2'),
  ('水果增味酸IPA', 'Fruited Sour IPA', 'ipa.sour', 'localized_display', 'style-localization-v1.2'),
  ('水果增味西打', 'Fruited Cider', 'cider.generic', 'localized_display', 'style-localization-v1.2'),
  ('水果增味硬苏打', 'Fruited Hard Seltzer', 'hard_seltzer.generic', 'localized_display', 'style-localization-v1.2'),
  ('水果Cider', 'Fruited Cider', 'cider.generic', 'localized_display', 'style-localization-v1.2'),
  ('水晶琥珀拉格', 'Lager', 'lager.generic', 'localized_display', 'style-localization-v1.2'),
  ('水晶拉格', 'Lager', 'lager.generic', 'localized_display', 'style-localization-v1.2'),
  ('水晶小麦', 'Wheat Beer', 'wheat.generic', 'localized_display', 'style-localization-v1.2'),
  ('思慕雪奶昔酸啤酒', 'Milkshake Smoothie / Pastry Sour', 'sour.smoothie', 'localized_display', 'style-localization-v1.2'),
  ('思慕雪酸艾尔', 'Smoothie / Pastry Sour', 'sour.smoothie', 'localized_display', 'style-localization-v1.2'),
  ('斯洛文尼亚皮尔森', 'Pilsner', 'pilsner.generic', 'localized_display', 'style-localization-v1.2'),
  ('四倍干投帝国浑浊IPA', 'Imperial QDH Hazy IPA', 'ipa.hazy', 'localized_display', 'style-localization-v1.2'),
  ('四倍干投帝国新英格兰IPA', 'Imperial QDH Hazy IPA', 'ipa.hazy', 'localized_display', 'style-localization-v1.2'),
  ('四倍干投三倍浑浊IPA', 'Triple QDH Hazy IPA', 'ipa.hazy', 'localized_display', 'style-localization-v1.2'),
  ('四倍浑浊IPA', 'Hazy IPA', 'ipa.hazy', 'localized_display', 'style-localization-v1.2'),
  ('四倍芒果果泥浑浊IPA', 'Fruited Hazy IPA', 'ipa.hazy', 'localized_display', 'style-localization-v1.2'),
  ('四倍莓果果泥西打', 'Fruited Cider', 'cider.generic', 'localized_display', 'style-localization-v1.2'),
  ('四料', 'Belgian Quadrupel', 'unknown', 'localized_display', 'style-localization-v1.2'),
  ('四料啤酒', 'Belgian Quadrupel', 'unknown', 'localized_display', 'style-localization-v1.2'),
  ('苏格兰烈性艾尔🏴󠁧󠁢󠁳󠁣󠁴󠁿', 'Scottish Ale', 'unknown', 'localized_display', 'style-localization-v1.2'),
  ('酸 IPA', 'Sour IPA', 'ipa.sour', 'localized_display', 'style-localization-v1.2'),
  ('酸艾尔', 'Sour Ale', 'sour.generic', 'localized_display', 'style-localization-v1.2'),
  ('酸比利时ipa', 'Sour Belgian IPA', 'ipa.sour', 'localized_display', 'style-localization-v1.2'),
  ('酸比利时IPA', 'Sour Belgian IPA', 'ipa.sour', 'localized_display', 'style-localization-v1.2'),
  ('酸波特', 'Sour Porter', 'unknown', 'localized_display', 'style-localization-v1.2'),
  ('酸浑浊IPA', 'Sour Hazy IPA', 'ipa.sour', 'localized_display', 'style-localization-v1.2'),
  ('酸浑浊IPA / Sour Hazy IPA', 'Sour Hazy IPA', 'ipa.sour', 'localized_display', 'style-localization-v1.2'),
  ('酸混浊IPA', 'Sour Hazy IPA', 'ipa.sour', 'localized_display', 'style-localization-v1.2'),
  ('酸酒花拉格', 'Hoppy Sour Lager', 'unknown', 'localized_display', 'style-localization-v1.2'),
  ('酸拉格', 'Sour Lager', 'unknown', 'localized_display', 'style-localization-v1.2'),
  ('酸农舍艾尔', 'Sour Farmhouse Ale', 'saison.farmhouse', 'localized_display', 'style-localization-v1.2'),
  ('酸啤', 'Sour Ale', 'sour.generic', 'localized_display', 'style-localization-v1.2'),
  ('酸塞松', 'Sour Saison', 'saison.saison', 'localized_display', 'style-localization-v1.2'),
  ('酸塞松 Saison', 'Sour Saison', 'saison.saison', 'localized_display', 'style-localization-v1.2'),
  ('酸赛松', 'Sour Saison', 'saison.saison', 'localized_display', 'style-localization-v1.2'),
  ('酸世涛', 'Sour Stout', 'unknown', 'localized_display', 'style-localization-v1.2'),
  ('酸双倍冷 IPA', 'Double Sour Cold IPA', 'ipa.sour', 'localized_display', 'style-localization-v1.2'),
  ('酸汤古斯啤酒', 'Gose', 'sour.gose', 'localized_display', 'style-localization-v1.2'),
  ('酸西海岸IPA', 'Sour West Coast IPA', 'ipa.sour', 'localized_display', 'style-localization-v1.2'),
  ('酸小麦', 'Sour Wheat Ale', 'sour.wheat', 'localized_display', 'style-localization-v1.2'),
  ('酸樱桃树莓古斯', 'Fruited Gose', 'sour.gose', 'localized_display', 'style-localization-v1.2'),
  ('酸ipa', 'Sour IPA', 'ipa.sour', 'localized_display', 'style-localization-v1.2'),
  ('酸IPA', 'Sour IPA', 'ipa.sour', 'localized_display', 'style-localization-v1.2'),
  ('酸IPL', 'Sour Hoppy Lager', 'lager.hoppy', 'localized_display', 'style-localization-v1.2'),
  ('太平洋艾尔', 'Ale', 'unknown', 'localized_display', 'style-localization-v1.2'),
  ('太平洋淡色艾尔', 'Pale Ale', 'pale_ale.generic', 'localized_display', 'style-localization-v1.2'),
  ('泰国青柠茉莉花酸艾尔', 'Fruited Sour', 'sour.fruited', 'localized_display', 'style-localization-v1.2'),
  ('桃子果泥酸艾尔', 'Fruited Smoothie / Pastry Sour', 'sour.smoothie', 'localized_display', 'style-localization-v1.2'),
  ('桃子酒花塞松', 'Fruited Saison', 'saison.saison', 'localized_display', 'style-localization-v1.2'),
  ('桃子芒果草莓冰沙果泥', NULL, 'unknown', 'hold_for_manual_review', 'style-localization-v1.2'),
  ('特级苦啤', 'Strong Bitter / ESB', 'english.esb', 'localized_display', 'style-localization-v1.2'),
  ('甜菜根柏林酸', 'Berliner Weisse', 'sour.berliner_weisse', 'localized_display', 'style-localization-v1.2'),
  ('甜点艾尔', 'Pastry Ale', 'unknown', 'localized_display', 'style-localization-v1.2'),
  ('甜点奶昔酸艾尔', 'Milkshake Smoothie / Pastry Sour', 'sour.smoothie', 'localized_display', 'style-localization-v1.2'),
  ('甜点酸艾尔', 'Pastry Sour Ale', 'unknown', 'localized_display', 'style-localization-v1.2'),
  ('甜品世涛', 'Stout', 'stout.generic', 'localized_display', 'style-localization-v1.2'),
  ('桶陈大麦烈酒', 'Barrel-Aged Barleywine', 'unknown', 'localized_display', 'style-localization-v1.2'),
  ('桶陈帝国冬季艾尔', 'Imperial Barrel-Aged Ale', 'unknown', 'localized_display', 'style-localization-v1.2'),
  ('桶陈帝国世涛', 'Barrel-Aged Imperial Stout', 'stout.imperial', 'localized_display', 'style-localization-v1.2'),
  ('桶陈帝国甜点世涛', 'Barrel-Aged Pastry Imperial Stout', 'stout.imperial', 'localized_display', 'style-localization-v1.2'),
  ('桶陈混合发酵酸艾尔', 'Barrel-Aged Mixed-Fermentation Sour Ale', 'sour.generic', 'localized_display', 'style-localization-v1.2'),
  ('桶陈美式野菌艾尔', 'Barrel-Aged Wild Ale', 'wild.generic', 'localized_display', 'style-localization-v1.2'),
  ('桶陈农舍IPA', 'IPA', 'ipa.generic', 'style_key_safe_fallback', 'style-localization-v1.2'),
  ('桶陈世涛', 'Barrel-Aged Stout', 'stout.generic', 'localized_display', 'style-localization-v1.2'),
  ('桶陈酸艾', 'Barrel-Aged Sour Ale', 'sour.generic', 'localized_display', 'style-localization-v1.2'),
  ('桶陈甜点酸艾尔', 'Barrel-Aged Pastry Sour Ale', 'unknown', 'localized_display', 'style-localization-v1.2'),
  ('桶陈野菌艾尔', 'Barrel-Aged Wild Ale', 'wild.generic', 'localized_display', 'style-localization-v1.2'),
  ('桶陈野菌拉格', 'Barrel-Aged Wild-Fermented Lager', 'unknown', 'localized_display', 'style-localization-v1.2'),
  ('桶陈野菌赛松', 'Barrel-Aged Wild-Fermented Saison', 'saison.saison', 'localized_display', 'style-localization-v1.2'),
  ('桶陈野菌世涛', 'Barrel-Aged Wild-Fermented Stout', 'unknown', 'localized_display', 'style-localization-v1.2'),
  ('桶陈增味型农舍艾尔', 'Barrel-Aged Farmhouse Ale', 'saison.farmhouse', 'localized_display', 'style-localization-v1.2'),
  ('图林根烟熏酸', 'Smoked Sour Lichtenhainer', 'unknown', 'localized_display', 'style-localization-v1.2'),
  ('维也纳拉格', 'Vienna Lager', 'lager.vienna', 'localized_display', 'style-localization-v1.2'),
  ('未过滤巴伐利亚清凉拉格', 'Unfiltered Lager', 'lager.generic', 'localized_display', 'style-localization-v1.2'),
  ('未过滤版 双倍干投西海岸IPA', 'DDH Unfiltered West Coast IPA', 'ipa.west_coast', 'localized_display', 'style-localization-v1.2'),
  ('未过滤德式皮尔森', 'Unfiltered German Pilsner', 'pilsner.german', 'localized_display', 'style-localization-v1.2'),
  ('未过滤拉格', 'Unfiltered Lager', 'lager.generic', 'localized_display', 'style-localization-v1.2'),
  ('未过滤皮尔森', 'Unfiltered Pilsner', 'pilsner.generic', 'localized_display', 'style-localization-v1.2'),
  ('未来西海岸', NULL, 'unknown', 'hold_for_manual_review', 'style-localization-v1.2'),
  ('未来西海岸IPA', 'West Coast IPA', 'ipa.west_coast', 'localized_display', 'style-localization-v1.2'),
  ('榅桲雷司令野菌酸艾尔', 'Wild-Fermented Sour Ale', 'sour.generic', 'localized_display', 'style-localization-v1.2'),
  ('乌龙茶西打', 'Tea Cider', 'cider.generic', 'localized_display', 'style-localization-v1.2'),
  ('无醇', NULL, 'unknown', 'hold_for_manual_review', 'style-localization-v1.2'),
  ('无醇果汁气泡饮', 'Non-Alcoholic Juice', 'non_alcoholic.juice', 'localized_display', 'style-localization-v1.2'),
  ('无醇苹果汁', 'Non-Alcoholic Juice', 'non_alcoholic.juice', 'localized_display', 'style-localization-v1.2'),
  ('无醇柚子金汤力', NULL, 'unknown', 'hold_for_manual_review', 'style-localization-v1.2'),
  ('无醇IPA', 'Non-Alcoholic IPA', 'unknown', 'localized_display', 'style-localization-v1.2'),
  ('无醇NFC果汁', 'Non-Alcoholic Juice', 'non_alcoholic.juice', 'localized_display', 'style-localization-v1.2'),
  ('无麸质水果艾尔', 'Fruited Ale', 'unknown', 'localized_display', 'style-localization-v1.2'),
  ('无麸质甜点酸艾尔', 'Pastry Sour Ale', 'unknown', 'localized_display', 'style-localization-v1.2'),
  ('无酒精', NULL, 'unknown', 'hold_for_manual_review', 'style-localization-v1.2'),
  ('五倍干投四倍浑浊IPA', 'Dry-Hopped Hazy IPA', 'ipa.hazy', 'localized_display', 'style-localization-v1.2'),
  ('五常大米拉格', 'Rice Lager', 'lager.rice', 'localized_display', 'style-localization-v1.2'),
  ('五月博克', 'Maibock / Helles Bock', 'bock.generic', 'localized_display', 'style-localization-v1.2'),
  ('武夷山岩茶古斯', 'Tea Gose', 'sour.gose', 'localized_display', 'style-localization-v1.2'),
  ('西北海岸IPA', 'IPA', 'ipa.generic', 'localized_display', 'style-localization-v1.2'),
  ('西达', 'Cider', 'cider.generic', 'localized_display', 'style-localization-v1.2'),
  ('西打', 'Cider', 'cider.generic', 'localized_display', 'style-localization-v1.2'),
  ('西打￼', 'Cider', 'cider.generic', 'localized_display', 'style-localization-v1.2'),
  ('西打果酒', 'Cider', 'cider.generic', 'localized_display', 'style-localization-v1.2'),
  ('西打酒', 'Cider', 'cider.generic', 'localized_display', 'style-localization-v1.2'),
  ('西番莲凤梨酸浑浊IPA', 'Fruited Sour Hazy IPA', 'ipa.sour', 'localized_display', 'style-localization-v1.2'),
  ('西番莲青柠古斯', 'Fruited Gose', 'sour.gose', 'localized_display', 'style-localization-v1.2'),
  ('西瓜/薄荷/茉莉花茶/金酒/伏特加', 'Fruited Tea', 'unknown', 'localized_display', 'style-localization-v1.2'),
  ('西瓜莓果茶果酒', 'Fruited Tea', 'unknown', 'localized_display', 'style-localization-v1.2'),
  ('西瓜梅果茶西打', 'Fruited Tea Cider', 'cider.generic', 'localized_display', 'style-localization-v1.2'),
  ('西瓜奇兰乌龙茶西打', 'Fruited Tea Cider', 'cider.generic', 'localized_display', 'style-localization-v1.2'),
  ('西瓜树莓冰浆风味果泥西打', 'Fruited Cider', 'cider.generic', 'localized_display', 'style-localization-v1.2'),
  ('西瓜西打果酒', 'Fruited Cider', 'cider.generic', 'localized_display', 'style-localization-v1.2'),
  ('西瓜西柚粉芭乐水果酸艾尔', 'Fruited Sour', 'sour.fruited', 'localized_display', 'style-localization-v1.2'),
  ('西瓜西柚海盐硬苏打', 'Fruited Hard Seltzer', 'hard_seltzer.generic', 'localized_display', 'style-localization-v1.2'),
  ('西瓜西柚硬苏打', 'Fruited Hard Seltzer', 'hard_seltzer.generic', 'localized_display', 'style-localization-v1.2'),
  ('西海岸', NULL, 'unknown', 'hold_for_manual_review', 'style-localization-v1.2'),
  ('西海岸 IPA', 'West Coast IPA', 'ipa.west_coast', 'localized_display', 'style-localization-v1.2'),
  ('西海岸 IPA标杆', 'West Coast IPA', 'ipa.west_coast', 'localized_display', 'style-localization-v1.2'),
  ('西海岸淡色艾尔', 'West Coast Pale Ale', 'pale_ale.generic', 'localized_display', 'style-localization-v1.2'),
  ('西海岸帝国IPA', 'Imperial West Coast IPA', 'ipa.west_coast', 'localized_display', 'style-localization-v1.2'),
  ('西海岸酒花皮尔森', 'Hoppy West Coast Pilsner', 'pilsner.generic', 'localized_display', 'style-localization-v1.2'),
  ('西海岸美式淡色艾尔', 'West Coast American Pale Ale', 'pale_ale.american', 'localized_display', 'style-localization-v1.2'),
  ('西海岸皮尔森', 'West Coast Pilsner', 'pilsner.generic', 'localized_display', 'style-localization-v1.2'),
  ('西海岸皮尔斯', 'West Coast Pilsner', 'pilsner.generic', 'localized_display', 'style-localization-v1.2'),
  ('西海岸双倍IPA', 'Double West Coast IPA', 'ipa.west_coast', 'localized_display', 'style-localization-v1.2'),
  ('西海岸酸IPA', 'West Coast Sour IPA', 'ipa.sour', 'localized_display', 'style-localization-v1.2'),
  ('西海岸五月博克', 'West Coast Maibock / Helles Bock', 'bock.generic', 'localized_display', 'style-localization-v1.2'),
  ('西海岸IPA', 'West Coast IPA', 'ipa.west_coast', 'localized_display', 'style-localization-v1.2'),
  ('西海岸IPA 酒花干爽 精酿老玩家的最爱', 'West Coast IPA', 'ipa.west_coast', 'localized_display', 'style-localization-v1.2'),
  ('西拉世涛', 'Stout', 'stout.generic', 'localized_display', 'style-localization-v1.2'),
  ('西兰花皮尔森', 'Pilsner', 'pilsner.generic', 'localized_display', 'style-localization-v1.2'),
  ('西梅柏林酸小麦', 'Berliner Weisse', 'sour.berliner_weisse', 'localized_display', 'style-localization-v1.2'),
  ('霞多丽佛手柑黄姜柠檬西打', 'Fruited Cider', 'cider.generic', 'localized_display', 'style-localization-v1.2'),
  ('霞多丽橡木桶陈赛松', 'Barrel-Aged Saison', 'saison.saison', 'localized_display', 'style-localization-v1.2'),
  ('夏黑葡萄茉莉西打', 'Fruited Cider', 'cider.generic', 'localized_display', 'style-localization-v1.2'),
  ('夏令甜酿苹果酒', 'Cider', 'cider.generic', 'localized_display', 'style-localization-v1.2'),
  ('夏日橘子科隆', 'Kölsch', 'kolsch.generic', 'localized_display', 'style-localization-v1.2'),
  ('夏日美式艾尔', 'American Ale', 'unknown', 'localized_display', 'style-localization-v1.2'),
  ('鲜花IPA', 'IPA', 'ipa.generic', 'localized_display', 'style-localization-v1.2'),
  ('鲜酒花IPA', 'IPA', 'ipa.generic', 'localized_display', 'style-localization-v1.2'),
  ('鲜榨青芒·青苹果·霞多丽', NULL, 'unknown', 'hold_for_manual_review', 'style-localization-v1.2'),
  ('咸柠七拉格', 'Lager', 'lager.generic', 'localized_display', 'style-localization-v1.2'),
  ('现代阿根廷IPA', 'IPA', 'ipa.generic', 'localized_display', 'style-localization-v1.2'),
  ('现代皮尔森', 'Pilsner', 'pilsner.generic', 'localized_display', 'style-localization-v1.2'),
  ('现代西海岸IPA', 'West Coast IPA', 'ipa.west_coast', 'localized_display', 'style-localization-v1.2'),
  ('现代IPA', 'IPA', 'ipa.generic', 'localized_display', 'style-localization-v1.2'),
  ('香槟帝国啤酒', NULL, 'unknown', 'hold_for_manual_review', 'style-localization-v1.2'),
  ('香槟IPA', 'Brut IPA', 'ipa.generic', 'localized_display', 'style-localization-v1.2'),
  ('香草咖啡白世涛', 'Coffee White Stout', 'stout.generic', 'localized_display', 'style-localization-v1.2'),
  ('香草牛奶世涛', 'Milk Stout', 'stout.milk', 'localized_display', 'style-localization-v1.2'),
  ('香草巧克力慕斯帝国世涛', 'Pastry Imperial Stout', 'stout.imperial', 'localized_display', 'style-localization-v1.2'),
  ('香草IPA', 'IPA', 'ipa.generic', 'localized_display', 'style-localization-v1.2'),
  ('香蕉果泥酸艾尔', 'Fruited Smoothie / Pastry Sour', 'sour.smoothie', 'localized_display', 'style-localization-v1.2'),
  ('香蕉小麦', 'Wheat Beer', 'wheat.generic', 'localized_display', 'style-localization-v1.2'),
  ('香梨苹果米芯百花蜜拙酒', NULL, 'unknown', 'hold_for_manual_review', 'style-localization-v1.2'),
  ('香料柚子酸艾尔', 'Fruited Sour', 'sour.fruited', 'localized_display', 'style-localization-v1.2'),
  ('香茅菠萝西打', 'Fruited Cider', 'cider.generic', 'localized_display', 'style-localization-v1.2'),
  ('香茅柠檬帝国古斯', 'Imperial Fruited Gose', 'sour.gose', 'localized_display', 'style-localization-v1.2'),
  ('香柠佛手柑酸混浊IPA', 'Fruited Sour Hazy IPA', 'ipa.sour', 'localized_display', 'style-localization-v1.2'),
  ('香水西打', 'Cider', 'cider.generic', 'localized_display', 'style-localization-v1.2'),
  ('香柚日式清酒拉格', NULL, 'unknown', 'hold_for_manual_review', 'style-localization-v1.2'),
  ('像桃子酸IPA', 'Fruited Sour IPA', 'ipa.sour', 'localized_display', 'style-localization-v1.2'),
  ('橡木拉格', 'Lager', 'lager.generic', 'localized_display', 'style-localization-v1.2'),
  ('橡木桶熟成的三月拉格', 'Barrel-Aged Märzen', 'lager.marzen', 'localized_display', 'style-localization-v1.2'),
  ('小红杏·三华李·霞多丽', NULL, 'unknown', 'hold_for_manual_review', 'style-localization-v1.2'),
  ('小麦', 'Wheat Beer', 'wheat.generic', 'localized_display', 'style-localization-v1.2'),
  ('小麦博客', 'Wheat Beer', 'wheat.generic', 'localized_display', 'style-localization-v1.2'),
  ('小麦茶啤', 'Tea Wheat Beer', 'wheat.generic', 'localized_display', 'style-localization-v1.2'),
  ('小麦啤酒', 'Wheat Beer', 'wheat.generic', 'localized_display', 'style-localization-v1.2'),
  ('小麦啤酒 日式风味 清爽淡雅', 'Wheat Beer', 'wheat.generic', 'style_key_safe_fallback', 'style-localization-v1.2'),
  ('小米辣滇橄榄古斯', 'Gose', 'sour.gose', 'localized_display', 'style-localization-v1.2'),
  ('新格兰IPA', 'Hazy IPA', 'ipa.hazy', 'localized_display', 'style-localization-v1.2'),
  ('新古典西海岸DDH DIPA', 'Double DDH West Coast IPA', 'ipa.west_coast', 'localized_display', 'style-localization-v1.2'),
  ('新疆和田香妃葡萄干苦啤', 'Fruited English Bitter', 'english.bitter', 'localized_display', 'style-localization-v1.2'),
  ('新世界科隆', 'Kölsch', 'kolsch.generic', 'localized_display', 'style-localization-v1.2'),
  ('新西兰淡拉格', 'Lager', 'lager.generic', 'localized_display', 'style-localization-v1.2'),
  ('新西兰淡色艾尔', 'Pale Ale', 'pale_ale.generic', 'localized_display', 'style-localization-v1.2'),
  ('新西兰酒花拉格', 'Hoppy Lager', 'lager.hoppy', 'localized_display', 'style-localization-v1.2'),
  ('新西兰酒花皮尔森', 'Hoppy New Zealand Pilsner', 'pilsner.generic', 'localized_display', 'style-localization-v1.2'),
  ('新西兰酒花西海岸IPA', 'West Coast IPA', 'ipa.west_coast', 'localized_display', 'style-localization-v1.2'),
  ('新西兰苦啤', 'English Bitter', 'english.bitter', 'localized_display', 'style-localization-v1.2'),
  ('新西兰皮尔森', 'New Zealand Pilsner', 'pilsner.generic', 'localized_display', 'style-localization-v1.2'),
  ('新西兰西海岸淡色拉格', 'West Coast Lager', 'lager.generic', 'localized_display', 'style-localization-v1.2'),
  ('新西兰西海岸IPA', 'West Coast IPA', 'ipa.west_coast', 'localized_display', 'style-localization-v1.2'),
  ('新西兰IPA', 'IPA', 'ipa.generic', 'localized_display', 'style-localization-v1.2'),
  ('新鲜酒花西海岸IPA', 'Fresh Hop West Coast IPA', 'ipa.west_coast', 'localized_display', 'style-localization-v1.2'),
  ('新鲜酒花DDH西海岸皮尔森', 'DDH Fresh Hop West Coast Pilsner', 'pilsner.generic', 'localized_display', 'style-localization-v1.2'),
  ('新英格兰 IPA', 'Hazy IPA', 'ipa.hazy', 'localized_display', 'style-localization-v1.2'),
  ('新英格兰淡色艾尔', 'Pale Ale', 'pale_ale.generic', 'localized_display', 'style-localization-v1.2'),
  ('新英格兰帝国 IPA', 'Imperial Hazy IPA', 'ipa.hazy', 'localized_display', 'style-localization-v1.2'),
  ('新英格兰帝国印度淡色艾尔', 'Imperial Hazy IPA', 'ipa.hazy', 'localized_display', 'style-localization-v1.2'),
  ('新英格兰帝国IPA', 'Imperial Hazy IPA', 'ipa.hazy', 'localized_display', 'style-localization-v1.2'),
  ('新英格兰三倍 IPA', 'Triple Hazy IPA', 'ipa.hazy', 'localized_display', 'style-localization-v1.2'),
  ('新英格兰三倍IPA', 'Triple Hazy IPA', 'ipa.hazy', 'localized_display', 'style-localization-v1.2'),
  ('新英格兰双倍IPA', 'Double Hazy IPA', 'ipa.hazy', 'localized_display', 'style-localization-v1.2'),
  ('新英格兰四倍IPA', 'Hazy IPA', 'ipa.hazy', 'localized_display', 'style-localization-v1.2'),
  ('新英格兰IPA', 'Hazy IPA', 'ipa.hazy', 'localized_display', 'style-localization-v1.2'),
  ('新中式花草茶', 'Herbal Tea', 'unknown', 'localized_display', 'style-localization-v1.2'),
  ('杏仁+伏特加', NULL, 'unknown', 'hold_for_manual_review', 'style-localization-v1.2'),
  ('杏仁豆腐 Cider', 'Cider', 'cider.generic', 'localized_display', 'style-localization-v1.2'),
  ('杏仁豆腐风味西打酒', 'Cider', 'cider.generic', 'localized_display', 'style-localization-v1.2'),
  ('杏子山楂蔓越莓水果古斯', 'Fruited Gose', 'sour.gose', 'localized_display', 'style-localization-v1.2'),
  ('杏子野菌艾尔', 'Fruited Wild Ale', 'wild.generic', 'localized_display', 'style-localization-v1.2'),
  ('杏子增味野菌艾尔', 'Fruited Wild Ale', 'wild.generic', 'localized_display', 'style-localization-v1.2'),
  ('匈牙利IPA', 'IPA', 'ipa.generic', 'localized_display', 'style-localization-v1.2'),
  ('雪山梨山茶花西打', 'Fruited Tea Cider', 'cider.generic', 'localized_display', 'style-localization-v1.2'),
  ('血橙胡萝卜硬苏打', 'Fruited Hard Seltzer', 'hard_seltzer.generic', 'localized_display', 'style-localization-v1.2'),
  ('血橙橘子科隆', 'Fruited Kölsch', 'kolsch.generic', 'localized_display', 'style-localization-v1.2'),
  ('血橙酸 IPA', 'Fruited Sour IPA', 'ipa.sour', 'localized_display', 'style-localization-v1.2'),
  ('血橙酸古斯', 'Fruited Gose', 'sour.gose', 'localized_display', 'style-localization-v1.2'),
  ('血橙香槟拉格', 'Fruited Lager', 'lager.generic', 'localized_display', 'style-localization-v1.2'),
  ('雅基玛皮尔森', 'Pilsner', 'pilsner.generic', 'localized_display', 'style-localization-v1.2'),
  ('亚当苹果汁', 'Fruited Juice', 'unknown', 'localized_display', 'style-localization-v1.2'),
  ('烟熏大米拉格', 'Smoked Rice Lager', 'lager.rice', 'localized_display', 'style-localization-v1.2'),
  ('烟熏拉格', 'Smoked Lager', 'lager.generic', 'localized_display', 'style-localization-v1.2'),
  ('烟熏啤酒', 'Smoked Rauchbier', 'unknown', 'localized_display', 'style-localization-v1.2'),
  ('烟熏三月啤酒', 'Smoked Märzen', 'lager.marzen', 'localized_display', 'style-localization-v1.2'),
  ('烟熏深色拉格', 'Smoked Dark Lager', 'lager.dark', 'localized_display', 'style-localization-v1.2'),
  ('烟熏酸艾', 'Smoked Sour Ale', 'sour.generic', 'localized_display', 'style-localization-v1.2'),
  ('烟熏酸艾尔', 'Smoked Sour Ale', 'sour.generic', 'localized_display', 'style-localization-v1.2'),
  ('烟熏酸小麦', 'Smoked Sour Wheat Ale', 'sour.wheat', 'localized_display', 'style-localization-v1.2'),
  ('烟熏野菌西打', 'Smoked Wild-Fermented Cider', 'cider.generic', 'localized_display', 'style-localization-v1.2'),
  ('盐渍菠萝荔枝糯香帝国西打', 'Imperial Fruited Cider', 'cider.generic', 'localized_display', 'style-localization-v1.2'),
  ('盐渍菠萝糯香荔枝帝国西打', 'Imperial Cider', 'cider.generic', 'localized_display', 'style-localization-v1.2'),
  ('盐渍蜜桃', NULL, 'unknown', 'hold_for_manual_review', 'style-localization-v1.2'),
  ('燕麦帝国世涛', 'Imperial Stout', 'stout.imperial', 'localized_display', 'style-localization-v1.2'),
  ('燕麦世涛', 'Oatmeal Stout', 'stout.oatmeal', 'localized_display', 'style-localization-v1.2'),
  ('阳丰脆柿·雪花梨·霞多丽', NULL, 'unknown', 'hold_for_manual_review', 'style-localization-v1.2'),
  ('阳光玫瑰·油柑·茉莉花茶·霞多丽', 'Tea', 'unknown', 'localized_display', 'style-localization-v1.2'),
  ('杨梅冰酪西打', 'Fruited Cider', 'cider.generic', 'localized_display', 'style-localization-v1.2'),
  ('杨梅果汁西打', 'Fruited Cider', 'cider.generic', 'localized_display', 'style-localization-v1.2'),
  ('杨梅李子杨桃', NULL, 'unknown', 'hold_for_manual_review', 'style-localization-v1.2'),
  ('杨梅李子杨桃酸木瓜乌龙茶西打', 'Fruited Tea Sour Cider', 'cider.generic', 'localized_display', 'style-localization-v1.2'),
  ('杨梅莓果红茶酸艾尔', 'Tea Fruited Sour', 'sour.fruited', 'localized_display', 'style-localization-v1.2'),
  ('杨梅青梅柠檬果泥硬苏打', 'Fruited Hard Seltzer', 'hard_seltzer.generic', 'localized_display', 'style-localization-v1.2'),
  ('杨梅酸艾尔', 'Fruited Sour', 'sour.fruited', 'localized_display', 'style-localization-v1.2'),
  ('杨梅酸IPA', 'Fruited Sour IPA', 'ipa.sour', 'localized_display', 'style-localization-v1.2'),
  ('杨桃芭乐铁观音康普茶', 'Fruited Tea Kombucha', 'kombucha.generic', 'localized_display', 'style-localization-v1.2'),
  ('杨桃番石榴芒果酸小麦', 'Fruited Sour Wheat Ale', 'sour.wheat', 'localized_display', 'style-localization-v1.2'),
  ('杨桃青苹果青提茉莉西打果酒', 'Fruited Cider', 'cider.generic', 'localized_display', 'style-localization-v1.2'),
  ('杨桃油柑西打', 'Fruited Cider', 'cider.generic', 'localized_display', 'style-localization-v1.2'),
  ('洋槐枇杷艾尔', 'Fruited Ale', 'unknown', 'localized_display', 'style-localization-v1.2'),
  ('窑臧皮尔森', 'Pilsner', 'pilsner.generic', 'localized_display', 'style-localization-v1.2'),
  ('椰奶西瓜绿茶轻果泥西打', 'Fruited Tea Cider', 'cider.generic', 'localized_display', 'style-localization-v1.2'),
  ('椰香西瓜绿茶轻果泥西打', 'Fruited Tea Cider', 'cider.generic', 'localized_display', 'style-localization-v1.2'),
  ('野采酵母石榴番石榴酸艾尔', 'Wild-Fermented Fruited Sour', 'sour.fruited', 'localized_display', 'style-localization-v1.2'),
  ('野刺梨混酿酸艾尔', 'Mixed-Fermentation Fruited Sour', 'sour.fruited', 'localized_display', 'style-localization-v1.2'),
  ('野菌', NULL, 'unknown', 'hold_for_manual_review', 'style-localization-v1.2'),
  ('野菌艾尔', 'Wild Ale', 'wild.generic', 'localized_display', 'style-localization-v1.2'),
  ('野菌拉格', 'Wild-Fermented Lager', 'unknown', 'localized_display', 'style-localization-v1.2'),
  ('野菌农舍艾尔', 'Wild-Fermented Farmhouse Ale', 'saison.farmhouse', 'localized_display', 'style-localization-v1.2'),
  ('野菌农舍塞松', 'Wild-Fermented Saison', 'saison.saison', 'localized_display', 'style-localization-v1.2'),
  ('野菌赛松', 'Wild-Fermented Saison', 'saison.saison', 'localized_display', 'style-localization-v1.2'),
  ('野菌酸艾', 'Sour Wild Ale', 'wild.generic', 'localized_display', 'style-localization-v1.2'),
  ('野菌酸艾尔', 'Sour Wild Ale', 'wild.generic', 'localized_display', 'style-localization-v1.2'),
  ('野菌西打', 'Wild-Fermented Cider', 'cider.generic', 'localized_display', 'style-localization-v1.2'),
  ('野生蜂蜜西打', 'Honey Cider', 'cider.generic', 'localized_display', 'style-localization-v1.2'),
  ('液态巧克力酸艾尔', 'Sour Ale', 'sour.generic', 'localized_display', 'style-localization-v1.2'),
  ('意大利风格皮尔森', 'Italian Pilsner', 'pilsner.italian', 'localized_display', 'style-localization-v1.2'),
  ('意大利皮尔森', 'Italian Pilsner', 'pilsner.italian', 'localized_display', 'style-localization-v1.2'),
  ('意大利皮尔斯', 'Italian Pilsner', 'pilsner.italian', 'localized_display', 'style-localization-v1.2'),
  ('意大利IPA', 'IPA', 'ipa.generic', 'localized_display', 'style-localization-v1.2'),
  ('意式酒花皮尔森', 'Hoppy Italian Pilsner', 'pilsner.italian', 'localized_display', 'style-localization-v1.2'),
  ('意式皮尔森', 'Italian Pilsner', 'pilsner.italian', 'localized_display', 'style-localization-v1.2'),
  ('印度淡色艾尔', 'IPA', 'ipa.generic', 'localized_display', 'style-localization-v1.2'),
  ('印度淡色拉格', 'Hoppy Lager', 'lager.hoppy', 'localized_display', 'style-localization-v1.2'),
  ('英式艾尔', 'English Ale', 'unknown', 'localized_display', 'style-localization-v1.2'),
  ('英式波特', 'English Porter', 'porter.english', 'localized_display', 'style-localization-v1.2'),
  ('英式大麦酒', 'Barleywine', 'strong_ale.barleywine', 'localized_display', 'style-localization-v1.2'),
  ('英式大麦烈酒', 'English Barleywine', 'unknown', 'localized_display', 'style-localization-v1.2'),
  ('英式淡色艾尔', 'Pale Ale', 'pale_ale.generic', 'localized_display', 'style-localization-v1.2'),
  ('英式氮气苦啤', 'Nitro English Bitter', 'english.bitter', 'localized_display', 'style-localization-v1.2'),
  ('英式湖泊拉格', 'Lager', 'lager.generic', 'localized_display', 'style-localization-v1.2'),
  ('英式琥珀拉格', 'Amber Lager', 'lager.amber', 'localized_display', 'style-localization-v1.2'),
  ('英式金色艾尔', 'Blonde / Golden Ale', 'pale_ale.blonde', 'localized_display', 'style-localization-v1.2'),
  ('英式苦啤', 'English Bitter', 'english.bitter', 'localized_display', 'style-localization-v1.2'),
  ('英式烈性苦啤', 'Strong Bitter / ESB', 'english.esb', 'localized_display', 'style-localization-v1.2'),
  ('英式柔和艾尔', 'Mild Ale', 'english.mild', 'localized_display', 'style-localization-v1.2'),
  ('英式社交深色艾尔', 'Session Dark English Ale', 'unknown', 'localized_display', 'style-localization-v1.2'),
  ('英式世涛', 'Stout', 'stout.generic', 'localized_display', 'style-localization-v1.2'),
  ('英式特级苦啤', 'Strong Bitter / ESB', 'english.esb', 'localized_display', 'style-localization-v1.2'),
  ('英式特级苦啤ESB', 'Strong Bitter / ESB', 'english.esb', 'localized_display', 'style-localization-v1.2'),
  ('英式温和艾尔', 'Mild Ale', 'english.mild', 'localized_display', 'style-localization-v1.2'),
  ('英式棕色艾尔', 'Brown Ale', 'amber_red_brown.brown', 'localized_display', 'style-localization-v1.2'),
  ('英式Ale', 'English Ale', 'unknown', 'localized_display', 'style-localization-v1.2'),
  ('英式IPA', 'English IPA', 'ipa.english', 'localized_display', 'style-localization-v1.2'),
  ('樱桃兰比克', 'Fruited Lambic', 'wild.lambic', 'localized_display', 'style-localization-v1.2'),
  ('樱桃香蕉桃子酸艾尔IPA', 'Fruited Sour IPA', 'ipa.sour', 'localized_display', 'style-localization-v1.2'),
  ('硬冰茶', 'Hard Tea', 'unknown', 'localized_display', 'style-localization-v1.2'),
  ('硬苏打', 'Hard Seltzer', 'hard_seltzer.generic', 'localized_display', 'style-localization-v1.2'),
  ('优质淡金拉格', 'Lager', 'lager.generic', 'localized_display', 'style-localization-v1.2'),
  ('优质拉格', 'Lager', 'lager.generic', 'localized_display', 'style-localization-v1.2'),
  ('油柑橄榄酸艾尔', 'Fruited Sour', 'sour.fruited', 'localized_display', 'style-localization-v1.2'),
  ('油柑橄榄西打', 'Cider', 'cider.generic', 'localized_display', 'style-localization-v1.2'),
  ('油柑古斯', 'Gose', 'sour.gose', 'localized_display', 'style-localization-v1.2'),
  ('油柑茉莉酸海棠西打', 'Sour Cider', 'cider.generic', 'localized_display', 'style-localization-v1.2'),
  ('油柑养乐多西打', 'Cider', 'cider.generic', 'localized_display', 'style-localization-v1.2'),
  ('油柑叶茶纯米特种酸啤', 'Sour Tea', 'sour.generic', 'localized_display', 'style-localization-v1.2'),
  ('有机农甜米泥', NULL, 'unknown', 'hold_for_manual_review', 'style-localization-v1.2'),
  ('柚香大米拉格', 'Rice Lager', 'lager.rice', 'localized_display', 'style-localization-v1.2'),
  ('柚子大米拉格', 'Fruited Rice Lager', 'lager.rice', 'localized_display', 'style-localization-v1.2'),
  ('柚子莲雾香茅酸艾', 'Fruited Sour', 'sour.fruited', 'localized_display', 'style-localization-v1.2'),
  ('柚子柠檬仙蒂 / Shandy', 'Fruited Radler / Shandy', 'unknown', 'localized_display', 'style-localization-v1.2'),
  ('柚子山茶花水果西打', 'Fruited Tea Cider', 'cider.generic', 'localized_display', 'style-localization-v1.2'),
  ('柚子山茶花西打果酒', 'Fruited Tea Cider', 'cider.generic', 'localized_display', 'style-localization-v1.2'),
  ('柚子酸IPA', 'Fruited Sour IPA', 'ipa.sour', 'localized_display', 'style-localization-v1.2'),
  ('余甘子风味西打酒', 'Cider', 'cider.generic', 'localized_display', 'style-localization-v1.2'),
  ('玉米科隆', 'Kölsch', 'kolsch.generic', 'localized_display', 'style-localization-v1.2'),
  ('玉米拉格', 'Corn Lager', 'lager.generic', 'localized_display', 'style-localization-v1.2'),
  ('芋泥奶昔艾尔', 'Milkshake Ale', 'unknown', 'localized_display', 'style-localization-v1.2'),
  ('芋泥薰衣草冰淇淋奶昔', NULL, 'unknown', 'hold_for_manual_review', 'style-localization-v1.2'),
  ('原萃绿茶酸艾尔', 'Tea Sour Ale', 'sour.generic', 'localized_display', 'style-localization-v1.2'),
  ('粤桂铁观音硬冰茶', 'Hard Tea', 'unknown', 'localized_display', 'style-localization-v1.2'),
  ('云南IPA', 'IPA', 'ipa.generic', 'localized_display', 'style-localization-v1.2'),
  ('早餐帝国世涛', 'Imperial Stout', 'stout.imperial', 'localized_display', 'style-localization-v1.2'),
  ('增味拉格', 'Lager', 'lager.generic', 'localized_display', 'style-localization-v1.2'),
  ('增味酸艾尔', 'Sour Ale', 'sour.generic', 'localized_display', 'style-localization-v1.2'),
  ('增味酸世涛', 'Sour Stout', 'unknown', 'localized_display', 'style-localization-v1.2'),
  ('增味小赛松', 'Saison', 'saison.saison', 'localized_display', 'style-localization-v1.2'),
  ('增味野菌艾尔', 'Wild Ale', 'wild.generic', 'localized_display', 'style-localization-v1.2'),
  ('长白山冰葡萄西打', 'Fruited Cider', 'cider.generic', 'localized_display', 'style-localization-v1.2'),
  ('长白山泉水拉格', 'Lager', 'lager.generic', 'localized_display', 'style-localization-v1.2'),
  ('榛子核桃帝国世涛', 'Imperial Stout', 'stout.imperial', 'localized_display', 'style-localization-v1.2'),
  ('蒸汽酒花拉格', 'Hoppy Lager', 'lager.hoppy', 'localized_display', 'style-localization-v1.2'),
  ('蒸汽拉格', 'Lager', 'lager.generic', 'localized_display', 'style-localization-v1.2'),
  ('蒸汽拉格·欧洲酒花版', 'Lager', 'lager.generic', 'localized_display', 'style-localization-v1.2'),
  ('蒸汽拉格（欧洲酒花版）', 'Lager', 'lager.generic', 'localized_display', 'style-localization-v1.2'),
  ('整米拉格', 'Rice Lager', 'lager.generic', 'localized_display', 'style-localization-v1.2'),
  ('栀香乌龙莓果古斯', 'Fruited Gose', 'sour.gose', 'localized_display', 'style-localization-v1.2'),
  ('栀子花蜂蜜啤酒', NULL, 'unknown', 'hold_for_manual_review', 'style-localization-v1.2'),
  ('栀子花沙糖桔风味西打酒', 'Cider', 'cider.generic', 'localized_display', 'style-localization-v1.2'),
  ('中式波特', 'Porter', 'porter.generic', 'localized_display', 'style-localization-v1.2'),
  ('中式淡色艾尔', 'Pale Ale', 'pale_ale.generic', 'localized_display', 'style-localization-v1.2'),
  ('中式苦啤', 'English Bitter', 'english.bitter', 'localized_display', 'style-localization-v1.2'),
  ('中式小麦', 'Wheat Beer', 'wheat.generic', 'localized_display', 'style-localization-v1.2'),
  ('重瓣玫瑰蜜桃古斯', 'Gose', 'sour.gose', 'localized_display', 'style-localization-v1.2'),
  ('重酒花双倍IPA', 'Double IPA', 'ipa.generic', 'localized_display', 'style-localization-v1.2'),
  ('竹香梨西打', 'Cider', 'cider.generic', 'localized_display', 'style-localization-v1.2'),
  ('紫泥酸艾尔', 'Sour Ale', 'sour.generic', 'localized_display', 'style-localization-v1.2'),
  ('紫糯米拉格', 'Rice Lager', 'lager.generic', 'localized_display', 'style-localization-v1.2'),
  ('自然发酵赛松', 'Saison', 'saison.saison', 'localized_display', 'style-localization-v1.2'),
  ('棕色艾尔', 'Brown Ale', 'amber_red_brown.brown', 'localized_display', 'style-localization-v1.2'),
  ('棕色拉格', 'Lager', 'lager.generic', 'localized_display', 'style-localization-v1.2'),
  ('最苦啤', NULL, 'unknown', 'hold_for_manual_review', 'style-localization-v1.2'),
  ('佐伊格尔拉格', 'Zoigl Beer', 'lager.generic', 'localized_display', 'style-localization-v1.2'),
  ('佐伊格尔啤酒', 'Zoigl Beer', 'unknown', 'localized_display', 'style-localization-v1.2'),
  ('American IPA', 'American IPA', 'ipa.american', 'localized_display', 'style-localization-v1.2'),
  ('American Pale Ale', 'American Pale Ale', 'pale_ale.american', 'localized_display', 'style-localization-v1.2'),
  ('APA', 'American Pale Ale', 'pale_ale.american', 'localized_display', 'style-localization-v1.2'),
  ('Belgian Farmhouse-Style Ale', 'Farmhouse Ale', 'saison.farmhouse', 'localized_display', 'style-localization-v1.2'),
  ('Belgian Tripel', 'Belgian Tripel', 'belgian.tripel', 'localized_display', 'style-localization-v1.2'),
  ('Best Bitter', 'Best Bitter', 'english.best', 'localized_display', 'style-localization-v1.2'),
  ('Blonde Ale', 'Blonde / Golden Ale', 'pale_ale.blonde', 'localized_display', 'style-localization-v1.2'),
  ('British Ale', 'Ale', 'unknown', 'localized_display', 'style-localization-v1.2'),
  ('Chop IPA', 'IPA', 'ipa.generic', 'localized_display', 'style-localization-v1.2'),
  ('Dark mild', 'Dark Mild Ale', 'english.mild', 'localized_display', 'style-localization-v1.2'),
  ('DDH', NULL, 'unknown', 'hold_for_manual_review', 'style-localization-v1.2'),
  ('DDH 浑浊 IPA', 'DDH Hazy IPA', 'ipa.hazy', 'localized_display', 'style-localization-v1.2'),
  ('DDH 浑浊双倍 IPA', 'Double DDH Hazy IPA', 'ipa.hazy', 'localized_display', 'style-localization-v1.2'),
  ('DDH 浑浊双倍IPA', 'Double DDH Hazy IPA', 'ipa.hazy', 'localized_display', 'style-localization-v1.2'),
  ('DDH 未来西海岸 IPA', 'DDH West Coast IPA', 'ipa.west_coast', 'localized_display', 'style-localization-v1.2'),
  ('DDH Double Hazy IPA', 'Double DDH Hazy IPA', 'ipa.hazy', 'localized_display', 'style-localization-v1.2'),
  ('DDH Hazy DIPA', 'Double DDH Hazy IPA', 'ipa.hazy', 'localized_display', 'style-localization-v1.2'),
  ('DDH India Pale Ale', 'DDH IPA', 'ipa.generic', 'localized_display', 'style-localization-v1.2'),
  ('DDH IPA', 'DDH IPA', 'ipa.generic', 'localized_display', 'style-localization-v1.2'),
  ('DDH NEIPA', 'DDH Hazy IPA', 'ipa.hazy', 'localized_display', 'style-localization-v1.2'),
  ('DDH Pale Ale', 'DDH Pale Ale', 'pale_ale.generic', 'localized_display', 'style-localization-v1.2'),
  ('DDH Wheat Ale', 'DDH Wheat Beer', 'wheat.generic', 'localized_display', 'style-localization-v1.2'),
  ('DDH超干型西海岸IPA', 'DDH West Coast IPA', 'ipa.west_coast', 'localized_display', 'style-localization-v1.2'),
  ('DDH单一酒花双倍浑浊IPA', 'Double DDH Hazy IPA', 'ipa.hazy', 'localized_display', 'style-localization-v1.2'),
  ('DDH帝国IPA', 'Imperial DDH IPA', 'ipa.generic', 'localized_display', 'style-localization-v1.2'),
  ('DDH凤尾鱼西海岸IPA', 'DDH West Coast IPA', 'ipa.west_coast', 'localized_display', 'style-localization-v1.2'),
  ('DDH黑IPA', 'DDH Black IPA', 'ipa.black', 'localized_display', 'style-localization-v1.2'),
  ('DDH浑浊淡色艾尔', 'DDH Hazy Pale Ale', 'pale_ale.generic', 'localized_display', 'style-localization-v1.2'),
  ('DDH浑浊双倍IPA', 'Double DDH Hazy IPA', 'ipa.hazy', 'localized_display', 'style-localization-v1.2'),
  ('DDH浑浊IPA', 'DDH Hazy IPA', 'ipa.hazy', 'localized_display', 'style-localization-v1.2'),
  ('DDH酒花拉格', 'DDH Hoppy Lager', 'lager.hoppy', 'localized_display', 'style-localization-v1.2'),
  ('DDH矩阵西海岸IPA', 'DDH West Coast IPA', 'ipa.west_coast', 'localized_display', 'style-localization-v1.2'),
  ('DDH冷IPA', 'DDH Cold IPA', 'ipa.cold', 'localized_display', 'style-localization-v1.2'),
  ('DDH美式淡色艾尔', 'DDH American Pale Ale', 'pale_ale.american', 'localized_display', 'style-localization-v1.2'),
  ('DDH三倍浑浊IPA', 'Triple DDH Hazy IPA', 'ipa.hazy', 'localized_display', 'style-localization-v1.2'),
  ('DDH双倍浑浊ipa', 'Double DDH Hazy IPA', 'ipa.hazy', 'localized_display', 'style-localization-v1.2'),
  ('DDH双倍浑浊IPA', 'Double DDH Hazy IPA', 'ipa.hazy', 'localized_display', 'style-localization-v1.2'),
  ('DDH双倍西海岸', NULL, 'unknown', 'hold_for_manual_review', 'style-localization-v1.2'),
  ('DDH双倍西海岸IPA', 'Double DDH West Coast IPA', 'ipa.west_coast', 'localized_display', 'style-localization-v1.2'),
  ('DDH双倍IPA', 'Double DDH IPA', 'ipa.generic', 'localized_display', 'style-localization-v1.2'),
  ('DDH酸IPA', 'DDH Sour IPA', 'ipa.sour', 'localized_display', 'style-localization-v1.2'),
  ('DDH西海岸皮尔森', 'DDH West Coast Pilsner', 'pilsner.generic', 'localized_display', 'style-localization-v1.2'),
  ('DDH西海岸IPA', 'DDH West Coast IPA', 'ipa.west_coast', 'localized_display', 'style-localization-v1.2'),
  ('DDH现代西海岸IPA', 'DDH West Coast IPA', 'ipa.west_coast', 'localized_display', 'style-localization-v1.2'),
  ('DDH新西兰淡色艾尔', 'DDH Pale Ale', 'pale_ale.generic', 'localized_display', 'style-localization-v1.2'),
  ('DDH新英格兰IPA', 'DDH Hazy IPA', 'ipa.hazy', 'localized_display', 'style-localization-v1.2'),
  ('DIPA', 'Double IPA', 'ipa.generic', 'localized_display', 'style-localization-v1.2'),
  ('Double India Pale Ale', 'Double IPA', 'ipa.generic', 'localized_display', 'style-localization-v1.2'),
  ('double IPA', 'Double IPA', 'ipa.generic', 'localized_display', 'style-localization-v1.2'),
  ('Double IPA', 'Double IPA', 'ipa.generic', 'localized_display', 'style-localization-v1.2'),
  ('ESB', 'Strong Bitter / ESB', 'english.esb', 'localized_display', 'style-localization-v1.2'),
  ('ESB英式苦啤', 'Strong Bitter / ESB', 'english.esb', 'localized_display', 'style-localization-v1.2'),
  ('Farmhouse Ale', 'Farmhouse Ale', 'saison.farmhouse', 'localized_display', 'style-localization-v1.2'),
  ('Farmhouse Ale - Saison', 'Saison', 'saison.saison', 'localized_display', 'style-localization-v1.2'),
  ('French-Style Lager', 'Lager', 'lager.generic', 'localized_display', 'style-localization-v1.2'),
  ('fresh hops ipa', 'Fresh Hop IPA', 'ipa.generic', 'localized_display', 'style-localization-v1.2'),
  ('Fruit Beer', 'Fruit Beer', 'unknown', 'localized_display', 'style-localization-v1.2'),
  ('Fruited Sour', 'Fruited Sour', 'sour.fruited', 'localized_display', 'style-localization-v1.2'),
  ('Gose', 'Gose', 'sour.gose', 'localized_display', 'style-localization-v1.2'),
  ('Guava Strawberry Ale', 'Ale', 'unknown', 'localized_display', 'style-localization-v1.2'),
  ('Hazy IPA', 'Hazy IPA', 'ipa.hazy', 'localized_display', 'style-localization-v1.2'),
  ('HDHC 帝国IPA', 'Imperial IPA', 'ipa.generic', 'localized_display', 'style-localization-v1.2'),
  ('HDHC DDH IPA', 'DDH IPA', 'ipa.generic', 'localized_display', 'style-localization-v1.2'),
  ('HDMF黄皮酸艾尔', 'Fruited Sour', 'sour.fruited', 'localized_display', 'style-localization-v1.2'),
  ('Hefeweizen', 'Hefeweizen', 'wheat.hefeweizen', 'localized_display', 'style-localization-v1.2'),
  ('Helles 拉格', 'Munich Helles', 'lager.helles', 'localized_display', 'style-localization-v1.2'),
  ('Helles Lager', 'Munich Helles', 'lager.helles', 'localized_display', 'style-localization-v1.2'),
  ('HVDE帝国浑浊IPA', 'Imperial Hazy IPA', 'ipa.hazy', 'localized_display', 'style-localization-v1.2'),
  ('Imperial Hazy IPA', 'Imperial Hazy IPA', 'ipa.hazy', 'localized_display', 'style-localization-v1.2'),
  ('India Pale Ale / West Coast IPA', 'West Coast IPA', 'ipa.west_coast', 'localized_display', 'style-localization-v1.2'),
  ('Ipa', 'IPA', 'ipa.generic', 'localized_display', 'style-localization-v1.2'),
  ('IPA', 'IPA', 'ipa.generic', 'localized_display', 'style-localization-v1.2'),
  ('IPA - American', 'American IPA', 'ipa.american', 'localized_display', 'style-localization-v1.2'),
  ('IPA - Imperial / Double New England / Hazy', 'Double Hazy IPA', 'ipa.hazy', 'localized_display', 'style-localization-v1.2'),
  ('IPA - New England / Hazy', 'Hazy IPA', 'ipa.hazy', 'localized_display', 'style-localization-v1.2'),
  ('IPA - Session', 'Session IPA', 'ipa.generic', 'localized_display', 'style-localization-v1.2'),
  ('IPA - Triple New England / Hazy', 'Triple Hazy IPA', 'ipa.hazy', 'localized_display', 'style-localization-v1.2'),
  ('IPL', 'Hoppy Lager', 'lager.hoppy', 'localized_display', 'style-localization-v1.2'),
  ('Japanese Lager', 'Lager', 'lager.generic', 'style_key_safe_fallback', 'style-localization-v1.2'),
  ('Kölsch科隆', 'Kölsch', 'kolsch.generic', 'localized_display', 'style-localization-v1.2'),
  ('Lager - Helles', 'Munich Helles', 'lager.helles', 'localized_display', 'style-localization-v1.2'),
  ('Lager - Mexican', 'Mexican Lager', 'lager.mexican', 'localized_display', 'style-localization-v1.2'),
  ('Lager - Other', 'Lager', 'lager.generic', 'localized_display', 'style-localization-v1.2'),
  ('Lambic', 'Lambic', 'wild.lambic', 'localized_display', 'style-localization-v1.2'),
  ('Lichtenhainer', 'Lichtenhainer', 'unknown', 'localized_display', 'style-localization-v1.2'),
  ('Milk Stout', 'Milk Stout', 'stout.milk', 'localized_display', 'style-localization-v1.2'),
  ('Modern IPA', 'IPA', 'ipa.generic', 'localized_display', 'style-localization-v1.2'),
  ('NEIPA', 'Hazy IPA', 'ipa.hazy', 'localized_display', 'style-localization-v1.2'),
  ('NFC果汁', 'Juice', 'unknown', 'localized_display', 'style-localization-v1.2'),
  ('Pale Ale', 'Pale Ale', 'pale_ale.generic', 'localized_display', 'style-localization-v1.2'),
  ('Pale Lager', 'Lager', 'lager.generic', 'localized_display', 'style-localization-v1.2'),
  ('Porter', 'Porter', 'porter.generic', 'localized_display', 'style-localization-v1.2'),
  ('Red Ale', 'Red Ale', 'amber_red_brown.red', 'localized_display', 'style-localization-v1.2'),
  ('Saison', 'Saison', 'saison.saison', 'localized_display', 'style-localization-v1.2'),
  ('Sour - Fruited', 'Fruited Sour', 'sour.fruited', 'localized_display', 'style-localization-v1.2'),
  ('Sour Hoppy Lager', 'Sour Hoppy Lager', 'lager.hoppy', 'localized_display', 'style-localization-v1.2'),
  ('Sour IPA', 'Sour IPA', 'ipa.sour', 'localized_display', 'style-localization-v1.2'),
  ('Spring Lager', 'Lager', 'lager.generic', 'localized_display', 'style-localization-v1.2'),
  ('Stout', 'Stout', 'stout.generic', 'localized_display', 'style-localization-v1.2'),
  ('TDH帝国浑浊IPA', 'Imperial TDH Hazy IPA', 'ipa.hazy', 'localized_display', 'style-localization-v1.2'),
  ('TDH浑浊IPA', 'TDH Hazy IPA', 'ipa.hazy', 'localized_display', 'style-localization-v1.2'),
  ('TDH酒花饱和艾尔', 'TDH Hoppy Ale', 'unknown', 'localized_display', 'style-localization-v1.2'),
  ('TDH摩登西海岸IPA', 'TDH West Coast IPA', 'ipa.west_coast', 'localized_display', 'style-localization-v1.2'),
  ('TDH三倍干投浑浊IPA', 'TDH Hazy IPA', 'ipa.hazy', 'localized_display', 'style-localization-v1.2'),
  ('TDH三倍浑浊IPA', 'Triple TDH Hazy IPA', 'ipa.hazy', 'localized_display', 'style-localization-v1.2'),
  ('TDH双倍浑浊IPA', 'Double TDH Hazy IPA', 'ipa.hazy', 'localized_display', 'style-localization-v1.2'),
  ('TDH四倍浑浊IPA', 'TDH Hazy IPA', 'ipa.hazy', 'localized_display', 'style-localization-v1.2'),
  ('TDH西海岸IPA', 'TDH West Coast IPA', 'ipa.west_coast', 'localized_display', 'style-localization-v1.2'),
  ('TDH新鲜酒花帝国美式IPA', 'Imperial TDH Fresh Hop American IPA', 'ipa.american', 'localized_display', 'style-localization-v1.2'),
  ('THD帝国浑浊IPA', 'Imperial Hazy IPA', 'ipa.hazy', 'localized_display', 'style-localization-v1.2'),
  ('Tiki风格酸IPA', 'Sour IPA', 'ipa.sour', 'localized_display', 'style-localization-v1.2'),
  ('UHA', NULL, 'unknown', 'hold_for_manual_review', 'style-localization-v1.2'),
  ('Unfiltered IPA', 'Unfiltered IPA', 'ipa.generic', 'localized_display', 'style-localization-v1.2'),
  ('West Coast India Pale Ale', 'West Coast IPA', 'ipa.west_coast', 'localized_display', 'style-localization-v1.2'),
  ('West Coast IPA', 'West Coast IPA', 'ipa.west_coast', 'localized_display', 'style-localization-v1.2'),
  ('Wheat Beer - Hefeweizen', 'Hefeweizen', 'wheat.hefeweizen', 'localized_display', 'style-localization-v1.2'),
  ('Witbier', 'Witbier', 'wheat.witbier', 'localized_display', 'style-localization-v1.2'),
  ('Witbier / Belgian Wheat Beer', 'Witbier', 'wheat.witbier', 'localized_display', 'style-localization-v1.2'),
  ('XDH 双倍IPA', 'Double IPA', 'ipa.generic', 'localized_display', 'style-localization-v1.2'),
  ('XPA', 'Pale Ale', 'pale_ale.generic', 'localized_display', 'style-localization-v1.2')
ON CONFLICT (raw_style) DO UPDATE SET
  display_en = EXCLUDED.display_en,
  style_key = EXCLUDED.style_key,
  consumer_delivery_tier = EXCLUDED.consumer_delivery_tier,
  version = EXCLUDED.version;

ALTER TABLE public.drink_products
  ADD COLUMN IF NOT EXISTS beer_style_en text,
  ADD COLUMN IF NOT EXISTS beer_style_en_source text,
  ADD COLUMN IF NOT EXISTS beer_style_en_status text NOT NULL DEFAULT 'needs_review',
  ADD COLUMN IF NOT EXISTS beer_style_en_version text;

ALTER TABLE public.drink_products
  DROP CONSTRAINT IF EXISTS drink_products_beer_style_en_source_check,
  ADD CONSTRAINT drink_products_beer_style_en_source_check CHECK (
    beer_style_en_source IS NULL OR beer_style_en_source IN ('dictionary', 'style_key_fallback', 'manual')
  ),
  DROP CONSTRAINT IF EXISTS drink_products_beer_style_en_status_check,
  ADD CONSTRAINT drink_products_beer_style_en_status_check CHECK (
    beer_style_en_status IN ('approved', 'needs_review')
  );

COMMENT ON COLUMN public.drink_products.beer_style_en IS
  'Consumer English style for canonical Product Pool products only.';
COMMENT ON COLUMN public.drink_products.beer_style_en_source IS
  'dictionary, style_key_fallback, or manual. Manual values are never overwritten by automatic refresh.';
COMMENT ON COLUMN public.drink_products.beer_style_en_status IS
  'Only approved values may be returned by consumer APIs.';
COMMENT ON COLUMN public.drink_products.beer_style_en_version IS
  'Frozen localization version used for the materialized English style.';

CREATE OR REPLACE FUNCTION nomenu_i18n.apply_product_style_v12(
  p_product_id uuid,
  p_force boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_product public.drink_products%ROWTYPE;
  v_mapping nomenu_i18n.style_localization_v12%ROWTYPE;
BEGIN
  SELECT * INTO v_product
  FROM public.drink_products
  WHERE id = p_product_id
  FOR UPDATE;

  IF v_product.id IS NULL THEN RAISE EXCEPTION 'Product not found'; END IF;
  IF NOT p_force AND v_product.beer_style_en_source = 'manual' THEN RETURN; END IF;

  SELECT * INTO v_mapping
  FROM nomenu_i18n.style_localization_v12
  WHERE raw_style = nullif(trim(v_product.beer_style), '');

  IF v_mapping.raw_style IS NOT NULL
    AND v_mapping.consumer_delivery_tier IN ('localized_display', 'style_key_safe_fallback')
    AND nullif(trim(v_mapping.display_en), '') IS NOT NULL
  THEN
    UPDATE public.drink_products
    SET beer_style_en = trim(v_mapping.display_en),
        beer_style_en_source = CASE
          WHEN v_mapping.consumer_delivery_tier = 'style_key_safe_fallback' THEN 'style_key_fallback'
          ELSE 'dictionary'
        END,
        beer_style_en_status = 'approved',
        beer_style_en_version = v_mapping.version
    WHERE id = p_product_id;
  ELSE
    UPDATE public.drink_products
    SET beer_style_en = NULL,
        beer_style_en_source = NULL,
        beer_style_en_status = 'needs_review',
        beer_style_en_version = 'style-localization-v1.2'
    WHERE id = p_product_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION nomenu_i18n.apply_product_style_v12(uuid, boolean)
  FROM PUBLIC, anon, authenticated;

-- Existing Product Pool rows receive the same exact-match materialization.
-- The image constraint is NOT VALID because some legacy products still carry
-- first-party drink URLs. PostgreSQL nevertheless checks those legacy rows on
-- any UPDATE, including an unrelated localization update. Temporarily remove
-- and restore the constraint inside this atomic block so the one-time backfill
-- does not mutate or discard legacy images. The final constraint is unchanged.
DO $style_localization_backfill$
DECLARE
  v_had_image_constraint boolean := false;
  v_image_constraint_was_validated boolean := false;
BEGIN
  SELECT true, convalidated
  INTO v_had_image_constraint, v_image_constraint_was_validated
  FROM pg_constraint
  WHERE conrelid = 'public.drink_products'::regclass
    AND conname = 'drink_products_canonical_first_party_image';

  IF v_had_image_constraint THEN
    ALTER TABLE public.drink_products
      DROP CONSTRAINT drink_products_canonical_first_party_image;
  END IF;

  UPDATE public.drink_products dp
  SET beer_style_en = m.display_en,
      beer_style_en_source = CASE
        WHEN m.consumer_delivery_tier = 'style_key_safe_fallback' THEN 'style_key_fallback'
        ELSE 'dictionary'
      END,
      beer_style_en_status = 'approved',
      beer_style_en_version = m.version
  FROM nomenu_i18n.style_localization_v12 m
  WHERE m.raw_style = nullif(trim(dp.beer_style), '')
    AND m.consumer_delivery_tier IN ('localized_display', 'style_key_safe_fallback')
    AND nullif(trim(m.display_en), '') IS NOT NULL
    AND dp.beer_style_en_source IS DISTINCT FROM 'manual';

  UPDATE public.drink_products dp
  SET beer_style_en = NULL,
      beer_style_en_source = NULL,
      beer_style_en_status = 'needs_review',
      beer_style_en_version = 'style-localization-v1.2'
  WHERE dp.beer_style_en_source IS DISTINCT FROM 'manual'
    AND NOT EXISTS (
      SELECT 1
      FROM nomenu_i18n.style_localization_v12 m
      WHERE m.raw_style = nullif(trim(dp.beer_style), '')
        AND m.consumer_delivery_tier IN ('localized_display', 'style_key_safe_fallback')
        AND nullif(trim(m.display_en), '') IS NOT NULL
    );

  IF v_had_image_constraint THEN
    ALTER TABLE public.drink_products
      ADD CONSTRAINT drink_products_canonical_first_party_image
      CHECK (
        image_url IS NULL
        OR image_url ~ (
          '^https://img\.nomenuapp\.com/prod/products/' ||
          id::text ||
          '/[A-Za-z0-9_-][A-Za-z0-9._-]{0,119}$'
        )
        OR (
          image_url !~ '^https://img\.nomenuapp\.com/'
          AND image_url !~ '^https://agtujigvxxdppngirqtu\.supabase\.co/storage/v1/object/public/taplist-media/'
        )
      ) NOT VALID;

    IF v_image_constraint_was_validated THEN
      ALTER TABLE public.drink_products
        VALIDATE CONSTRAINT drink_products_canonical_first_party_image;
    END IF;
  END IF;
END;
$style_localization_backfill$;

CREATE OR REPLACE FUNCTION public.admin_set_drink_product_style_localization(
  p_product_id uuid,
  p_mode text DEFAULT 'auto',
  p_style_en text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_mode text := lower(coalesce(nullif(trim(p_mode), ''), 'auto'));
  v_style_en text := nullif(trim(p_style_en), '');
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.is_super_admin() THEN RAISE EXCEPTION 'Unauthorized: super_admin role required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.drink_products WHERE id = p_product_id) THEN
    RAISE EXCEPTION 'Product not found';
  END IF;

  IF v_mode = 'manual' THEN
    IF v_style_en IS NULL THEN RAISE EXCEPTION 'Manual English style is required'; END IF;
    UPDATE public.drink_products
    SET beer_style_en = v_style_en,
        beer_style_en_source = 'manual',
        beer_style_en_status = 'approved',
        beer_style_en_version = 'manual'
    WHERE id = p_product_id;
  ELSIF v_mode = 'restore_dictionary' THEN
    PERFORM nomenu_i18n.apply_product_style_v12(p_product_id, true);
  ELSIF v_mode = 'auto' THEN
    PERFORM nomenu_i18n.apply_product_style_v12(p_product_id, false);
  ELSE
    RAISE EXCEPTION 'Invalid localization mode';
  END IF;

  RETURN (
    SELECT jsonb_build_object(
      'ok', true,
      'product_id', id,
      'beer_style_en', beer_style_en,
      'beer_style_en_source', beer_style_en_source,
      'beer_style_en_status', beer_style_en_status,
      'beer_style_en_version', beer_style_en_version
    )
    FROM public.drink_products
    WHERE id = p_product_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_drink_product_style_localization(uuid, text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_drink_product_style_localization(uuid, text, text)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_get_drink_product_style_localizations(
  p_product_ids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.is_super_admin() THEN RAISE EXCEPTION 'Unauthorized: super_admin role required'; END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'products', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', dp.id,
        'beer_style_en', dp.beer_style_en,
        'beer_style_en_source', dp.beer_style_en_source,
        'beer_style_en_status', dp.beer_style_en_status,
        'beer_style_en_version', dp.beer_style_en_version
      ) ORDER BY dp.id)
      FROM public.drink_products dp
      WHERE dp.id = ANY(coalesce(p_product_ids, '{}'::uuid[]))
    ), '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_drink_product_style_localizations(uuid[])
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_drink_product_style_localizations(uuid[])
  TO authenticated;

-- Add approved Product Pool style labels to existing i18n DTOs. Unlinked
-- drinks always receive NULL because there is no canonical product row.
CREATE OR REPLACE FUNCTION nomenu_i18n.public_drink(item jsonb)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT item || jsonb_build_object(
    'name_en', CASE WHEN d.product_id IS NULL THEN NULL ELSE dp.name_en END,
    'beer', CASE
      WHEN item->'beer' IS NULL OR item->'beer' = 'null'::jsonb THEN item->'beer'
      ELSE item->'beer' || jsonb_build_object(
        'beer_style_en', CASE WHEN dp.beer_style_en_status = 'approved' THEN dp.beer_style_en END,
        'brewery_en', dc.canonical_name_en,
        'country', dc.country,
        'country_en', dc.country_en,
        'origin_region', dc.origin_region,
        'origin_region_en', dc.origin_region_en,
        'origin_city', dc.origin_city,
        'origin_city_en', dc.origin_city_en
      )
    END
  )
  FROM public.drinks d
  LEFT JOIN public.drink_products dp ON dp.id = d.product_id AND dp.status = 'active'
  LEFT JOIN public.drink_companies dc ON dc.id = dp.company_id AND dc.status = 'active'
  WHERE d.id = nullif(item->>'id', '')::uuid;
$$;

REVOKE ALL ON FUNCTION nomenu_i18n.public_drink(jsonb)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.search_mini_products_i18n(
  p_city text DEFAULT NULL,
  p_query text DEFAULT '',
  p_style text DEFAULT NULL,
  p_brewery text DEFAULT NULL,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_result jsonb := public.search_mini_products(p_city, p_query, p_style, p_brewery, p_offset); v_items jsonb;
BEGIN
  SELECT coalesce(jsonb_agg(item || jsonb_build_object(
    'name_en', CASE WHEN dp.id IS NULL THEN NULL ELSE dp.name_en END,
    'beer_style_en', CASE WHEN dp.beer_style_en_status = 'approved' THEN dp.beer_style_en END,
    'brewery_en', dc.canonical_name_en,
    'country', dc.country,
    'country_en', dc.country_en,
    'origin_region', dc.origin_region,
    'origin_region_en', dc.origin_region_en,
    'origin_city', dc.origin_city,
    'origin_city_en', dc.origin_city_en,
    'venues', coalesce((
      SELECT jsonb_agg(venue || jsonb_build_object('display_name_en', t.display_name_en) ORDER BY venue_ord)
      FROM jsonb_array_elements(coalesce(item->'venues', '[]'::jsonb)) WITH ORDINALITY AS vr(venue, venue_ord)
      LEFT JOIN public.tenants t ON t.id = nullif(venue->>'id', '')::uuid
    ), '[]'::jsonb)
  ) ORDER BY ord), '[]'::jsonb)
  INTO v_items
  FROM jsonb_array_elements(coalesce(v_result->'results', '[]'::jsonb)) WITH ORDINALITY AS rows(item, ord)
  LEFT JOIN public.drink_products dp ON dp.id = nullif(item->>'product_id', '')::uuid AND dp.status = 'active'
  LEFT JOIN public.drink_companies dc ON dc.id = dp.company_id AND dc.status = 'active';
  RETURN jsonb_set(v_result, '{results}', v_items);
END;
$$;

REVOKE ALL ON FUNCTION public.search_mini_products_i18n(text, text, text, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_mini_products_i18n(text, text, text, text, integer) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_mini_product_i18n(
  p_product_id uuid DEFAULT NULL,
  p_drink_id uuid DEFAULT NULL,
  p_city text DEFAULT NULL,
  p_source_slug text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_result jsonb := public.get_mini_product(p_product_id, p_drink_id, p_city, p_source_slug); v_product jsonb; v_venues jsonb;
BEGIN
  IF coalesce((v_result->>'ok')::boolean, false) IS NOT TRUE THEN RETURN v_result; END IF;
  SELECT (v_result->'product') || jsonb_build_object(
    'name_en', CASE WHEN dp.id IS NULL THEN NULL ELSE dp.name_en END,
    'beer_style_en', CASE WHEN dp.beer_style_en_status = 'approved' THEN dp.beer_style_en END,
    'brewery_en', dc.canonical_name_en,
    'country', dc.country,
    'country_en', dc.country_en,
    'origin_region', dc.origin_region,
    'origin_region_en', dc.origin_region_en,
    'origin_city', dc.origin_city,
    'origin_city_en', dc.origin_city_en
  ) INTO v_product
  FROM (SELECT nullif(v_result->'product'->>'product_id', '')::uuid AS product_id) source
  LEFT JOIN public.drink_products dp ON dp.id = source.product_id AND dp.status = 'active'
  LEFT JOIN public.drink_companies dc ON dc.id = dp.company_id AND dc.status = 'active';

  SELECT coalesce(jsonb_agg(venue || jsonb_build_object('display_name_en', t.display_name_en) ORDER BY ord), '[]'::jsonb)
  INTO v_venues
  FROM jsonb_array_elements(coalesce(v_result->'venues', '[]'::jsonb)) WITH ORDINALITY AS rows(venue, ord)
  LEFT JOIN public.tenants t ON t.id = nullif(venue->>'id', '')::uuid;
  RETURN jsonb_set(jsonb_set(v_result, '{product}', v_product), '{venues}', v_venues);
END;
$$;

REVOKE ALL ON FUNCTION public.get_mini_product_i18n(uuid, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_mini_product_i18n(uuid, uuid, text, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_public_taplist_new_drinks_i18n(p_city text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_result jsonb := public.get_public_taplist_new_drinks(p_city); v_items jsonb;
BEGIN
  IF coalesce((v_result->>'ok')::boolean, false) IS NOT TRUE THEN RETURN v_result; END IF;
  SELECT coalesce(jsonb_agg(item || jsonb_build_object(
    'name_en', CASE WHEN dp.id IS NULL THEN NULL ELSE dp.name_en END,
    'beer_style_en', CASE WHEN dp.beer_style_en_status = 'approved' THEN dp.beer_style_en END,
    'brewery_en', dc.canonical_name_en,
    'country', dc.country,
    'country_en', dc.country_en,
    'origin_region', dc.origin_region,
    'origin_region_en', dc.origin_region_en,
    'origin_city', dc.origin_city,
    'origin_city_en', dc.origin_city_en,
    'tenant_display_name_en', t.display_name_en
  ) ORDER BY ord), '[]'::jsonb)
  INTO v_items
  FROM jsonb_array_elements(coalesce(v_result->'results', '[]'::jsonb)) WITH ORDINALITY AS rows(item, ord)
  LEFT JOIN public.drinks d ON d.id = nullif(item->>'drink_id', '')::uuid
  LEFT JOIN public.drink_products dp ON dp.id = d.product_id AND dp.status = 'active'
  LEFT JOIN public.drink_companies dc ON dc.id = dp.company_id AND dc.status = 'active'
  LEFT JOIN public.tenants t ON t.id = d.tenant_id;
  RETURN jsonb_set(v_result, '{results}', v_items);
END;
$$;

REVOKE ALL ON FUNCTION public.get_public_taplist_new_drinks_i18n(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_taplist_new_drinks_i18n(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_my_drink_history_i18n(p_cursor timestamptz DEFAULT NULL, p_limit integer DEFAULT 60)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_result jsonb := public.get_my_drink_history(p_cursor, p_limit); v_items jsonb;
BEGIN
  SELECT coalesce(jsonb_agg(item || jsonb_build_object(
    'name_en', CASE WHEN dp.id IS NULL THEN NULL ELSE dp.name_en END,
    'beer_style_en', CASE WHEN dp.beer_style_en_status = 'approved' THEN dp.beer_style_en END,
    'brewery_en', dc.canonical_name_en,
    'country', dc.country,
    'country_en', dc.country_en,
    'origin_region', dc.origin_region,
    'origin_region_en', dc.origin_region_en,
    'origin_city', dc.origin_city,
    'origin_city_en', dc.origin_city_en,
    'venues', coalesce((
      SELECT jsonb_agg(venue || jsonb_build_object(
        'tenant_name_en', t.display_name_en,
        'district_en', t.district_en,
        'address_en', t.address_en,
        'city_label_en', c.label_en
      ) ORDER BY venue_ord)
      FROM jsonb_array_elements(coalesce(item->'venues', '[]'::jsonb)) WITH ORDINALITY AS vr(venue, venue_ord)
      LEFT JOIN public.tenants t ON t.id = nullif(venue->>'tenant_id', '')::uuid
      LEFT JOIN public.taplist_public_cities c ON lower(trim(c.city)) = lower(trim(t.city))
    ), '[]'::jsonb)
  ) ORDER BY ord), '[]'::jsonb)
  INTO v_items
  FROM jsonb_array_elements(coalesce(v_result->'results', '[]'::jsonb)) WITH ORDINALITY AS rows(item, ord)
  LEFT JOIN public.drink_products dp ON dp.id = nullif(item->>'product_id', '')::uuid AND dp.status = 'active'
  LEFT JOIN public.drink_companies dc ON dc.id = dp.company_id AND dc.status = 'active';
  RETURN jsonb_set(v_result, '{results}', v_items);
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_drink_history_i18n(timestamptz, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_drink_history_i18n(timestamptz, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_drink_history_item_i18n(p_light_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_result jsonb := public.get_my_drink_history_item(p_light_id); v_item jsonb; v_venues jsonb;
BEGIN
  IF v_result->'result' IS NULL OR v_result->'result' = 'null'::jsonb THEN RETURN v_result; END IF;
  SELECT (v_result->'result') || jsonb_build_object(
    'name_en', CASE WHEN dp.id IS NULL THEN NULL ELSE dp.name_en END,
    'beer_style_en', CASE WHEN dp.beer_style_en_status = 'approved' THEN dp.beer_style_en END,
    'brewery_en', dc.canonical_name_en,
    'country', dc.country,
    'country_en', dc.country_en,
    'origin_region', dc.origin_region,
    'origin_region_en', dc.origin_region_en,
    'origin_city', dc.origin_city,
    'origin_city_en', dc.origin_city_en
  ) INTO v_item
  FROM (SELECT nullif(v_result->'result'->>'product_id', '')::uuid AS product_id) source
  LEFT JOIN public.drink_products dp ON dp.id = source.product_id AND dp.status = 'active'
  LEFT JOIN public.drink_companies dc ON dc.id = dp.company_id AND dc.status = 'active';

  SELECT coalesce(jsonb_agg(venue || jsonb_build_object(
    'tenant_name_en', t.display_name_en, 'city_label_en', c.label_en,
    'district_en', t.district_en, 'address_en', t.address_en
  ) ORDER BY ord), '[]'::jsonb)
  INTO v_venues
  FROM jsonb_array_elements(coalesce(v_result->'result'->'venues', '[]'::jsonb)) WITH ORDINALITY AS rows(venue, ord)
  LEFT JOIN public.tenants t ON t.id = nullif(venue->>'tenant_id', '')::uuid
  LEFT JOIN public.taplist_public_cities c ON lower(trim(c.city)) = lower(trim(t.city));
  RETURN jsonb_set(v_result, '{result}', jsonb_set(v_item, '{venues}', v_venues));
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_drink_history_item_i18n(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_drink_history_item_i18n(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.search_public_taplist_i18n(
  p_city text DEFAULT NULL,
  p_query text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_result jsonb := public.search_public_taplist(p_city, p_query); v_items jsonb;
BEGIN
  SELECT coalesce(jsonb_agg(item || jsonb_build_object(
    'name_en', CASE WHEN dp.id IS NULL THEN NULL ELSE dp.name_en END,
    'beer_style_en', CASE WHEN dp.beer_style_en_status = 'approved' THEN dp.beer_style_en END,
    'brewery_en', dc.canonical_name_en,
    'country', dc.country,
    'country_en', dc.country_en,
    'origin_region', dc.origin_region,
    'origin_region_en', dc.origin_region_en,
    'origin_city', dc.origin_city,
    'origin_city_en', dc.origin_city_en,
    'tenant_display_name_en', t.display_name_en
  ) ORDER BY ord), '[]'::jsonb)
  INTO v_items
  FROM jsonb_array_elements(coalesce(v_result->'results', '[]'::jsonb)) WITH ORDINALITY AS rows(item, ord)
  LEFT JOIN public.drink_products dp ON dp.id = nullif(item->>'product_id', '')::uuid AND dp.status = 'active'
  LEFT JOIN public.drink_companies dc ON dc.id = dp.company_id AND dc.status = 'active'
  LEFT JOIN public.tenants t ON t.id = nullif(item->>'tenant_id', '')::uuid;
  RETURN jsonb_set(v_result, '{results}', v_items);
END;
$$;

REVOKE ALL ON FUNCTION public.search_public_taplist_i18n(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_public_taplist_i18n(text, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_public_taplist_brewery_i18n(
  p_city text DEFAULT NULL,
  p_brewery text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_result jsonb := public.get_public_taplist_brewery(p_city, p_brewery); v_items jsonb;
BEGIN
  SELECT coalesce(jsonb_agg(item || jsonb_build_object(
    'name_en', CASE WHEN dp.id IS NULL THEN NULL ELSE dp.name_en END,
    'beer_style_en', CASE WHEN dp.beer_style_en_status = 'approved' THEN dp.beer_style_en END,
    'brewery_en', dc.canonical_name_en
  ) ORDER BY ord), '[]'::jsonb)
  INTO v_items
  FROM jsonb_array_elements(coalesce(v_result->'results', '[]'::jsonb)) WITH ORDINALITY AS rows(item, ord)
  LEFT JOIN public.drink_products dp ON dp.id = nullif(item->>'product_id', '')::uuid AND dp.status = 'active'
  LEFT JOIN public.drink_companies dc ON dc.id = dp.company_id AND dc.status = 'active';
  RETURN jsonb_set(v_result, '{results}', v_items);
END;
$$;

REVOKE ALL ON FUNCTION public.get_public_taplist_brewery_i18n(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_taplist_brewery_i18n(text, text) TO anon, authenticated;

-- Feed export is additive: ranking inputs and Reason evidence are unchanged.
CREATE OR REPLACE FUNCTION public.intelligence_export_snapshot_v1(p_scope text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_data jsonb; v_counts jsonb;
BEGIN
  IF p_scope='catalog' THEN
    IF EXISTS(SELECT 1 FROM public.taplist_public_cities c WHERE c.is_enabled AND c.city_code IS NULL) THEN
      RAISE EXCEPTION 'CITY_MAPPING_INCOMPLETE';
    END IF;
    v_data := public.ci_get_cities_v1() || jsonb_build_object('active_cycles',coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'session_id',s.session_id,'city_code',city.city_code,
        'tenant_id',t.id,'tenant_slug',t.slug,'tenant_name',coalesce(nullif(trim(t.display_name),''),t.name),
        'tenant_name_en',nullif(trim(t.display_name_en),''),
        'source_drink_id',d.id,'product_id',d.product_id,
        'beer_name',CASE WHEN d.product_id IS NULL THEN d.name ELSE coalesce(nullif(trim(d.display_name),''),dp.name,d.name) END,
        'beer_name_en',CASE WHEN d.product_id IS NULL THEN NULL ELSE nullif(trim(dp.name_en),'') END,
        'brewery',coalesce(nullif(trim(dp.brewery),''),nullif(trim(dp.brand_name),''),nullif(trim(bp.brewery),''),nullif(trim(d.brand_name),'')),
        'brewery_en',nullif(trim(dc.canonical_name_en),''),
        'style',coalesce(nullif(trim(dp.beer_style),''),nullif(trim(bp.beer_style),'')),
        'style_en',CASE WHEN d.product_id IS NOT NULL AND dp.beer_style_en_status='approved' THEN nullif(trim(dp.beer_style_en),'') END,
        'image_url',CASE WHEN d.product_id IS NULL THEN nullif(trim(d.image_url),'') ELSE coalesce(nullif(trim(d.image_url),''),nullif(trim(dp.image_url),'')) END,
        'current_cycle_started_at',s.started_at,'ended_at',s.ended_at,'accuracy',s.accuracy,'canceled',coalesce(s.canceled,false),
        'public_tenant',true,'public_category',true,'public_drink',true,'tap_assigned',true,'public_status',d.public_status
      ) ORDER BY t.id,d.id,s.session_id)
      FROM public.tap_lifecycle_sessions_v1 s
      JOIN public.drinks d ON d.id=s.drink_id AND d.tenant_id=s.tenant_id
      JOIN public.tenants t ON t.id=d.tenant_id
      JOIN public.categories c ON c.id=d.category_id AND c.tenant_id=t.id
      JOIN public.taplist_public_cities city ON city.city=t.city AND city.is_enabled AND city.city_code IS NOT NULL
      LEFT JOIN public.drink_products dp ON dp.id=d.product_id
      LEFT JOIN public.drink_companies dc ON dc.id=dp.company_id AND dc.status='active'
      LEFT JOIN public.drink_beer_profiles bp ON bp.drink_id=d.id
      WHERE s.ended_at IS NULL AND s.canceled IS NOT TRUE AND s.accuracy='exact' AND s.started_at IS NOT NULL
        AND t.status='active' AND t.is_public_visible
        AND c.enabled AND c.is_public_visible AND d.enabled AND d.is_public_visible
        AND d.public_sort_order>=1 AND d.public_status IN ('new','available','low')
        AND (d.product_id IS NULL OR dp.status='active')
    ),'[]'::jsonb));
  ELSIF p_scope='consumer' THEN
    v_data := jsonb_build_object(
      'user_beers',coalesce((SELECT jsonb_agg(jsonb_build_object(
        'id',l.id,'user_id',l.user_id,'product_id',l.product_id,'provisional_drink_id',l.provisional_drink_id,
        'style',coalesce(nullif(trim(dp.beer_style),''),nullif(trim(bp.beer_style),''))
      ) ORDER BY l.id) FROM public.user_drink_lights l
      LEFT JOIN public.drink_products dp ON dp.id=l.product_id
      LEFT JOIN public.drink_beer_profiles bp ON bp.drink_id=l.provisional_drink_id),'[]'::jsonb),
      'venue_experiences',coalesce((SELECT jsonb_agg(jsonb_build_object(
        'id',v.id,'user_id',v.user_id,'product_id',l.product_id,'provisional_drink_id',l.provisional_drink_id,
        'tenant_id',v.tenant_id,'source_drink_id',v.source_drink_id,'first_drank_at',v.first_drank_at,
        'created_at',v.created_at,'style',null
      ) ORDER BY v.id) FROM public.user_drink_venues v JOIN public.user_drink_lights l ON l.id=v.light_id AND l.user_id=v.user_id),'[]'::jsonb),
      'follows',coalesce((SELECT jsonb_agg(jsonb_build_object('user_id',user_id,'tenant_id',tenant_id) ORDER BY user_id,tenant_id) FROM public.user_bar_follows),'[]'::jsonb),
      'consumer_profiles',coalesce((SELECT jsonb_agg(jsonb_build_object('user_id',user_id,'home_city_code',home_city_code) ORDER BY user_id) FROM public.user_profiles),'[]'::jsonb)
    );
  ELSE RAISE EXCEPTION 'INVALID_EXPORT_SCOPE';
  END IF;
  SELECT jsonb_object_agg(key,jsonb_array_length(value)) INTO v_counts FROM jsonb_each(v_data);
  RETURN v_data || jsonb_build_object('schema_version',1,'export_id',gen_random_uuid(),'scope',p_scope,
    'source_as_of',statement_timestamp(),'complete',true,'counts',v_counts);
END;
$$;

REVOKE ALL ON FUNCTION public.intelligence_export_snapshot_v1(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.intelligence_export_snapshot_v1(text) TO service_role;
