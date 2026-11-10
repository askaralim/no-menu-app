// Display-only Chinese labels for the reviewed V2 vocabulary; no normalization or matching rules.
// Explicit granularity: it is not inferred from a key suffix or the bridge-parent list.
// Change REASON_VERSION whenever these labels or their semantics change.
const broad = {
  'ipa.generic':'IPA类酒', 'pilsner.generic':'皮尔森类酒', 'lager.generic':'拉格类酒',
  'bock.generic':'博克类酒', 'pale_ale.generic':'淡色艾尔类酒', 'sour.generic':'酸艾尔类酒',
  'stout.generic':'世涛类酒', 'porter.generic':'波特类酒', 'wheat.generic':'小麦啤酒类',
  'wild.generic':'野菌艾尔类酒', 'english.bitter':'英式苦啤类酒',
  'lager.dark':'深色拉格类酒', 'sour.wheat':'酸小麦啤酒类', 'sour.smoothie':'果泥及甜品酸啤类酒',
  'cider.generic':'西打类酒', 'mead.generic':'蜂蜜酒类', 'kombucha.generic':'康普茶类饮品',
  'hard_seltzer.generic':'硬苏打类酒', 'sake.generic':'清酒类酒',
  'non_alcoholic.juice':'果汁类饮品', 'non_alcoholic.tea':'茶类饮品', 'other.generic':'其他饮品类',
  'amber_red_brown.amber':'琥珀艾尔类酒', 'amber_red_brown.red':'红色艾尔类酒',
  'amber_red_brown.brown':'棕色艾尔类酒', 'lager.amber':'琥珀拉格类酒',
}
const specific = {
  'ipa.west_coast':'西海岸IPA', 'ipa.hazy':'浑浊IPA', 'ipa.american':'美式IPA', 'ipa.sour':'酸IPA',
  'ipa.rye':'黑麦IPA', 'ipa.black':'黑色IPA', 'ipa.cold':'冷IPA', 'ipa.white':'白IPA',
  'ipa.belgian':'比利时IPA', 'ipa.english':'英式IPA', 'ipa.red':'红IPA',
  'pilsner.german':'德式皮尔森', 'pilsner.czech':'捷克皮尔森', 'pilsner.italian':'意大利皮尔森',
  'lager.helles':'德式清亮拉格', 'lager.rice':'米拉格', 'lager.hoppy':'酒花拉格',
  'lager.california_common':'加州蒸汽啤酒', 'lager.marzen':'三月拉格', 'lager.kellerbier':'窖藏拉格',
  'lager.vienna':'维也纳拉格', 'lager.mexican':'墨西哥拉格', 'lager.festbier':'德式节庆拉格',
  'lager.dortmunder_export':'多特蒙德出口拉格', 'lager.czech_amber':'捷克琥珀拉格',
  'kolsch.generic':'科隆啤酒', 'pale_ale.american':'美式淡色艾尔', 'pale_ale.blonde':'金色艾尔',
  'saison.saison':'赛松', 'saison.farmhouse':'农舍艾尔', 'wild.lambic':'兰比克', 'wild.gueuze':'贵兹',
  'sour.fruited':'水果酸艾尔', 'sour.gose':'古斯', 'sour.berliner_weisse':'柏林酸小麦',
  'sour.flanders_red':'法兰德斯红艾尔', 'stout.imperial':'帝国世涛', 'stout.milk':'牛奶世涛',
  'stout.dry':'干世涛', 'stout.oatmeal':'燕麦世涛', 'stout.foreign_extra':'出口世涛',
  'porter.english':'英式波特', 'porter.baltic':'波罗的海波特',
  'english.esb':'英式特级苦啤', 'english.mild':'英式淡味艾尔', 'english.ordinary':'英式普通苦啤',
  'english.best':'英式优质苦啤', 'strong_ale.old':'陈年艾尔', 'strong_ale.barleywine':'大麦酒',
  'belgian.blond':'比利时金色艾尔', 'belgian.dubbel':'比利时双料', 'belgian.tripel':'比利时三料',
  'belgian.quad':'比利时四料', 'wheat.witbier':'比利时小麦', 'wheat.hefeweizen':'德式酵母小麦',
  'bock.helles':'浅色博克', 'bock.doppel':'双料博克', 'bock.weizen':'小麦博克',
}
export const reasonLabels = Object.freeze(Object.fromEntries([
  ...Object.entries(broad).map(([key,label])=>[key,Object.freeze({label,granularity:'broad'})]),
  ...Object.entries(specific).map(([key,label])=>[key,Object.freeze({label,granularity:'specific'})]),
]))
