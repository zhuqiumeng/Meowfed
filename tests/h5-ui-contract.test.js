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
const indexHtml = readFileSync(
  join(__dirname, "..", "preview", "index.html"),
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
const iphonePreview = readFileSync(
  join(__dirname, "..", "preview", "iphone15pro.html"),
  "utf8"
);

test("首页始终提供最近记录信息流与空状态", () => {
  assert.match(source, /id="recent-records-title">最近记录<\/h2>/);
  assert.match(source, /还没有最近记录/);
  assert.match(source, /已经到底了哟/);
  assert.doesNotMatch(source, /home-record-action|data-record-trigger="home-greeting"|记录已有食物/);
  assert.match(source, /class="primary-button recent-empty-primary"[\s\S]*data-nav="add">拍下第一款/);
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
    /\.home-greeting\s*\{[\s\S]*margin: 32px 0 16px;[\s\S]*color: #1a1a1a;[\s\S]*font-size: var\(--type-page-size\);[\s\S]*font-weight: var\(--type-weight-medium\)/
  );
});

test("最近记录保持读屏顺序并使用两列独立堆叠的九像素信息流", () => {
  assert.match(source, /class="recent-food-grid"/);
  assert.match(source, /\$\{foods\.map\(recentFoodCard\)\.join\(""\)\}/);
  assert.doesNotMatch(source, /leftColumn|rightColumn|recent-food-column/);
  assert.match(source, /class="recent-food-card"/);
  assert.match(source, /class="recent-card-media /);
  assert.match(source, /class="recent-feedback-tag/);
  assert.match(
    styles,
    /\.recent-food-grid\s*\{[\s\S]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);[\s\S]*gap: 9px/
  );
  assert.match(source, /function layoutRecentFoodGrid\([\s\S]*const column = index % 2;[\s\S]*columnHeights\[column\] \+= card\.getBoundingClientRect\(\)\.height \+ gap/);
  assert.match(source, /grid\.style\.height = `\$\{Math\.max\(\.\.\.columnHeights\) - gap\}px`/);
  assert.match(source, /new ResizeObserver\(scheduleRecentFeedLayout\)/);
  assert.match(styles, /\.recent-food-grid\.is-masonry\s*\{[\s\S]*position: relative;[\s\S]*display: block/);
  assert.match(styles, /\.recent-food-grid\.is-masonry \.recent-food-card\s*\{[\s\S]*position: absolute;[\s\S]*translate3d\(var\(--recent-card-x\), var\(--recent-card-y\), 0\)/);
  assert.match(styles, /\.home-screen \.recent-food-card,[\s\S]*transition: none/);
  assert.match(styles, /\.home-screen \.recent-food-grid:not\(\.is-masonry\) \.recent-food-card:active\s*\{[\s\S]*transform: none/);
  assert.match(styles, /\.home-screen \.recent-food-grid\.is-masonry \.recent-food-card:active\s*\{[\s\S]*translate3d\(var\(--recent-card-x\), var\(--recent-card-y\), 0\)/);
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
    /\.home-screen \.recent-card-title\s*\{[\s\S]*font-size: var\(--type-body-size\);[\s\S]*font-weight: var\(--type-weight-medium\);[\s\S]*-webkit-line-clamp: 2/
  );
  assert.match(
    styles,
    /\.home-screen \.recent-card-meta\s*\{[\s\S]*margin: 0 0 9px;[\s\S]*color: #808080;[\s\S]*font-size: var\(--type-label-size\)/
  );
  assert.match(styles, /\.home-screen \.recent-card-type\s*\{[\s\S]*color: #0088df/);
  assert.match(
    styles,
    /\.home-screen \.recent-feedback-tag\s*\{[\s\S]*height: var\(--tag-height\);[\s\S]*padding: 0 7px;[\s\S]*border-radius: var\(--tag-radius\);[\s\S]*font-size: var\(--type-label-size\);[\s\S]*font-weight: var\(--type-weight-semibold\)/
  );
  assert.match(source, /class="recent-feedback-tag status-tag feedback-/);
  assert.match(styles, /\.home-screen \.feedback-eager,[\s\S]*\.home-screen \.feedback-okay/);
  assert.match(styles, /\.home-screen \.feedback-reluctant/);
  assert.match(styles, /\.home-screen \.feedback-bury/);
  assert.match(
    styles,
    /\.home-screen \.recent-card-time\s*\{[\s\S]*color: #4d4d4d;[\s\S]*font-size: var\(--type-meta-size\)/
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
  assert.match(indexHtml, /apple-mobile-web-app-capable" content="yes"/);
  assert.match(indexHtml, /mobile-web-app-capable" content="yes"/);
  assert.match(indexHtml, /apple-mobile-web-app-status-bar-style" content="black-translucent"/);
  assert.match(indexHtml, /<html lang="zh-CN" data-screen="home">/);
  assert.match(indexHtml, /document\.documentElement\.dataset\.screen = screen/);
  assert.match(indexHtml, /html\[data-screen="library"\][\s\S]*linear-gradient\(128deg, #edf8ff/);
  assert.match(styles, /#app\s*\{[\s\S]*background-origin: border-box;[\s\S]*background-position: 0 0/);
  assert.match(styles, /\.screen:not\(\.library-screen\)\s*\{[\s\S]*background-origin: border-box;[\s\S]*background-position: 0 0/);
  assert.match(styles, /\.library-cat-profile\s*\{[\s\S]*background-origin: border-box;[\s\S]*background-position: 0 0/);
});

test("真机状态栏跟随当前页面顶部背景而不是外层灰色画布", () => {
  assert.match(source, /const PAGE_THEME_COLORS = \{[\s\S]*home: "#edf3ff"[\s\S]*library: "#edf8ff"[\s\S]*detail: "#ffffff"/);
  assert.match(source, /document\.documentElement\.dataset\.screen = screen/);
  assert.match(source, /document\.body\.dataset\.screen = screen/);
  assert.match(source, /meta\[name="theme-color"\][\s\S]*PAGE_THEME_COLORS\[screen\]/);
  assert.match(styles, /html\[data-screen="home"\],[\s\S]*body\[data-screen="home"\][\s\S]*--page-chrome-background:/);
  assert.match(styles, /html\[data-screen="library"\],[\s\S]*body\[data-screen="library"\][\s\S]*linear-gradient\(128deg, #edf8ff/);
  assert.match(styles, /html\[data-screen="add"\],[\s\S]*body\[data-screen="detail"\][\s\S]*--page-chrome-background: #ffffff/);
  assert.doesNotMatch(styles, /body::before\s*\{[\s\S]*height: var\(--safe-area-top\)/);
  assert.match(styles, /\.home-screen\s*\{[\s\S]*padding:[\s\S]*var\(--safe-area-top\)/);
  assert.match(styles, /\.library-cat-profile\s*\{[\s\S]*padding:[\s\S]*var\(--safe-area-top\)/);
  assert.match(styles, /\.fixed-page-shell\s*\{[\s\S]*background: #ffffff/);
  assert.doesNotMatch(styles, /html\s*\{[\s\S]*background: #f2f3f7/);
  assert.doesNotMatch(styles, /body\s*\{[\s\S]*background: #f2f3f7/);
});

test("详情内保存表现会回退原详情，快速记录则覆盖为详情", () => {
  assert.match(source, /const historyEntry = \{ screen: state\.screen \}/);
  assert.match(source, /if \(state\.screen === "feedback"\) \{[\s\S]*historyEntry\.from = prevScreen/);
  assert.match(source, /async function submitFeedback\(\)[\s\S]*history\.state\?\.from === "detail"[\s\S]*history\.back\(\)[\s\S]*route\("detail", \{ id: updated\.id \}, true\)/);
});

test("零反馈食物显示灰色未评价标签", () => {
  assert.match(source, /if \(!\(food\.results \|\| \[\]\)\.length\) \{[\s\S]*status-unrated[\s\S]*未评价/);
  assert.match(source, /const feedbackKey = latestRecordedResult\?\.outcome \|\| "unrated"/);
  assert.match(source, /unrated: "未评价"/);
  assert.match(styles, /\.status-unrated,[\s\S]*\.feedback-unrated,[\s\S]*background: var\(--gray-soft\)/);
});

test("反馈支持最多 120 字可选备注并写入结果", () => {
  assert.match(source, /data-feedback-note[\s\S]*maxlength="120"[\s\S]*placeholder="例如：加了冻干才愿意吃"/);
  assert.match(source, /note: state\.feedbackNote\.trim\(\)/);
  assert.match(source, /state\.feedbackNote = event\.currentTarget\.value\.slice\(0, 120\)/);
  assert.match(styles, /\.feedback-note-field textarea\s*\{[\s\S]*min-height: 72px;[\s\S]*font-size: var\(--type-control-size\);[\s\S]*font-weight: var\(--type-weight-regular\)/);
  const selectedOutcomeRules = [...styles.matchAll(/\.outcome-option\.selected\s*\{([^}]*)\}/g)].map((match) => match[1]);
  assert.ok(selectedOutcomeRules.length > 0);
  assert.ok(selectedOutcomeRules.every((rule) => !/inset 3px|brand-soft|lime-soft/.test(rule)));
  assert.match(styles, /\.outcome-option\.selected\s*\{[\s\S]*border-color: var\(--line\);[\s\S]*background: rgba\(255, 255, 255, 0\.94\);[\s\S]*box-shadow: none/);
});

test("清单状态 Tab 只接受横向触摸手势", () => {
  assert.match(styles, /\.library-tabs\s*\{[\s\S]*overflow-x: auto;[\s\S]*overflow-y: hidden;[\s\S]*overscroll-behavior-y: none;[\s\S]*touch-action: pan-x/);
});

test("直接打开 HTML 文件时显示本地服务器说明而不是白屏", () => {
  assert.match(source, /function renderFileProtocolNotice\(\)/);
  assert.match(source, /if \(location\.protocol === "file:"\)/);
  assert.match(source, /请通过本地预览打开/);
  assert.match(source, /npm run preview/);
  assert.match(source, /http:\/\/127\.0\.0\.1:4173\//);
  assert.match(styles, /\.file-preview-notice\s*\{[\s\S]*text-align: center/);
});

test("iPhone 15 Pro 样机使用 393×852 内容视口并按窗口等比缩放", () => {
  assert.match(iphonePreview, /width: 393px/);
  assert.match(iphonePreview, /height: 852px/);
  assert.match(iphonePreview, /class="dynamic-island"/);
  assert.match(iphonePreview, /class="status-bar"/);
  assert.match(iphonePreview, /class="status-time">9:41/);
  assert.match(iphonePreview, /title="猫吃了吗手机预览"/);
  assert.match(iphonePreview, /function fitDevice\(\)/);
  assert.match(iphonePreview, /const appParams = new URLSearchParams\(location\.search\)/);
  assert.match(iphonePreview, /appParams\.set\("screen", screen\)/);
  assert.match(iphonePreview, /appFrame\.src = `\.\.\/\?\$\{appParams\.toString\(\)\}`/);
  assert.match(iphonePreview, /const previewVersion = "34"/);
  assert.match(iphonePreview, /appParams\.set\("preview", previewVersion\)/);
  assert.match(iphonePreview, /--safe-area-top", "59px"/);
  assert.match(iphonePreview, /--preview-safe-area-bottom", "34px"/);
  assert.match(iphonePreview, /class="simulated-keyboard"/);
  assert.match(iphonePreview, /\.screen\.keyboard-open\.keyboard-resize iframe\s*\{[\s\S]*var\(--simulated-keyboard-height\)/);
  assert.match(iphonePreview, /function bindSimulatedKeyboard\(\)[\s\S]*focusin[\s\S]*data-mobile-keyboard[\s\S]*focusout/);
  assert.match(iphonePreview, /function keyboardUsesResizedViewport\(field\)[\s\S]*\[role="dialog"\], \.fixed-page-shell[\s\S]*!\["home", "library"\]\.includes\(page\)/);
  assert.match(iphonePreview, /classList\.toggle\("keyboard-resize", shouldResize\)[\s\S]*classList\.toggle\("keyboard-overlay", !shouldResize\)/);
  assert.match(iphonePreview, /setAppSafeAreaBottom\(shouldResize \? "0px" : "34px"\)/);
  assert.match(iphonePreview, /function hideSimulatedKeyboard\(\)[\s\S]*setAppSafeAreaBottom\("34px"\)/);
});

test("真机键盘区分表单缩放与一级页覆盖两种模式", () => {
  assert.match(styles, /--safe-area-bottom: var\([\s\S]*--runtime-safe-area-bottom,[\s\S]*--preview-safe-area-bottom,[\s\S]*env\(safe-area-inset-bottom, 0px\)/);
  assert.match(styles, /html\[data-mobile-keyboard-mode="overlay"\] \.bottom-nav\s*\{[\s\S]*translateY\(var\(--mobile-keyboard-overlap\)\)/);
  assert.match(source, /function keyboardUsesResizedViewport\(field\)[\s\S]*\[role="dialog"\], \.fixed-page-shell[\s\S]*!\["home", "library"\]\.includes\(page\)/);
  assert.match(source, /function syncMobileKeyboardViewport\(\)[\s\S]*shouldResize[\s\S]*--runtime-safe-area-bottom", "0px"[\s\S]*removeProperty\("--runtime-safe-area-bottom"\)/);
  assert.match(source, /root\.dataset\.mobileKeyboardMode = shouldResize \? "resize" : "overlay"/);
  assert.match(source, /--mobile-keyboard-overlap[\s\S]*keyboardOverlap/);
  assert.match(source, /window\.visualViewport\?\.addEventListener\("resize", syncMobileKeyboardViewport\)/);
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
  assert.match(source, /class="library-tab status-tab/);
  assert.match(source, /class="library-type-chip filter-chip/);
  assert.match(source, /aria-pressed=/);
  assert.doesNotMatch(source, /library-filter-heading/);
  assert.doesNotMatch(source, /不选即全部/);
  assert.match(source, /availableTypes = FOOD_TYPE_ORDER\.filter/);
  assert.doesNotMatch(source, /<select class="filter-select" data-library-type/);
  assert.match(styles, /\.library-type-chip\s*\{[\s\S]*min-height: 44px/);
  assert.match(
    styles,
    /\.library-type-chip-label\s*\{[\s\S]*min-height: 32px;[\s\S]*padding: 0 10px;[\s\S]*border-radius: var\(--filter-radius\);[\s\S]*font-size: var\(--type-body-size\);[\s\S]*line-height: 18px/
  );
  assert.match(
    styles,
    /\.record-type-chip\.active,[\s\S]*\.library-type-chip\.active \.library-type-chip-label,[\s\S]*border-color: var\(--filter-active\);[\s\S]*background: var\(--filter-active-soft\);[\s\S]*box-shadow: none/
  );
});

test("补货清单顶部展示单猫头像并用底部抽屉编辑昵称，商品使用类型包装图标", () => {
  assert.match(dataStoreSource, /CAT_EAT_H5_CAT_PROFILE_V1/);
  assert.match(source, /DEFAULT_CAT_AVATAR = "\.\/assets\/cat-profile-default\.jpg"/);
  assert.match(source, /class="library-cat-profile"/);
  assert.match(source, /class="library-profile-center"/);
  assert.match(source, /class="library-cat-avatar"/);
  assert.match(source, /class="library-avatar-camera"/);
  assert.match(source, /formatCatNickname\(catProfile\.nickname\)/);
  assert.match(source, /function profileNameSheet\(catProfile\)/);
  assert.match(source, /class="modal-sheet profile-name-sheet"/);
  assert.match(source, /id="cat-profile-name-form"/);
  assert.match(source, /data-profile-name/);
  assert.match(source, /data-profile-name-sheet/);
  assert.match(source, /data-edit-profile/);
  assert.match(source, /data-profile-name-label/);
  assert.match(source, /data-close-profile/);
  assert.match(source, /aria-label="编辑猫猫昵称"/);
  assert.match(source, /aria-label="猫猫昵称"/);
  assert.doesNotMatch(source, /<label for="library-profile-name-input">猫猫昵称<\/label>/);
  assert.match(source, /<button class="primary-button profile-name-save" type="submit">保存<\/button>/);
  assert.doesNotMatch(source, /cat-profile-inline-form/);
  assert.doesNotMatch(source, /library-profile-name-form/);
  assert.doesNotMatch(source, /编辑年龄/);
  assert.doesNotMatch(source, /catProfileDialog/);
  assert.doesNotMatch(source, /data-open-profile/);
  assert.doesNotMatch(source, /保存昵称<\/button>/);
  assert.match(source, /data-profile-photo-input/);
  assert.doesNotMatch(source, /class="library-profile-total"/);
  assert.match(source, /class="library-sheet"/);
  assert.match(source, /productThumbnail: true/);
  assert.match(source, /uiIcon\(iconName, "product-fallback", label\)/);
  assert.match(source, /phosphor-cylinder-light\.svg/);
  assert.match(styles, /\.library-cat-profile\s*\{[\s\S]*min-height: 266px;[\s\S]*linear-gradient\(128deg, #edf8ff/);
  assert.match(styles, /\.library-cat-profile::before,[\s\S]*filter: blur\(46px\)/);
  assert.match(styles, /\.library-cat-avatar\s*\{[\s\S]*width: 96px;[\s\S]*border-radius: 50%/);
  assert.doesNotMatch(source, /library-profile-stats|library-summary|librarySummaryText|猫咪试吃概览|款吃过|款放心买/);
  assert.match(styles, /\.profile-name-backdrop\s*\{[\s\S]*padding: 0/);
  assert.match(styles, /body\[data-profile-sheet-open\]\s*\{[\s\S]*position: fixed;[\s\S]*top: var\(--profile-sheet-scroll-offset, 0\);[\s\S]*overflow: hidden/);
  assert.match(styles, /\.profile-name-backdrop\s*\{[\s\S]*height: var\(--profile-viewport-height, 100dvh\);[\s\S]*overscroll-behavior: none;[\s\S]*touch-action: none/);
  assert.match(styles, /\.modal-sheet\.profile-name-sheet\s*\{[\s\S]*width: 100%;[\s\S]*padding: 10px 24px calc\(9px \+ var\(--safe-area-bottom\)\);[\s\S]*border-radius: 24px 24px 0 0;[\s\S]*background: #ffffff/);
  assert.match(styles, /\.modal-sheet\.profile-name-sheet\s*\{[\s\S]*align-self: flex-end;[\s\S]*overflow: hidden;[\s\S]*margin: 0/);
  assert.match(source, /function openProfileNameEditor\(\)[\s\S]*insertAdjacentHTML\("beforeend", profileNameSheet\(readCatProfile\(\)\)\)[\s\S]*lockProfileSheetPage\(\)/);
  assert.match(source, /function lockProfileSheetPage\(\)[\s\S]*window\.scrollY[\s\S]*dataset\.profileSheetOpen[\s\S]*window\.visualViewport\?\.addEventListener\("resize"/);
  assert.match(source, /backdrop\.addEventListener\([\s\S]*"touchmove"[\s\S]*event\.preventDefault\(\)[\s\S]*passive: false/);
  assert.match(source, /function route\([\s\S]*closeProfileNameEditor\(\{ restoreFocus: false \}\)/);
  assert.match(source, /window\.addEventListener\("popstate"[\s\S]*closeProfileNameEditor\(\{ restoreFocus: false \}\)/);
  assert.doesNotMatch(source, /state\.profileEditing = true;\s*render\(\);\s*const profileName/);
  assert.match(styles, /\.profile-name-sheet-form input\s*\{[\s\S]*min-height: 48px;[\s\S]*font-size: var\(--type-control-size\)/);
  assert.match(styles, /\.profile-name-sheet-head\s*\{[\s\S]*display: grid;[\s\S]*grid-template-columns: 44px minmax\(0, 1fr\) 44px/);
  assert.match(styles, /\.profile-name-sheet-head h2\s*\{[\s\S]*grid-column: 2;[\s\S]*text-align: center/);
  assert.match(styles, /\.profile-name-sheet-head \.modal-close-button\s*\{[\s\S]*background: transparent/);
  assert.match(styles, /\.library-sheet\s*\{[\s\S]*margin-top: -24px;[\s\S]*border-radius: 30px 30px 0 0;[\s\S]*backdrop-filter: blur\(28px\) saturate\(145%\)/);
  assert.match(styles, /\.product-thumb-staple_can,[\s\S]*\.product-thumb-snack_can/);
  assert.match(styles, /\.icon-can\s*\{[\s\S]*phosphor-cylinder-light\.svg/);
  assert.match(styles, /\.food-row\s*\{[\s\S]*min-width: 0;[\s\S]*max-width: 100%/);
});

test("全应用使用 14px Regular 正文和收敛的字体层级", () => {
  assert.match(styles, /--type-body-size: 14px/);
  assert.match(styles, /--type-weight-regular: 400/);
  assert.match(styles, /body\s*\{[\s\S]*font-size: var\(--type-body-size\);[\s\S]*font-weight: var\(--type-weight-regular\)/);
  assert.match(styles, /--type-label-size: 11px/);
  assert.match(styles, /--type-meta-size: 12px/);
  assert.match(styles, /--type-control-size: 16px/);
  assert.match(styles, /--type-section-size: 18px/);
  assert.match(styles, /--type-detail-size: 22px/);
  assert.match(styles, /--type-page-size: 28px/);
  const allowedSizes = new Set([
    "var(--type-label-size)",
    "var(--type-meta-size)",
    "var(--type-body-size)",
    "var(--type-control-size)",
    "var(--type-section-size)",
    "var(--type-detail-size)",
    "var(--type-page-size)"
  ]);
  const allowedWeights = new Set([
    "var(--type-weight-regular)",
    "var(--type-weight-medium)",
    "var(--type-weight-semibold)"
  ]);
  const fontSizes = [...styles.matchAll(/font-size:\s*([^;]+);/g)].map((match) => match[1].trim());
  const fontWeights = [...styles.matchAll(/font-weight:\s*([^;]+);/g)].map((match) => match[1].trim());
  assert.ok(fontSizes.every((value) => allowedSizes.has(value)), `存在未归一的字号：${fontSizes.filter((value) => !allowedSizes.has(value)).join(", ")}`);
  assert.ok(fontWeights.every((value) => allowedWeights.has(value)), `存在未归一的字重：${fontWeights.filter((value) => !allowedWeights.has(value)).join(", ")}`);
});

test("添加和编辑食物支持系统照片选择器而非强制打开相机", () => {
  assert.match(source, /id="photo-input" type="file" accept="image\/\*"/);
  assert.doesNotMatch(source, /capture="environment"/);
  assert.match(source, /aria-label="拍包装或选择照片"/);
  assert.match(source, /figma-add-plus\.svg/);
});

test("补货清单使用轻量搜索、清晰状态 Tab 和图标关闭按钮", () => {
  assert.match(source, /placeholder="搜品牌、口味或质地"/);
  assert.match(source, /class="icon-button modal-close-button"[\s\S]*aria-label="关闭"/);
  assert.doesNotMatch(source, />关闭<\/button>/);
  assert.match(styles, /\.library-sheet \.search-input\s*\{[\s\S]*font-size: var\(--type-control-size\)/);
  assert.match(styles, /\.library-tab\.active::after\s*\{[\s\S]*background: currentColor/);
  assert.match(styles, /\.modal-close-button\s*\{[\s\S]*width: 44px;[\s\S]*height: 44px/);
  assert.match(source, /data-library-search[\s\S]*data-mobile-keyboard[\s\S]*inputmode="search"/);
});

test("所有输入框聚焦时只保留光标且不改变容器边框", () => {
  assert.match(styles, /input:focus,[\s\S]*input:focus-visible,[\s\S]*textarea:focus,[\s\S]*textarea:focus-visible\s*\{[\s\S]*outline: 0;[\s\S]*box-shadow: none/);
  assert.doesNotMatch(styles, /input:focus-visible,[\s\S]*outline: 3px solid/);
  assert.doesNotMatch(styles, /textarea:focus-visible\s*\{[\s\S]*outline: 3px solid/);
  assert.doesNotMatch(styles, /\.record-picker-search:focus-within/);
  assert.doesNotMatch(styles, /\.library-sheet \.search-wrap:focus-within/);
  assert.doesNotMatch(styles, /\.profile-name-sheet-form input:focus/);
  assert.doesNotMatch(styles, /\.photo-upload:focus-within/);
});

test("手机安全区、吸顶栏和文字输入使用机型自适应约束", () => {
  assert.match(styles, /--safe-area-top: env\(safe-area-inset-top, 0px\)/);
  assert.match(styles, /--safe-area-bottom: var\([\s\S]*--runtime-safe-area-bottom,[\s\S]*--preview-safe-area-bottom,[\s\S]*env\(safe-area-inset-bottom, 0px\)/);
  assert.match(source, /class="fixed-page-shell add-page-shell"[\s\S]*class="screen no-tab fixed-page-scroll add-screen"/);
  assert.match(source, /class="fixed-page-shell feedback-page-shell"[\s\S]*class="screen no-tab fixed-page-scroll feedback-screen"/);
  assert.match(source, /class="fixed-page-shell detail-page-shell"[\s\S]*class="screen no-tab fixed-page-scroll detail-screen"/);
  assert.match(styles, /\.screen\.no-tab\.fixed-page-scroll\s*\{[\s\S]*padding-top: calc\([\s\S]*var\(--safe-area-top\)[\s\S]*var\(--fixed-topbar-content-height\)/);
  assert.match(styles, /body\[data-screen="add"\],[\s\S]*body\[data-screen="detail"\][\s\S]*position: fixed;[\s\S]*inset: 0/);
  assert.match(styles, /\.fixed-page-shell\s*\{[\s\S]*position: fixed;[\s\S]*inset: 0;[\s\S]*width: min\(100%, var\(--app-max-width\)\);[\s\S]*overflow: hidden/);
  assert.match(styles, /\.fixed-page-shell > \.fixed-page-scroll\s*\{[\s\S]*height: 100%;[\s\S]*overflow-y: auto;[\s\S]*overscroll-behavior-y: none/);
  assert.match(styles, /\.fixed-page-shell > \.topbar\s*\{[\s\S]*position: absolute;[\s\S]*top: 0;[\s\S]*height: calc\(var\(--fixed-topbar-content-height\) \+ var\(--safe-area-top\)\);[\s\S]*padding: var\(--safe-area-top\)/);
  assert.doesNotMatch(source, /const history = \(food\.results/);
  assert.match(styles, /html\s*\{[\s\S]*overscroll-behavior-y: none/);
  assert.match(styles, /body\s*\{[\s\S]*overscroll-behavior-y: none/);
  assert.match(source, /data-mobile-keyboard/);
  assert.match(source, /data-picker-search[\s\S]*data-mobile-keyboard[\s\S]*inputmode="search"/);
  assert.match(source, /data-feedback-note[\s\S]*data-mobile-keyboard[\s\S]*enterkeyhint="done"/);
  assert.doesNotMatch(source, /包装识别将在下一阶段接入/);
  assert.match(styles, /input:focus,[\s\S]*input:focus-visible,[\s\S]*textarea:focus,[\s\S]*textarea:focus-visible\s*\{[\s\S]*outline: 0;[\s\S]*box-shadow: none/);
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
  const appBackground = styles.match(/#app\s*\{[\s\S]*?\n\}/)?.[0] || "";
  const diffuseLayers = appBackground.match(/radial-gradient\(/g) || [];

  assert.match(styles, /--canvas: #fafafa/);
  assert.match(styles, /--paper: rgba\(255, 255, 255, 0\.82\)/);
  assert.equal(diffuseLayers.length, 3);
  assert.match(styles, /rgba\(151, 190, 255, 0\.1\)/);
  assert.match(styles, /rgba\(135, 225, 178, 0\.07\)/);
  assert.match(styles, /rgba\(255, 190, 214, 0\.055\)/);
});

test("全部任务页面共用轻盈彩色背景、玻璃表面和品牌蓝交互色", () => {
  assert.match(styles, /--brand-600: #4571fc/);
  assert.match(styles, /--system-blue: var\(--brand-primary\)/);
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
  assert.match(source, /\["record", "添加"\]/);
  assert.match(source, /\["library", "清单"\]/);
  assert.doesNotMatch(source, /<svg/);
  assert.doesNotMatch(source, /function recordHub\(\)/);
  assert.doesNotMatch(source, /record: recordHub/);
  assert.match(source, /data-nav="add"/);
  assert.match(source, /aria-label="添加"/);
  assert.match(source, /data-nav="\$\{key\}"/);
  assert.match(source, /data-open-picker/);
  assert.match(source, /function navStateIcon\(key\)/);
  assert.match(source, /nav-state-\$\{key\}/);
  assert.doesNotMatch(source, /const stateName = active/);
  assert.match(source, /const destination = key === "record" \? "add" : key/);
  assert.match(styles, /--nav-content-height: 48px/);
  assert.match(styles, /--nav-active: var\(--brand-primary\)/);
  assert.match(
    styles,
    /\/\* Bottom navigation · 390 × 48 reference plus the device safe area\.[\s\S]*\.bottom-nav\s*\{[\s\S]*height: calc\(var\(--nav-content-height\) \+ var\(--safe-area-bottom\)\);[\s\S]*padding: 0 0 var\(--safe-area-bottom\);[\s\S]*background: #f7f7f7;[\s\S]*box-shadow: inset 0 0\.5px 0 #e6e6e6/
  );
  assert.match(
    styles,
    /\/\* Bottom navigation · 390 × 48 reference plus the device safe area\.[\s\S]*\.nav-item,[\s\S]*color: #4d4d4d;[\s\S]*font-size: var\(--type-label-size\);[\s\S]*line-height: 14px/
  );
  assert.match(
    styles,
    /\/\* Bottom navigation · 390 × 48 reference plus the device safe area\.[\s\S]*\.nav-item\.active,[\s\S]*color: #4571fc/
  );
  assert.match(styles, /\.nav-state-icon\s*\{[\s\S]*width: 32px;[\s\S]*height: 32px;[\s\S]*background: currentColor/);
  assert.match(styles, /\.nav-state-home\s*\{[\s\S]*nav-home-default\.svg/);
  assert.match(styles, /\.nav-state-record\s*\{[\s\S]*nav-add-default\.svg/);
  assert.match(styles, /\.nav-state-library\s*\{[\s\S]*nav-can-default\.svg/);
  [
    "nav-home-default.svg",
    "nav-add-default.svg",
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
  assert.match(source, /class="record-type-chip filter-chip/);
  assert.match(styles, /\.record-type-chip\.active,[\s\S]*color: var\(--filter-active\)/);
});

test("所有底部抽屉都不显示顶部拖动定位器", () => {
  assert.doesNotMatch(source, /record-sheet-grabber/);
  assert.doesNotMatch(styles, /\.record-sheet-grabber/);
});

test("添加记录直达新品页并为已有产品字段提供联想", () => {
  assert.match(source, /<strong class="topbar-title">\$\{escapeHtml\(title\)\}<\/strong>/);
  assert.match(source, /topbar\(editing \? "编辑食物" : "加食物"\)/);
  assert.match(source, /function autocompleteSuggestions\(field, query\)/);
  assert.match(source, /listFoods\(\)\.forEach\(\(food\) =>/);
  assert.match(source, /AUTOCOMPLETE_PLACEHOLDERS/);
  assert.match(source, /autocompleteField\("brand", "品牌"[\s\S]*autocompleteField\("name", "产品名"/);
  assert.doesNotMatch(source, /field-name/);
  assert.doesNotMatch(styles, /\.field-name/);
  assert.match(source, /autocompleteField\("flavor", "肉源\/口味"/);
  assert.match(source, /role="listbox"/);
  assert.match(source, /data-autocomplete-option/);
  assert.match(source, /data-autocomplete-value=/);
  assert.match(source, /input\.focus\(\)/);
  assert.match(styles, /\.autocomplete-menu\s*\{[\s\S]*position: absolute/);
  assert.match(styles, /\.autocomplete-menu\[hidden\]\s*\{[\s\S]*display: none/);
  assert.match(styles, /\.autocomplete-option\s*\{[\s\S]*min-height: 44px/);
  assert.match(styles, /\.autocomplete-option:focus-visible/);
  assert.match(source, /class="fixed-bottom-action add-bottom-action"/);
  assert.match(source, /class="primary-button fixed-bottom-action-button add-submit-button" type="submit" form="food-form">保存<\/button>/);
  assert.match(styles, /\/\* Figma add\/edit food form[\s\S]*\.fixed-bottom-action\s*\{[\s\S]*padding: 9px 20px calc\(9px \+ var\(--safe-area-bottom\)\);[\s\S]*background: #ffffff/);
  assert.match(styles, /\/\* Figma add\/edit food form[\s\S]*\.fixed-bottom-action \.fixed-bottom-action-button\s*\{[\s\S]*min-height: 42px;[\s\S]*height: 42px;[\s\S]*border-radius: 100px/);
});

test("页面预览隐藏滚动条但保留滚动容器", () => {
  assert.match(styles, /\*\s*\{[\s\S]*scrollbar-width: none/);
  assert.match(styles, /\*::-webkit-scrollbar\s*\{[\s\S]*display: none/);
  assert.match(styles, /\.fixed-page-shell > \.fixed-page-scroll\s*\{[\s\S]*overflow-y: auto/);
});

test("记录表现页与加食物页共用固定底部操作栏", () => {
  assert.match(source, /class="fixed-bottom-action feedback-bottom-action"/);
  assert.match(source, /class="primary-button fixed-bottom-action-button" data-submit-feedback \$\{state\.selectedOutcome \? "" : "disabled"\}>保存<\/button>/);
  assert.match(styles, /\.feedback-page-shell > \.fixed-page-scroll\s*\{[\s\S]*var\(--fixed-bottom-action-content-height\) \+ var\(--safe-area-bottom\) \+ 16px/);
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

test("类型与质地复用 Figma 选择抽屉而不是原生下拉菜单", () => {
  assert.match(
    source,
    /const TEXTURE_OPTIONS = \["肉泥\/慕斯", "肉块", "肉丝", "冻干", "其他"\];/
  );
  assert.match(source, /function choiceField\(name, label, selectedValue, options/);
  assert.match(source, /function choiceSheet\(name, title, selectedValue, options\)/);
  assert.match(source, /choiceField\("foodType", "类型"/);
  assert.match(source, /choiceField\("texture", "质地"/);
  assert.match(source, /choiceSheet\("foodType", "类型"/);
  assert.match(source, /choiceSheet\("texture", "质地"/);
  assert.match(source, /function chooseChoiceOption\(option\)/);
  assert.match(source, /function bindChoiceSheets\(\)/);
  assert.doesNotMatch(source, /<select name="texture">/);
  assert.match(styles, /\.choice-sheet-panel\s*\{[\s\S]*border-radius: 12px 12px 0 0/);
  assert.match(styles, /\.choice-sheet-head\s*\{[\s\S]*min-height: 48px/);
  assert.match(styles, /\.choice-sheet-option\s*\{[\s\S]*min-height: 56px/);
  assert.match(styles, /\.choice-sheet-scrim\s*\{[\s\S]*background: rgba\(0, 0, 0, 0\.4\)/);
  [
    "figma-add-back.svg",
    "figma-add-plus.svg",
    "figma-add-chevron-right.svg",
    "figma-sheet-close.svg",
    "figma-radio-checked.svg",
    "figma-radio-default.svg"
  ].forEach((asset) => {
    assert.ok(existsSync(join(__dirname, "..", "assets", "icons", asset)), `缺少 Figma 资源：${asset}`);
  });
});

test("移动端操作提供触控尺寸、固定底部主操作和减少动态效果", () => {
  assert.match(styles, /\.type-option span\s*\{[\s\S]*min-height: 44px/);
  assert.match(styles, /\.fixed-bottom-action\s*\{[\s\S]*position: absolute/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
});

test("非底部导航图标、标签、状态 Tab 和筛选项使用统一组件规范", () => {
  assert.match(styles, /--icon-size: 24px/);
  assert.match(styles, /--control-touch-size: 44px/);
  assert.match(styles, /--tag-height: 20px/);
  assert.match(styles, /\.ui-icon\s*\{[\s\S]*width: var\(--icon-size\);[\s\S]*height: var\(--icon-size\)/);
  assert.match(source, /class="status-badge status-tag status-/);
  assert.match(source, /class="choice-sheet-option \$\{selected \? "selected" : ""\}"/);
  assert.match(styles, /\.status-tag\s*\{[\s\S]*height: var\(--tag-height\);[\s\S]*border-radius: var\(--tag-radius\)/);
  assert.match(styles, /\/\* Brand color application[\s\S]*\.status-tab\.active,[\s\S]*\.library-tab\.active\s*\{[\s\S]*color: var\(--brand-interactive-text\)/);
  assert.match(styles, /\.type-option input:checked \+ \.filter-chip-label\s*\{[\s\S]*background: var\(--filter-active-soft\)/);
  assert.match(styles, /Bottom navigation is intentionally excluded/);
  assert.match(styles, /--nav-active: var\(--brand-primary\)/);
});

test("品牌蓝色卡覆盖交互控件且不替代正向语义色", () => {
  [50, 100, 200, 300, 400, 500, 600, 700, 800, 900].forEach((step) => {
    assert.match(styles, new RegExp(`--brand-${step}: #[0-9a-f]{6}`));
  });
  assert.match(styles, /--brand-primary: var\(--brand-600\)/);
  assert.match(styles, /--filter-active: var\(--brand-interactive-text\)/);
  assert.match(styles, /--brand-button: var\(--brand-700\)/);
  assert.match(styles, /\/\* Brand color application[\s\S]*\.primary-button\s*\{[\s\S]*background: var\(--brand-button\)/);
  assert.match(styles, /\/\* Brand color application[\s\S]*\.outcome-option\.selected \.outcome-icon-shell\s*\{[\s\S]*background: var\(--brand-100\)/);
  assert.match(styles, /\.status-repurchase,[\s\S]*background: var\(--mint-soft\);[\s\S]*color: #16763a/);
});
