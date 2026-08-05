const ICONS = {
  home: "/assets/icons/ddmc-home.svg",
  add: "/assets/icons/ddmc-add.svg",
  camera: "/assets/icons/ddmc-camera.svg",
  list: "/assets/icons/ddmc-list.svg",
  box: "/assets/icons/ddmc-box.svg",
  can: "/assets/icons/phosphor-cylinder-light.svg",
  cat: "/assets/icons/phosphor-cat-thin.svg",
  eye: "/assets/icons/ddmc-eye.svg",
  heart: "/assets/icons/ddmc-heart.svg",
  check: "/assets/icons/ddmc-check.svg",
  warning: "/assets/icons/ddmc-warning.svg",
  clock: "/assets/icons/ddmc-clock.svg",
  back: "/assets/icons/ddmc-back.svg",
  search: "/assets/icons/ddmc-search.svg"
};

const FOOD_TYPES = {
  staple_can: "主食罐头",
  snack_can: "零食罐头",
  freeze_dried: "冻干",
  cat_treat: "猫条",
  cat_food: "猫粮",
  other: "其他"
};

const TEXTURE_OPTIONS = ["肉泥 / 慕斯", "肉块", "肉丝", "冻干块", "其他"];

const FOOD_TYPE_ORDER = [
  "staple_can",
  "snack_can",
  "freeze_dried",
  "cat_treat",
  "cat_food",
  "other"
];

const STORAGE_KEY = "CAT_EAT_H5_FOODS_V2";
const INITIALIZED_KEY = "CAT_EAT_H5_INITIALIZED_V2";
const PARTICIPANT_KEY = "CAT_EAT_H5_PARTICIPANT_V1";
const CAT_PROFILE_KEY = "CAT_EAT_H5_CAT_PROFILE_V1";
const DEFAULT_CAT_AVATAR = "/assets/cat-profile-default.jpg";
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

const state = {
  screen: new URLSearchParams(location.search).get("screen") || "home",
  selectedFoodId: new URLSearchParams(location.search).get("id") || "",
  selectedOutcome: "",
  photoDataUrl: "",
  libraryQuery: "",
  libraryGroup: "buy",
  libraryType: "",
  pickerOpen: false,
  pickerExpanded: false,
  pickerQuery: "",
  pickerType: "",
  pickerTrigger: "",
  profileOpen: false
};

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

function createId(prefix) {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return `${prefix}-${window.crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function ensureParticipant() {
  const invite = new URLSearchParams(location.search).get("invite");
  const existing = localStorage.getItem(PARTICIPANT_KEY);

  if (invite) {
    localStorage.setItem(PARTICIPANT_KEY, `invite:${invite}`);
    return `invite:${invite}`;
  }

  if (existing) {
    return existing;
  }

  const localId = createId("local");
  localStorage.setItem(PARTICIPANT_KEY, localId);
  return localId;
}

function readFoods() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  } catch (error) {
    return [];
  }
}

function writeFoods(foods) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(foods));
    return true;
  } catch (error) {
    showToast("照片或数据太多，暂时没有保存成功");
    return false;
  }
}

function readCatProfile() {
  try {
    const profile = JSON.parse(localStorage.getItem(CAT_PROFILE_KEY) || "{}");
    const ageYears = Number(profile.ageYears);
    return {
      nickname: typeof profile.nickname === "string" ? profile.nickname.trim() : "",
      ageYears: Number.isFinite(ageYears) && ageYears > 0 ? ageYears : null,
      photoPath: typeof profile.photoPath === "string" ? profile.photoPath : ""
    };
  } catch (error) {
    return { nickname: "", ageYears: null, photoPath: "" };
  }
}

function writeCatProfile(profile) {
  localStorage.setItem(CAT_PROFILE_KEY, JSON.stringify(profile));
}

function formatCatNickname(nickname) {
  return nickname || "噜噜";
}

function ensureInitialized() {
  if (!localStorage.getItem(INITIALIZED_KEY)) {
    writeFoods([]);
    localStorage.setItem(INITIALIZED_KEY, "1");
  }
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

function autocompleteField(field, label, value, placeholder) {
  const inputId = `food-${field}`;
  const listId = `${inputId}-suggestions`;

  return `
    <div class="field field-autocomplete" data-autocomplete-field="${field}">
      <label class="field-label-text" for="${inputId}">${label}</label>
      <input
        id="${inputId}"
        name="${field}"
        value="${escapeHtml(value || "")}"
        placeholder="${escapeHtml(placeholder)}"
        autocomplete="off"
        aria-autocomplete="list"
        aria-controls="${listId}"
        aria-expanded="false"
        data-autocomplete-input="${field}"
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
    <span class="status-badge status-${food.status.key}">
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
      ${options.feedback ? `<span class="status-badge status-trial">记录</span>` : statusBadge(food)}
    </button>
  `;
}

function recentFoodCard(food) {
  const feedbackKey = food.latestResult?.outcome || "unknown";
  const feedbackLabels = {
    eager: "主动吃",
    okay: "正常接受",
    reluctant: "勉强吃",
    bury: "埋屎",
    unknown: "没法判断"
  };
  const feedback = feedbackLabels[feedbackKey] || feedbackLabels.unknown;
  const recordedAt = food.latestResult?.createdAt || food.createdAt;
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
          <span class="recent-feedback-tag feedback-${feedbackKey}">${escapeHtml(feedback)}</span>
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

function navStateIcon(key, active) {
  const iconNames = {
    home: "home",
    record: "add",
    library: "can"
  };
  const stateName = active ? "active" : "default";

  return `<img class="nav-state-icon" src="/assets/icons/nav-${iconNames[key]}-${stateName}.svg" alt="" />`;
}

function bottomNav(active) {
  const items = [
    ["home", "首页"],
    ["record", "添加记录"],
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
                aria-label="添加记录"
                ${selected ? 'aria-current="page"' : ""}
              >
                <span class="nav-icon-shell" aria-hidden="true">
                  ${navStateIcon(key, selected)}
                </span>
                <span>${label}</span>
              </button>
            `;
          }

          return `
            <button class="nav-item nav-item-${key} ${selected ? "active" : ""}" data-nav="${key}" ${selected ? 'aria-current="page"' : ""}>
              <span class="nav-icon-shell" aria-hidden="true">
                ${navStateIcon(key, selected)}
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
  const foods = listFoods();
  const catProfile = readCatProfile();
  const nickname = formatCatNickname(catProfile.nickname);
  const leftColumn = foods.filter((_, index) => index % 2 === 0);
  const rightColumn = foods.filter((_, index) => index % 2 === 1);

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
                  <div class="recent-food-column">${leftColumn.map(recentFoodCard).join("")}</div>
                  <div class="recent-food-column">${rightColumn.map(recentFoodCard).join("")}</div>
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
                  <button class="text-button" data-load-demo>载入示例</button>
                </div>
              `
          }
        </section>
      </section>
    </main>
    ${bottomNav("home")}
    ${state.pickerOpen ? foodPicker() : ""}
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
                      class="record-type-chip ${state.pickerType === type ? "active" : ""}"
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
        <span class="record-sheet-grabber" aria-hidden="true"></span>
        <div class="record-picker-head">
          <span>
            <h2 id="picker-title">立即记录</h2>
            <p>选刚刚喂的，或者拍一款新品</p>
          </span>
          <button class="text-button" type="button" data-close-picker>关闭</button>
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

function catProfileDialog() {
  const profile = readCatProfile();
  return `
    <div class="modal-backdrop" data-close-profile>
      <section class="modal-sheet profile-sheet" role="dialog" aria-modal="true" aria-labelledby="profile-title">
        <div class="modal-head">
          <h2 id="profile-title">猫猫昵称</h2>
          <button class="text-button" type="button" data-close-profile>关闭</button>
        </div>
        <form id="cat-profile-form">
          <label class="profile-name-field">
            <span>昵称</span>
            <input
              data-profile-name
              name="nickname"
              type="text"
              maxlength="20"
              value="${escapeHtml(profile.nickname)}"
              placeholder="例如：年糕"
              required
            />
          </label>
          <button class="primary-button profile-save-button" type="submit">保存昵称</button>
        </form>
      </section>
    </div>
  `;
}

function textureField(value) {
  const selected = TEXTURE_OPTIONS.includes(value) ? value : TEXTURE_OPTIONS[0];

  return `
    <div class="field custom-select-field" data-texture-select>
      <span id="food-texture-label" class="field-label-text">质地</span>
      <input type="hidden" name="texture" value="${escapeHtml(selected)}" data-texture-value />
      <button
        class="custom-select-trigger"
        type="button"
        data-texture-trigger
        aria-labelledby="food-texture-label food-texture-value"
        aria-haspopup="listbox"
        aria-expanded="false"
      >
        <span id="food-texture-value" class="custom-select-value">${escapeHtml(selected)}</span>
        <span class="custom-select-chevron" aria-hidden="true"></span>
      </button>
      <div
        class="custom-select-menu"
        data-texture-menu
        role="listbox"
        aria-labelledby="food-texture-label"
        hidden
      >
        ${TEXTURE_OPTIONS
          .map(
            (option) => `
              <button
                class="custom-select-option ${option === selected ? "selected" : ""}"
                type="button"
                role="option"
                aria-selected="${option === selected}"
                data-texture-option="${escapeHtml(option)}"
              >
                <span>${escapeHtml(option)}</span>
                <span class="custom-select-option-mark" aria-hidden="true">${option === selected ? "✓" : ""}</span>
              </button>
            `
          )
          .join("")}
      </div>
    </div>
  `;
}

function addFoodView() {
  const editing = state.selectedFoodId ? findFood(state.selectedFoodId) : null;
  const type = editing?.foodType || "staple_can";
  const photo = state.photoDataUrl || editing?.photoPath || "";

  return `
    <main class="screen no-tab add-screen">
      ${topbar(editing ? "编辑食物" : "记一款新品")}

      <section class="page-intro">
        <h1>${editing ? "修改识别信息" : "先记住它是谁"}</h1>
        <p>食物类型必选，包装、名称或品牌至少留一个。输入品牌、名称或口味时会提示已有记录。</p>
      </section>

      <form id="food-form" data-editing-id="${editing?.id || ""}">
        <label class="photo-upload">
          <input id="photo-input" type="file" accept="image/*" capture="environment" />
          ${
            photo
              ? image(photo, "photo-preview", "包装预览")
              : `${uiIcon("camera", "photo-upload-icon")}<strong>拍包装或选照片</strong><small>再次记录不用重复拍</small>`
          }
        </label>

        <fieldset class="field-group">
          <legend>食物类型</legend>
          <div class="type-options">
            ${Object.entries(FOOD_TYPES)
              .map(
                ([value, label]) => `
                  <label class="type-option">
                    <input type="radio" name="foodType" value="${value}" ${value === type ? "checked" : ""} />
                    <span>${label}</span>
                  </label>
                `
              )
              .join("")}
          </div>
        </fieldset>

        <section class="form-card">
          ${autocompleteField("brand", "品牌", editing?.brand, "例如 Catz Finefood")}
          ${autocompleteField("name", "系列或名称", editing?.name, "例如 鸡肉火鸡主食罐")}
          <label class="field">
            <span>规格</span>
            <input name="specification" value="${escapeHtml(editing?.specification || "")}" placeholder="例如 85g" />
          </label>
          ${autocompleteField("flavor", "口味 / 肉源", editing?.flavor, "例如 鸡肉、火鸡")}
          ${textureField(editing?.texture)}
        </section>

        <p class="helper-text">包装识别将在下一阶段接入。现在照片会先作为你认出同款的凭证。</p>
        <button class="primary-button sticky-action" type="submit">${editing ? "保存修改" : "加入试吃清单"}</button>
      </form>
    </main>
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
    <main class="screen no-tab feedback-screen">
      ${topbar("记录这次表现")}

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

      <button class="primary-button sticky-action" data-submit-feedback ${state.selectedOutcome ? "" : "disabled"}>保存这次反馈</button>
    </main>
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

  const history = (food.results || []).slice().sort((a, b) => b.createdAt - a.createdAt);
  const progressWidth = `${Math.min(food.progress / 3, 1) * 100}%`;

  return `
    <main class="screen no-tab detail-screen">
      ${topbar("食物详情", { action: `<button class="topbar-action" data-edit-food="${food.id}">编辑</button>` })}

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
          history.length
            ? `
              <div class="history">
                ${history
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

function librarySummaryText() {
  const foods = searchFilteredFoods();
  const buyCount = foods.filter((food) => food.status.key === "repurchase").length;
  return `共 ${foods.length} 款 · ${buyCount} 款放心买`;
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
              class="library-tab ${state.libraryGroup === key ? "active" : ""}"
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
                      class="library-type-chip ${state.libraryType === type ? "active" : ""}"
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
  const summary = document.querySelector("[data-library-summary]");
  const browser = document.querySelector("[data-library-browser]");

  if (summary) {
    summary.textContent = librarySummaryText();
  }

  if (browser) {
    browser.innerHTML = libraryBrowserHtml();
    bindFoodLinks(browser);
    bindImageFallback(browser);
  }
}

function library() {
  const catProfile = readCatProfile();
  const foods = listFoods();
  const buyCount = foods.filter((food) => food.status.key === "repurchase").length;
  const avatar = catProfile.photoPath || DEFAULT_CAT_AVATAR;
  return `
    <main class="screen library-screen">
      <section class="library-cat-profile" aria-label="当前猫咪资料">
        <header class="library-profile-top">
          <span class="library-profile-brand">
            <span class="library-profile-brand-icon">${uiIcon("cat", "", "猫")}</span>
            猫吃了吗
          </span>
          <button class="library-profile-edit" type="button" data-open-profile>编辑昵称</button>
        </header>

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
          <button class="library-cat-name" type="button" data-open-profile>
            ${escapeHtml(formatCatNickname(catProfile.nickname))}
          </button>
        </div>

        <div class="library-profile-stats" aria-label="猫咪试吃概览">
          <span><strong>${foods.length}</strong> 款吃过</span>
          <span><strong>${buyCount}</strong> 款放心买</span>
        </div>
      </section>

      <section class="library-sheet">
        <header class="library-sheet-heading">
          <h1>补货清单</h1>
          <p class="library-summary" data-library-summary>${librarySummaryText()}</p>
        </header>

        <section class="search-tools">
          <label class="search-wrap">
            ${uiIcon("search", "search-icon")}
            <input class="search-input" data-library-search value="${escapeHtml(state.libraryQuery)}" placeholder="搜索品牌或口味" aria-label="搜索食物" />
          </label>
        </section>

        <div class="library-browser" data-library-browser>${libraryBrowserHtml()}</div>
      </section>
    </main>
    ${bottomNav("library")}
    ${state.pickerOpen ? foodPicker() : ""}
    ${state.profileOpen ? catProfileDialog() : ""}
  `;
}

function route(screen, params = {}, replace = false) {
  state.screen = screen === "record" ? "home" : screen;
  state.pickerOpen = false;
  state.pickerExpanded = false;
  state.pickerQuery = "";
  state.pickerType = "";
  state.pickerTrigger = "";
  state.profileOpen = false;
  state.selectedOutcome = "";

  if (params.id !== undefined) {
    state.selectedFoodId = params.id;
  } else if (!["detail", "feedback", "add"].includes(screen)) {
    state.selectedFoodId = "";
  }

  const search = new URLSearchParams();
  search.set("screen", state.screen);
  if (state.selectedFoodId && ["detail", "feedback", "add"].includes(state.screen)) {
    search.set("id", state.selectedFoodId);
  }

  const method = replace ? "replaceState" : "pushState";
  history[method](null, "", `?${search.toString()}`);
  render();
  window.scrollTo(0, 0);
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove("show"), 2200);
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

function submitFood(form) {
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
    brand: brand || "品牌待补充",
    name: name || "未命名食物",
    specification: String(data.get("specification") || "").trim(),
    foodType: String(data.get("foodType") || "other"),
    flavor: String(data.get("flavor") || "").trim(),
    texture: String(data.get("texture") || "其他"),
    photoPath,
    createdAt: existing?.createdAt || Date.now(),
    results: existing?.results || []
  };

  if (existingIndex >= 0) {
    foods[existingIndex] = food;
  } else {
    foods.unshift(food);
  }

  if (writeFoods(foods)) {
    state.photoDataUrl = "";
    route("detail", { id: food.id });
    showToast(existing ? "修改已经保存" : "已经加入试吃清单");
  }
}

function submitFeedback() {
  if (!state.selectedOutcome) {
    return;
  }

  const foods = readFoods();
  const index = foods.findIndex((food) => food.id === state.selectedFoodId);
  if (index < 0) {
    showToast("没有找到这款食物");
    return;
  }

  foods[index].manualStatus = null;
  foods[index].results = foods[index].results || [];
  foods[index].results.push({
    id: createId("result"),
    outcome: state.selectedOutcome,
    createdAt: Date.now()
  });

  const summary = rules.summarizeFood(foods[index]);
  if (summary.status.key === "repurchase") {
    foods[index].everQualified = true;
  }

  if (writeFoods(foods)) {
    const foodId = foods[index].id;
    state.selectedOutcome = "";
    route("detail", { id: foodId });
    showToast("这次表现已经记住");
  }
}

function retryFood(foodId) {
  const foods = readFoods();
  const index = foods.findIndex((food) => food.id === foodId);
  if (index < 0) return;
  foods[index].manualRetryAfter = Date.now();
  writeFoods(foods);
  render();
  showToast("已回到试吃中，原来的记录仍然保留");
}

function deleteFood(foodId) {
  if (!window.confirm("删除后会同时移除全部反馈，确定删除吗？")) {
    return;
  }

  writeFoods(readFoods().filter((food) => food.id !== foodId));
  route("home");
  showToast("这款食物已删除");
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
      },
      { once: true }
    );
  });
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

function textureSelectParts() {
  const field = document.querySelector("[data-texture-select]");
  return {
    field,
    trigger: field?.querySelector("[data-texture-trigger]"),
    menu: field?.querySelector("[data-texture-menu]"),
    value: field?.querySelector("[data-texture-value]"),
    label: field?.querySelector("#food-texture-value")
  };
}

function closeTextureSelect(focusTrigger = false) {
  const { field, trigger, menu } = textureSelectParts();
  if (!field || !trigger || !menu) return;

  field.classList.remove("is-open");
  field.classList.remove("opens-up");
  trigger.setAttribute("aria-expanded", "false");
  menu.hidden = true;
  if (focusTrigger) trigger.focus();
}

function positionTextureMenu() {
  const { field, trigger, menu } = textureSelectParts();
  if (!field || !trigger || !menu || !field.classList.contains("is-open")) return;

  const triggerRect = trigger.getBoundingClientRect();
  const menuHeight = menu.scrollHeight;
  const spaceBelow = window.innerHeight - triggerRect.bottom;
  const spaceAbove = triggerRect.top;
  const opensUp = spaceBelow < menuHeight + 12 && spaceAbove > spaceBelow;
  field.classList.toggle("opens-up", opensUp);
}

function openTextureSelect(focusSelected = false) {
  const { field, trigger, menu } = textureSelectParts();
  if (!field || !trigger || !menu) return;

  field.classList.add("is-open");
  trigger.setAttribute("aria-expanded", "true");
  menu.hidden = false;
  positionTextureMenu();

  if (focusSelected) {
    menu.querySelector('[data-texture-option][aria-selected="true"]')?.focus();
  }
}

function chooseTextureOption(option) {
  const { field, trigger, menu, value, label } = textureSelectParts();
  const nextValue = option?.dataset.textureOption;
  if (!field || !trigger || !menu || !value || !label || !nextValue) return;

  value.value = nextValue;
  label.textContent = nextValue;
  menu.querySelectorAll("[data-texture-option]").forEach((item) => {
    const selected = item === option;
    item.classList.toggle("selected", selected);
    item.setAttribute("aria-selected", String(selected));
    const mark = item.querySelector(".custom-select-option-mark");
    if (mark) mark.textContent = selected ? "✓" : "";
  });
  closeTextureSelect(true);
}

function bindTextureSelect() {
  if (app.dataset.textureSelectBound === "true") return;
  app.dataset.textureSelectBound = "true";

  app.addEventListener("click", (event) => {
    const trigger = event.target.closest?.("[data-texture-trigger]");
    if (trigger) {
      const { field } = textureSelectParts();
      if (field?.classList.contains("is-open")) {
        closeTextureSelect();
      } else {
        openTextureSelect();
      }
      return;
    }

    const option = event.target.closest?.("[data-texture-option]");
    if (option) {
      event.preventDefault();
      chooseTextureOption(option);
      return;
    }

    if (!event.target.closest?.("[data-texture-select]")) {
      closeTextureSelect();
    }
  });

  app.addEventListener("keydown", (event) => {
    const trigger = event.target.closest?.("[data-texture-trigger]");
    if (trigger) {
      if (["ArrowDown", "Enter", " "].includes(event.key)) {
        event.preventDefault();
        openTextureSelect(true);
      } else if (event.key === "Escape") {
        event.preventDefault();
        closeTextureSelect();
      }
      return;
    }

    const option = event.target.closest?.("[data-texture-option]");
    if (!option) return;

    const menu = option.closest("[data-texture-menu]");
    const options = menu
      ? Array.from(menu.querySelectorAll("[data-texture-option]"))
      : [];
    const currentIndex = options.indexOf(option);

    if (event.key === "ArrowDown" && options.length) {
      event.preventDefault();
      options[(currentIndex + 1) % options.length].focus();
    } else if (event.key === "ArrowUp" && options.length) {
      event.preventDefault();
      options[(currentIndex - 1 + options.length) % options.length].focus();
    } else if (event.key === "Home" && options.length) {
      event.preventDefault();
      options[0].focus();
    } else if (event.key === "End" && options.length) {
      event.preventDefault();
      options[options.length - 1].focus();
    } else if (event.key === "Escape") {
      event.preventDefault();
      closeTextureSelect(true);
    } else if (["Enter", " "].includes(event.key)) {
      event.preventDefault();
      chooseTextureOption(option);
    }
  });

  window.addEventListener("resize", positionTextureMenu);
}

function bindEvents() {
  bindImageFallback();
  bindAutocomplete();
  bindTextureSelect();

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

  document.querySelectorAll("[data-open-profile]").forEach((element) => {
    element.addEventListener("click", () => {
      state.profileOpen = true;
      render();
      document.querySelector("[data-profile-name]")?.focus();
    });
  });

  document.querySelectorAll("[data-close-profile]").forEach((element) => {
    element.addEventListener("click", (event) => {
      if (event.target === element || element.matches("button")) {
        state.profileOpen = false;
        render();
      }
    });
  });

  document.querySelector("#cat-profile-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const nickname = String(
      new FormData(event.currentTarget).get("nickname") || ""
    ).trim();
    if (!nickname) {
      showToast("请填写猫猫昵称");
      return;
    }
    writeCatProfile({ ...readCatProfile(), nickname });
    state.profileOpen = false;
    render();
    showToast("猫猫昵称已保存");
  });

  document.querySelector("[data-load-demo]")?.addEventListener("click", () => {
    writeFoods(clone(DEMO_FOODS));
    render();
    window.scrollTo(0, 0);
    showToast("示例已经准备好");
  });

  bindFoodLinks();

  document.querySelectorAll("[data-outcome]").forEach((element) => {
    element.addEventListener("click", () => {
      state.selectedOutcome = element.dataset.outcome;
      render();
    });
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
      writeCatProfile({ ...readCatProfile(), photoPath });
      render();
      showToast("猫猫头像已更新");
    } catch (error) {
      showToast("头像没有读取成功，请重新选择");
    }
  });

  document.querySelector("#food-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    submitFood(event.currentTarget);
  });

  const librarySearch = document.querySelector("[data-library-search]");
  librarySearch?.addEventListener("input", () => {
    state.libraryQuery = librarySearch.value;
    refreshLibraryBrowser();
  });

  const libraryBrowser = document.querySelector("[data-library-browser]");
  libraryBrowser?.addEventListener("click", (event) => {
    const groupButton = event.target.closest("[data-library-group]");
    if (groupButton) {
      state.libraryGroup = groupButton.dataset.libraryGroup;
      state.libraryType = "";
      refreshLibraryBrowser();
      document.querySelector(`[data-library-group="${state.libraryGroup}"]`)?.focus();
      return;
    }

    const typeButton = event.target.closest("[data-library-type]");
    if (typeButton) {
      const nextType = typeButton.dataset.libraryType;
      state.libraryType = state.libraryType === nextType ? "" : nextType;
      refreshLibraryBrowser();
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

function render() {
  const views = {
    home,
    add: addFoodView,
    feedback,
    detail,
    library
  };

  app.innerHTML = (views[state.screen] || home)();
  bindEvents();
}

window.addEventListener("popstate", () => {
  const params = new URLSearchParams(location.search);
  state.screen = params.get("screen") === "record" ? "home" : params.get("screen") || "home";
  state.selectedFoodId = params.get("id") || "";
  state.selectedOutcome = "";
  state.pickerOpen = false;
  state.pickerExpanded = false;
  state.pickerQuery = "";
  state.pickerType = "";
  state.pickerTrigger = "";
  state.profileOpen = false;
  render();
});

ensureParticipant();
ensureInitialized();
if (new URLSearchParams(location.search).get("screen") === "record") {
  state.screen = "home";
  history.replaceState(null, "", "?screen=home");
}
render();

if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}
