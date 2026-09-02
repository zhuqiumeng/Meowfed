// utils/data-service.js
//
// DataService：统一的业务数据访问层。H5 IndexedDB 与小程序 wx storage
// 都通过这一层暴露一致的 API（getFoods / saveFood / addResult / ...）。
//
// DataService 不直接持有任何具体 Adapter；它只面对一个
// `LocalRepository` 与一个 `AssetRepository`。不同的 Adapter
//（IndexedDBAdapter / WxStorageAdapter / 未来的 CloudAdapter）只
// 决定数据落地的位置，不影响业务语义。
//
// 派生的「试吃状态」「90 天统计」等字段由 utils/rules.js 的纯函数
// 计算，DataService 在 View 层包装时统一注入。

(function attachDataService(globalScope) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { createDataService };
  }
  if (globalScope) {
    globalScope.CatEatDataService = { createDataService };
  }
})(typeof globalThis !== "undefined" ? globalThis : this);

function createDataService(args) {
  const repo = args.repo;
  const assetRepo = args.assetRepo;
  const rules = args.rules;
  const constants = args.constants;
  const crypto = args.crypto;
  const now = args.now;
  const migrate = args.migrate;
  const initialSkipDefaults = args.skipDefaults === true;

  if (!repo) throw new Error("DataService requires a LocalRepository");
  if (!assetRepo) throw new Error("DataService requires an AssetRepository");
  if (!rules) throw new Error("DataService requires utils/rules");
  if (!constants) throw new Error("DataService requires constants");

  const SCHEMA_VERSION = constants.SCHEMA_VERSION;
  const DEFAULT_CAT_AVATAR = constants.DEFAULT_CAT_AVATAR;
  const cryptoApi = crypto;
  const time = typeof now === "function" ? now : () => Date.now();

  // activeRepo 是可变引用：业务方法走它，migrate 仍走原 repo
  let activeRepo = repo;
  // skipDefaults 也支持后期切换：cloud 配好后才切到 true
  let skipDefaults = initialSkipDefaults;
  let mode = "uninitialized";
  let lastError = null;
  const view = {
    foods: [],
    resultsByFood: new Map(),
    catProfile: null,
    catId: "",
    participantId: ""
  };

  function clone(value) {
    return value === null || value === undefined
      ? value
      : JSON.parse(JSON.stringify(value));
  }

  function createUuid() {
    if (cryptoApi && typeof cryptoApi.randomUUID === "function") {
      return cryptoApi.randomUUID();
    }
    const random = () =>
      Math.floor(Math.random() * 0x10000)
        .toString(16)
        .padStart(4, "0");
    return `${random()}${random()}-${random()}-4${random().slice(1)}-a${random().slice(1)}-${random()}${random()}${random()}`;
  }

  function isUuid(value) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      String(value || "")
    );
  }

  function stableId(value) {
    return isUuid(value) ? value : createUuid();
  }

  // ---- Normalize ----

  function normalizeFood(input, context = {}) {
    const timestamp = context.timestamp || time();
    const createdAt = Number(input.createdAt) || timestamp;
    return {
      schemaVersion: SCHEMA_VERSION,
      id: context.id || stableId(input.id),
      legacyId: context.legacyId || input.legacyId || null,
      catId: context.catId || input.catId,
      ownerId: input.ownerId || null,
      brand: String(input.brand || "品牌待补充"),
      name: String(input.name || "未命名食物"),
      specification: String(input.specification || ""),
      foodType: String(input.foodType || "other"),
      flavor: String(input.flavor || ""),
      texture: String(input.texture || "其他"),
      photoAssetId:
        context.photoAssetId !== undefined
          ? context.photoAssetId
          : input.photoAssetId || null,
      manualStatus: input.manualStatus || null,
      manualRetryAfter: Number(input.manualRetryAfter) || null,
      everQualified: Boolean(input.everQualified),
      createdAt,
      updatedAt: Number(input.updatedAt) || timestamp
    };
  }

  function normalizeResult(input, context = {}) {
    const timestamp = context.timestamp || time();
    const createdAt = Number(input.createdAt) || timestamp;
    return {
      schemaVersion: SCHEMA_VERSION,
      id: context.id || stableId(input.id),
      legacyId: context.legacyId || input.legacyId || null,
      foodId: context.foodId || input.foodId,
      catId: context.catId || input.catId,
      ownerId: input.ownerId || null,
      outcome: String(input.outcome || "unknown"),
      assistedBy: String(input.assistedBy || ""),
      note: String(input.note || ""),
      createdAt,
      updatedAt: Number(input.updatedAt) || timestamp
    };
  }

  function normalizeCat(input, context = {}) {
    const timestamp = context.timestamp || time();
    const createdAt = Number(input.createdAt) || timestamp;
    const ageYears = Number(input.ageYears);
    return {
      schemaVersion: SCHEMA_VERSION,
      id: context.id || input.id || createUuid(),
      ownerId: input.ownerId || null,
      nickname: typeof input.nickname === "string" ? input.nickname.trim() : "",
      ageYears: Number.isFinite(ageYears) && ageYears > 0 ? ageYears : null,
      photoAssetId:
        context.photoAssetId !== undefined
          ? context.photoAssetId
          : input.photoAssetId || null,
      createdAt,
      updatedAt: Number(input.updatedAt) || timestamp
    };
  }

  // ---- View (cache) ----

  async function refreshView() {
    const [foods, results, cats, catMeta, participantMeta] = await Promise.all([
      activeRepo.readAll("foods"),
      activeRepo.readAll("results"),
      activeRepo.readAll("cats"),
      activeRepo.find("meta", "catId"),
      activeRepo.find("meta", "participantId")
    ]);

    const catId = (catMeta && catMeta.value) || "";
    const participantId = (participantMeta && participantMeta.value) || "";

    const resultsByFood = new Map();
    results
      .filter((r) => !catId || r.catId === catId)
      .forEach((r) => {
        const list = resultsByFood.get(r.foodId) || [];
        list.push(r);
        resultsByFood.set(r.foodId, list);
      });
    resultsByFood.forEach((list) => list.sort((a, b) => a.createdAt - b.createdAt));

    const cat = cats.find((c) => c.id === catId) || null;
    const assetIds = new Set();
    if (cat && cat.photoAssetId) assetIds.add(cat.photoAssetId);
    foods.forEach((f) => {
      if (f.photoAssetId) assetIds.add(f.photoAssetId);
    });
    if (assetIds.size > 0) {
      await assetRepo.preload(Array.from(assetIds));
    }

    const filteredFoods = foods.filter((f) => !catId || f.catId === catId);
    const summarizedFoods = filteredFoods.map((food) =>
      rules.summarizeFood(
        {
          ...food,
          photoPath: food.photoAssetId ? assetRepo.getUrl(food.photoAssetId) : "",
          results: resultsByFood.get(food.id) || []
        },
        time()
      )
    );

    view.foods = summarizedFoods;
    view.resultsByFood = resultsByFood;
    view.catId = catId;
    view.participantId = participantId;
    view.catProfile = cat
      ? {
          ...cat,
          photoPath: (cat.photoAssetId ? assetRepo.getUrl(cat.photoAssetId) : "") || DEFAULT_CAT_AVATAR
        }
      : null;
  }

  // ---- Public reads ----

  function getFoods() {
    return clone(view.foods);
  }

  function getFood(foodId) {
    const food = view.foods.find((item) => item.id === foodId);
    return food ? clone(food) : null;
  }

  function getCatProfile() {
    return clone(view.catProfile);
  }

  // ---- Public writes ----

  async function saveFood(input, options = {}) {
    const existing = input.id ? await activeRepo.find("foods", input.id) : null;
    const foodId = existing ? existing.id : stableId(input.id);
    const catId = input.catId || (existing && existing.catId) || view.catId;
    let photoAssetId =
      (existing && existing.photoAssetId) || input.photoAssetId || null;

    // v1.1.4-hotfix-3: 诊断 iPhone PWA "拍照+写产品名" saveFood 失败的根因。
    // user 反馈"提示数据或照片暂时无法保存"但表单值还在,看起来像成功。
    // 之前的 catch 只在 submitFood 里吃成通用 toast,根因被埋了。
    // 现在每步 catch + log 实际 error 到 globalThis, iPhone 调试抽屉能拉到。
    const diagLog = (stage, payload) => {
      try {
        const prev = globalThis.__CAT_EAT_SAVE_FOOD_DIAG__ || [];
        prev.push({ at: Date.now(), stage, ...payload });
        globalThis.__CAT_EAT_SAVE_FOOD_DIAG__ = prev.slice(-20);
      } catch {}
    };

    let blob = null;
    if (options.photoDataUrl) {
      try {
        blob = dataUrlToBlob(options.photoDataUrl);
      } catch (e) {
        diagLog("dataUrlToBlob-throw", { error: e.message });
        throw e;
      }
      if (!blob) {
        diagLog("dataUrlToBlob-null", { dataUrlPrefix: String(options.photoDataUrl || "").slice(0, 40) });
        throw new Error("Unable to convert photo to Blob");
      }
      try {
        photoAssetId = await assetRepo.putFoodPhoto(catId, blob, photoAssetId);
      } catch (e) {
        diagLog("putFoodPhoto-fail", { catId, blobSize: blob.size, error: e.message, stack: e.stack });
        throw e;
      }
    }

    const record = normalizeFood(input, {
      id: foodId,
      catId,
      photoAssetId,
      timestamp: time()
    });

    try {
      await activeRepo.runTransaction(({ foods, assets }) => {
        foods.put(record);
        if (
          options.photoDataUrl &&
          existing &&
          existing.photoAssetId &&
          existing.photoAssetId !== photoAssetId
        ) {
          assets.delete(existing.photoAssetId);
        }
      });
    } catch (e) {
      diagLog("runTransaction-fail", { foodId, catId, photoAssetId, error: e.message, stack: e.stack });
      throw e;
    }

    try {
      await refreshView();
    } catch (e) {
      diagLog("refreshView-fail", { foodId, error: e.message });
      throw e;
    }
    return getFood(foodId);
  }

  async function addResult(foodId, input) {
    const food = await activeRepo.find("foods", foodId);
    if (!food) throw new Error("Food not found");
    const timestamp = time();
    const result = normalizeResult(input, {
      id: stableId(input.id),
      foodId,
      catId: food.catId,
      timestamp
    });
    const updatedFood = {
      ...food,
      manualStatus: null,
      updatedAt: timestamp
    };

    await activeRepo.runTransaction(({ foods, results }) => {
      foods.put(updatedFood);
      results.put(result);
    });

    await refreshView();
    return getFood(foodId);
  }

  async function updateFood(foodId, patch) {
    const food = await activeRepo.find("foods", foodId);
    if (!food) throw new Error("Food not found");
    const updated = normalizeFood(
      { ...food, ...patch, updatedAt: time() },
      {
        id: food.id,
        catId: food.catId,
        photoAssetId: food.photoAssetId,
        timestamp: time()
      }
    );
    await activeRepo.runTransaction(({ foods }) => foods.put(updated));
    await refreshView();
    return getFood(foodId);
  }

  async function deleteFood(foodId) {
    const food = await activeRepo.find("foods", foodId);
    const results = await activeRepo.readAll("results");
    await activeRepo.runTransaction(({ foods, results: resultsStore, assets }) => {
      foods.delete(foodId);
      results
        .filter((r) => r.foodId === foodId)
        .forEach((r) => resultsStore.delete(r.id));
      if (food && food.photoAssetId) {
        assets.delete(food.photoAssetId);
      }
    });
    await refreshView();
  }

  async function replaceFoods(nextFoods) {
    const existingAssets = await activeRepo.readAll("assets");
    const timestamp = time();
    const foods = [];
    const results = [];
    nextFoods.forEach((input) => {
      const foodId = stableId(input.id);
      foods.push(
        normalizeFood(input, {
          id: foodId,
          catId: view.catId,
          photoAssetId: null,
          timestamp
        })
      );
      (input.results || []).forEach((result) => {
        results.push(
          normalizeResult(result, {
            id: stableId(result.id),
            foodId,
            catId: view.catId,
            timestamp: Number(result.createdAt) || timestamp
          })
        );
      });
    });

    await activeRepo.runTransaction(({ foods: foodsStore, results: resultsStore, assets }) => {
      foodsStore.clear();
      resultsStore.clear();
      existingAssets
        .filter((a) => a.kind === "food-photo")
        .forEach((a) => assets.delete(a.id));
      foods.forEach((f) => foodsStore.put(f));
      results.forEach((r) => resultsStore.put(r));
    });

    await refreshView();
    return getFoods();
  }

  async function saveCatProfile(input, options = {}) {
    const existing = (await activeRepo.find("cats", view.catId)) || {};
    let photoAssetId = existing.photoAssetId || null;
    if (options.photoDataUrl) {
      const blob = dataUrlToBlob(options.photoDataUrl);
      if (!blob) throw new Error("Unable to convert cat photo to Blob");
      photoAssetId = await assetRepo.putCatAvatar(view.catId, blob, photoAssetId);
    }
    const cat = normalizeCat(
      { ...existing, ...input, updatedAt: time() },
      { id: view.catId, photoAssetId, timestamp: time() }
    );
    await activeRepo.runTransaction(({ cats, assets }) => {
      cats.put(cat);
      if (
        options.photoDataUrl &&
        existing.photoAssetId &&
        existing.photoAssetId !== photoAssetId
      ) {
        assets.delete(existing.photoAssetId);
      }
    });
    await refreshView();
    return getCatProfile();
  }

  // ---- Lifecycle ----

  async function initialize(context = {}) {
    try {
      await activeRepo.adapter.initialize();
      mode = activeRepo.adapter.kind;
      if (typeof migrate === "function") {
        // 迁移失败需要让调用方感知（data-store.js 会据此回退到 legacy-fallback）
        await migrate(context.participantId || "");
      }
      // 确保 meta / cats 默认值存在（云端模式下跳过，等用户显式 push/pull）
      if (!skipDefaults) {
        await ensureDefaults(context.participantId || "");
      }
      await refreshView();
      lastError = null;
    } catch (error) {
      lastError = error;
      mode = "uninitialized";
      throw error;
    }
    return status();
  }

  async function ensureDefaults(participantHint = "") {
    const catMeta = await activeRepo.find("meta", "catId");
    const participantMeta = await activeRepo.find("meta", "participantId");
    const catId = isUuid(catMeta && catMeta.value) ? catMeta.value : createUuid();
    const participantId =
      participantHint || (participantMeta && participantMeta.value) || createUuid();
    const existingCat = await activeRepo.find("cats", catId);
    await activeRepo.runTransaction(({ meta, cats }) => {
      meta.put({ key: "schemaVersion", value: SCHEMA_VERSION });
      meta.put({ key: "catId", value: catId });
      meta.put({ key: "participantId", value: participantId });
      if (!existingCat) {
        cats.put(normalizeCat({}, { id: catId, timestamp: time() }));
      }
    });
  }

  function status() {
    const capabilities = {
      cloud: activeRepo && activeRepo.kind === "mirror",
      imageStorage: "blob",
      transactions: true
    };
    return {
      mode,
      schemaVersion: SCHEMA_VERSION,
      catId: view.catId,
      participantId: view.participantId,
      error: lastError ? String(lastError.message || lastError) : null,
      capabilities
    };
  }

  // ---- DataURL → Blob ----
  function dataUrlToBlob(dataUrl) {
    const match = /^data:([^;,]+)?(?:;charset=[^;,]+)?;base64,(.*)$/i.exec(
      String(dataUrl || "")
    );
    if (!match) return null;
    const mimeType = match[1] || "application/octet-stream";
    const decode =
      typeof atob === "function"
        ? atob
        : (v) => Buffer.from(v, "base64").toString("binary");
    const binary = decode(match[2]);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new Blob([bytes], { type: mimeType });
  }

  return {
    initialize,
    createUuid,
    getFoods,
    getFood,
    getCatProfile,
    saveFood,
    addResult,
    updateFood,
    deleteFood,
    replaceFoods,
    saveCatProfile,
    status,
    constants,
    // 手动刷新视图缓存（用于云端恢复等外部直接写 localRepo 的场景）
    refresh: refreshView,
    // 切换底层 repo（如初始化后开启 CloudBase 镜像模式时调）
    setRepo(nextRepo) {
      if (nextRepo) {
        activeRepo = nextRepo;
      }
    },
    // 切换是否跳过 ensureDefaults
    setSkipDefaults(value) {
      skipDefaults = value === true;
    }
  };
}
