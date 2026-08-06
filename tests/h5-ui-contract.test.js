const test = require("node:test");
const assert = require("node:assert/strict");
const { existsSync, readFileSync } = require("node:fs");
const { join } = require("node:path");

const source = readFileSync(
  join(__dirname, "..", "preview", "preview.js"),
  "utf8"
);
const styles = readFileSync(
  join(__dirname, "..", "preview", "preview.css"),
  "utf8"
);
const dataStoreSource = readFileSync(
  join(__dirname, "..", "utils", "data-store.js"),
  "utf8"
);
const previewServer = readFileSync(
  join(__dirname, "..", "tools", "serve-preview.js"),
  "utf8"
);

test("首页始终提供最近记录信息流与空状态", () => {
  assert.match(source, /id="recent-records-title">最近记录<\/h2>/);
  assert.match(source, /还没有最近记录/);
  assert.match(source, /已经到底了哟/);
});

test("一级页面和最近区块不展示副标题", () => {
  assert.doesNotMatch(source, /新品拍一下，吃过的点一下，十秒记完/);
  assert.doesNotMatch(source, /最近喂过的，横滑查看/);
  assert.doesNotMatch(source, /先选这次是在尝新，还是继续记录老朋友/);
  assert.doesNotMatch(source, /点一款就能继续记录/);
  assert.doesNotMatch(source, /买之前看一眼，再去找当前的车/);
});

test("食物照片缺失或加载失败时使用猫猫头", () => {
  assert.match(source, /uiIcon\("cat", "cat-fallback", "猫猫头占位图"\)/);
  assert.match(source, /data-image-fallback/);
  assert.match(source, /element\.src = ICONS\.cat/);
  assert.match(source, /phosphor-cat-thin\.svg/);
});

test("首页问候读取用户设置的猫猫昵称", () => {
  assert.match(source, /const catProfile = readCatProfile\(\)/);
  assert.match(source, /const nickname = formatCatNickname\(catProfile\.nickname\)/);
  assert.match(source, /<span>Hi \$\{escapeHtml\(nickname\)\}<\/span>/);
  assert.match(source, /<span>这次吃的怎么样？<\/span>/);
  assert.match(source, /return nickname \|\| "噜噜"/);
  assert.match(
    styles,
    /\.home-greeting\s*\{[\s\S]*margin: 32px 0 16px;[\s\S]*color: #1a1a1a;[\s\S]*font-size: 28px;[\s\S]*font-weight: 500/
  );
});

test("最近记录按时间排序并使用双列九像素信息流", () => {
  assert.match(source, /const leftColumn = foods\.filter\(\(_, index\) => index % 2 === 0\)/);
  assert.match(source, /const rightColumn = foods\.filter\(\(_, index\) => index % 2 === 1\)/);
  assert.match(source, /class="recent-food-grid"/);
  assert.match(source, /class="recent-food-column"/);
  assert.match(source, /class="recent-food-card"/);
  assert.match(source, /class="recent-card-media /);
  assert.match(source, /class="recent-feedback-tag/);
  assert.match(
    styles,
    /\.recent-food-grid\s*\{[\s\S]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);[\s\S]*gap: 9px/
  );
  assert.match(
    styles,
    /\.recent-food-column\s*\{[\s\S]*flex-direction: column;[\s\S]*gap: 9px/
  );
});

test("首页食品卡遵循图片、标题、相关点、反馈和日期规格", () => {
  assert.match(source, /food\.specification \|\| ""/);
  assert.match(source, /name="specification"/);
  assert.match(source, /specification: String\(data\.get\("specification"\)/);
  assert.match(source, /FOOD_TYPES\[food\.foodType\]/);
  assert.match(source, /food\.texture \|\| "质地待补充"/);
  assert.match(source, /food\.flavor \|\| "肉类待补充"/);
  assert.match(source, /eager: "主动吃"/);
  assert.match(source, /okay: "正常接受"/);
  assert.match(source, /unknown: "没法判断"/);
  assert.match(source, /formatCardDate\(recordedAt\)/);
  assert.match(
    styles,
    /\.home-screen \.recent-card-media\.is-fallback\s*\{[\s\S]*height: 140px/
  );
  assert.match(
    styles,
    /\.home-screen \.recent-card-media\.has-photo img\.photo\s*\{[\s\S]*width: 100%;[\s\S]*height: auto/
  );
  assert.match(
    styles,
    /\.home-screen \.recent-card-body\s*\{[\s\S]*padding: 9px/
  );
  assert.match(
    styles,
    /\.home-screen \.recent-card-title\s*\{[\s\S]*font-size: 14px;[\s\S]*font-weight: 500;[\s\S]*-webkit-line-clamp: 2/
  );
  assert.match(
    styles,
    /\.home-screen \.recent-card-meta\s*\{[\s\S]*margin: 0 0 9px;[\s\S]*color: #808080;[\s\S]*font-size: 11px/
  );
  assert.match(styles, /\.home-screen \.recent-card-type\s*\{[\s\S]*color: #0088df/);
  assert.match(
    styles,
    /\.home-screen \.recent-feedback-tag\s*\{[\s\S]*height: 18px;[\s\S]*padding: 0 6px;[\s\S]*border-radius: 3px;[\s\S]*font-size: 11px/
  );
  assert.match(styles, /\.home-screen \.feedback-eager\s*\{[\s\S]*color: #00b740/);
  assert.match(styles, /\.home-screen \.feedback-okay\s*\{[\s\S]*color: #009bff/);
  assert.match(styles, /\.home-screen \.feedback-reluctant\s*\{[\s\S]*color: #ffb51c/);
  assert.match(styles, /\.home-screen \.feedback-bury\s*\{[\s\S]*color: #ff3133/);
  assert.match(
    styles,
    /\.home-screen \.recent-card-time\s*\{[\s\S]*color: #4d4d4d;[\s\S]*font-size: 12px/
  );
});

test("H5 以 390×844 为设计基准并自适应宽高和安全区", () => {
  assert.match(styles, /--design-reference-width: 390px/);
  assert.match(styles, /--design-reference-height: 844px/);
  assert.match(styles, /--screen-gutter: 16px/);
  assert.match(styles, /100dvh/);
  assert.match(styles, /@media \(max-width: 350px\)/);
  assert.match(styles, /@media \(orientation: portrait\) and \(max-height: 620px\)/);
  assert.match(styles, /@media \(orientation: landscape\) and \(max-height: 500px\)/);
});

test("补货清单使用状态 Tab 和按需出现的线框类型胶囊", () => {
  assert.match(source, /libraryGroup: "buy"/);
  assert.match(source, /libraryType: ""/);
  assert.match(
    source,
    /const FOOD_TYPE_ORDER = \[\s*"staple_can",\s*"snack_can",\s*"freeze_dried",\s*"cat_treat",\s*"cat_food",\s*"other"\s*\]/
  );
  assert.match(source, /cat_food: "猫粮"/);
  assert.match(source, /class="library-tabs" role="tablist"/);
  assert.match(source, /role="tab"/);
  assert.match(source, /class="library-type-chip/);
  assert.match(source, /class="library-type-chip-label"/);
  assert.match(source, /aria-pressed=/);
  assert.doesNotMatch(source, /library-filter-heading/);
  assert.doesNotMatch(source, /不选即全部/);
  assert.match(source, /availableTypes = FOOD_TYPE_ORDER\.filter/);
  assert.doesNotMatch(source, /<select class="filter-select" data-library-type/);
  assert.match(styles, /\.library-type-chip\s*\{[\s\S]*min-height: 44px/);
  assert.match(
    styles,
    /\.library-type-chip-label\s*\{[\s\S]*padding: 3px 6px;[\s\S]*border-radius: 3px;[\s\S]*font-size: 12px;[\s\S]*line-height: 14px/
  );
  assert.match(
    styles,
    /\.library-type-chip\.active \.library-type-chip-label\s*\{[\s\S]*box-shadow: inset 0 0 0 1px/
  );
});

test("补货清单顶部展示单猫头像和可编辑昵称，商品使用类型包装图标", () => {
  assert.match(dataStoreSource, /CAT_EAT_H5_CAT_PROFILE_V1/);
  assert.match(source, /DEFAULT_CAT_AVATAR = "\/assets\/cat-profile-default\.jpg"/);
  assert.match(source, /class="library-cat-profile"/);
  assert.match(source, /class="library-profile-center"/);
  assert.match(source, /class="library-cat-avatar"/);
  assert.match(source, /class="library-avatar-camera"/);
  assert.match(source, /formatCatNickname\(catProfile\.nickname\)/);
  assert.match(source, /data-profile-name/);
  assert.match(source, /编辑昵称/);
  assert.doesNotMatch(source, /编辑年龄/);
  assert.match(source, /data-open-profile/);
  assert.match(source, /querySelectorAll\("\[data-open-profile\]"\)/);
  assert.match(source, /data-profile-photo-input/);
  assert.match(source, /id="cat-profile-form"/);
  assert.match(source, /class="library-sheet"/);
  assert.match(source, /productThumbnail: true/);
  assert.match(source, /uiIcon\(iconName, "product-fallback", label\)/);
  assert.match(source, /phosphor-cylinder-light\.svg/);
  assert.match(styles, /\.library-cat-profile\s*\{[\s\S]*min-height: 380px;[\s\S]*linear-gradient\(128deg, #edf8ff/);
  assert.match(styles, /\.library-cat-profile::before,[\s\S]*filter: blur\(46px\)/);
  assert.match(styles, /\.library-cat-avatar\s*\{[\s\S]*width: 112px;[\s\S]*border-radius: 50%/);
  assert.match(styles, /\.library-profile-stats\s*\{[\s\S]*backdrop-filter: blur\(18px\) saturate\(150%\)/);
  assert.match(styles, /\.library-sheet\s*\{[\s\S]*margin-top: -30px;[\s\S]*border-radius: 30px 30px 0 0;[\s\S]*backdrop-filter: blur\(28px\) saturate\(145%\)/);
  assert.match(styles, /\.product-thumb-staple_can,[\s\S]*\.product-thumb-snack_can/);
  assert.match(styles, /\.icon-can\s*\{[\s\S]*phosphor-cylinder-light\.svg/);
  assert.match(styles, /\.food-row\s*\{[\s\S]*min-width: 0;[\s\S]*max-width: 100%/);
});

test("H5 UI 仅通过统一数据访问层读写持久数据", () => {
  assert.match(source, /const dataStore = window\.CatEatData/);
  assert.match(source, /await dataStore\.initialize/);
  assert.match(source, /return dataStore\.getFoods\(\)/);
  assert.match(source, /return dataStore\.getCatProfile\(\)/);
  assert.doesNotMatch(source, /localStorage/);
  assert.doesNotMatch(source, /indexedDB/);
  assert.match(dataStoreSource, /const DB_NAME = "cat-eat-local"/);
  assert.match(dataStoreSource, /db\.createObjectStore\("foods"/);
  assert.match(dataStoreSource, /db\.createObjectStore\("results"/);
  assert.match(dataStoreSource, /db\.createObjectStore\("assets"/);
  assert.match(dataStoreSource, /migration\.localStorageV2/);
});

test("全局使用 FAFAFA 画布和克制的彩色弥散背景", () => {
  const diffuseLayers = styles.match(/radial-gradient\(/g) || [];

  assert.match(styles, /--canvas: #fafafa/);
  assert.match(styles, /--paper: rgba\(255, 255, 255, 0\.82\)/);
  assert.equal(diffuseLayers.length, 3);
  assert.match(styles, /rgba\(151, 190, 255, 0\.1\)/);
  assert.match(styles, /rgba\(135, 225, 178, 0\.07\)/);
  assert.match(styles, /rgba\(255, 190, 214, 0\.055\)/);
});

test("全部任务页面共用轻盈彩色背景、玻璃表面和 Apple 语义色", () => {
  assert.match(styles, /--system-blue: #007aff/);
  assert.match(styles, /--surface-glass: rgba\(255, 255, 255, 0\.68\)/);
  assert.match(styles, /--glass-border: rgba\(255, 255, 255, 0\.86\)/);
  assert.match(
    styles,
    /\.screen:not\(\.library-screen\)\s*\{[\s\S]*linear-gradient\(150deg,[\s\S]*isolation: isolate/
  );
  assert.match(
    styles,
    /\.screen:not\(\.library-screen\)::before,[\s\S]*filter: blur\(52px\)/
  );
  assert.match(
    styles,
    /\.recent-food-card,[\s\S]*\.record-launch-card\s*\{[\s\S]*backdrop-filter: blur\(20px\) saturate\(145%\)/
  );
  assert.match(
    styles,
    /\/\* Final app-wide normalization\.[\s\S]*\.primary-button,[\s\S]*min-height: 48px/
  );
  assert.match(
    styles,
    /\/\* Final app-wide normalization\.[\s\S]*\.modal-sheet\s*\{[\s\S]*backdrop-filter: blur\(30px\) saturate\(155%\)/
  );
  assert.match(styles, /\.photo-upload-icon\s*\{[\s\S]*color: var\(--system-blue\)/);
});

test("普通组件不使用外投影，只给头像和浮层保留轻量高度", () => {
  assert.match(
    styles,
    /\/\* Reduced elevation:[\s\S]*\.library-sheet \.food-list\s*\{[\s\S]*box-shadow: none/
  );
  assert.match(
    styles,
    /\/\* Reduced elevation:[\s\S]*\.library-cat-avatar\s*\{[\s\S]*0 10px 28px rgba\(76, 91, 130, 0\.12\)/
  );
  assert.match(
    styles,
    /\/\* Reduced elevation:[\s\S]*\.modal-sheet\s*\{[\s\S]*0 18px 48px rgba\(45, 55, 79, 0\.14\)/
  );
});

test("底部导航使用统一线描图标、全局记录动作和独立安全区", () => {
  assert.match(source, /\["home", "首页"\]/);
  assert.match(source, /\["record", "添加记录"\]/);
  assert.match(source, /\["library", "清单"\]/);
  assert.doesNotMatch(source, /<svg/);
  assert.doesNotMatch(source, /function recordHub\(\)/);
  assert.doesNotMatch(source, /record: recordHub/);
  assert.match(source, /data-nav="add"/);
  assert.match(source, /aria-label="添加记录"/);
  assert.match(source, /data-nav="\$\{key\}"/);
  assert.match(source, /data-open-picker/);
  assert.match(source, /function navStateIcon\(key, active\)/);
  assert.match(source, /nav-\$\{iconNames\[key\]\}-\$\{stateName\}\.svg/);
  assert.match(source, /const destination = key === "record" \? "add" : key/);
  assert.match(styles, /--nav-content-height: 48px/);
  assert.match(styles, /--nav-active: #4571fc/);
  assert.match(
    styles,
    /\/\* Bottom navigation · 390 × 48 reference plus the device safe area\.[\s\S]*\.bottom-nav\s*\{[\s\S]*height: calc\(var\(--nav-content-height\) \+ env\(safe-area-inset-bottom\)\);[\s\S]*padding: 0 0 env\(safe-area-inset-bottom\);[\s\S]*background: #f7f7f7;[\s\S]*box-shadow: inset 0 0\.5px 0 #e6e6e6/
  );
  assert.match(
    styles,
    /\/\* Bottom navigation · 390 × 48 reference plus the device safe area\.[\s\S]*\.nav-item,[\s\S]*color: #4d4d4d;[\s\S]*font-size: 11px;[\s\S]*line-height: 14px/
  );
  assert.match(
    styles,
    /\/\* Bottom navigation · 390 × 48 reference plus the device safe area\.[\s\S]*\.nav-item\.active,[\s\S]*color: #4571fc/
  );
  assert.match(styles, /\.nav-state-icon\s*\{[\s\S]*height: 32px/);
  [
    "nav-home-active.svg",
    "nav-home-default.svg",
    "nav-add-active.svg",
    "nav-add-default.svg",
    "nav-can-active.svg",
    "nav-can-default.svg"
  ].forEach((file) => {
    assert.ok(existsSync(join(__dirname, "..", "assets", "icons", file)));
  });
  assert.match(previewServer, /"\.svg": "image\/svg\+xml; charset=utf-8"/);
});

test("立即记录使用最近四款优先且可搜索展开的统一选择器", () => {
  assert.doesNotMatch(source, /function recordHub\(\)/);
  assert.doesNotMatch(source, /<main class="screen record-screen">/);
  assert.match(source, /foods\.slice\(0, 4\)/);
  assert.match(source, /data-record-sheet/);
  assert.match(source, /data-picker-search/);
  assert.match(source, /placeholder="搜索品牌、口味或类型"/);
  assert.match(source, /data-expand-picker/);
  assert.match(source, /data-picker-type/);
  assert.match(source, /class="picker-food-grid"/);
  assert.match(source, /拍一款新品/);
  assert.match(source, /最近喂过/);
  assert.match(source, /sheetStartY - endY > 42/);
  assert.match(styles, /\.record-picker-sheet\.expanded\s*\{[\s\S]*max-height: calc\(100dvh - 20px\)/);
  assert.match(styles, /\.picker-food-grid\s*\{[\s\S]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(styles, /\.record-type-chip\.active\s*\{[\s\S]*color: #16763a/);
});

test("添加记录直达新品页并为已有产品字段提供联想", () => {
  assert.match(source, /<strong class="topbar-title">\$\{escapeHtml\(title\)\}<\/strong>/);
  assert.match(source, /topbar\(editing \? "编辑食物" : "记一款新品"\)/);
  assert.match(source, /function autocompleteSuggestions\(field, query\)/);
  assert.match(source, /listFoods\(\)\.forEach\(\(food\) =>/);
  assert.match(source, /AUTOCOMPLETE_PLACEHOLDERS/);
  assert.match(source, /autocompleteField\("brand", "品牌"/);
  assert.match(source, /autocompleteField\("name", "系列或名称"/);
  assert.match(source, /autocompleteField\("flavor", "口味 \/ 肉源"/);
  assert.match(source, /role="listbox"/);
  assert.match(source, /data-autocomplete-option/);
  assert.match(source, /data-autocomplete-value=/);
  assert.match(source, /input\.focus\(\)/);
  assert.match(styles, /\.autocomplete-menu\s*\{[\s\S]*position: absolute/);
  assert.match(styles, /\.autocomplete-menu\[hidden\]\s*\{[\s\S]*display: none/);
  assert.match(styles, /\.autocomplete-option\s*\{[\s\S]*min-height: 44px/);
  assert.match(styles, /\.autocomplete-option:focus-visible/);
});

test("添加页会用本地数据提示可能重复的产品", () => {
  assert.match(source, /function normalizeProductText\(value\)/);
  assert.match(source, /function productTextVariants\(value\)/);
  assert.match(source, /function findLikelyDuplicateFood\(values, excludeId = ""\)/);
  assert.match(
    source,
    /function refreshDuplicateFoodNotice\(form = document\.querySelector\("#food-form"\)\)/
  );
  assert.match(source, /data-duplicate-food-notice/);
  assert.match(source, /这款食物已经有记录/);
  assert.match(source, /查看已有记录/);
  assert.match(source, /route\("detail", \{ id: button\.dataset\.duplicateFood \}\)/);
  assert.match(styles, /\.duplicate-food-notice\s*\{[\s\S]*grid-template-columns/);
  assert.match(styles, /\.duplicate-food-notice\[hidden\]\s*\{[\s\S]*display: none/);
});

test("质地使用页面内选择器而不是原生下拉菜单", () => {
  assert.match(
    source,
    /const TEXTURE_OPTIONS = \["肉泥 \/ 慕斯", "肉块", "肉丝", "冻干块", "其他"\];/
  );
  assert.match(source, /function textureField\(value\)/);
  assert.match(source, /data-texture-trigger/);
  assert.match(source, /data-texture-menu/);
  assert.match(source, /data-texture-option=/);
  assert.match(source, /function chooseTextureOption\(option\)/);
  assert.match(source, /function bindTextureSelect\(\)/);
  assert.match(source, /function positionTextureMenu\(\)/);
  assert.doesNotMatch(source, /<select name="texture">/);
  assert.match(styles, /\.custom-select-trigger\s*\{[\s\S]*min-height: 34px/);
  assert.match(styles, /\.custom-select-menu\s*\{[\s\S]*border-radius: 14px/);
  assert.match(styles, /\.custom-select-field\.opens-up \.custom-select-menu/);
  assert.match(styles, /\.custom-select-menu\[hidden\]\s*\{[\s\S]*display: none/);
  assert.match(styles, /\.custom-select-option\s*\{[\s\S]*min-height: 44px/);
});

test("移动端操作提供触控尺寸、粘性主操作和减少动态效果", () => {
  assert.match(styles, /\.type-option span\s*\{[\s\S]*min-height: 44px/);
  assert.match(styles, /\.sticky-action\s*\{[\s\S]*position: sticky/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
});
