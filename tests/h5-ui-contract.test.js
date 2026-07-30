const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");

const source = readFileSync(
  join(__dirname, "..", "preview", "preview.js"),
  "utf8"
);
const styles = readFileSync(
  join(__dirname, "..", "preview", "preview.css"),
  "utf8"
);
const previewServer = readFileSync(
  join(__dirname, "..", "tools", "serve-preview.js"),
  "utf8"
);

test("首页始终提供最近记录空状态", () => {
  assert.match(source, /<h2>最近记录<\/h2>/);
  assert.match(source, /还没有最近记录/);
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

test("立即记录入口固定在首屏偏下的单手操作区", () => {
  assert.match(source, /<section class="home-first-view">/);
  assert.match(styles, /\.record-zone\s*\{[\s\S]*margin-top: auto/);
  assert.match(source, /刚刚喂过？/);
  assert.match(styles, /100svh/);
});

test("最近记录使用最多五张横向卡片并保留查看全部入口", () => {
  const recentPosition = source.indexOf('class="home-recent"');
  const summaryPosition = source.indexOf('class="home-summary"');
  const recordPosition = source.indexOf('class="record-zone"');

  assert.ok(recentPosition >= 0);
  assert.ok(recentPosition < summaryPosition);
  assert.ok(summaryPosition < recordPosition);
  assert.match(source, /foods\.slice\(0, 5\)/);
  assert.match(source, /class="recent-food-card"/);
  assert.match(source, /class="recent-card-media"/);
  assert.match(source, /class="recent-feedback-tag/);
  assert.match(source, /data-recent-carousel/);
  assert.match(source, /const threshold = 48/);
  assert.match(styles, /\.recent-carousel\s*\{[\s\S]*overflow-x: auto/);
  assert.match(styles, /scroll-snap-type: x proximity/);
  assert.match(
    styles,
    /\.recent-food-card\s*\{[\s\S]*width: calc\(43\.4783% - 0\.87px\);[\s\S]*flex-basis: calc\(43\.4783% - 0\.87px\)/
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
  assert.match(source, /CAT_EAT_H5_CAT_PROFILE_V1/);
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
  assert.match(source, /\["home", "home", "首页"\]/);
  assert.match(source, /\["record", "add", "立即记录"\]/);
  assert.match(source, /\["library", "list", "补货清单"\]/);
  assert.doesNotMatch(source, /<svg/);
  assert.doesNotMatch(source, /function recordHub\(\)/);
  assert.doesNotMatch(source, /record: recordHub/);
  assert.match(source, /data-record-trigger="nav"/);
  assert.match(source, /aria-label="立即记录食物"/);
  assert.match(source, /data-nav="\$\{key\}"/);
  assert.match(source, /data-open-picker/);
  assert.match(styles, /--nav-content-height: 48px/);
  assert.match(styles, /--nav-active: #34c759/);
  assert.match(
    styles,
    /\.bottom-nav\s*\{[\s\S]*min-height: calc\(48px \+ env\(safe-area-inset-bottom\)\)/
  );
  assert.match(styles, /\.icon-home\s*\{[\s\S]*ddmc-home\.svg/);
  assert.match(styles, /\.icon-add\s*\{[\s\S]*ddmc-add\.svg/);
  assert.match(styles, /\.icon-list\s*\{[\s\S]*ddmc-list\.svg/);
  assert.match(styles, /\.nav-item\.active \.nav-icon-shell\s*\{[\s\S]*background: var\(--lime-soft\)/);
  assert.match(styles, /\.nav-icon-shell,[\s\S]*border-radius: 8px/);
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

test("移动端操作提供触控尺寸、粘性主操作和减少动态效果", () => {
  assert.match(styles, /\.type-option span\s*\{[\s\S]*min-height: 44px/);
  assert.match(styles, /\.sticky-action\s*\{[\s\S]*position: sticky/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
});
