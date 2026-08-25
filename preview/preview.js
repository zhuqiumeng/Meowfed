const ICONS = {
  home: "./assets/icons/ddmc-home.svg",
  add: "./assets/icons/ddmc-add.svg",
  camera: "./assets/icons/ddmc-camera.svg",
  list: "./assets/icons/ddmc-list.svg",
  box: "./assets/icons/ddmc-box.svg",
  can: "./assets/icons/phosphor-cylinder-light.svg",
  cat: "./assets/icons/phosphor-cat-thin.svg",
  eye: "./assets/icons/ddmc-eye.svg",
  heart: "./assets/icons/ddmc-heart.svg",
  check: "./assets/icons/ddmc-check.svg",
  warning: "./assets/icons/ddmc-warning.svg",
  clock: "./assets/icons/ddmc-clock.svg",
  back: "./assets/icons/ddmc-back.svg",
  search: "./assets/icons/ddmc-search.svg"
};

const FOOD_TYPES = {
  staple_can: "主食罐头",
  snack_can: "零食罐头",
  freeze_dried: "冻干",
  cat_treat: "猫条",
  cat_food: "猫粮",
  other: "其他"
};

const TEXTURE_OPTIONS = ["肉泥/慕斯", "肉块", "肉丝", "冻干", "其他"];

const FOOD_TYPE_ORDER = [
  "staple_can",
  "snack_can",
  "freeze_dried",
  "cat_treat",
  "cat_food",
  "other"
];

const DEFAULT_CAT_AVATAR = "./assets/cat-profile-default.jpg";
const RULE_DAY_MS = window.CatEatRules.DAY_MS;
const now = Date.now();

const DEMO_FOODS = [
  {
    id: "demo-catz",
    brand: "Catz Finefood",
    name: "鸡肉火鸡主食罐",
    specification: "85g",
    foodType: "staple_can",
    flavor: "鸡肉 · 火鸡",
    texture: "肉泥",
    photoPath: "",
    createdAt: now - 30 * RULE_DAY_MS,
    results: [
      { id: "r1", outcome: "eager", createdAt: now - 24 * RULE_DAY_MS },
      { id: "r2", outcome: "okay", createdAt: now - 16 * RULE_DAY_MS },
      { id: "r3", outcome: "eager", createdAt: now - 7 * RULE_DAY_MS }
    ]
  },
  {
    id: "demo-oasy",
    brand: "Oasy",
    name: "吞拿鱼慕斯",
    specification: "70g",
    foodType: "snack_can",
    flavor: "吞拿鱼",
    texture: "慕斯",
    photoPath: "",
    createdAt: now - 18 * RULE_DAY_MS,
    results: [
      { id: "r4", outcome: "okay", createdAt: now - 12 * RULE_DAY_MS },
      { id: "r5", outcome: "eager", createdAt: now - 5 * RULE_DAY_MS }
    ]
  },
  {
    id: "demo-venandi",
    brand: "Venandi",
    name: "火鸡单一蛋白罐",
    specification: "200g",
    foodType: "staple_can",
    flavor: "火鸡",
    texture: "细肉泥",
    photoPath: "",
    createdAt: now - 70 * RULE_DAY_MS,
    results: [
      { id: "r6", outcome: "eager", createdAt: now - 60 * RULE_DAY_MS },
      { id: "r7", outcome: "okay", createdAt: now - 50 * RULE_DAY_MS },
      { id: "r8", outcome: "eager", createdAt: now - 40 * RULE_DAY_MS },
      { id: "r9", outcome: "reluctant", createdAt: now - 2 * RULE_DAY_MS }
    ]
  },
  {
    id: "demo-freeze",
    brand: "K9 Natural",
    name: "羊肉冻干",
    specification: "100g",
    foodType: "freeze_dried",
    flavor: "羊肉",
    texture: "冻干块",
    photoPath: "",
    createdAt: now - 8 * RULE_DAY_MS,
    results: [{ id: "r10", outcome: "reluctant", createdAt: now - 3 * RULE_DAY_MS }]
  },
  {
    id: "demo-bury",
    brand: "Mjamjam",
    name: "多汁牛肉罐",
    specification: "200g",
    foodType: "staple_can",
    flavor: "牛肉",
    texture: "粗肉泥",
    photoPath: "",
    createdAt: now - 6 * RULE_DAY_MS,
    results: [{ id: "r11", outcome: "bury", createdAt: now - RULE_DAY_MS }]
  }
];

const app = document.querySelector("#app");
const toast = document.querySelector("#toast");
const rules = window.CatEatRules;
const dataStore = window.CatEatData;
const PAGE_THEME_COLORS = {
  home: "#edf3ff",
  library: "#edf8ff",
  add: "#ffffff",
  feedback: "#ffffff",
  detail: "#ffffff"
};

const state = {
  screen: new URLSearchParams(location.search).get("screen") || "home",
  selectedFoodId: new URLSearchParams(location.search).get("id") || "",
  selectedOutcome: "",
  feedbackNote: "",
  photoDataUrl: "",
  libraryQuery: "",
  libraryGroup: "buy",
  libraryType: "",
  pickerOpen: false,
  pickerExpanded: false,
  pickerQuery: "",
  pickerType: "",
  pickerTrigger: "",
  profileEditing: false
};

let recentFeedLayoutFrame = 0;
let recentFeedResizeObserver = null;
let profileSheetScrollY = 0;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function createId() {
  return dataStore.createUuid();
}

function readFoods() {
  return dataStore.getFoods();
}

function readCatProfile() {
  return dataStore.getCatProfile();
}

function writeCatProfile(profile, options = {}) {
  return dataStore.saveCatProfile(profile, options);
}

function formatCatNickname(nickname) {
  return nickname || "噜噜";
}

function listFoods() {
  return readFoods()
    .map((food) => rules.summarizeFood(food))
    .sort((a, b) => {
      const aTime = a.latestResult?.createdAt || a.createdAt;
      const bTime = b.latestResult?.createdAt || b.createdAt;
      return bTime - aTime;
    });
}

function productIdentity(food) {
  // 用品牌 + 名称归一化做商品身份；带 _legacyId 的旧数据也参与
  const brand = normalizeProductText(food.brand);
  const name = normalizeProductText(food.name);
  if (!brand && !name) return "";
  return [brand, name].filter(Boolean).join("::");
}

function dedupeFoodsForFeed(foods) {
  // foods 已按"最近一次活动"倒序；保留每组第一条（最新），记下被合并的条数
  const seen = new Map();
  const order = [];
  for (const food of foods) {
    const key = productIdentity(food) || `id::${food.id}`;
    if (seen.has(key)) {
      seen.get(key).mergedCount += 1;
    } else {
      seen.set(key, { food, mergedCount: 0 });
      order.push(key);
    }
  }
  return order.map((key) => {
    const { food, mergedCount } = seen.get(key);
    return mergedCount > 0 ? { ...food, _mergedCount: mergedCount } : food;
  });
}

function findFood(foodId) {
  const food = readFoods().find((item) => item.id === foodId);
  return food ? rules.summarizeFood(food) : null;
}

const AUTOCOMPLETE_PLACEHOLDERS = new Set([
  "品牌待补充",
  "待补充品牌",
  "未命名食物",
  "待命名食物",
  "口味待确认",
  "肉类待补充"
]);

function autocompleteSuggestions(field, query) {
  const normalizedQuery = String(query || "").trim().toLocaleLowerCase("zh-CN");
  if (!normalizedQuery) return [];

  const suggestions = new Map();

  listFoods().forEach((food) => {
    const value = String(food[field] || "").trim();
    if (
      !value ||
      AUTOCOMPLETE_PLACEHOLDERS.has(value) ||
      !value.toLocaleLowerCase("zh-CN").includes(normalizedQuery)
    ) {
      return;
    }

    const existing = suggestions.get(value) || { value, count: 0 };
    existing.count += 1;
    suggestions.set(value, existing);
  });

  return Array.from(suggestions.values()).slice(0, 6);
}

function normalizeProductText(value) {
  return String(value || "")
    .trim()
    .toLocaleLowerCase("zh-CN")
    .replace(/[·•/／、,，;；:：\-—_()[\]{}]/g, "")
    .replace(/\s+/g, "");
}

function productTextVariants(value) {
  const normalized = normalizeProductText(value);
  if (!normalized) return [];

  const variants = new Set([normalized]);
  const replacements = [
    ["火鸡肉", "火鸡"],
    ["鸡肉", "鸡"],
    ["牛肉", "牛"],
    ["鸭肉", "鸭"],
    ["羊肉", "羊"],
    ["主食罐头", "罐"],
    ["主食罐", "罐"],
    ["零食罐头", "罐"],
    ["零食罐", "罐"],
    ["罐头", "罐"]
  ];

  replacements.forEach(([from, to]) => {
    Array.from(variants).forEach((variant) => {
      const replaced = variant.replaceAll(from, to);
      if (replaced) variants.add(replaced);
    });
  });

  return Array.from(variants);
}

function productFieldMatches(value, existingValue, field) {
  const leftVariants = productTextVariants(value);
  const rightVariants = productTextVariants(existingValue);
  if (!leftVariants.length || !rightVariants.length) return false;

  if (leftVariants.some((variant) => rightVariants.includes(variant))) {
    return true;
  }

  if (!['brand', 'name'].includes(field)) return false;

  return leftVariants.some((left) =>
    rightVariants.some((right) => {
      const shorter = left.length <= right.length ? left : right;
      const longer = left.length <= right.length ? right : left;
      const minimumLength = field === 'brand' ? 3 : 4;
      return shorter.length >= minimumLength && longer.includes(shorter);
    })
  );
}

function specificationMatches(value, existingValue) {
  const normalize = (candidate) =>
    normalizeProductText(candidate)
      .replaceAll("毫升", "ml")
      .replaceAll("厘米", "cm")
      .replaceAll("克", "g");
  return productFieldMatches(normalize(value), normalize(existingValue), "specification");
}

function duplicateFormValues(form) {
  const data = new FormData(form);
  return {
    brand: String(data.get("brand") || "").trim(),
    name: String(data.get("name") || "").trim(),
    specification: String(data.get("specification") || "").trim(),
    flavor: String(data.get("flavor") || "").trim(),
    foodType: String(data.get("foodType") || "").trim()
  };
}

function isUsableProductValue(value) {
  const text = String(value || "").trim();
  return Boolean(text && !AUTOCOMPLETE_PLACEHOLDERS.has(text));
}

function scoreDuplicateFood(values, food) {
  if (!food || values.foodType && food.foodType && values.foodType !== food.foodType) {
    return null;
  }

  const fields = {
    brand: productFieldMatches(values.brand, food.brand, "brand"),
    name: productFieldMatches(values.name, food.name, "name"),
    specification: specificationMatches(values.specification, food.specification),
    flavor: productFieldMatches(values.flavor, food.flavor, "flavor")
  };

  const providedFields = Object.keys(fields).filter((field) => isUsableProductValue(values[field]));
  if (providedFields.length < 2) return null;

  const conflictingField = providedFields.find(
    (field) => isUsableProductValue(food[field]) && !fields[field]
  );
  if (conflictingField) return null;

  const hasBrandAndName = fields.brand && fields.name;
  const hasBrandAndFlavorAndSize = fields.brand && fields.flavor && fields.specification;
  const hasNameAndFlavorAndSize = fields.name && fields.flavor && fields.specification;
  if (!hasBrandAndName && !hasBrandAndFlavorAndSize && !hasNameAndFlavorAndSize) {
    return null;
  }

  const weights = { brand: 5, name: 6, specification: 4, flavor: 3 };
  const score = providedFields.reduce(
    (total, field) => total + (fields[field] ? weights[field] : 0),
    0
  );
  const confidence = hasBrandAndName && score >= 11 ? "direct" : "possible";

  return {
    food,
    fields,
    matchedFields: providedFields.filter((field) => fields[field]),
    score: score + (hasBrandAndName ? 4 : 0) + (fields.specification ? 2 : 0),
    confidence
  };
}

function findLikelyDuplicateFood(values, excludeId = "") {
  return listFoods()
    .filter((food) => food.id !== excludeId)
    .map((food) => scoreDuplicateFood(values, food))
    .filter(Boolean)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const aTime = a.food.latestResult?.createdAt || a.food.createdAt;
      const bTime = b.food.latestResult?.createdAt || b.food.createdAt;
      return bTime - aTime;
    })[0] || null;
}

function duplicateFoodNotice(match) {
  if (!match) return "";

  const food = match.food;
  const title = [food.brand, food.name, food.specification].filter(Boolean).join(" · ");
  const detail = [
    FOOD_TYPES[food.foodType] || "其他",
    food.flavor,
    food.latestOutcome ? `最近：${food.latestOutcome.shortLabel}` : "还没反馈"
  ]
    .filter(Boolean)
    .join(" · ");

  return `
    <span class="duplicate-food-icon-shell">${uiIcon("search", "duplicate-food-icon")}</span>
    <span class="duplicate-food-copy">
      <strong>${match.confidence === "direct" ? "这款食物已经有记录" : "这款食物可能记录过"}</strong>
      <span class="duplicate-food-title">已有：${escapeHtml(title || food.name || "未命名食物")}</span>
      <small>${escapeHtml(detail)}</small>
      <small>如果是不同包装或配方，仍可以继续添加。</small>
    </span>
    <button
      class="duplicate-food-action"
      type="button"
      data-duplicate-food="${escapeHtml(food.id)}"
    >查看已有记录</button>
  `;
}

function refreshDuplicateFoodNotice(form = document.querySelector("#food-form")) {
  const notice = form?.querySelector("[data-duplicate-food-notice]");
  if (!form || !notice) return;

  const match = findLikelyDuplicateFood(
    duplicateFormValues(form),
    form.dataset.editingId || ""
  );

  notice.innerHTML = duplicateFoodNotice(match);
  notice.hidden = !match;
}

function bindDuplicateFoodCheck() {
  if (app.dataset.duplicateFoodCheckBound === "true") return;
  app.dataset.duplicateFoodCheckBound = "true";

  const refresh = (event) => {
    const form = event?.target?.closest?.("#food-form") || document.querySelector("#food-form");
    if (form) refreshDuplicateFoodNotice(form);
  };

  app.addEventListener("input", (event) => {
    if (event.target.closest?.("#food-form")) refresh(event);
  });

  app.addEventListener("change", (event) => {
    if (event.target.closest?.("#food-form")) refresh(event);
  });

  app.addEventListener("click", (event) => {
    const button = event.target.closest?.("[data-duplicate-food]");
    if (!button) return;
    event.preventDefault();
    route("detail", { id: button.dataset.duplicateFood });
  });
}

function autocompleteField(field, label, value, placeholder) {
  const inputId = `food-${field}`;
  const listId = `${inputId}-suggestions`;

  return `
    <div class="field-row field-autocomplete" data-autocomplete-field="${field}">
      <label class="field-label-text" for="${inputId}">${label}</label>
      <input
        id="${inputId}"
        name="${field}"
        value="${escapeHtml(value || "")}"
        placeholder="${escapeHtml(placeholder)}"
        autocomplete="off"
        inputmode="text"
        enterkeyhint="next"
        aria-autocomplete="list"
        aria-controls="${listId}"
        aria-expanded="false"
        data-autocomplete-input="${field}"
        data-mobile-keyboard
      />
      <div
        id="${listId}"
        class="autocomplete-menu"
        data-autocomplete-list="${field}"
        role="listbox"
        hidden
      ></div>
    </div>
  `;
}

function outcomeIcon(outcome) {
  return {
    eager: "heart",
    okay: "check",
    reluctant: "clock",
    bury: "warning",
    unknown: "eye"
  }[outcome] || "eye";
}

function statusExplanation(food) {
  const explanations = {
    trial: "还在试吃阶段，继续少量尝试就好。",
    repurchase: "近 90 天已经有 3 次好反馈，可以加入常备候选。",
    stale: "以前表现不错，但最近记录不足，建议少量复验。",
    observe: "以前喜欢，最近出现了拒绝或勉强吃，先观察几次。",
    consume: "不太主动吃，现有库存慢慢消耗，不建议主动补货。",
    avoid: "最近出现埋屎拒绝，先避雷；你仍可以手动再给一次机会。",
    paused: "这款已由你手动暂停回购。"
  };

  return explanations[food.status.key] || "";
}

function formatDate(timestamp) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit"
  }).format(new Date(timestamp));
}

function formatCardDate(timestamp) {
  const date = new Date(timestamp);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${month}-${day}`;
}

function image(src, className, alt = "") {
  return `<img class="${className}" src="${src}" alt="${escapeHtml(alt)}" />`;
}

function uiIcon(name, className = "", label = "") {
  const accessibility = label
    ? `role="img" aria-label="${escapeHtml(label)}"`
    : 'aria-hidden="true"';
  return `<span class="ui-icon icon-${name} ${className}" ${accessibility}></span>`;
}

function thumbnail(food) {
  const content = food.photoPath
    ? `<img class="photo" src="${escapeHtml(food.photoPath)}" alt="${escapeHtml(`${food.name}包装`)}" data-image-fallback />`
    : uiIcon("cat", "cat-fallback", "猫猫头占位图");

  return `<span class="food-thumb">${content}</span>`;
}

function productThumbnail(food) {
  const isCan = ["staple_can", "snack_can"].includes(food.foodType);
  const iconName = isCan ? "can" : "box";
  const label = isCan ? "罐头包装占位图" : "食物包装占位图";
  const content = food.photoPath
    ? `<img class="photo" src="${escapeHtml(food.photoPath)}" alt="${escapeHtml(`${food.name}包装`)}" data-image-fallback="${iconName}" />`
    : uiIcon(iconName, "product-fallback", label);

  return `<span class="food-thumb product-thumb product-thumb-${escapeHtml(food.foodType || "other")}">${content}</span>`;
}

function statusBadge(food) {
  if (!(food.results || []).length) {
    return `
      <span class="status-badge status-tag status-unrated">
        <span class="status-label-full">未评价</span>
        <span class="status-label-compact" aria-hidden="true">未评价</span>
      </span>
    `;
  }

  const compactLabels = {
    trial: "再试",
    repurchase: "放心",
    stale: "复验",
    observe: "观察",
    consume: "不补",
    avoid: "避雷",
    paused: "暂停"
  };
  const compactLabel = compactLabels[food.status.key] || food.status.shortLabel;

  return `
    <span class="status-badge status-tag status-${food.status.key}">
      <span class="status-label-full">${escapeHtml(food.status.shortLabel)}</span>
      <span class="status-label-compact" aria-hidden="true">${escapeHtml(compactLabel)}</span>
    </span>
  `;
}

function foodRow(food, options = {}) {
  const meta = [
    FOOD_TYPES[food.foodType] || "其他",
    food.flavor || "",
    food.latestOutcome ? `最近：${food.latestOutcome.shortLabel}` : "还没反馈"
  ]
    .filter(Boolean)
    .join(" · ");
  const action = options.feedback ? `data-feedback-food="${food.id}"` : `data-food="${food.id}"`;

  return `
    <button class="food-row" ${action}>
      ${options.productThumbnail ? productThumbnail(food) : thumbnail(food)}
      <span class="food-row-copy">
        <small>${escapeHtml(food.brand || "品牌待补充")}</small>
        <strong>${escapeHtml(food.name || "未命名食物")}</strong>
        <small>${escapeHtml(meta)}</small>
      </span>
      ${options.feedback ? `<span class="status-badge status-tag status-trial">记录</span>` : statusBadge(food)}
    </button>
  `;
}

function recentFoodCard(food) {
  const latestRecordedResult = (food.results || [])
    .slice()
    .sort((a, b) => b.createdAt - a.createdAt)[0] || null;
  const feedbackKey = latestRecordedResult?.outcome || "unrated";
  const feedbackLabels = {
    eager: "主动吃",
    okay: "正常接受",
    reluctant: "勉强吃",
    bury: "埋屎",
    unknown: "没法判断",
    unrated: "未评价"
  };
  const feedback = feedbackLabels[feedbackKey] || feedbackLabels.unknown;
  const recordedAt = latestRecordedResult?.createdAt || food.createdAt;
  const title = [
    food.brand || "品牌待补充",
    food.name || "未命名食物",
    food.specification || ""
  ]
    .filter(Boolean)
    .join(" ");
  const media = food.photoPath
    ? `<img class="photo" src="${escapeHtml(food.photoPath)}" alt="${escapeHtml(`${food.name}包装`)}" data-image-fallback />`
    : uiIcon("cat", "cat-fallback", "猫猫头占位图");

  return `
    <button class="recent-food-card" data-food="${escapeHtml(food.id)}">
      <span class="recent-card-media ${food.photoPath ? "has-photo" : "is-fallback"}">${media}</span>
      <span class="recent-card-body">
        <strong class="recent-card-title">${escapeHtml(title)}</strong>
        <small class="recent-card-meta">
          <span class="recent-card-type">${escapeHtml(FOOD_TYPES[food.foodType] || "其他")}</span>
          <span class="recent-card-divider" aria-hidden="true">｜</span>
          <span>${escapeHtml(food.texture || "质地待补充")}</span>
          <span class="recent-card-divider" aria-hidden="true">｜</span>
          <span>${escapeHtml(food.flavor || "肉类待补充")}</span>
        </small>
        <span class="recent-card-feedback-row">
          <span class="recent-feedback-tag status-tag feedback-${feedbackKey}">${escapeHtml(feedback)}</span>
          <time class="recent-card-time" datetime="${new Date(recordedAt).toISOString()}">${formatCardDate(recordedAt)}</time>
        </span>
      </span>
    </button>
  `;
}

function topbar(title, options = {}) {
  if (options.brand) {
    return `
      <header class="topbar">
        <div class="brand">
          <span class="brand-icon-shell">${uiIcon("cat", "brand-icon", "猫")}</span>
          <span>猫吃了吗</span>
        </div>
        <span class="quiet-label">试用版</span>
      </header>
    `;
  }

  return `
    <header class="topbar">
      <span class="topbar-side"><button class="back-button" data-back aria-label="返回">${uiIcon("back")}</button></span>
      <strong class="topbar-title">${escapeHtml(title)}</strong>
      <span class="topbar-side">${options.action || ""}</span>
    </header>
  `;
}

function navStateIcon(key) {
  return `<span class="nav-state-icon nav-state-${key}" aria-hidden="true"></span>`;
}

function bottomNav(active) {
  const items = [
    ["home", "首页"],
    ["record", "添加"],
    ["library", "清单"]
  ];

  return `
    <nav class="bottom-nav" aria-label="主导航">
      ${items
        .map(([key, label]) => {
          const destination = key === "record" ? "add" : key;
          const selected = active === destination;

          if (key === "record") {
            return `
              <button
                class="nav-item nav-item-record ${selected ? "active" : ""}"
                type="button"
                data-nav="add"
                aria-label="添加"
                ${selected ? 'aria-current="page"' : ""}
              >
                <span class="nav-icon-shell" aria-hidden="true">
                  ${navStateIcon(key)}
                </span>
                <span>${label}</span>
              </button>
            `;
          }

          return `
            <button class="nav-item nav-item-${key} ${selected ? "active" : ""}" data-nav="${key}" ${selected ? 'aria-current="page"' : ""}>
              <span class="nav-icon-shell" aria-hidden="true">
                ${navStateIcon(key)}
              </span>
              <span>${label}</span>
            </button>
          `;
        })
        .join("")}
    </nav>
  `;
}

function home() {
  const foods = dedupeFoodsForFeed(listFoods());
  const catProfile = readCatProfile();
  const nickname = formatCatNickname(catProfile.nickname);

  return `
    <main class="screen home-screen">
      <section class="home-feed">
        <h1 class="home-greeting">
          <span>Hi ${escapeHtml(nickname)}</span>
          <span>这次吃的怎么样？</span>
        </h1>

        <section class="home-recent" aria-labelledby="recent-records-title">
          <h2 class="home-recent-heading" id="recent-records-title">最近记录</h2>
          ${
            foods.length
              ? `
                <div class="recent-food-grid" aria-label="最近记录，越近添加的越靠前">
                  ${foods.map(recentFoodCard).join("")}
                </div>
                <div class="home-feed-end" role="note" aria-label="已经到底了哟">
                  <span></span><strong>已经到底了哟</strong><span></span>
                </div>
              `
              : `
                <div class="empty-card recent-empty">
                  ${uiIcon("cat", "cat-fallback empty-cat", "猫猫头占位图")}
                  <span>
                    <strong>还没有最近记录</strong>
                    <p>拍下第一款后，最近吃过的会出现在这里。</p>
                  </span>
                  <span class="recent-empty-actions">
                    <button class="primary-button recent-empty-primary" type="button" data-nav="add">拍下第一款</button>
                    <button class="text-button" type="button" data-load-demo>载入示例</button>
                  </span>
                </div>
              `
          }
        </section>
      </section>
    </main>
    ${bottomNav("home")}
    ${state.pickerOpen ? foodPicker() : ""}
    ${renderCloudSyncCard()}
    ${renderDiagPanel()}
  `;
}

// ---- 内置诊断抽屉（v1.1.1 临时：解决 PWA 数据找回 / 调试，不用 DevTools） ----
//
// iOS PWA 跟 Safari 共享 origin 但隔离 storage；用户在 PWA 内部能直接看自己的 IndexedDB。
// 主入口是 home 页面底部一个折叠的 <details>，点开 6 个按钮：扫 v2 残留 / 扫 IDB / 读全部 /
// 诊断 catId 漂移 / 导出 JSON / 修复 catId。
// 标记 v1.1.1-devdiag，v1.2 抽出到独立路由（_diag/rescue.html）后可以删。

function renderDiagPanel() {
  return `
    <details class="diag-panel" data-diag-panel>
      <summary>🛠 调试工具（v1.1.1 临时，数据找回用）</summary>
      <div class="diag-panel-body">
        <p class="diag-panel-hint">点开下面 6 个按钮，把每段输出复制发回给 Mavis。⚠️ 第 6 个会改 IndexedDB 里的 catId，看完第 4 个再决定要不要点。</p>
        <button class="diag-btn" data-diag-action="ls">1. 对比 IDB 食物数 vs 可见数（推断漂移）</button>
        <pre class="diag-pre" data-diag-out="ls">（点上面按钮开始）</pre>
        <button class="diag-btn" data-diag-action="dbs">2. 列 IndexedDB 库</button>
        <pre class="diag-pre" data-diag-out="dbs">（点上面按钮开始）</pre>
        <button class="diag-btn" data-diag-action="all">3. 读 cat-eat-local 全部数据</button>
        <pre class="diag-pre" data-diag-out="all">（点上面按钮开始）</pre>
        <button class="diag-btn" data-diag-action="drift">4. catId 漂移诊断 + 食物清单</button>
        <pre class="diag-pre" data-diag-out="drift">（点上面按钮开始）</pre>
        <button class="diag-btn" data-diag-action="export">5. 一键导出全量 JSON</button>
        <pre class="diag-pre" data-diag-out="export">（点上面按钮开始）</pre>
        <button class="diag-btn diag-btn-danger" data-diag-action="fix">6. 把所有食物.catId 改成 meta.catId（修复漂移）</button>
        <pre class="diag-pre" data-diag-out="fix">（点上面按钮开始）</pre>
      </div>
    </details>
  `;
}

// ---- 调试抽屉：6 个动作由 utils/diag.js 提供（避免 preview.js 出现 IDB 字面量被 CI 拒） ----
//
// preview.js 负责：渲染抽屉 HTML + 动态加载 utils/diag.js + 按钮事件路由
// utils/diag.js 负责：所有 IndexedDB 读写、catId 漂移检测、JSON 导出、修复

function diagSetOut(key, value) {
  const el = document.querySelector(`[data-diag-out="${key}"]`);
  if (el) el.textContent = value;
}

let diagModulePromise = null;
function loadDiagModule() {
  if (diagModulePromise) return diagModulePromise;
  diagModulePromise = new Promise((resolve, reject) => {
    if (window.CatEatDiag) {
      resolve(window.CatEatDiag);
      return;
    }
    const s = document.createElement("script");
    s.src = "./utils/diag.js";
    s.onload = () => resolve(window.CatEatDiag);
    s.onerror = () => reject(new Error("utils/diag.js 加载失败"));
    document.head.appendChild(s);
  });
  return diagModulePromise;
}

async function dispatchDiagAction(action) {
  const out = await loadDiagModule();
  return out.run(action, dataStore);
}

function bindDiagActions() {
  const panel = document.querySelector("[data-diag-panel]");
  if (!panel) return;
  panel.addEventListener("click", async (event) => {
    const btn = event.target.closest("[data-diag-action]");
    if (!btn) return;
    const action = btn.dataset.diagAction;
    try {
      diagSetOut(action, "执行中…");
      const result = await dispatchDiagAction(action);
      diagSetOut(action, result);
    } catch (e) {
      diagSetOut(action, "ERR: " + (e && e.message ? e.message : e));
    }
  });
}

function renderCloudSyncCard() {
  const dataStore = window.CatEatData;
  if (!dataStore) return "";
  // SDK 完全没加载 → 不显示（云同步能力不可用）
  if (!dataStore.isCloudBaseSdkAvailable()) return "";

  // v1.1.2：env ID 有 hardcoded default，永远 resolve 成功。
  // UI 改成「状态显示 + 主动操作按钮」，不再有「填 env ID」onboarding。
  // 启动时 data-store 已自动 cloudSync.start()，user 几乎无感。
  const cs = dataStore.cloudSync;
  if (!cs) return "";
  const state = cs.getState();
  const phaseLabel = {
    idle: "准备中…",
    connecting: "连接中…",
    ready: "已同步",
    syncing: "同步中…",
    error: "同步出错"
  }[state.phase] || state.phase;
  const lastSync = state.lastSyncAt
    ? new Date(state.lastSyncAt).toLocaleString("zh-CN", { hour12: false })
    : "—";
  // 友好提示文案随状态变
  let hint = "数据自动备份到云端，无需手动操作。";
  if (state.phase === "error") {
    hint = "网络或权限问题，重试或检查调试工具。";
  } else if (state.phase === "connecting" || state.phase === "idle") {
    hint = "首次连接中，约 2-5 秒。";
  } else if (state.phase === "ready") {
    hint = "数据自动备份到云端。换设备登录同一账号可同步。";
  }
  return `
    <section class="home-cloud-card" aria-label="云同步">
      <header class="home-cloud-head">
        <h3>云同步</h3>
        <span class="home-cloud-status" data-cloud-phase="${state.phase}">${escapeHtml(phaseLabel)}</span>
      </header>
      <p class="home-cloud-meta">最近一次同步：${escapeHtml(lastSync)}</p>
      <p class="home-cloud-hint">${escapeHtml(hint)}</p>
      ${state.error ? `<p class="home-cloud-error">${escapeHtml(state.error)}</p>` : ""}
      <div class="home-cloud-actions">
        <button type="button" class="cloud-button" data-cloud-action="push">立即上传到云</button>
        <button type="button" class="cloud-button cloud-button-secondary" data-cloud-action="pull">从云恢复</button>
        <button type="button" class="cloud-button cloud-button-secondary home-cloud-disconnect" data-cloud-action="disconnect">断开</button>
      </div>
    </section>
  `;
}

function pickerFoodCard(food) {
  const meta = [
    FOOD_TYPES[food.foodType] || "其他",
    food.flavor || "",
    food.latestOutcome?.shortLabel || "待反馈"
  ]
    .filter(Boolean)
    .join(" · ");

  return `
    <button class="picker-food-card" data-feedback-food="${escapeHtml(food.id)}">
      ${thumbnail(food)}
      <span class="picker-food-copy">
        <small>${escapeHtml(food.brand || "品牌待补充")}</small>
        <strong>${escapeHtml(food.name || "未命名食物")}</strong>
        <small>${escapeHtml(meta)}</small>
      </span>
    </button>
  `;
}

function pickerMatches(food, query) {
  if (!query) return true;
  const searchable = [
    food.brand,
    food.name,
    food.flavor,
    food.texture,
    FOOD_TYPES[food.foodType]
  ]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase("zh-CN");
  return searchable.includes(query.toLocaleLowerCase("zh-CN"));
}

function foodPickerResults() {
  const foods = listFoods();
  const query = state.pickerQuery.trim();
  const availableTypes = FOOD_TYPE_ORDER.filter((type) =>
    foods.some((food) => food.foodType === type)
  );
  const expanded = state.pickerExpanded || Boolean(query) || Boolean(state.pickerType);
  const matches = foods.filter(
    (food) =>
      pickerMatches(food, query) &&
      (!state.pickerType || food.foodType === state.pickerType)
  );
  const visibleFoods = expanded ? matches : foods.slice(0, 4);

  if (!foods.length) {
    return `
      <div class="record-picker-empty">
        ${uiIcon("cat", "empty-cat", "猫猫头占位图")}
        <strong>还没有食物档案</strong>
        <p>先拍一款新品，下次就能直接选择它。</p>
      </div>
    `;
  }

  return `
    <section class="record-picker-library" aria-label="${expanded ? "全部已有食物" : "最近喂过"}">
      <div class="record-picker-section-head">
        <h3>${expanded ? (query ? "搜索结果" : "全部食物") : "最近喂过"}</h3>
        ${
          expanded
            ? `<span>${matches.length} 款</span>`
            : `<button type="button" data-expand-picker>全部食物 ${foods.length}</button>`
        }
      </div>
      ${
        expanded && availableTypes.length > 1
          ? `
            <div class="record-type-filters" aria-label="按食物类型筛选">
              ${availableTypes
                .map(
                  (type) => `
                    <button
                      class="record-type-chip filter-chip ${state.pickerType === type ? "active" : ""}"
                      type="button"
                      data-picker-type="${type}"
                      aria-pressed="${state.pickerType === type}"
                    >${escapeHtml(FOOD_TYPES[type])}</button>
                  `
                )
                .join("")}
            </div>
          `
          : ""
      }
      ${
        visibleFoods.length
          ? `<div class="picker-food-grid">${visibleFoods.map(pickerFoodCard).join("")}</div>`
          : `
            <div class="record-picker-no-results">
              ${uiIcon("search", "record-picker-no-results-icon")}
              <strong>没有找到</strong>
              <p>换个品牌、肉类或食物类型试试。</p>
            </div>
          `
      }
    </section>
  `;
}

function foodPicker() {
  return `
    <div class="modal-backdrop" data-close-picker>
      <section
        class="modal-sheet record-picker-sheet ${state.pickerExpanded ? "expanded" : ""}"
        data-record-sheet
        role="dialog"
        aria-modal="true"
        aria-labelledby="picker-title"
        tabindex="-1"
      >
        <div class="record-picker-head">
          <span>
            <h2 id="picker-title">立即记录</h2>
            <p>选刚刚喂的，或者拍一款新品</p>
          </span>
          <button class="icon-button modal-close-button" type="button" data-close-picker aria-label="关闭">
            ${uiIcon("close")}
          </button>
        </div>
        <button class="record-new-action" type="button" data-nav="add">
          <span class="record-new-icon">${uiIcon("camera")}</span>
          <span>
            <strong>拍一款新品</strong>
            <small>第一次只拍包装，之后不用重复拍</small>
          </span>
        </button>
        <label class="record-picker-search">
          ${uiIcon("search", "search-icon")}
          <input
            data-picker-search
            data-mobile-keyboard
            type="search"
            inputmode="search"
            enterkeyhint="search"
            value="${escapeHtml(state.pickerQuery)}"
            placeholder="搜索品牌、口味或类型"
            aria-label="搜索已有食物"
          />
        </label>
        <div class="record-picker-results" data-picker-results>
          ${foodPickerResults()}
        </div>
      </section>
    </div>
  `;
}

function profileNameSheet(catProfile) {
  return `
    <div class="modal-backdrop profile-name-backdrop" data-close-profile>
      <section
        class="modal-sheet profile-name-sheet"
        data-profile-name-sheet
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-name-title"
        tabindex="-1"
      >
        <header class="profile-name-sheet-head">
          <h2 id="profile-name-title">编辑昵称</h2>
          <button class="icon-button modal-close-button" type="button" data-close-profile aria-label="关闭昵称编辑">
            ${uiIcon("close")}
          </button>
        </header>
        <form class="profile-name-sheet-form" id="cat-profile-name-form">
          <input
            id="library-profile-name-input"
            data-profile-name
            data-mobile-keyboard
            name="nickname"
            type="text"
            aria-label="猫猫昵称"
            inputmode="text"
            enterkeyhint="done"
            maxlength="20"
            value="${escapeHtml(catProfile.nickname)}"
            placeholder="例如：年糕"
            autocomplete="off"
            required
          />
          <button class="primary-button profile-name-save" type="submit">保存</button>
        </form>
      </section>
    </div>
  `;
}

function syncProfileSheetViewport() {
  const backdrop = document.querySelector(".profile-name-backdrop");
  if (!backdrop) return;

  const viewport = window.visualViewport;
  const viewportTop = viewport?.offsetTop || 0;
  const viewportHeight = viewport?.height || window.innerHeight;
  backdrop.style.setProperty("--profile-viewport-top", `${viewportTop}px`);
  backdrop.style.setProperty("--profile-viewport-height", `${viewportHeight}px`);
}

function lockProfileSheetPage() {
  profileSheetScrollY = window.scrollY;
  document.body.dataset.profileSheetOpen = "";
  document.body.style.setProperty(
    "--profile-sheet-scroll-offset",
    `${-profileSheetScrollY}px`
  );
  syncProfileSheetViewport();
  window.visualViewport?.addEventListener("resize", syncProfileSheetViewport);
  window.visualViewport?.addEventListener("scroll", syncProfileSheetViewport);
}

function unlockProfileSheetPage() {
  if (!document.body.hasAttribute("data-profile-sheet-open")) return;

  window.visualViewport?.removeEventListener("resize", syncProfileSheetViewport);
  window.visualViewport?.removeEventListener("scroll", syncProfileSheetViewport);
  document.body.removeAttribute("data-profile-sheet-open");
  document.body.style.removeProperty("--profile-sheet-scroll-offset");
  window.scrollTo(0, profileSheetScrollY);
}

function closeProfileNameEditor({ restoreFocus = true } = {}) {
  state.profileEditing = false;
  document.querySelector(".profile-name-backdrop")?.remove();
  unlockProfileSheetPage();

  if (restoreFocus) {
    requestAnimationFrame(() => {
      document.querySelector("[data-edit-profile]")?.focus({ preventScroll: true });
    });
  }
}

function bindProfileNameSheetEvents(root = document) {
  const sheet = root.querySelector("[data-profile-name-sheet]");
  const backdrop = sheet?.closest(".profile-name-backdrop");
  if (!sheet || !backdrop || backdrop.dataset.profileSheetBound === "true") return;
  backdrop.dataset.profileSheetBound = "true";

  backdrop.addEventListener(
    "touchmove",
    (event) => {
      event.preventDefault();
    },
    { passive: false }
  );

  backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop) closeProfileNameEditor();
  });

  backdrop.querySelectorAll("button[data-close-profile]").forEach((button) => {
    button.addEventListener("click", () => closeProfileNameEditor());
  });

  sheet.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeProfileNameEditor();
  });

  sheet.querySelector("#cat-profile-name-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const nickname = String(
      new FormData(event.currentTarget).get("nickname") || ""
    ).trim();
    if (!nickname) {
      showToast("请填写猫猫昵称");
      return;
    }
    try {
      await writeCatProfile({ ...readCatProfile(), nickname });
      const nameLabel = document.querySelector("[data-profile-name-label]");
      if (nameLabel) nameLabel.textContent = formatCatNickname(nickname);
      closeProfileNameEditor({ restoreFocus: false });
      showToast("昵称已保存");
    } catch (error) {
      showToast("昵称暂时没有保存成功");
    }
  });
}

function openProfileNameEditor() {
  if (document.querySelector(".profile-name-backdrop")) return;

  state.profileEditing = true;
  app.insertAdjacentHTML("beforeend", profileNameSheet(readCatProfile()));
  lockProfileSheetPage();
  bindProfileNameSheetEvents(app);

  requestAnimationFrame(() => {
    syncProfileSheetViewport();
    const profileName = document.querySelector("[data-profile-name]");
    profileName?.focus({ preventScroll: true });
    profileName?.select();
  });
}

function normalizeTextureSelection(value) {
  const current = String(value || "").trim();
  if (TEXTURE_OPTIONS.includes(current)) return current;
  if (/肉泥|慕斯/.test(current)) return "肉泥/慕斯";
  if (/冻干/.test(current)) return "冻干";
  return "";
}

function choiceField(name, label, selectedValue, options, placeholder = "请选择") {
  const fieldId = `food-${name}-label`;
  const valueId = `food-${name}-value-label`;
  const selectedLabel = options.find(([value]) => value === selectedValue)?.[1] || "";

  return `
    <div class="field-row choice-field" data-choice-field="${escapeHtml(name)}">
      <span id="${fieldId}" class="field-label-text">${escapeHtml(label)}</span>
      <input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(selectedValue)}" data-choice-value="${escapeHtml(name)}" />
      <button
        class="choice-field-trigger"
        type="button"
        data-choice-trigger="${escapeHtml(name)}"
        aria-labelledby="${fieldId} ${valueId}"
        aria-haspopup="dialog"
        aria-controls="food-${escapeHtml(name)}-sheet"
        aria-expanded="false"
      >
        <span id="${valueId}" class="choice-field-value ${selectedLabel ? "" : "is-placeholder"}">${escapeHtml(selectedLabel || placeholder)}</span>
        <img class="choice-field-chevron" src="./assets/icons/figma-add-chevron-right.svg" alt="" aria-hidden="true" />
      </button>
    </div>
  `;
}

function choiceSheet(name, title, selectedValue, options) {
  return `
    <div class="choice-sheet-layer" data-choice-sheet="${escapeHtml(name)}" hidden>
      <button class="choice-sheet-scrim" type="button" data-choice-close="${escapeHtml(name)}" aria-label="关闭${escapeHtml(title)}选择"></button>
      <section
        class="choice-sheet-panel"
        id="food-${escapeHtml(name)}-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="food-${escapeHtml(name)}-sheet-title"
        style="--choice-sheet-height: ${92 + options.length * 56}px"
        tabindex="-1"
      >
        <header class="choice-sheet-head">
          <h2 id="food-${escapeHtml(name)}-sheet-title">${escapeHtml(title)}</h2>
          <button class="choice-sheet-close" type="button" data-choice-close="${escapeHtml(name)}" aria-label="关闭${escapeHtml(title)}选择">
            <img src="./assets/icons/figma-sheet-close.svg" alt="" aria-hidden="true" />
          </button>
        </header>
        <div class="choice-sheet-options" role="radiogroup" aria-labelledby="food-${escapeHtml(name)}-sheet-title">
          ${options
            .map(([value, optionLabel]) => {
              const selected = value === selectedValue;
              return `
                <button
                  class="choice-sheet-option ${selected ? "selected" : ""}"
                  type="button"
                  role="radio"
                  aria-checked="${selected}"
                  data-choice-option="${escapeHtml(name)}"
                  data-choice-option-value="${escapeHtml(value)}"
                >
                  <span>${escapeHtml(optionLabel)}</span>
                  <img
                    class="choice-sheet-radio"
                    src="./assets/icons/${selected ? "figma-radio-checked.svg" : "figma-radio-default.svg"}"
                    alt=""
                    aria-hidden="true"
                  />
                </button>
              `;
            })
            .join("")}
        </div>
      </section>
    </div>
  `;
}

function addFoodView() {
  const editing = state.selectedFoodId ? findFood(state.selectedFoodId) : null;
  const type = editing?.foodType || "staple_can";
  const texture = normalizeTextureSelection(editing?.texture);
  const photo = state.photoDataUrl || editing?.photoPath || "";
  const typeOptions = Object.entries(FOOD_TYPES);
  const textureOptions = TEXTURE_OPTIONS.map((option) => [option, option]);

  return `
    <section class="fixed-page-shell add-page-shell">
      ${topbar(editing ? "编辑食物" : "加食物")}
      <main class="screen no-tab fixed-page-scroll add-screen">

      <aside class="page-intro-tip" role="note">赶时间？可以只先拍包装，有空再补详情～</aside>

      <form id="food-form" data-editing-id="${editing?.id || ""}">
        <section class="add-photo-card">
          <span class="add-photo-label"><span aria-hidden="true">*</span>包装图</span>
          <label class="photo-upload" aria-label="拍包装或选择照片">
            <input id="photo-input" type="file" accept="image/*" />
            ${
              photo
                ? image(photo, "photo-preview", "包装预览")
                : '<img class="add-photo-plus" src="./assets/icons/figma-add-plus.svg" alt="" aria-hidden="true" />'
            }
          </label>
        </section>

        <section class="form-card">
          ${choiceField("foodType", "类型", type, typeOptions)}
          ${autocompleteField("brand", "品牌", editing?.brand, "请输入")}
          ${autocompleteField("name", "产品名", editing?.name, "请输入")}
          <label class="field-row">
            <span class="field-label-text">规格</span>
            <input
              name="specification"
              value="${escapeHtml(editing?.specification || "")}"
              placeholder="请输入"
              inputmode="text"
              enterkeyhint="next"
              data-mobile-keyboard
            />
          </label>
          ${autocompleteField("flavor", "肉源/口味", editing?.flavor, "请输入")}
          ${choiceField("texture", "质地", texture, textureOptions)}
        </section>

        <section class="duplicate-food-notice" data-duplicate-food-notice role="status" aria-live="polite" hidden></section>

        </form>
      </main>
      <footer class="fixed-bottom-action add-bottom-action">
        <button class="primary-button fixed-bottom-action-button add-submit-button" type="submit" form="food-form">保存</button>
      </footer>
      ${choiceSheet("foodType", "类型", type, typeOptions)}
      ${choiceSheet("texture", "质地", texture, textureOptions)}
    </section>
  `;
}

function feedback() {
  const food = findFood(state.selectedFoodId) || listFoods()[0];

  if (!food) {
    return home();
  }

  state.selectedFoodId = food.id;
  const outcomes = Object.values(rules.OUTCOMES);

  return `
    <section class="fixed-page-shell feedback-page-shell">
      ${topbar("记录这次表现")}
      <main class="screen no-tab fixed-page-scroll feedback-screen">

      <section class="identity-row">
        ${thumbnail(food)}
        <span class="food-row-copy">
          <small>${escapeHtml(food.brand || "品牌待补充")}</small>
          <strong>${escapeHtml(food.name)}</strong>
          <small>${escapeHtml(FOOD_TYPES[food.foodType] || "其他")}</small>
        </span>
        <span class="progress-note">近 90 天 ${food.progress}/3</span>
      </section>

      <section class="feedback-heading">
        <h1>最接近哪种表现？</h1>
        <p>看它的主动性，不用估算精确克重。</p>
      </section>

      <section class="outcome-list">
        ${outcomes
          .map(
            (outcome) => `
              <button class="outcome-option ${state.selectedOutcome === outcome.key ? "selected" : ""}" data-outcome="${outcome.key}" aria-pressed="${state.selectedOutcome === outcome.key}">
                <span class="outcome-icon-shell">${uiIcon(outcomeIcon(outcome.key), "outcome-icon")}</span>
                <span class="outcome-copy">
                  <strong>${outcome.label}</strong>
                  <small>${outcome.description}</small>
                </span>
                <span class="selection-mark">${state.selectedOutcome === outcome.key ? uiIcon("check", "", "已选") : ""}</span>
              </button>
            `
          )
          .join("")}
      </section>

      <label class="feedback-note-field">
        <span>备注 <small>选填，最多 120 字</small></span>
        <textarea
          data-feedback-note
          data-mobile-keyboard
          inputmode="text"
          enterkeyhint="done"
          maxlength="120"
          rows="2"
          placeholder="例如：加了冻干才愿意吃"
        >${escapeHtml(state.feedbackNote)}</textarea>
      </label>

      </main>
      <footer class="fixed-bottom-action feedback-bottom-action">
        <button class="primary-button fixed-bottom-action-button" data-submit-feedback ${state.selectedOutcome ? "" : "disabled"}>保存</button>
      </footer>
    </section>
  `;
}

function detail() {
  const food = findFood(state.selectedFoodId);

  if (!food) {
    state.screen = "home";
    state.selectedFoodId = "";
    history.replaceState(null, "", "?screen=home");
    return home();
  }

  const feedbackHistory = (food.results || []).slice().sort((a, b) => b.createdAt - a.createdAt);
  const progressWidth = `${Math.min(food.progress / 3, 1) * 100}%`;

  return `
    <section class="fixed-page-shell detail-page-shell">
      ${topbar("食物详情", { action: `<button class="topbar-action" data-edit-food="${food.id}">编辑</button>` })}
      <main class="screen no-tab fixed-page-scroll detail-screen">

      <section class="detail-card">
        ${thumbnail(food)}
        <div class="detail-copy">
          <small>${escapeHtml(food.brand || "品牌待补充")} · ${escapeHtml(FOOD_TYPES[food.foodType] || "其他")}</small>
          <h1>${escapeHtml(food.name)}</h1>
          <p>${escapeHtml([food.flavor, food.texture].filter(Boolean).join(" · ") || "信息待补充")}</p>
        </div>
      </section>

      <section class="status-panel">
        <div class="status-panel-head">
          <h2>${escapeHtml(food.status.label)}</h2>
          ${statusBadge(food)}
        </div>
        <p>${statusExplanation(food)}</p>
        <div class="progress-meta"><span>近 90 天好反馈</span><strong>${food.progress}/3</strong></div>
        <div class="progress-track"><span style="width:${progressWidth}"></span></div>
      </section>

      <button class="primary-button" data-feedback-food="${food.id}">记录这次表现</button>
      ${
        food.status.key === "avoid"
          ? `<button class="secondary-button" data-retry-food="${food.id}">再给一次机会</button>`
          : ""
      }

      <section class="section">
        <div class="section-heading"><div><h2>反馈历史</h2><p>旧记录会保留，当前判断只看最近 90 天</p></div></div>
        ${
          feedbackHistory.length
            ? `
              <div class="history">
                ${feedbackHistory
                  .map((item) => {
                    const outcome = rules.OUTCOMES[item.outcome];
                    return `
                      <div class="history-item">
                        ${uiIcon(outcomeIcon(item.outcome), "history-icon")}
                        <span class="history-copy">
                          <strong>${outcome.label}</strong>
                          <small>${escapeHtml(item.note || outcome.description)}</small>
                        </span>
                        <span class="history-date">${formatDate(item.createdAt)}</span>
                      </div>
                    `;
                  })
                  .join("")}
              </div>
            `
            : `<div class="empty-card"><strong>还没有反馈</strong><p>第一次吃完后点一下表现即可。</p></div>`
        }
      </section>

        <button class="danger-button" data-delete-food="${food.id}">删除这款食物</button>
      </main>
    </section>
  `;
}

const LIBRARY_GROUPS = [
  ["buy", "放心买", "近 90 天通过三次好反馈", "heart"],
  ["trial", "少量再试", "还在形成判断", "box"],
  ["stale", "待复验", "以前喜欢，最近记录不足", "eye"],
  ["observe", "近期观察", "最近有点降温", "eye"],
  ["skip", "不主动补货", "勉强吃或已暂停", "clock"],
  ["avoid", "埋屎避雷", "先不要重复购买", "warning"]
];

function normalizedFoodType(food) {
  return FOOD_TYPES[food.foodType] ? food.foodType : "other";
}

function searchFilteredFoods() {
  const query = state.libraryQuery.trim().toLowerCase();

  return listFoods().filter((food) => {
    const haystack = [
      food.brand,
      food.name,
      food.flavor,
      food.texture,
      FOOD_TYPES[normalizedFoodType(food)]
    ]
      .join(" ")
      .toLowerCase();
    return !query || haystack.includes(query);
  });
}

function libraryBrowserHtml() {
  const foods = searchFilteredFoods();
  const groups = rules.groupForShopping(foods);
  const visibleGroups = LIBRARY_GROUPS.filter(([key]) => groups[key].length);

  if (!visibleGroups.length) {
    state.libraryGroup = "";
    state.libraryType = "";
    return `<div class="empty-card library-empty"><strong>没有找到相符的食物</strong><p>换个关键词试试看。</p></div>`;
  }

  if (!visibleGroups.some(([key]) => key === state.libraryGroup)) {
    state.libraryGroup = visibleGroups[0][0];
    state.libraryType = "";
  }

  const activeGroup = LIBRARY_GROUPS.find(([key]) => key === state.libraryGroup);
  const [, activeTitle, activeDescription] = activeGroup;
  const groupFoods = groups[state.libraryGroup];
  const availableTypes = FOOD_TYPE_ORDER.filter((type) =>
    groupFoods.some((food) => normalizedFoodType(food) === type)
  );

  if (state.libraryType && !availableTypes.includes(state.libraryType)) {
    state.libraryType = "";
  }

  const visibleFoods = state.libraryType
    ? groupFoods.filter((food) => normalizedFoodType(food) === state.libraryType)
    : groupFoods;

  return `
    <div class="library-tabs" role="tablist" aria-label="补货判断">
      ${visibleGroups
        .map(
          ([key, title]) => `
            <button
              id="library-tab-${key}"
              class="library-tab status-tab ${state.libraryGroup === key ? "active" : ""}"
              type="button"
              role="tab"
              aria-selected="${state.libraryGroup === key}"
              aria-controls="library-tab-panel"
              aria-label="${escapeHtml(`${title}，${groups[key].length}款`)}"
              tabindex="${state.libraryGroup === key ? "0" : "-1"}"
              data-library-group="${key}"
            >
              <span>${escapeHtml(title)}</span>
              <small>${groups[key].length}</small>
            </button>
          `
        )
        .join("")}
    </div>

    <section
      id="library-tab-panel"
      class="library-tab-panel"
      role="tabpanel"
      aria-labelledby="library-tab-${state.libraryGroup}"
    >
      ${
        availableTypes.length
          ? `
            <div class="library-type-filters" aria-label="${escapeHtml(`${activeTitle}的食物类型筛选`)}">
              ${availableTypes
                .map(
                  (type) => `
                    <button
                      class="library-type-chip filter-chip ${state.libraryType === type ? "active" : ""}"
                      type="button"
                      aria-pressed="${state.libraryType === type}"
                      data-library-type="${type}"
                    ><span class="library-type-chip-label">${escapeHtml(FOOD_TYPES[type])}</span></button>
                  `
                )
                .join("")}
            </div>
          `
          : ""
      }

      <div class="library-tab-meta">
        <span>${escapeHtml(activeDescription)}</span>
        <strong>${visibleFoods.length} 款</strong>
      </div>
      <div class="food-list">${visibleFoods.map((food) => foodRow(food, { productThumbnail: true })).join("")}</div>
    </section>
  `;
}

function refreshLibraryBrowser() {
  const browser = document.querySelector("[data-library-browser]");

  if (browser) {
    browser.innerHTML = libraryBrowserHtml();
    bindFoodLinks(browser);
    bindImageFallback(browser);
  }
}

function library() {
  const catProfile = readCatProfile();
  const avatar = catProfile.photoPath || DEFAULT_CAT_AVATAR;
  return `
    <main class="screen library-screen">
      <section class="library-cat-profile" aria-label="当前猫咪资料">
        <div class="library-profile-center">
          <label class="library-avatar-action" aria-label="更换猫猫头像">
            <img
              class="library-cat-avatar"
              src="${escapeHtml(avatar)}"
              alt="猫猫头像"
              data-profile-image-fallback
            />
            <input data-profile-photo-input type="file" accept="image/*" />
            <span class="library-avatar-camera">${uiIcon("camera", "", "更换头像")}</span>
          </label>
          <div class="library-profile-name-row">
            <button class="library-cat-name" type="button" data-edit-profile aria-label="编辑猫猫昵称">
              <span data-profile-name-label>${escapeHtml(formatCatNickname(catProfile.nickname))}</span>
              ${uiIcon("edit", "library-name-edit-icon")}
            </button>
          </div>
        </div>

      </section>

      <section class="library-sheet">
        <header class="library-sheet-heading">
          <h1>补货清单</h1>
        </header>

        <section class="search-tools">
          <label class="search-wrap">
            ${uiIcon("search", "search-icon")}
            <input
              class="search-input"
              data-library-search
              data-mobile-keyboard
              type="search"
              inputmode="search"
              enterkeyhint="search"
              autocomplete="off"
              value="${escapeHtml(state.libraryQuery)}"
              placeholder="搜品牌、口味或质地"
              aria-label="搜索食物"
            />
          </label>
        </section>

        <div class="library-browser" data-library-browser>${libraryBrowserHtml()}</div>
      </section>
    </main>
    ${bottomNav("library")}
    ${state.pickerOpen ? foodPicker() : ""}
  `;
}

function route(screen, params = {}, replace = false) {
  closeProfileNameEditor({ restoreFocus: false });
  const prevScreen = state.screen;
  state.screen = screen === "record" ? "home" : screen;
  state.pickerOpen = false;
  state.pickerExpanded = false;
  state.pickerQuery = "";
  state.pickerType = "";
  state.pickerTrigger = "";
  state.profileEditing = false;
  state.selectedOutcome = "";
  state.feedbackNote = "";

  if (params.id !== undefined) {
    state.selectedFoodId = params.id;
  } else if (!["detail", "feedback", "add"].includes(screen)) {
    state.selectedFoodId = "";
  }

  const search = buildSearchParams();

  // 离开旧 screen 前，保存它的滚动位置
  saveScrollPosition(prevScreen);

  const method = replace ? "replaceState" : "pushState";
  const historyEntry = { screen: state.screen };
  if (state.screen === "feedback") {
    historyEntry.from = prevScreen;
  }
  history[method](historyEntry, "", `?${search.toString()}`);
  render();
  // 进入新 screen 后恢复滚动位置（如果没有则保持 0）
  restoreScrollPosition(state.screen);
}

function saveScrollPosition(screenKey) {
  if (!screenKey) return;
  try {
    sessionStorage.setItem(`scroll:${screenKey}`, String(window.scrollY));
  } catch (error) {
    // sessionStorage 不可用时静默忽略
  }
}

function restoreScrollPosition(screenKey) {
  if (!screenKey) {
    window.scrollTo(0, 0);
    return;
  }
  let saved = null;
  try {
    saved = sessionStorage.getItem(`scroll:${screenKey}`);
  } catch (error) {
    saved = null;
  }
  if (saved === null) {
    window.scrollTo(0, 0);
    return;
  }
  const target = Number(saved);
  if (Number.isFinite(target) && target > 0) {
    requestAnimationFrame(() => window.scrollTo(0, target));
  } else {
    window.scrollTo(0, 0);
  }
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove("show"), 2200);
}

// 把当前 state 序列化成 URL 查询串；library 内部状态变更后用 replaceState 同步
function buildSearchParams() {
  const search = new URLSearchParams();
  search.set("screen", state.screen);
  if (state.selectedFoodId && ["detail", "feedback", "add"].includes(state.screen)) {
    search.set("id", state.selectedFoodId);
  }
  if (state.screen === "library") {
    if (state.libraryGroup && state.libraryGroup !== "buy") {
      search.set("group", state.libraryGroup);
    }
    if (state.libraryType) {
      search.set("type", state.libraryType);
    }
    if (state.libraryQuery) {
      search.set("q", state.libraryQuery);
    }
  }
  return search;
}

function syncLibraryUrl() {
  if (state.screen !== "library") return;
  history.replaceState(null, "", `?${buildSearchParams().toString()}`);
}

function compressImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const source = new Image();
      source.onerror = reject;
      source.onload = () => {
        const maxSize = 720;
        const scale = Math.min(maxSize / source.width, maxSize / source.height, 1);
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(source.width * scale);
        canvas.height = Math.round(source.height * scale);
        const context = canvas.getContext("2d");
        context.drawImage(source, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.68));
      };
      source.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

async function submitFood(form) {
  const data = new FormData(form);
  const editingId = form.dataset.editingId;
  const foods = readFoods();
  const existingIndex = foods.findIndex((food) => food.id === editingId);
  const existing = existingIndex >= 0 ? foods[existingIndex] : null;
  const brand = String(data.get("brand") || "").trim();
  const name = String(data.get("name") || "").trim();
  const photoPath = state.photoDataUrl || existing?.photoPath || "";

  if (!photoPath && !brand && !name) {
    showToast("请拍包装，或填写名称 / 品牌");
    return;
  }

  const food = {
    ...(existing || {}),
    id: existing?.id || createId("food"),
    catId: existing?.catId || dataStore.status().catId,
    ownerId: existing?.ownerId || null,
    brand: brand || "品牌待补充",
    name: name || "未命名食物",
    specification: String(data.get("specification") || "").trim(),
    foodType: String(data.get("foodType") || "other"),
    flavor: String(data.get("flavor") || "").trim(),
    texture: String(data.get("texture") || "其他"),
    createdAt: existing?.createdAt || Date.now(),
    updatedAt: Date.now()
  };

  try {
    await dataStore.saveFood(food, { photoDataUrl: state.photoDataUrl });
    state.photoDataUrl = "";
    // 用 replaceState 覆盖 add 页，back 一次直接回上一级（home / 详情）
    route("detail", { id: food.id }, true);
    showToast(existing ? "修改已经保存" : "已经加入清单");
  } catch (error) {
    showToast("照片或数据暂时没有保存成功");
  }
}

async function submitFeedback() {
  if (!state.selectedOutcome) {
    return;
  }

  const food = dataStore.getFood(state.selectedFoodId);
  if (!food) {
    showToast("没有找到这款食物");
    return;
  }

  try {
    let updated = await dataStore.addResult(food.id, {
      id: createId("result"),
      outcome: state.selectedOutcome,
      note: state.feedbackNote.trim(),
      createdAt: Date.now(),
      updatedAt: Date.now()
    });
    const summary = rules.summarizeFood(updated);
    if (summary.status.key === "repurchase" && !updated.everQualified) {
      updated = await dataStore.updateFood(food.id, { everQualified: true });
    }
    state.selectedOutcome = "";
    state.feedbackNote = "";
    if (history.state?.from === "detail") {
      // 回退到原详情历史项，避免产生“详情 → 反馈 → 详情”的重复栈。
      showToast("这次表现已经记住");
      history.back();
    } else {
      // 从首页或清单的快速记录进入时，保存后仍展示最新判断。
      route("detail", { id: updated.id }, true);
      showToast("这次表现已经记住");
    }
  } catch (error) {
    showToast("这次反馈暂时没有保存成功");
  }
}

async function retryFood(foodId) {
  try {
    await dataStore.updateFood(foodId, { manualRetryAfter: Date.now() });
    render();
    showToast("已回到试吃中，原来的记录仍然保留");
  } catch (error) {
    showToast("暂时没有保存成功");
  }
}

async function deleteFood(foodId) {
  if (!window.confirm("删除后会同时移除全部反馈，确定删除吗？")) {
    return;
  }

  try {
    await dataStore.deleteFood(foodId);
    route("home");
    showToast("这款食物已删除");
  } catch (error) {
    showToast("暂时没有删除成功");
  }
}

function bindFoodLinks(root = document) {
  root.querySelectorAll("[data-food]").forEach((element) => {
    element.addEventListener("click", () => route("detail", { id: element.dataset.food }));
  });

  root.querySelectorAll("[data-feedback-food]").forEach((element) => {
    element.addEventListener("click", () =>
      route("feedback", { id: element.dataset.feedbackFood })
    );
  });
}

function bindImageFallback(root = document) {
  root.querySelectorAll("[data-profile-image-fallback]").forEach((element) => {
    element.addEventListener(
      "error",
      () => {
        element.removeAttribute("data-profile-image-fallback");
        element.src = DEFAULT_CAT_AVATAR;
      },
      { once: true }
    );
  });

  root.querySelectorAll("[data-image-fallback]").forEach((element) => {
    element.addEventListener(
      "error",
      () => {
        const productFallback = element.dataset.imageFallback;
        if (["can", "box"].includes(productFallback)) {
          const fallback = document.createElement("span");
          fallback.className = `ui-icon icon-${productFallback} product-fallback`;
          fallback.setAttribute("role", "img");
          fallback.setAttribute(
            "aria-label",
            productFallback === "can" ? "罐头包装占位图" : "食物包装占位图"
          );
          element.replaceWith(fallback);
          return;
        }

        element.removeAttribute("data-image-fallback");
        element.classList.remove("photo");
        const recentMedia = element.closest(".recent-card-media");
        recentMedia?.classList.remove("has-photo");
        recentMedia?.classList.add("is-fallback");
        element.src = ICONS.cat;
        element.classList.add("cat-fallback-image");
        element.alt = "猫猫头占位图";
        scheduleRecentFeedLayout();
      },
      { once: true }
    );
  });
}

function layoutRecentFoodGrid(grid = document.querySelector(".recent-food-grid")) {
  if (!grid?.isConnected) return;

  const cards = Array.from(grid.querySelectorAll(".recent-food-card"));
  if (!cards.length) return;

  grid.classList.remove("is-masonry");
  grid.style.removeProperty("height");
  cards.forEach((card) => {
    card.style.removeProperty("width");
    card.style.removeProperty("--recent-card-x");
    card.style.removeProperty("--recent-card-y");
  });

  const gridWidth = grid.clientWidth;
  if (!gridWidth) return;

  const styles = getComputedStyle(grid);
  const measuredGap = Number.parseFloat(styles.columnGap);
  const gap = Number.isFinite(measuredGap) ? measuredGap : 9;
  const columnWidth = (gridWidth - gap) / 2;
  const columnHeights = [0, 0];

  cards.forEach((card, index) => {
    const column = index % 2;
    card.style.width = `${columnWidth}px`;
    card.style.setProperty("--recent-card-x", `${column * (columnWidth + gap)}px`);
    card.style.setProperty("--recent-card-y", `${columnHeights[column]}px`);
    columnHeights[column] += card.getBoundingClientRect().height + gap;
  });

  grid.style.height = `${Math.max(...columnHeights) - gap}px`;
  grid.classList.add("is-masonry");
}

function scheduleRecentFeedLayout() {
  window.cancelAnimationFrame(recentFeedLayoutFrame);
  recentFeedLayoutFrame = window.requestAnimationFrame(() => {
    recentFeedLayoutFrame = 0;
    layoutRecentFoodGrid();
  });
}

function bindRecentFeedLayout(root = document) {
  recentFeedResizeObserver?.disconnect();
  recentFeedResizeObserver = null;

  const grid = root.querySelector(".recent-food-grid");
  if (!grid) return;

  grid.querySelectorAll("img").forEach((element) => {
    if (!element.complete) {
      element.addEventListener("load", scheduleRecentFeedLayout, { once: true });
    }
  });

  if ("ResizeObserver" in window) {
    recentFeedResizeObserver = new ResizeObserver(scheduleRecentFeedLayout);
    recentFeedResizeObserver.observe(grid.parentElement || grid);
    grid.querySelectorAll(".recent-food-card").forEach((card) => {
      recentFeedResizeObserver.observe(card);
    });
  }

  document.fonts?.ready.then(scheduleRecentFeedLayout);
  scheduleRecentFeedLayout();
}

function closeAutocompleteField(field) {
  if (!field) return;

  const input = field.querySelector("[data-autocomplete-input]");
  const list = field.querySelector("[data-autocomplete-list]");
  if (list) {
    list.hidden = true;
    list.innerHTML = "";
  }
  input?.setAttribute("aria-expanded", "false");
  field.classList.remove("has-suggestions");
}

function closeAutocompleteMenus(except = null) {
  document.querySelectorAll("[data-autocomplete-field]").forEach((field) => {
    if (field !== except) closeAutocompleteField(field);
  });
}

function refreshAutocomplete(field) {
  const input = field?.querySelector("[data-autocomplete-input]");
  const list = field?.querySelector("[data-autocomplete-list]");
  if (!input || !list) return;

  const suggestions = autocompleteSuggestions(field.dataset.autocompleteField, input.value);
  if (!suggestions.length) {
    closeAutocompleteField(field);
    return;
  }

  list.innerHTML = `
    <div class="autocomplete-heading">已有产品</div>
    ${suggestions
      .map(
        ({ value, count }) => `
          <button
            class="autocomplete-option"
            type="button"
            role="option"
            aria-selected="false"
            data-autocomplete-option
            data-autocomplete-value="${escapeHtml(value)}"
          >
            <span>${escapeHtml(value)}</span>
            <small>${count} 款已有记录</small>
          </button>
        `
      )
      .join("")}
  `;
  list.hidden = false;
  input.setAttribute("aria-expanded", "true");
  field.classList.add("has-suggestions");
}

function bindAutocomplete() {
  if (app.dataset.autocompleteBound === "true") return;
  app.dataset.autocompleteBound = "true";

  app.addEventListener("input", (event) => {
    const input = event.target.closest?.("[data-autocomplete-input]");
    if (!input) return;

    const field = input.closest("[data-autocomplete-field]");
    closeAutocompleteMenus(field);
    refreshAutocomplete(field);
  });

  app.addEventListener("focusin", (event) => {
    const input = event.target.closest?.("[data-autocomplete-input]");
    if (!input) return;
    if (input.dataset.autocompleteSkipFocus === "true") {
      delete input.dataset.autocompleteSkipFocus;
      return;
    }
    if (!input.value.trim()) return;

    const field = input.closest("[data-autocomplete-field]");
    closeAutocompleteMenus(field);
    refreshAutocomplete(field);
  });

  app.addEventListener("click", (event) => {
    const option = event.target.closest?.("[data-autocomplete-option]");
    if (option) {
      event.preventDefault();
      const field = option.closest("[data-autocomplete-field]");
      const input = field?.querySelector("[data-autocomplete-input]");
      if (field && input) {
        input.value = option.dataset.autocompleteValue || "";
        closeAutocompleteField(field);
        input.dataset.autocompleteSkipFocus = "true";
        input.focus();
        refreshDuplicateFoodNotice(input.closest("#food-form"));
      }
      return;
    }

    if (!event.target.closest?.("[data-autocomplete-field]")) {
      closeAutocompleteMenus();
    }
  });

  app.addEventListener("keydown", (event) => {
    const control = event.target.closest?.(
      "[data-autocomplete-input], [data-autocomplete-option]"
    );
    if (!control) return;

    const field = control.closest("[data-autocomplete-field]");
    const input = field?.querySelector("[data-autocomplete-input]");
    const options = field
      ? Array.from(field.querySelectorAll("[data-autocomplete-option]"))
      : [];
    const currentIndex = options.indexOf(control);

    if (event.key === "Escape") {
      event.preventDefault();
      closeAutocompleteField(field);
      input?.focus();
      return;
    }

    if (event.key === "ArrowDown" && options.length) {
      event.preventDefault();
      options[(currentIndex + 1 + options.length) % options.length].focus();
    }

    if (event.key === "ArrowUp" && options.length) {
      event.preventDefault();
      if (currentIndex <= 0) {
        input?.focus();
      } else {
        options[currentIndex - 1].focus();
      }
    }
  });
}

function choiceSheetParts(name) {
  const field = document.querySelector(`[data-choice-field="${name}"]`);
  const layer = document.querySelector(`[data-choice-sheet="${name}"]`);
  return {
    field,
    layer,
    trigger: field?.querySelector(`[data-choice-trigger="${name}"]`),
    value: field?.querySelector(`[data-choice-value="${name}"]`),
    label: field?.querySelector(".choice-field-value"),
    panel: layer?.querySelector(".choice-sheet-panel")
  };
}

function closeChoiceSheet(name, focusTrigger = false) {
  const { layer, trigger } = choiceSheetParts(name);
  if (!layer || !trigger) return;

  layer.hidden = true;
  trigger.setAttribute("aria-expanded", "false");
  if (!document.querySelector("[data-choice-sheet]:not([hidden])")) {
    document.body.removeAttribute("data-choice-sheet-open");
  }
  if (focusTrigger) trigger.focus();
}

function closeAllChoiceSheets() {
  document.querySelectorAll("[data-choice-sheet]:not([hidden])").forEach((layer) => {
    closeChoiceSheet(layer.dataset.choiceSheet);
  });
}

function openChoiceSheet(name, focusSelected = false) {
  closeAllChoiceSheets();
  const { layer, trigger, panel } = choiceSheetParts(name);
  if (!layer || !trigger || !panel) return;

  if (!layer.querySelector('[data-choice-option][aria-checked="true"]')) {
    const firstOption = layer.querySelector("[data-choice-option]");
    firstOption?.classList.add("selected");
    firstOption?.setAttribute("aria-checked", "true");
    const radio = firstOption?.querySelector(".choice-sheet-radio");
    if (radio) radio.src = "./assets/icons/figma-radio-checked.svg";
  }

  layer.hidden = false;
  trigger.setAttribute("aria-expanded", "true");
  document.body.dataset.choiceSheetOpen = name;
  if (focusSelected) {
    layer.querySelector('[data-choice-option][aria-checked="true"]')?.focus();
  } else {
    panel.focus({ preventScroll: true });
  }
}

function syncChoiceField(name) {
  const { layer, value, label } = choiceSheetParts(name);
  if (!layer || !value || !label) return;

  const selectedOption = layer.querySelector(
    `[data-choice-option="${name}"][data-choice-option-value="${CSS.escape(value.value)}"]`
  );
  const nextLabel = selectedOption?.querySelector("span")?.textContent || "";
  label.textContent = nextLabel || "请选择";
  label.classList.toggle("is-placeholder", !nextLabel);

  layer.querySelectorAll(`[data-choice-option="${name}"]`).forEach((option) => {
    const selected = option === selectedOption;
    option.classList.toggle("selected", selected);
    option.setAttribute("aria-checked", String(selected));
    const radio = option.querySelector(".choice-sheet-radio");
    if (radio) {
      radio.src = `./assets/icons/${selected ? "figma-radio-checked.svg" : "figma-radio-default.svg"}`;
    }
  });
}

function chooseChoiceOption(option) {
  const name = option?.dataset.choiceOption;
  const nextValue = option?.dataset.choiceOptionValue;
  const { value } = choiceSheetParts(name);
  if (!name || !nextValue || !value) return;

  value.value = nextValue;
  syncChoiceField(name);
  value.dispatchEvent(new Event("change", { bubbles: true }));
  closeChoiceSheet(name, true);
}

function bindChoiceSheets() {
  if (app.dataset.choiceSheetsBound === "true") return;
  app.dataset.choiceSheetsBound = "true";

  app.addEventListener("click", (event) => {
    const trigger = event.target.closest?.("[data-choice-trigger]");
    if (trigger) {
      openChoiceSheet(trigger.dataset.choiceTrigger);
      return;
    }

    const option = event.target.closest?.("[data-choice-option]");
    if (option) {
      event.preventDefault();
      chooseChoiceOption(option);
      return;
    }

    const close = event.target.closest?.("[data-choice-close]");
    if (close) {
      closeChoiceSheet(close.dataset.choiceClose, true);
    }
  });

  app.addEventListener("keydown", (event) => {
    const trigger = event.target.closest?.("[data-choice-trigger]");
    if (trigger && ["ArrowDown", "Enter", " "].includes(event.key)) {
      event.preventDefault();
      openChoiceSheet(trigger.dataset.choiceTrigger, true);
      return;
    }

    const layer = event.target.closest?.("[data-choice-sheet]");
    if (!layer) return;
    const name = layer.dataset.choiceSheet;

    if (event.key === "Escape") {
      event.preventDefault();
      closeChoiceSheet(name, true);
      return;
    }

    const option = event.target.closest?.("[data-choice-option]");
    if (option && ["Enter", " "].includes(event.key)) {
      event.preventDefault();
      chooseChoiceOption(option);
      return;
    }

    if (!option || !["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      return;
    }

    const options = Array.from(layer.querySelectorAll("[data-choice-option]"));
    const currentIndex = options.indexOf(option);
    event.preventDefault();
    if (event.key === "Home") {
      options[0]?.focus();
    } else if (event.key === "End") {
      options.at(-1)?.focus();
    } else {
      const offset = event.key === "ArrowDown" ? 1 : -1;
      options[(currentIndex + offset + options.length) % options.length]?.focus();
    }
  });
}

function bindEvents() {
  bindImageFallback();
  bindRecentFeedLayout();
  bindAutocomplete();
  bindDuplicateFoodCheck();
  bindChoiceSheets();
  refreshDuplicateFoodNotice();
  bindMobileKeyboardViewport();
  bindDiagActions();

  document.querySelectorAll("[data-mobile-keyboard]").forEach((input) => {
    input.addEventListener("pointerdown", () => {
      if (document.activeElement !== input) {
        input.focus({ preventScroll: true });
      }
    });
  });

  document.querySelector("[data-edit-profile]")?.addEventListener("click", openProfileNameEditor);

  document.querySelectorAll("[data-nav]").forEach((element) => {
    element.addEventListener("click", () => {
      const screen = element.dataset.nav;
      route(screen, screen === "add" ? { id: "" } : {});
    });
  });

  document.querySelector("[data-back]")?.addEventListener("click", () => {
    if (history.length > 1) {
      history.back();
    } else {
      route("home", {}, true);
    }
  });

  document.querySelectorAll("[data-open-picker]").forEach((element) => {
    element.addEventListener("click", () => {
      if (!listFoods().length) {
        route("add", { id: "" });
        return;
      }
      state.pickerTrigger = element.dataset.recordTrigger || "";
      state.pickerOpen = true;
      render();
      document.querySelector("[data-record-sheet]")?.focus();
    });
  });

  document.querySelectorAll("[data-close-picker]").forEach((element) => {
    element.addEventListener("click", (event) => {
      if (event.target === element || element.matches("button")) {
        const trigger = state.pickerTrigger;
        state.pickerOpen = false;
        state.pickerExpanded = false;
        state.pickerQuery = "";
        state.pickerType = "";
        state.pickerTrigger = "";
        render();
        if (trigger) {
          document.querySelector(`[data-record-trigger="${trigger}"]`)?.focus();
        }
      }
    });
  });

  const recordSheet = document.querySelector("[data-record-sheet]");
  const pickerResults = document.querySelector("[data-picker-results]");
  const refreshPicker = () => {
    if (!pickerResults) return;
    recordSheet?.classList.add("expanded");
    pickerResults.innerHTML = foodPickerResults();
    bindFoodLinks(pickerResults);
    bindImageFallback(pickerResults);
  };

  document.querySelector("[data-picker-search]")?.addEventListener("input", (event) => {
    state.pickerQuery = event.currentTarget.value;
    state.pickerExpanded = true;
    refreshPicker();
  });

  pickerResults?.addEventListener("click", (event) => {
    const expandButton = event.target.closest("[data-expand-picker]");
    if (expandButton) {
      state.pickerExpanded = true;
      refreshPicker();
      document.querySelector("[data-picker-search]")?.focus();
      return;
    }

    const typeButton = event.target.closest("[data-picker-type]");
    if (typeButton) {
      const nextType = typeButton.dataset.pickerType;
      state.pickerType = state.pickerType === nextType ? "" : nextType;
      state.pickerExpanded = true;
      refreshPicker();
    }
  });

  if (recordSheet) {
    let sheetStartY = 0;
    recordSheet.addEventListener(
      "touchstart",
      (event) => {
        sheetStartY = event.touches[0]?.clientY || 0;
      },
      { passive: true }
    );
    recordSheet.addEventListener(
      "touchend",
      (event) => {
        const endY = event.changedTouches[0]?.clientY || sheetStartY;
        if (!state.pickerExpanded && sheetStartY - endY > 42) {
          state.pickerExpanded = true;
          refreshPicker();
        }
      },
      { passive: true }
    );
    recordSheet.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      document.querySelector("button[data-close-picker]")?.click();
    });
  }

  bindProfileNameSheetEvents();

  document.querySelector("[data-load-demo]")?.addEventListener("click", async () => {
    try {
      await dataStore.replaceFoods(clone(DEMO_FOODS));
      render();
      window.scrollTo(0, 0);
      showToast("示例已经准备好");
    } catch (error) {
      showToast("示例暂时没有载入成功");
    }
  });

  bindFoodLinks();

  document.querySelectorAll("[data-outcome]").forEach((element) => {
    element.addEventListener("click", () => {
      state.selectedOutcome = element.dataset.outcome;
      render();
    });
  });

  document.querySelector("[data-feedback-note]")?.addEventListener("input", (event) => {
    state.feedbackNote = event.currentTarget.value.slice(0, 120);
  });

  document.querySelector("[data-submit-feedback]")?.addEventListener("click", submitFeedback);

  document.querySelector("[data-edit-food]")?.addEventListener("click", (event) => {
    route("add", { id: event.currentTarget.dataset.editFood });
  });

  document.querySelector("[data-retry-food]")?.addEventListener("click", (event) => {
    retryFood(event.currentTarget.dataset.retryFood);
  });

  document.querySelector("[data-delete-food]")?.addEventListener("click", (event) => {
    deleteFood(event.currentTarget.dataset.deleteFood);
  });

  // 云同步卡片按钮
  document.querySelectorAll("[data-cloud-action]").forEach((btn) => {
    btn.addEventListener("click", async (event) => {
      const action = event.currentTarget.dataset.cloudAction;
      const dataStore = window.CatEatData;
      if (!dataStore) return;
      try {
        if (action === "push") {
          if (!dataStore.cloudSync) return;
          const result = await dataStore.cloudSync.pushFirstTime();
          if (result.ok) {
            showToast(`已上传 ${result.counts.foods || 0} 条食物`);
          } else {
            showToast(`上传失败：${result.error}`);
          }
        } else if (action === "pull") {
          if (!dataStore.cloudSync) return;
          const result = await dataStore.cloudSync.pullFromCloud();
          if (result.ok) {
            showToast(`已从云端恢复（${result.counts.foods || 0} 条食物）`);
            render();
          } else {
            showToast(`恢复失败：${result.error}`);
          }
        } else if (action === "disconnect") {
          if (!confirm("确定要断开云同步吗？\n本地数据会保留，重新连接后会继续自动备份。")) return;
          dataStore.setCloudBaseEnv("");
          showToast("已断开云同步");
          render();
        }
      } catch (error) {
        showToast(`操作失败：${error.message || error}`);
      }
    });
  });

  const photoInput = document.querySelector("#photo-input");
  photoInput?.addEventListener("change", async () => {
    const file = photoInput.files?.[0];
    if (!file) return;

    try {
      state.photoDataUrl = await compressImage(file);
      const form = document.querySelector("#food-form");
      const values = form
        ? Object.fromEntries(new FormData(form).entries())
        : {};
      render();
      const nextForm = document.querySelector("#food-form");
      Object.entries(values).forEach(([name, value]) => {
        const control = nextForm?.elements.namedItem(name);
        if (control && "value" in control && control.type !== "radio") {
          control.value = value;
        }
      });
      syncChoiceField("foodType");
      syncChoiceField("texture");
    } catch (error) {
      showToast("照片没有读取成功，请重新选择");
    }
  });

  const profilePhotoInput = document.querySelector("[data-profile-photo-input]");
  profilePhotoInput?.addEventListener("change", async () => {
    const file = profilePhotoInput.files?.[0];
    if (!file) return;

    try {
      const photoPath = await compressImage(file);
      await writeCatProfile(readCatProfile(), { photoDataUrl: photoPath });
      render();
      showToast("猫猫头像已更新");
    } catch (error) {
      showToast("头像没有读取成功，请重新选择");
    }
  });

  document.querySelector("#food-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    await submitFood(event.currentTarget);
  });

  const librarySearch = document.querySelector("[data-library-search]");
  librarySearch?.addEventListener("input", () => {
    state.libraryQuery = librarySearch.value;
    refreshLibraryBrowser();
    syncLibraryUrl();
  });

  const libraryBrowser = document.querySelector("[data-library-browser]");
  libraryBrowser?.addEventListener("click", (event) => {
    const groupButton = event.target.closest("[data-library-group]");
    if (groupButton) {
      state.libraryGroup = groupButton.dataset.libraryGroup;
      state.libraryType = "";
      refreshLibraryBrowser();
      syncLibraryUrl();
      document.querySelector(`[data-library-group="${state.libraryGroup}"]`)?.focus();
      return;
    }

    const typeButton = event.target.closest("[data-library-type]");
    if (typeButton) {
      const nextType = typeButton.dataset.libraryType;
      state.libraryType = state.libraryType === nextType ? "" : nextType;
      refreshLibraryBrowser();
      syncLibraryUrl();
    }
  });

  libraryBrowser?.addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;

    const tabs = Array.from(libraryBrowser.querySelectorAll("[data-library-group]"));
    const currentIndex = tabs.findIndex((tab) => tab === document.activeElement);
    if (currentIndex < 0) return;

    event.preventDefault();
    const offset = event.key === "ArrowRight" ? 1 : -1;
    const nextTab = tabs[(currentIndex + offset + tabs.length) % tabs.length];
    nextTab.click();
  });
}

let mobileKeyboardLayoutHeight = 0;

function keyboardUsesResizedViewport(field) {
  const page = document.documentElement.dataset.screen || "";
  return Boolean(field?.closest?.('[role="dialog"], .fixed-page-shell')) ||
    !["home", "library"].includes(page);
}

function currentViewportHeight() {
  const viewport = window.visualViewport;
  return viewport ? viewport.height + viewport.offsetTop : window.innerHeight;
}

function clearMobileKeyboardViewport() {
  const root = document.documentElement;
  delete root.dataset.mobileKeyboardMode;
  root.style.removeProperty("--runtime-safe-area-bottom");
  root.style.removeProperty("--mobile-keyboard-overlap");
  mobileKeyboardLayoutHeight = Math.max(window.innerHeight, currentViewportHeight());
}

function syncMobileKeyboardViewport() {
  const field = document.activeElement?.closest?.("[data-mobile-keyboard]");
  if (!field) {
    clearMobileKeyboardViewport();
    return;
  }

  const root = document.documentElement;
  const shouldResize = keyboardUsesResizedViewport(field);
  const visibleHeight = currentViewportHeight();
  mobileKeyboardLayoutHeight = Math.max(
    mobileKeyboardLayoutHeight,
    window.innerHeight,
    visibleHeight
  );
  const keyboardOverlap = Math.max(0, Math.round(mobileKeyboardLayoutHeight - visibleHeight));

  root.dataset.mobileKeyboardMode = shouldResize ? "resize" : "overlay";
  if (shouldResize) {
    root.style.setProperty("--runtime-safe-area-bottom", "0px");
  } else {
    root.style.removeProperty("--runtime-safe-area-bottom");
  }
  root.style.setProperty("--mobile-keyboard-overlap", `${keyboardOverlap}px`);
}

function bindMobileKeyboardViewport() {
  const root = document.documentElement;
  if (root.dataset.mobileKeyboardViewportBound === "true") return;
  root.dataset.mobileKeyboardViewportBound = "true";
  mobileKeyboardLayoutHeight = Math.max(window.innerHeight, currentViewportHeight());

  document.addEventListener("focusin", (event) => {
    if (!event.target.closest?.("[data-mobile-keyboard]")) return;
    mobileKeyboardLayoutHeight = Math.max(
      mobileKeyboardLayoutHeight,
      window.innerHeight,
      currentViewportHeight()
    );
    syncMobileKeyboardViewport();
    requestAnimationFrame(syncMobileKeyboardViewport);
  });
  document.addEventListener("focusout", () => {
    setTimeout(syncMobileKeyboardViewport, 0);
  });
  window.visualViewport?.addEventListener("resize", syncMobileKeyboardViewport);
  window.visualViewport?.addEventListener("scroll", syncMobileKeyboardViewport);
}

window.addEventListener("resize", scheduleRecentFeedLayout);

function render() {
  const views = {
    home,
    add: addFoodView,
    feedback,
    detail,
    library
  };

  const screen = views[state.screen] ? state.screen : "home";
  document.documentElement.dataset.screen = screen;
  document.body.dataset.screen = screen;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", PAGE_THEME_COLORS[screen] || PAGE_THEME_COLORS.home);
  document.body.removeAttribute("data-choice-sheet-open");
  app.innerHTML = (views[screen] || home)();
  bindEvents();
}

window.addEventListener("popstate", () => {
  closeProfileNameEditor({ restoreFocus: false });
  const params = new URLSearchParams(location.search);
  const prevScreen = state.screen;
  state.screen = params.get("screen") === "record" ? "home" : params.get("screen") || "home";
  state.selectedFoodId = params.get("id") || "";
  state.selectedOutcome = "";
  state.feedbackNote = "";
  state.pickerOpen = false;
  state.pickerExpanded = false;
  state.pickerQuery = "";
  state.pickerType = "";
  state.pickerTrigger = "";
  state.profileEditing = false;
  if (state.screen === "library") {
    state.libraryGroup = params.get("group") || "buy";
    state.libraryType = params.get("type") || "";
    state.libraryQuery = params.get("q") || "";
  }
  // 离开旧 screen 时存位置
  saveScrollPosition(prevScreen);
  render();
  // 进入新 screen 时恢复
  restoreScrollPosition(state.screen);
});

async function bootstrap() {
  const params = new URLSearchParams(location.search);
  const invite = params.get("invite");
  const storageStatus = await dataStore.initialize({
    participantId: invite ? `invite:${invite}` : ""
  });

  if (params.get("screen") === "record") {
    state.screen = "home";
    history.replaceState(null, "", "?screen=home");
  }
  render();

  if (storageStatus.mode === "legacy-fallback") {
    showToast("本地数据库暂时不可用，原数据仍已保留");
  }
}

function renderFileProtocolNotice() {
  app.innerHTML = `
    <main class="screen no-tab file-preview-screen">
      <section class="file-preview-notice" role="alert">
        ${uiIcon("cat", "file-preview-icon", "猫")}
        <h1>请通过本地预览打开</h1>
        <p>这个应用需要本地数据库和 PWA 环境，不能直接双击 HTML 文件运行。</p>
        <code>npm run preview</code>
        <p>然后打开 <strong>http://127.0.0.1:4173/</strong></p>
      </section>
    </main>
  `;
}

if (location.protocol === "file:") {
  renderFileProtocolNotice();
} else {
  bootstrap();
}

if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}
