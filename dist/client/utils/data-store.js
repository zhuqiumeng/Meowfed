(function attachDataStore(globalScope, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory;
  }

  if (globalScope && globalScope.document) {
    globalScope.CatEatData = factory({
      indexedDB: globalScope.indexedDB,
      localStorage: globalScope.localStorage,
      crypto: globalScope.crypto,
      URL: globalScope.URL
    });
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function createDataStore(options = {}) {

  const DB_NAME = "cat-eat-local";
  const DB_VERSION = 1;
  const SCHEMA_VERSION = 1;
  const DEFAULT_CAT_AVATAR = "/assets/cat-profile-default.jpg";
  const LEGACY_KEYS = {
    foods: "CAT_EAT_H5_FOODS_V2",
    initialized: "CAT_EAT_H5_INITIALIZED_V2",
    participant: "CAT_EAT_H5_PARTICIPANT_V1",
    catProfile: "CAT_EAT_H5_CAT_PROFILE_V1"
  };
  const META_KEYS = {
    schemaVersion: "schemaVersion",
    catId: "catId",
    participantId: "participantId",
    migration: "migration.localStorageV2"
  };

  const idb = options.indexedDB;
  const storage = options.localStorage;
  const cryptoApi = options.crypto;
  const urlApi = options.URL;
  const now = typeof options.now === "function" ? options.now : () => Date.now();

  let database = null;
  let initializePromise = null;
  let mode = "uninitialized";
  let lastError = null;
  let objectUrls = [];
  let cache = {
    foods: [],
    catProfile: { nickname: "", ageYears: null, photoPath: "" },
    catId: "",
    participantId: ""
  };

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function createUuid() {
    if (cryptoApi && typeof cryptoApi.randomUUID === "function") {
      return cryptoApi.randomUUID();
    }

    const random = () => Math.floor(Math.random() * 0x10000).toString(16).padStart(4, "0");
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

  function safeStorageGet(key) {
    try {
      return storage ? storage.getItem(key) : null;
    } catch (error) {
      return null;
    }
  }

  function strictStorageGet(key) {
    if (!storage) return null;
    return storage.getItem(key);
  }

  function safeStorageSet(key, value) {
    if (!storage) return false;
    try {
      storage.setItem(key, value);
      return true;
    } catch (error) {
      return false;
    }
  }

  function safeJsonParse(value, fallback) {
    if (value === null || value === undefined || value === "") return fallback;
    return JSON.parse(value);
  }

  function requestValue(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("IndexedDB request failed"));
    });
  }

  function transactionDone(transaction) {
    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error("IndexedDB transaction failed"));
      transaction.onabort = () => reject(transaction.error || new Error("IndexedDB transaction aborted"));
    });
  }

  function openDatabase() {
    return new Promise((resolve, reject) => {
      if (!idb || typeof idb.open !== "function") {
        reject(new Error("IndexedDB is unavailable"));
        return;
      }

      let request;
      try {
        request = idb.open(DB_NAME, DB_VERSION);
      } catch (error) {
        reject(error);
        return;
      }

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains("meta")) {
          db.createObjectStore("meta", { keyPath: "key" });
        }
        if (!db.objectStoreNames.contains("cats")) {
          db.createObjectStore("cats", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("foods")) {
          const store = db.createObjectStore("foods", { keyPath: "id" });
          store.createIndex("catId", "catId", { unique: false });
        }
        if (!db.objectStoreNames.contains("results")) {
          const store = db.createObjectStore("results", { keyPath: "id" });
          store.createIndex("foodId", "foodId", { unique: false });
          store.createIndex("catId", "catId", { unique: false });
        }
        if (!db.objectStoreNames.contains("assets")) {
          const store = db.createObjectStore("assets", { keyPath: "id" });
          store.createIndex("catId", "catId", { unique: false });
          store.createIndex("kind", "kind", { unique: false });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("Unable to open IndexedDB"));
      request.onblocked = () => reject(new Error("IndexedDB upgrade is blocked"));
    });
  }

  async function getRecord(storeName, key) {
    const transaction = database.transaction(storeName, "readonly");
    return requestValue(transaction.objectStore(storeName).get(key));
  }

  async function getAllRecords(storeName) {
    const transaction = database.transaction(storeName, "readonly");
    return requestValue(transaction.objectStore(storeName).getAll());
  }

  async function putRecords(storeNames, callback) {
    const transaction = database.transaction(storeNames, "readwrite");
    const stores = Object.fromEntries(
      storeNames.map((storeName) => [storeName, transaction.objectStore(storeName)])
    );
    callback(stores, transaction);
    await transactionDone(transaction);
  }

  function normalizeFood(input, context = {}) {
    const timestamp = context.timestamp || now();
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
      photoAssetId: context.photoAssetId !== undefined
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
    const timestamp = context.timestamp || now();
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
    const timestamp = context.timestamp || now();
    const createdAt = Number(input.createdAt) || timestamp;
    const ageYears = Number(input.ageYears);
    return {
      schemaVersion: SCHEMA_VERSION,
      id: context.id || input.id || createUuid(),
      ownerId: input.ownerId || null,
      nickname: typeof input.nickname === "string" ? input.nickname.trim() : "",
      ageYears: Number.isFinite(ageYears) && ageYears > 0 ? ageYears : null,
      photoAssetId: context.photoAssetId !== undefined
        ? context.photoAssetId
        : input.photoAssetId || null,
      createdAt,
      updatedAt: Number(input.updatedAt) || timestamp
    };
  }

  function dataUrlToBlob(dataUrl) {
    const match = /^data:([^;,]+)?(?:;charset=[^;,]+)?;base64,(.*)$/i.exec(String(dataUrl || ""));
    if (!match) return null;

    const mimeType = match[1] || "application/octet-stream";
    const decode = typeof atob === "function"
      ? atob
      : (value) => Buffer.from(value, "base64").toString("binary");
    const binary = decode(match[2]);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return new Blob([bytes], { type: mimeType });
  }

  function createAsset(blob, kind, catId, existing = {}) {
    const timestamp = now();
    return {
      schemaVersion: SCHEMA_VERSION,
      id: stableId(existing.id),
      catId,
      ownerId: existing.ownerId || null,
      kind,
      mimeType: blob.type || "application/octet-stream",
      size: Number(blob.size) || 0,
      blob,
      createdAt: Number(existing.createdAt) || timestamp,
      updatedAt: timestamp
    };
  }

  function readLegacyPayload(strict = false) {
    const getValue = strict ? strictStorageGet : safeStorageGet;
    const rawFoods = getValue(LEGACY_KEYS.foods);
    const rawProfile = getValue(LEGACY_KEYS.catProfile);
    const participantId = getValue(LEGACY_KEYS.participant);
    const initialized = getValue(LEGACY_KEYS.initialized);

    return {
      exists: [rawFoods, rawProfile, participantId, initialized].some((value) => value !== null),
      foods: safeJsonParse(rawFoods, []),
      catProfile: safeJsonParse(rawProfile, {}),
      participantId: participantId || ""
    };
  }

  function cleanupLegacyStorage() {
    if (!storage) return false;
    try {
      Object.values(LEGACY_KEYS).forEach((key) => storage.removeItem(key));
      return true;
    } catch (error) {
      return false;
    }
  }

  async function migrateLegacyStorage(participantHint = "") {
    const migration = await getRecord("meta", META_KEYS.migration);
    if (migration?.status === "complete") {
      cleanupLegacyStorage();
      return migration;
    }

    const legacy = readLegacyPayload(true);
    if (!legacy.exists) {
      const completedAt = now();
      await putRecords(["meta"], ({ meta }) => {
        meta.put({
          key: META_KEYS.migration,
          status: "complete",
          source: "localStorage-v2",
          importedFoods: 0,
          importedResults: 0,
          importedAssets: 0,
          completedAt
        });
      });
      return getRecord("meta", META_KEYS.migration);
    }

    if (!Array.isArray(legacy.foods)) {
      throw new Error("Legacy food data is not an array");
    }

    const existingCatId = (await getRecord("meta", META_KEYS.catId))?.value;
    const catId = isUuid(existingCatId) ? existingCatId : createUuid();
    const existingFoods = await getAllRecords("foods");
    const existingResults = await getAllRecords("results");
    const foodByLegacyId = new Map(
      existingFoods.filter((food) => food.legacyId).map((food) => [food.legacyId, food])
    );
    const resultByLegacyId = new Map(
      existingResults.filter((result) => result.legacyId).map((result) => [result.legacyId, result])
    );
    const foods = [];
    const results = [];
    const assets = [];

    legacy.foods.forEach((legacyFood) => {
      const legacyFoodId = String(legacyFood.id || "");
      const existingFood = foodByLegacyId.get(legacyFoodId);
      const foodId = existingFood?.id || stableId(legacyFood.id);
      let photoAssetId = existingFood?.photoAssetId || null;
      const photoBlob = dataUrlToBlob(legacyFood.photoPath);
      if (photoBlob) {
        const asset = createAsset(photoBlob, "food-photo", catId);
        assets.push(asset);
        photoAssetId = asset.id;
      }

      const sourceResults = Array.isArray(legacyFood.results) ? legacyFood.results : [];
      const latestTimestamp = sourceResults.reduce(
        (latest, result) => Math.max(latest, Number(result.createdAt) || 0),
        Number(legacyFood.createdAt) || 0
      );
      foods.push(
        normalizeFood(legacyFood, {
          id: foodId,
          legacyId: legacyFoodId || null,
          catId,
          photoAssetId,
          timestamp: latestTimestamp || now()
        })
      );

      sourceResults.forEach((legacyResult) => {
        const legacyResultId = String(legacyResult.id || "");
        const existingResult = resultByLegacyId.get(legacyResultId);
        results.push(
          normalizeResult(legacyResult, {
            id: existingResult?.id || stableId(legacyResult.id),
            legacyId: legacyResultId || null,
            foodId,
            catId,
            timestamp: Number(legacyResult.createdAt) || now()
          })
        );
      });
    });

    const existingCat = await getRecord("cats", catId);
    let catPhotoAssetId = existingCat?.photoAssetId || null;
    const catPhotoBlob = dataUrlToBlob(legacy.catProfile.photoPath);
    if (catPhotoBlob) {
      const asset = createAsset(catPhotoBlob, "cat-avatar", catId);
      assets.push(asset);
      catPhotoAssetId = asset.id;
    }
    const cat = normalizeCat(legacy.catProfile, {
      id: catId,
      photoAssetId: catPhotoAssetId,
      timestamp: now()
    });
    const participantId = participantHint || legacy.participantId || createUuid();

    await putRecords(["meta", "cats", "foods", "results", "assets"], (stores) => {
      stores.meta.put({ key: META_KEYS.schemaVersion, value: SCHEMA_VERSION });
      stores.meta.put({ key: META_KEYS.catId, value: catId });
      stores.meta.put({ key: META_KEYS.participantId, value: participantId });
      stores.cats.put(cat);
      foods.forEach((food) => stores.foods.put(food));
      results.forEach((result) => stores.results.put(result));
      assets.forEach((asset) => stores.assets.put(asset));
    });

    const verifiedFoods = await Promise.all(foods.map((food) => getRecord("foods", food.id)));
    const verifiedResults = await Promise.all(results.map((result) => getRecord("results", result.id)));
    const verifiedAssets = await Promise.all(assets.map((asset) => getRecord("assets", asset.id)));
    if (
      verifiedFoods.some((food) => !food) ||
      verifiedResults.some((result) => !result) ||
      verifiedAssets.some((asset) => !asset)
    ) {
      throw new Error("Legacy data verification failed");
    }

    const completedAt = now();
    await putRecords(["meta"], ({ meta }) => {
      meta.put({
        key: META_KEYS.migration,
        status: "complete",
        source: "localStorage-v2",
        importedFoods: foods.length,
        importedResults: results.length,
        importedAssets: assets.length,
        completedAt
      });
    });
    cleanupLegacyStorage();
    return getRecord("meta", META_KEYS.migration);
  }

  async function ensureDefaults(participantHint = "") {
    const catMeta = await getRecord("meta", META_KEYS.catId);
    const participantMeta = await getRecord("meta", META_KEYS.participantId);
    const catId = isUuid(catMeta?.value) ? catMeta.value : createUuid();
    const participantId = participantHint || participantMeta?.value || createUuid();
    const existingCat = await getRecord("cats", catId);

    await putRecords(["meta", "cats"], ({ meta, cats }) => {
      meta.put({ key: META_KEYS.schemaVersion, value: SCHEMA_VERSION });
      meta.put({ key: META_KEYS.catId, value: catId });
      meta.put({ key: META_KEYS.participantId, value: participantId });
      if (!existingCat) {
        cats.put(normalizeCat({}, { id: catId, timestamp: now() }));
      }
    });
  }

  function revokeObjectUrls() {
    if (urlApi && typeof urlApi.revokeObjectURL === "function") {
      objectUrls.forEach((value) => urlApi.revokeObjectURL(value));
    }
    objectUrls = [];
  }

  function assetUrl(asset) {
    if (!asset?.blob || !urlApi || typeof urlApi.createObjectURL !== "function") return "";
    const value = urlApi.createObjectURL(asset.blob);
    objectUrls.push(value);
    return value;
  }

  async function refreshIndexedDbCache() {
    const [foods, results, assets, cats, catMeta, participantMeta] = await Promise.all([
      getAllRecords("foods"),
      getAllRecords("results"),
      getAllRecords("assets"),
      getAllRecords("cats"),
      getRecord("meta", META_KEYS.catId),
      getRecord("meta", META_KEYS.participantId)
    ]);
    revokeObjectUrls();
    const assetMap = new Map(assets.map((asset) => [asset.id, assetUrl(asset)]));
    const resultsByFood = new Map();
    results.forEach((result) => {
      const list = resultsByFood.get(result.foodId) || [];
      list.push(result);
      resultsByFood.set(result.foodId, list);
    });
    resultsByFood.forEach((list) => list.sort((a, b) => a.createdAt - b.createdAt));
    const catId = catMeta?.value || "";
    const cat = cats.find((item) => item.id === catId) || {};

    cache = {
      foods: foods
        .filter((food) => !catId || food.catId === catId)
        .map((food) => ({
          ...food,
          photoPath: assetMap.get(food.photoAssetId) || "",
          results: resultsByFood.get(food.id) || []
        })),
      catProfile: {
        ...cat,
        photoPath: assetMap.get(cat.photoAssetId) || ""
      },
      catId,
      participantId: participantMeta?.value || ""
    };
  }

  function refreshLegacyCache() {
    let legacy;
    try {
      legacy = readLegacyPayload();
    } catch (error) {
      legacy = { foods: [], catProfile: {}, participantId: "" };
    }
    const fallbackCatId = cache.catId || createUuid();
    cache = {
      foods: Array.isArray(legacy.foods) ? legacy.foods : [],
      catProfile: {
        nickname: legacy.catProfile?.nickname || "",
        ageYears: legacy.catProfile?.ageYears || null,
        photoPath: legacy.catProfile?.photoPath || ""
      },
      catId: fallbackCatId,
      participantId: legacy.participantId || createUuid()
    };
  }

  async function initialize(context = {}) {
    if (initializePromise) return initializePromise;

    initializePromise = (async () => {
      try {
        database = await openDatabase();
        await migrateLegacyStorage(context.participantId || "");
        await ensureDefaults(context.participantId || "");
        await refreshIndexedDbCache();
        mode = "indexeddb";
        lastError = null;
      } catch (error) {
        lastError = error;
        mode = "legacy-fallback";
        refreshLegacyCache();
      }
      return status();
    })();
    return initializePromise;
  }

  function getFoods() {
    return clone(cache.foods);
  }

  function getFood(foodId) {
    const food = cache.foods.find((item) => item.id === foodId);
    return food ? clone(food) : null;
  }

  function getCatProfile() {
    return clone(cache.catProfile);
  }

  function legacyWriteFoods(foods) {
    if (!safeStorageSet(LEGACY_KEYS.foods, JSON.stringify(foods))) {
      throw new Error("Unable to save legacy food data");
    }
    safeStorageSet(LEGACY_KEYS.initialized, "1");
    refreshLegacyCache();
  }

  async function saveFood(input, options = {}) {
    if (mode === "legacy-fallback") {
      const foods = getFoods();
      const index = foods.findIndex((food) => food.id === input.id);
      const existing = index >= 0 ? foods[index] : null;
      const food = {
        ...(existing || {}),
        ...input,
        schemaVersion: SCHEMA_VERSION,
        id: input.id || createUuid(),
        catId: input.catId || cache.catId,
        ownerId: input.ownerId || null,
        photoPath: options.photoDataUrl || existing?.photoPath || "",
        createdAt: Number(input.createdAt) || now(),
        updatedAt: now(),
        results: existing?.results || input.results || []
      };
      if (index >= 0) foods[index] = food;
      else foods.unshift(food);
      legacyWriteFoods(foods);
      return getFood(food.id);
    }

    const existing = input.id ? await getRecord("foods", input.id) : null;
    const foodId = existing?.id || stableId(input.id);
    const catId = input.catId || existing?.catId || cache.catId;
    let photoAssetId = existing?.photoAssetId || input.photoAssetId || null;
    let asset = null;
    if (options.photoDataUrl) {
      const blob = dataUrlToBlob(options.photoDataUrl);
      if (!blob) throw new Error("Unable to convert photo to Blob");
      asset = createAsset(blob, "food-photo", catId);
      photoAssetId = asset.id;
    }
    const record = normalizeFood(input, {
      id: foodId,
      catId,
      photoAssetId,
      timestamp: now()
    });

    await putRecords(["foods", "assets"], ({ foods, assets }) => {
      foods.put(record);
      if (asset) assets.put(asset);
      if (asset && existing?.photoAssetId && existing.photoAssetId !== asset.id) {
        assets.delete(existing.photoAssetId);
      }
    });
    await refreshIndexedDbCache();
    return getFood(foodId);
  }

  async function addResult(foodId, input) {
    if (mode === "legacy-fallback") {
      const foods = getFoods();
      const index = foods.findIndex((food) => food.id === foodId);
      if (index < 0) throw new Error("Food not found");
      foods[index].manualStatus = null;
      foods[index].results = foods[index].results || [];
      foods[index].results.push({
        ...input,
        schemaVersion: SCHEMA_VERSION,
        id: input.id || createUuid(),
        foodId,
        catId: foods[index].catId || cache.catId,
        ownerId: input.ownerId || null,
        createdAt: Number(input.createdAt) || now(),
        updatedAt: now()
      });
      foods[index].updatedAt = now();
      legacyWriteFoods(foods);
      return getFood(foodId);
    }

    const food = await getRecord("foods", foodId);
    if (!food) throw new Error("Food not found");
    const timestamp = now();
    const result = normalizeResult(input, {
      id: stableId(input.id),
      foodId,
      catId: food.catId,
      timestamp
    });
    const updatedFood = { ...food, manualStatus: null, updatedAt: timestamp };
    await putRecords(["foods", "results"], ({ foods, results }) => {
      foods.put(updatedFood);
      results.put(result);
    });
    await refreshIndexedDbCache();
    return getFood(foodId);
  }

  async function updateFood(foodId, patch) {
    if (mode === "legacy-fallback") {
      const foods = getFoods();
      const index = foods.findIndex((food) => food.id === foodId);
      if (index < 0) throw new Error("Food not found");
      foods[index] = { ...foods[index], ...patch, updatedAt: now() };
      legacyWriteFoods(foods);
      return getFood(foodId);
    }

    const food = await getRecord("foods", foodId);
    if (!food) throw new Error("Food not found");
    const updated = normalizeFood(
      { ...food, ...patch, updatedAt: now() },
      { id: food.id, catId: food.catId, photoAssetId: food.photoAssetId, timestamp: now() }
    );
    await putRecords(["foods"], ({ foods }) => foods.put(updated));
    await refreshIndexedDbCache();
    return getFood(foodId);
  }

  async function deleteFood(foodId) {
    if (mode === "legacy-fallback") {
      legacyWriteFoods(getFoods().filter((food) => food.id !== foodId));
      return;
    }

    const food = await getRecord("foods", foodId);
    const results = await getAllRecords("results");
    await putRecords(["foods", "results", "assets"], (stores) => {
      stores.foods.delete(foodId);
      results.filter((result) => result.foodId === foodId).forEach((result) => {
        stores.results.delete(result.id);
      });
      if (food?.photoAssetId) stores.assets.delete(food.photoAssetId);
    });
    await refreshIndexedDbCache();
  }

  async function replaceFoods(nextFoods) {
    if (mode === "legacy-fallback") {
      const timestamp = now();
      legacyWriteFoods(
        nextFoods.map((food) => ({
          ...food,
          schemaVersion: SCHEMA_VERSION,
          id: stableId(food.id),
          catId: cache.catId,
          ownerId: food.ownerId || null,
          createdAt: Number(food.createdAt) || timestamp,
          updatedAt: timestamp,
          results: (food.results || []).map((result) => ({
            ...result,
            schemaVersion: SCHEMA_VERSION,
            id: stableId(result.id),
            catId: cache.catId,
            ownerId: result.ownerId || null,
            createdAt: Number(result.createdAt) || timestamp,
            updatedAt: timestamp
          }))
        }))
      );
      return getFoods();
    }

    const assets = await getAllRecords("assets");
    const timestamp = now();
    const foods = [];
    const results = [];
    nextFoods.forEach((input) => {
      const foodId = stableId(input.id);
      foods.push(
        normalizeFood(input, {
          id: foodId,
          catId: cache.catId,
          photoAssetId: null,
          timestamp
        })
      );
      (input.results || []).forEach((result) => {
        results.push(
          normalizeResult(result, {
            id: stableId(result.id),
            foodId,
            catId: cache.catId,
            timestamp: Number(result.createdAt) || timestamp
          })
        );
      });
    });

    await putRecords(["foods", "results", "assets"], (stores) => {
      stores.foods.clear();
      stores.results.clear();
      assets.filter((asset) => asset.kind === "food-photo").forEach((asset) => {
        stores.assets.delete(asset.id);
      });
      foods.forEach((food) => stores.foods.put(food));
      results.forEach((result) => stores.results.put(result));
    });
    await refreshIndexedDbCache();
    return getFoods();
  }

  async function saveCatProfile(input, options = {}) {
    if (mode === "legacy-fallback") {
      const profile = {
        ...getCatProfile(),
        ...input,
        schemaVersion: SCHEMA_VERSION,
        id: cache.catId,
        ownerId: input.ownerId || null,
        photoPath: options.photoDataUrl || getCatProfile().photoPath || "",
        createdAt: Number(input.createdAt) || now(),
        updatedAt: now()
      };
      if (!safeStorageSet(LEGACY_KEYS.catProfile, JSON.stringify(profile))) {
        throw new Error("Unable to save legacy cat profile");
      }
      refreshLegacyCache();
      return getCatProfile();
    }

    const existing = (await getRecord("cats", cache.catId)) || {};
    let photoAssetId = existing.photoAssetId || null;
    let asset = null;
    if (options.photoDataUrl) {
      const blob = dataUrlToBlob(options.photoDataUrl);
      if (!blob) throw new Error("Unable to convert cat photo to Blob");
      asset = createAsset(blob, "cat-avatar", cache.catId);
      photoAssetId = asset.id;
    }
    const cat = normalizeCat(
      { ...existing, ...input, updatedAt: now() },
      { id: cache.catId, photoAssetId, timestamp: now() }
    );
    await putRecords(["cats", "assets"], ({ cats, assets }) => {
      cats.put(cat);
      if (asset) assets.put(asset);
      if (asset && existing.photoAssetId && existing.photoAssetId !== asset.id) {
        assets.delete(existing.photoAssetId);
      }
    });
    await refreshIndexedDbCache();
    return getCatProfile();
  }

  function status() {
    return {
      mode,
      schemaVersion: SCHEMA_VERSION,
      catId: cache.catId,
      participantId: cache.participantId,
      error: lastError ? String(lastError.message || lastError) : null
    };
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
    constants: {
      DB_NAME,
      DB_VERSION,
      SCHEMA_VERSION,
      DEFAULT_CAT_AVATAR,
      LEGACY_KEYS
    }
  };
});
