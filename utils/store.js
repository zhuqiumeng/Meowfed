// utils/store.js
//
// 微信小程序数据层入口。保留形态：原型阶段，使用 wx storage。
//
// 内部存储使用 H5 schema（cats / foods / results / assets 分离），
// 与 utils/data-store.js 的 IndexedDB schema 保持一致字段集合
// （brand, name, specification, foodType, flavor, texture,
// photoAssetId, manualStatus, manualRetryAfter, everQualified 等）。
//
// 旧的小程序扩展字段（country / color / quantityBought）也一并保留
// 在 food 记录上，作为 H5 schema 之外的扩展层，UI 不感知 schema
// 切换。下一阶段如需彻底对齐 H5，这些字段可被废弃。
//
// API 表面与重构前完全一致（listFoods / getFood / addFood /
// updateFood / addResult / setManualStatus / removeFood /
// shoppingGroups / resetDemo / clearAll / persistPhoto /
// ensureInitialized），pages/*.js 无需修改。

const { summarizeFood, groupForShopping } = require("./rules");

const SCHEMA_VERSION = 1;
const STORAGE_PREFIX = "cat-eat-v1:";
const STORAGE_KEYS = {
  meta: `${STORAGE_PREFIX}meta`,
  cats: `${STORAGE_PREFIX}cats`,
  foods: `${STORAGE_PREFIX}foods`,
  results: `${STORAGE_PREFIX}results`,
  assets: `${STORAGE_PREFIX}assets`
};

const META_KEYS = {
  schemaVersion: "schemaVersion",
  catId: "catId",
  participantId: "participantId"
};

const DEMO_FOODS = [
  {
    id: "demo-catz-chicken",
    name: "鸡肉火鸡主食罐",
    brand: "Catz Finefood",
    flavor: "鸡肉 · 火鸡",
    texture: "肉泥",
    country: "德国",
    color: "#FFD86A",
    photoPath: "",
    quantityBought: 3,
    createdAt: Date.now() - 24 * 86400000,
    results: [
      { id: "r1", outcome: "eager", createdAt: Date.now() - 23 * 86400000 },
      { id: "r2", outcome: "okay", createdAt: Date.now() - 18 * 86400000 },
      { id: "r3", outcome: "eager", createdAt: Date.now() - 11 * 86400000 }
    ]
  },
  {
    id: "demo-oasy-tuna",
    name: "吞拿鱼慕斯",
    brand: "Oasy",
    flavor: "吞拿鱼",
    texture: "慕斯",
    country: "意大利",
    color: "#85D5C0",
    photoPath: "",
    quantityBought: 2,
    createdAt: Date.now() - 14 * 86400000,
    results: [
      { id: "r4", outcome: "okay", createdAt: Date.now() - 13 * 86400000 },
      { id: "r5", outcome: "eager", createdAt: Date.now() - 6 * 86400000 }
    ]
  },
  {
    id: "demo-venandi-turkey",
    name: "火鸡单一蛋白罐",
    brand: "Venandi",
    flavor: "火鸡",
    texture: "细肉泥",
    country: "德国",
    color: "#FF9A8F",
    photoPath: "",
    quantityBought: 6,
    createdAt: Date.now() - 60 * 86400000,
    results: [
      { id: "r6", outcome: "eager", createdAt: Date.now() - 58 * 86400000 },
      { id: "r7", outcome: "okay", createdAt: Date.now() - 52 * 86400000 },
      { id: "r8", outcome: "eager", createdAt: Date.now() - 45 * 86400000 },
      { id: "r9", outcome: "reluctant", createdAt: Date.now() - 2 * 86400000 }
    ]
  },
  {
    id: "demo-macs-duck",
    name: "鸭肉鸡心罐",
    brand: "MAC's",
    flavor: "鸭肉 · 鸡心",
    texture: "肉块",
    country: "德国",
    color: "#C9C1E9",
    photoPath: "",
    quantityBought: 2,
    createdAt: Date.now() - 9 * 86400000,
    results: [{ id: "r10", outcome: "reluctant", createdAt: Date.now() - 8 * 86400000 }]
  },
  {
    id: "demo-mjamjam-beef",
    name: "多汁牛肉罐",
    brand: "Mjamjam",
    flavor: "牛肉",
    texture: "粗肉泥",
    country: "德国",
    color: "#B9A8C3",
    photoPath: "",
    quantityBought: 1,
    createdAt: Date.now() - 5 * 86400000,
    results: [{ id: "r11", outcome: "bury", createdAt: Date.now() - 4 * 86400000 }]
  }
];

function clone(value) {
  return value === null || value === undefined
    ? value
    : JSON.parse(JSON.stringify(value));
}

function createId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function readCollection(name) {
  try {
    const raw = wx.getStorageSync(STORAGE_KEYS[name]);
    if (raw === "" || raw === null || raw === undefined) return [];
    if (typeof raw === "string") return JSON.parse(raw);
    return raw;
  } catch (error) {
    return [];
  }
}

function writeCollection(name, records) {
  try {
    wx.setStorageSync(STORAGE_KEYS[name], records);
  } catch (error) {
    throw new Error(`Unable to write wx storage collection ${name}: ${error.message || error}`);
  }
}

function normalizeFood(input, ctx) {
  const timestamp = Date.now();
  const createdAt = Number(input.createdAt) || ctx.timestamp || timestamp;
  return {
    // H5 schema 字段
    schemaVersion: SCHEMA_VERSION,
    id: ctx.id || (input.id ? String(input.id) : createId("food")),
    legacyId: null,
    catId: ctx.catId || input.catId || null,
    ownerId: input.ownerId || null,
    brand: String(input.brand || "品牌待补充"),
    name: String(input.name || "未命名食物"),
    specification: String(input.specification || ""),
    foodType: String(input.foodType || "other"),
    flavor: String(input.flavor || ""),
    texture: String(input.texture || "其他"),
    photoAssetId: ctx.photoAssetId !== undefined ? ctx.photoAssetId : (input.photoAssetId || null),
    manualStatus: input.manualStatus || null,
    manualRetryAfter: Number(input.manualRetryAfter) || null,
    everQualified: Boolean(input.everQualified),
    createdAt,
    updatedAt: Number(input.updatedAt) || timestamp,
    // 小程序扩展字段（与 H5 schema 并存；下一阶段如彻底对齐可移除）
    country: input.country || "",
    color: input.color || "#FFD86A",
    quantityBought: Number(input.quantityBought) || 1
  };
}

function normalizeResult(input, ctx) {
  const timestamp = Date.now();
  const createdAt = Number(input.createdAt) || ctx.timestamp || timestamp;
  return {
    schemaVersion: SCHEMA_VERSION,
    id: ctx.id || (input.id ? String(input.id) : createId("result")),
    legacyId: null,
    foodId: ctx.foodId,
    catId: ctx.catId || null,
    ownerId: input.ownerId || null,
    outcome: String(input.outcome || "unknown"),
    assistedBy: String(input.assistedBy || ""),
    note: String(input.note || ""),
    createdAt,
    updatedAt: Number(input.updatedAt) || timestamp
  };
}

function normalizeCat(input, ctx) {
  const timestamp = Date.now();
  const ageYears = Number(input.ageYears);
  return {
    schemaVersion: SCHEMA_VERSION,
    id: ctx.id || input.id || createId("cat"),
    ownerId: input.ownerId || null,
    nickname: typeof input.nickname === "string" ? input.nickname.trim() : "",
    ageYears: Number.isFinite(ageYears) && ageYears > 0 ? ageYears : null,
    photoAssetId: ctx.photoAssetId !== undefined ? ctx.photoAssetId : (input.photoAssetId || null),
    createdAt: Number(input.createdAt) || timestamp,
    updatedAt: Number(input.updatedAt) || timestamp
  };
}

// ---- Cache（mirror of wx storage）----

const cache = {
  foods: [],
  cats: [],
  results: [],
  assets: [],
  meta: [],
  catId: "",
  participantId: ""
};

function rebuildFromStorage() {
  cache.foods = readCollection("foods");
  cache.cats = readCollection("cats");
  cache.results = readCollection("results");
  cache.assets = readCollection("assets");
  cache.meta = readCollection("meta");

  const catMeta = cache.meta.find((m) => m.key === META_KEYS.catId);
  const participantMeta = cache.meta.find((m) => m.key === META_KEYS.participantId);
  cache.catId = (catMeta && catMeta.value) || "";
  cache.participantId = (participantMeta && participantMeta.value) || "";
}

function persistFoods() {
  writeCollection("foods", cache.foods);
}
function persistCats() {
  writeCollection("cats", cache.cats);
}
function persistResults() {
  writeCollection("results", cache.results);
}
function persistAssets() {
  writeCollection("assets", cache.assets);
}
function persistMeta() {
  writeCollection("meta", cache.meta);
}

function getMetaValue(key) {
  const entry = cache.meta.find((m) => m.key === key);
  return entry ? entry.value : null;
}

function setMetaValue(key, value) {
  const index = cache.meta.findIndex((m) => m.key === key);
  if (index >= 0) cache.meta[index] = { key, value };
  else cache.meta.push({ key, value });
  persistMeta();
}

function currentCat() {
  return cache.cats.find((c) => c.id === cache.catId) || null;
}

function currentAsset(assetId) {
  return cache.assets.find((a) => a.id === assetId) || null;
}

function ensureDefaults() {
  if (!cache.catId) {
    cache.catId = createId("cat");
    setMetaValue(META_KEYS.catId, cache.catId);
  }
  if (!cache.participantId) {
    cache.participantId = createId("participant");
    setMetaValue(META_KEYS.participantId, cache.participantId);
  }
  setMetaValue(META_KEYS.schemaVersion, SCHEMA_VERSION);
  if (!currentCat()) {
    cache.cats.push(
      normalizeCat({}, { id: cache.catId, timestamp: Date.now() })
    );
    persistCats();
  }
}

function buildSummary(food) {
  const foodResults = cache.results
    .filter((r) => r.foodId === food.id)
    .sort((a, b) => a.createdAt - b.createdAt);
  const photoPath = food.photoAssetId
    ? (currentAsset(food.photoAssetId) || {}).path || ""
    : "";
  return summarizeFood(
    { ...food, photoPath, results: foodResults },
    Date.now()
  );
}

function listSummaries() {
  return cache.foods.map(buildSummary);
}

function findSummary(id) {
  const food = cache.foods.find((f) => f.id === id);
  return food ? buildSummary(food) : null;
}

// ---- Public API ----

function ensureInitialized() {
  // 同步初始化。wx storage 在小程序启动后即可访问。
  rebuildFromStorage();
  ensureDefaults();
}

function listFoods() {
  return clone(listSummaries());
}

function getFood(id) {
  const summary = findSummary(id);
  return summary ? clone(summary) : null;
}

function getCatProfile() {
  const cat = currentCat();
  const photoPath = cat && cat.photoAssetId
    ? (currentAsset(cat.photoAssetId) || {}).path || ""
    : "";
  if (!cat) {
    return clone({ nickname: "", ageYears: null, photoPath: "" });
  }
  return clone({ ...cat, photoPath });
}

function addFood(input) {
  ensureInitialized();
  const normalized = normalizeFood(input, {
    id: input.id || createId("food"),
    catId: cache.catId,
    timestamp: Date.now()
  });
  // 兼容旧 API：photoPath 直接转 photoAssetId。
  if (!normalized.photoAssetId && input.photoPath) {
    const asset = {
      schemaVersion: SCHEMA_VERSION,
      id: createId("asset"),
      catId: cache.catId,
      ownerId: null,
      kind: "food-photo",
      mimeType: "image/jpeg",
      size: 0,
      path: input.photoPath,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    cache.assets.push(asset);
    persistAssets();
    normalized.photoAssetId = asset.id;
  }
  cache.foods.unshift(normalized);
  // 内嵌 results（如有）拆出到 results collection
  const embedded = Array.isArray(input.results) ? input.results : [];
  embedded.forEach((r) => {
    cache.results.push(
      normalizeResult(r, {
        id: r.id || createId("result"),
        foodId: normalized.id,
        catId: cache.catId,
        timestamp: r.createdAt || Date.now()
      })
    );
  });
  persistFoods();
  if (embedded.length > 0) persistResults();
  return getFood(normalized.id);
}

function updateFood(foodId, input) {
  ensureInitialized();
  const index = cache.foods.findIndex((f) => f.id === foodId);
  if (index < 0) throw new Error("找不到这款罐头");
  const existing = cache.foods[index];
  // 兼容 photoPath → photoAssetId
  let photoAssetId = existing.photoAssetId;
  if (input.photoPath && input.photoPath !== (currentAsset(photoAssetId) || {}).path) {
    const asset = {
      schemaVersion: SCHEMA_VERSION,
      id: createId("asset"),
      catId: cache.catId,
      ownerId: null,
      kind: "food-photo",
      mimeType: "image/jpeg",
      size: 0,
      path: input.photoPath,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    cache.assets.push(asset);
    persistAssets();
    photoAssetId = asset.id;
  }
  const normalized = normalizeFood(
    { ...existing, ...input, photoAssetId, updatedAt: Date.now() },
    {
      id: existing.id,
      catId: existing.catId || cache.catId,
      photoAssetId,
      timestamp: Date.now()
    }
  );
  cache.foods[index] = normalized;
  persistFoods();
  return getFood(foodId);
}

function addResult(foodId, outcome, extras) {
  ensureInitialized();
  const index = cache.foods.findIndex((f) => f.id === foodId);
  if (index < 0) throw new Error("找不到这款罐头");
  const food = cache.foods[index];
  const result = normalizeResult(
    {
      outcome,
      assistedBy: (extras && extras.assistedBy) || "",
      note: (extras && extras.note) || ""
    },
    {
      id: createId("result"),
      foodId,
      catId: food.catId || cache.catId,
      timestamp: Date.now()
    }
  );
  cache.results.push(result);
  // 清 manualStatus
  cache.foods[index] = { ...food, manualStatus: null, updatedAt: Date.now() };
  persistResults();
  persistFoods();
  return getFood(foodId);
}

function setManualStatus(foodId, status) {
  ensureInitialized();
  const index = cache.foods.findIndex((f) => f.id === foodId);
  if (index < 0) throw new Error("找不到这款罐头");
  cache.foods[index] = {
    ...cache.foods[index],
    manualStatus: status || null,
    updatedAt: Date.now()
  };
  persistFoods();
  return getFood(foodId);
}

function removeFood(foodId) {
  ensureInitialized();
  cache.foods = cache.foods.filter((f) => f.id !== foodId);
  cache.results = cache.results.filter((r) => r.foodId !== foodId);
  persistFoods();
  persistResults();
}

function shoppingGroups() {
  return groupForShopping(cache.foods);
}

function resetDemo() {
  ensureInitialized();
  const now = Date.now();
  // 写 demo 数据，遵循 H5 schema
  cache.foods = DEMO_FOODS.map((food) =>
    normalizeFood(
      {
        ...food,
        id: food.id, // demo 用固定 id，便于排障
        createdAt: food.createdAt
      },
      { id: food.id, catId: cache.catId, timestamp: now }
    )
  );
  cache.results = [];
  cache.foods.forEach((food) => {
    (food._pendingResults || []).forEach(() => {});
    const embedded = (DEMO_FOODS.find((d) => d.id === food.id) || {}).results || [];
    embedded.forEach((r) => {
      cache.results.push(
        normalizeResult(r, {
          id: r.id,
          foodId: food.id,
          catId: cache.catId,
          timestamp: r.createdAt
        })
      );
    });
  });
  cache.assets = [];
  persistFoods();
  persistResults();
  persistAssets();
}

function clearAll() {
  cache.foods = [];
  cache.results = [];
  cache.assets = [];
  cache.cats = [];
  cache.meta = [];
  rebuildFromStorage();
  ensureDefaults();
  persistFoods();
  persistResults();
  persistAssets();
  persistCats();
}

function persistPhoto(tempFilePath) {
  return new Promise((resolve) => {
    if (!tempFilePath) {
      resolve("");
      return;
    }
    wx.getFileSystemManager().saveFile({
      tempFilePath,
      success: ({ savedFilePath }) => {
        // 同步创建 asset 记录，返回 savedFilePath 给调用方
        ensureInitialized();
        const asset = {
          schemaVersion: SCHEMA_VERSION,
          id: createId("asset"),
          catId: cache.catId,
          ownerId: null,
          kind: "food-photo",
          mimeType: "image/jpeg",
          size: 0,
          path: savedFilePath,
          createdAt: Date.now(),
          updatedAt: Date.now()
        };
        cache.assets.push(asset);
        try {
          persistAssets();
        } catch (error) {
          // ignore
        }
        resolve(savedFilePath);
      },
      fail: () => resolve(tempFilePath)
    });
  });
}

module.exports = {
  ensureInitialized,
  listFoods,
  getFood,
  addFood,
  updateFood,
  addResult,
  setManualStatus,
  removeFood,
  shoppingGroups,
  resetDemo,
  clearAll,
  persistPhoto
};
