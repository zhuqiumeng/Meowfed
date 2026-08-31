// utils/data-store.js
//
// H5 数据层入口。负责：
//   1. 定义 constants 与 schema（被 CI 守门断言的字面量集中在这里）
//   2. 一次性把旧 localStorage v2 数据迁到 IndexedDB
//   3. 在 IndexedDBAdapter 之上挂一个 DataService 暴露为 window.CatEatData
//   4. IndexedDB 不可用时回退到 legacy-fallback（直接读写 localStorage）
//
// 业务语义（normalize / summarize / cache 重建）由 utils/data-service.js
// 统一提供，H5 与小程序共用同一份实现。

(function attachDataStore(globalScope, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory;
  }

  if (globalScope && globalScope.document) {
    const services = factory({
      indexedDB: globalScope.indexedDB,
      localStorage: globalScope.localStorage,
      crypto: globalScope.crypto,
      URL: globalScope.URL
    });
    globalScope.CatEatDataServices = services;
    // CatEatData 始终指向 factory API（带 withActive 转发的统一门面）。
    // v1.1 修：之前 getter 优先返回 active service（indexeddb/legacy），
    // 但 legacy service 没有 cloudbase 集成方法（isCloudBaseSdkAvailable
    // 等只在 api 上），导致 renderCloudSyncCard 第二次读 CatEatData 时
    // 拿到 legacy、抛 TypeError、#app 保持空白。
    // api 上 getFoods/saveFood 等通过 withActive 转发到 active service，
    // 行为跟直接拿 service 一致；cloudbase 方法也都在 api 上。
    Object.defineProperty(globalScope, "CatEatData", {
      configurable: true,
      get() {
        return services;
      }
    });
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function createDataStore(options = {}) {
  const DB_NAME = "cat-eat-local";
  const DB_VERSION = 1;
  const SCHEMA_VERSION = 1;
  const DEFAULT_CAT_AVATAR = "./assets/cat-profile-default.jpg";
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
  const CONSTANTS = { DB_NAME, DB_VERSION, SCHEMA_VERSION, DEFAULT_CAT_AVATAR, LEGACY_KEYS };

  const time = typeof options.now === "function" ? options.now : () => Date.now();

  // ---- Schema 声明（CI 守门断言 `db.createObjectStore("foods"/"results"/"assets")` 必须存在） ----

  function setupSchema(db) {
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
    if (!db.objectStoreNames.contains("outbox")) {
      db.createObjectStore("outbox", { keyPath: "id" });
    }
  }

  // ---- localStorage 旧 v2 兼容 ----

  function safeStorageGet(key) {
    const storage = options.localStorage;
    if (!storage) return null;
    try {
      return storage.getItem(key);
    } catch (error) {
      return null;
    }
  }

  function strictStorageGet(key) {
    const storage = options.localStorage;
    if (!storage) return null;
    return storage.getItem(key);
  }

  function safeStorageSet(key, value) {
    const storage = options.localStorage;
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

  function readLegacyPayload(strict) {
    const get = strict ? strictStorageGet : safeStorageGet;
    return {
      exists: [
        get(LEGACY_KEYS.foods),
        get(LEGACY_KEYS.catProfile),
        get(LEGACY_KEYS.participant),
        get(LEGACY_KEYS.initialized)
      ].some((v) => v !== null),
      foods: safeJsonParse(get(LEGACY_KEYS.foods), []),
      catProfile: safeJsonParse(get(LEGACY_KEYS.catProfile), {}),
      participantId: get(LEGACY_KEYS.participant) || ""
    };
  }

  function cleanupLegacyStorage() {
    const storage = options.localStorage;
    if (!storage) return false;
    try {
      Object.values(LEGACY_KEYS).forEach((key) => storage.removeItem(key));
      return true;
    } catch (error) {
      return false;
    }
  }

  // ---- UUID 工具（迁移 + DataService 共享）----

  function createUuidInternal() {
    const cryptoApi = options.crypto;
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

  // ---- 内部模块加载（commonjs / globalThis 双通道）----

  function loadRules() {
    if (typeof require === "function") {
      try {
        return require("./rules");
      } catch (error) {
        // ignore
      }
    }
    if (typeof globalThis !== "undefined" && globalThis.CatEatRules) {
      return globalThis.CatEatRules;
    }
    return null;
  }

  function createIndexedDBAdapter() {
    if (typeof require === "function") {
      const mod = require("./adapters/indexeddb-adapter");
      return mod.createIndexedDBAdapter({
        indexedDB: options.indexedDB,
        DB_NAME,
        DB_VERSION,
        setupSchema
      });
    }
    if (globalThis.CatEatIndexedDBAdapter) {
      return globalThis.CatEatIndexedDBAdapter.createIndexedDBAdapter({
        indexedDB: options.indexedDB,
        DB_NAME,
        DB_VERSION,
        setupSchema
      });
    }
    throw new Error("IndexedDBAdapter is not available");
  }

  function createLocalRepository(adapter, options) {
    if (typeof require === "function") {
      const mod = require("./repos/local-repository");
      return mod.createLocalRepository(adapter, options);
    }
    if (globalThis.CatEatLocalRepository) {
      return globalThis.CatEatLocalRepository.createLocalRepository(adapter, options);
    }
    throw new Error("LocalRepository is not available");
  }

  function createAssetRepository(repo) {
    if (typeof require === "function") {
      const mod = require("./repos/asset-repository");
      return mod.createAssetRepository({
        repo,
        urlApi: options.URL,
        createUuid: createUuidInternal,
        now: options.now,
        SCHEMA_VERSION
      });
    }
    if (globalThis.CatEatAssetRepository) {
      return globalThis.CatEatAssetRepository.createAssetRepository({
        repo,
        urlApi: options.URL,
        createUuid: createUuidInternal,
        now: options.now,
        SCHEMA_VERSION
      });
    }
    throw new Error("AssetRepository is not available");
  }

  // 直接构造 AssetRepository，传完整 options（含 downloadAsset）。
  // 上面的 createAssetRepository() 是接单参数 repo 的旧 wrapper，
  // 只用于不接 cloud 的旧调用方；新代码走这里。
  function createAssetRepositoryDirect(assetRepoOptions) {
    if (typeof require === "function") {
      const mod = require("./repos/asset-repository");
      return mod.createAssetRepository(assetRepoOptions);
    }
    if (globalThis.CatEatAssetRepository) {
      return globalThis.CatEatAssetRepository.createAssetRepository(assetRepoOptions);
    }
    throw new Error("AssetRepository is not available");
  }

  function createDataService(args) {
    if (typeof require === "function") {
      const mod = require("./data-service");
      return mod.createDataService(args);
    }
    if (globalThis.CatEatDataService) {
      return globalThis.CatEatDataService.createDataService(args);
    }
    throw new Error("DataService is not available");
  }

  // ---- CloudBase 集成（feature flag：env 配置时启用） ----
  //
  // 集成策略：
  //   - CloudBase 不可用 / 未配置 → 走纯本地（向后兼容）
  //   - CloudBase 可用 → DataService 拿到的 repo 是 SyncRepository，
  //     写操作会本地先写 + 异步 push 到云；失败入 outbox
  //   - CloudSync 实例暴露在 factory.cloudSync 上，供 UI 触发
  //     pushFirstTime / pullFromCloud / 资源同步

  function getCloudBaseConfig() {
    // v1.1.2-fix：浏览器优先。esbuild bundle 时会注入 require shim，
    // 如果不先看 globalThis，require 抛错会立即 return null，错过
    // ./utils/cloudbase-config.js IIFE 挂的 globalThis.CatEatCloudBaseConfig。
    if (globalThis && globalThis.CatEatCloudBaseConfig) {
      return globalThis.CatEatCloudBaseConfig;
    }
    if (typeof require === "function") {
      try {
        const mod = require("./cloudbase-config");
        return mod(globalThis);
      } catch (error) {
        return null;
      }
    }
    return null;
  }

  function loadCloudBaseSDK() {
    // v1.1.2-fix：浏览器优先。esbuild bundle data-store.js 时会注入 require
    // shim，让 `typeof require === "function"` 在浏览器里也是 true，
    // 如果不先看 globalThis，require 抛错会立即 return null，不再 fall
    // through 到 globalThis.cloudbase（由 ./utils/cloudbase-sdk.js IIFE 挂上）。
    if (globalThis && globalThis.cloudbase) {
      return globalThis.cloudbase;
    }
    if (typeof require === "function") {
      try {
        return require("@cloudbase/js-sdk");
      } catch (error) {
        return null;
      }
    }
    return null;
  }

  // 测试 / 自定义环境可通过 options.cloudBaseSdk 注入 SDK
  function resolveCloudBaseSDK() {
    if (options.cloudBaseSdk) return options.cloudBaseSdk;
    return loadCloudBaseSDK();
  }

  // 测试可注入 mock；否则读 window / 持久化 env
  function resolveCloudBaseEnv() {
    if (options.cloudBaseEnv) return options.cloudBaseEnv;
    const config = getCloudBaseConfig();
    if (config) return config.getEnv();
    return null;
  }

  function loadCloudBaseModules() {
    const modules = {};
    if (typeof require === "function") {
      try {
        modules.adapterMod = require("./adapters/cloudbase-adapter");
      } catch (error) {/* ignore */}
      try {
        modules.cloudRepoMod = require("./repos/cloud-repository");
      } catch (error) {/* ignore */}
      try {
        modules.outboxMod = require("./repos/outbox");
      } catch (error) {/* ignore */}
      try {
        modules.syncRepoMod = require("./repos/sync-repository");
      } catch (error) {/* ignore */}
      try {
        modules.cloudSyncMod = require("./cloud-sync");
      } catch (error) {/* ignore */}
    }
    if (globalThis) {
      modules.adapterMod = modules.adapterMod || globalThis.CatEatCloudBaseAdapter;
      modules.cloudRepoMod = modules.cloudRepoMod || globalThis.CatEatCloudRepository;
      modules.outboxMod = modules.outboxMod || globalThis.CatEatOutbox;
      modules.syncRepoMod = modules.syncRepoMod || globalThis.CatEatSyncRepository;
      modules.cloudSyncMod = modules.cloudSyncMod || globalThis.CatEatCloudSync;
    }
    return modules;
  }

  function tryCreateCloudBootstrap(localRepo) {
    const env = resolveCloudBaseEnv();
    if (!env) return null;
    const sdk = resolveCloudBaseSDK();
    if (!sdk || typeof sdk.init !== "function") return null;
    const mods = loadCloudBaseModules();
    if (!mods.adapterMod || !mods.cloudRepoMod || !mods.outboxMod || !mods.syncRepoMod || !mods.cloudSyncMod) {
      return null;
    }
    const app = sdk.init({ env });
    const adapter = mods.adapterMod.createCloudBaseAdapter({ app, env });
    const cloudRepo = mods.cloudRepoMod.createCloudRepository(adapter);
    const outbox = mods.outboxMod.createOutbox({
      localRepo,
      cloudRepo,
      now: options.now
    });
    const syncRepo = mods.syncRepoMod.createSyncRepository({
      local: localRepo,
      cloud: cloudRepo,
      outbox
    });
    const cloudSync = mods.cloudSyncMod.createCloudSync({
      adapter,
      cloudRepo,
      localRepo,
      outbox,
      now: options.now
    });
    return { app, env, adapter, cloudRepo, outbox, syncRepo, cloudSync };
  }

  // ---- 迁移（旧 v2 localStorage → IndexedDB v1）----
  //
  // migrate 用 repo（DataService 持有的 LocalRepository）来读写；
  // 不开新的 IDB 连接，避免和 DataService 内部的连接争用。

  function createMigrator(repo) {
    return async function migrate(participantHint) {
      const migration = await repo.find("meta", META_KEYS.migration);
      if (migration && migration.status === "complete") {
        cleanupLegacyStorage();
        return migration;
      }

      const legacy = readLegacyPayload(true);
      if (!legacy.exists) {
        const completedAt = time();
        await repo.runTransaction(({ meta }) => {
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
        return repo.find("meta", META_KEYS.migration);
      }
      if (!Array.isArray(legacy.foods)) {
        throw new Error("Legacy food data is not an array");
      }

      const existingCatIdRecord = await repo.find("meta", META_KEYS.catId);
      const catId = isUuid(existingCatIdRecord && existingCatIdRecord.value)
        ? existingCatIdRecord.value
        : createUuidInternal();

      const existingFoods = await repo.readAll("foods");
      const existingResults = await repo.readAll("results");
      const foodByLegacyId = new Map(
        existingFoods
          .filter((f) => f.legacyId)
          .map((f) => [f.legacyId, f])
      );
      const resultByLegacyId = new Map(
        existingResults
          .filter((r) => r.legacyId)
          .map((r) => [r.legacyId, r])
      );

      const foods = [];
      const results = [];
      const assets = [];

      legacy.foods.forEach((legacyFood) => {
        const legacyFoodId = String(legacyFood.id || "");
        const existingFood = foodByLegacyId.get(legacyFoodId);
        const foodId = (existingFood && existingFood.id) || createUuidInternal();
        let photoAssetId = (existingFood && existingFood.photoAssetId) || null;
        const photoBlob = dataUrlToBlob(legacyFood.photoPath);
        if (photoBlob) {
          const asset = {
            schemaVersion: SCHEMA_VERSION,
            id: createUuidInternal(),
            catId,
            ownerId: null,
            kind: "food-photo",
            mimeType: photoBlob.type || "image/jpeg",
            size: photoBlob.size || 0,
            blob: photoBlob,
            createdAt: time(),
            updatedAt: time()
          };
          assets.push(asset);
          photoAssetId = asset.id;
        }

        const sourceResults = Array.isArray(legacyFood.results) ? legacyFood.results : [];
        const latestTimestamp = sourceResults.reduce(
          (latest, r) => Math.max(latest, Number(r.createdAt) || 0),
          Number(legacyFood.createdAt) || 0
        );

        foods.push({
          schemaVersion: SCHEMA_VERSION,
          id: foodId,
          legacyId: legacyFoodId || null,
          catId,
          ownerId: null,
          brand: String(legacyFood.brand || "品牌待补充"),
          name: String(legacyFood.name || "未命名食物"),
          specification: String(legacyFood.specification || ""),
          foodType: String(legacyFood.foodType || "other"),
          flavor: String(legacyFood.flavor || ""),
          texture: String(legacyFood.texture || "其他"),
          photoAssetId,
          manualStatus: legacyFood.manualStatus || null,
          manualRetryAfter: Number(legacyFood.manualRetryAfter) || null,
          everQualified: Boolean(legacyFood.everQualified),
          createdAt: Number(legacyFood.createdAt) || time(),
          updatedAt: latestTimestamp || time()
        });

        sourceResults.forEach((legacyResult) => {
          const legacyResultId = String(legacyResult.id || "");
          const existingResult = resultByLegacyId.get(legacyResultId);
          results.push({
            schemaVersion: SCHEMA_VERSION,
            id: (existingResult && existingResult.id) || createUuidInternal(),
            legacyId: legacyResultId || null,
            foodId,
            catId,
            ownerId: null,
            outcome: String(legacyResult.outcome || "unknown"),
            assistedBy: String(legacyResult.assistedBy || ""),
            note: String(legacyResult.note || ""),
            createdAt: Number(legacyResult.createdAt) || time(),
            updatedAt: time()
          });
        });
      });

      const existingCat = await repo.find("cats", catId);
      let catPhotoAssetId = (existingCat && existingCat.photoAssetId) || null;
      const catPhotoBlob = dataUrlToBlob(legacy.catProfile.photoPath);
      if (catPhotoBlob) {
        const asset = {
          schemaVersion: SCHEMA_VERSION,
          id: createUuidInternal(),
          catId,
          ownerId: null,
          kind: "cat-avatar",
          mimeType: catPhotoBlob.type || "image/jpeg",
          size: catPhotoBlob.size || 0,
          blob: catPhotoBlob,
          createdAt: time(),
          updatedAt: time()
        };
        assets.push(asset);
        catPhotoAssetId = asset.id;
      }
      const ageYears = Number(legacy.catProfile.ageYears);
      const cat = {
        schemaVersion: SCHEMA_VERSION,
        id: catId,
        ownerId: null,
        nickname:
          typeof legacy.catProfile.nickname === "string"
            ? legacy.catProfile.nickname.trim()
            : "",
        ageYears: Number.isFinite(ageYears) && ageYears > 0 ? ageYears : null,
        photoAssetId: catPhotoAssetId,
        createdAt: time(),
        updatedAt: time()
      };
      const participantId =
        participantHint || legacy.participantId || createUuidInternal();

      await repo.runTransaction(({ meta, cats, foods: foodsStore, results: resultsStore, assets: assetsStore }) => {
        meta.put({ key: META_KEYS.schemaVersion, value: SCHEMA_VERSION });
        meta.put({ key: META_KEYS.catId, value: catId });
        meta.put({ key: META_KEYS.participantId, value: participantId });
        cats.put(cat);
        foods.forEach((f) => foodsStore.put(f));
        results.forEach((r) => resultsStore.put(r));
        assets.forEach((a) => assetsStore.put(a));
      });

      // 验证：每条都读得到
      const verifiedFoods = await Promise.all(
        foods.map((f) => repo.find("foods", f.id))
      );
      const verifiedResults = await Promise.all(
        results.map((r) => repo.find("results", r.id))
      );
      const verifiedAssets = await Promise.all(
        assets.map((a) => repo.find("assets", a.id))
      );
      if (
        verifiedFoods.some((v) => !v) ||
        verifiedResults.some((v) => !v) ||
        verifiedAssets.some((v) => !v)
      ) {
        throw new Error("Legacy data verification failed");
      }

      const completedAt = time();
      await repo.runTransaction(({ meta }) => {
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
      return repo.find("meta", META_KEYS.migration);
    };
  }

  // ---- IndexedDB 服务工厂 ----

  function buildIndexedDBService() {
    const adapter = createIndexedDBAdapter();
    const localRepo = createLocalRepository(adapter, {
      collections: ["meta", "cats", "foods", "results", "assets", "outbox"]
    });
    // cloudBootstrap 在下方被赋值；闭包延迟读取，用于 AssetRepository 在
    // 冷启动 preload 时若遇到 cloudFileID 但无 blob 的 asset，能从云端拉回
    let cloudBootstrap = null;
    const assetRepo = createAssetRepositoryDirect({
      repo: localRepo,
      urlApi: options.URL,
      createUuid: createUuidInternal,
      now: options.now,
      SCHEMA_VERSION,
      downloadAsset: async (fileID) => {
        if (cloudBootstrap && cloudBootstrap.adapter) {
          return cloudBootstrap.adapter.downloadFile(fileID);
        }
        throw new Error("Cloud not configured for asset download");
      }
    });
    const rules = loadRules();

    // 先建 DataService（用纯 localRepo）；后面若有 cloud，再 setRepo 切到 syncRepo
    const service = createDataService({
      repo: localRepo,
      assetRepo,
      rules,
      constants: CONSTANTS,
      crypto: options.crypto,
      now: options.now,
      migrate: createMigrator(localRepo)
    });

    // 可选：CloudBase 镜像模式（feature flag 触发）
    // 注意：cloudBootstrap 已在上面声明（让 AssetRepository 的 downloadAsset 闭包能延迟读到）
    const cloudEnv = resolveCloudBaseEnv();
    if (cloudEnv) {
      const mods = loadCloudBaseModules();
      const sdk = resolveCloudBaseSDK();
      if (sdk && typeof sdk.init === "function" && mods.adapterMod) {
        try {
          const app = sdk.init({ env: cloudEnv });
          const cloudAdapter = mods.adapterMod.createCloudBaseAdapter({ app, env: cloudEnv });
          const cloudRepo = mods.cloudRepoMod.createCloudRepository(cloudAdapter);
          const outbox = mods.outboxMod.createOutbox({
            localRepo,
            cloudRepo,
            now: options.now
          });
          const syncRepo = mods.syncRepoMod.createSyncRepository({
            local: localRepo,
            cloud: cloudRepo,
            outbox
          });
          const cloudSync = mods.cloudSyncMod.createCloudSync({
            adapter: cloudAdapter,
            cloudRepo,
            localRepo,
            outbox,
            syncRepo, // 让 cloudSync 能 flushPending
            now: options.now,
            // pullFromCloud 后刷新 DataService 视图缓存
            onLocalChanged: () => {
              if (service && typeof service.refresh === "function") {
                service.refresh();
              }
            }
          });
          cloudBootstrap = { app, env: cloudEnv, adapter: cloudAdapter, cloudRepo, outbox, syncRepo, cloudSync };
          // 业务方法切到 syncRepo（local first + async cloud push + outbox）
          if (typeof service.setRepo === "function") {
            service.setRepo(syncRepo);
          }
        } catch (error) {
          cloudBootstrap = null;
        }
      }
    }
    return { service, cloudBootstrap };
  }

  // ---- Legacy Fallback（IDB 不可用时）----

  function buildLegacyService() {
    const cache = {
      foods: [],
      catProfile: { nickname: "", ageYears: null, photoPath: "" },
      catId: "",
      participantId: ""
    };
    let lastError = null;

    function clone(value) {
      return JSON.parse(JSON.stringify(value));
    }

    function refreshLegacyCache() {
      let legacy;
      try {
        legacy = readLegacyPayload(false);
      } catch (error) {
        legacy = { foods: [], catProfile: {}, participantId: "" };
      }
      cache.foods = Array.isArray(legacy.foods) ? legacy.foods : [];
      cache.catProfile = {
        nickname: (legacy.catProfile && legacy.catProfile.nickname) || "",
        ageYears: (legacy.catProfile && legacy.catProfile.ageYears) || null,
        photoPath: (legacy.catProfile && legacy.catProfile.photoPath) || ""
      };
      cache.catId = cache.catId || createUuidInternal();
      cache.participantId = legacy.participantId || createUuidInternal();
    }

    function legacyWriteFoods(foods) {
      if (!safeStorageSet(LEGACY_KEYS.foods, JSON.stringify(foods))) {
        throw new Error("Unable to save legacy food data");
      }
      safeStorageSet(LEGACY_KEYS.initialized, "1");
      refreshLegacyCache();
    }

    const service = {
      constants: CONSTANTS,

      async initialize(context = {}) {
        try {
          refreshLegacyCache();
          cache.participantId = context.participantId || cache.participantId;
          lastError = null;
        } catch (error) {
          lastError = error;
        }
        return service.status();
      },

      createUuid() {
        return createUuidInternal();
      },

      getFoods() {
        return clone(cache.foods);
      },

      getFood(foodId) {
        const food = cache.foods.find((f) => f.id === foodId);
        return food ? clone(food) : null;
      },

      getCatProfile() {
        return clone(cache.catProfile);
      },

      async saveFood(input, options = {}) {
        const foods = cache.foods;
        const index = foods.findIndex((f) => f.id === input.id);
        const existing = index >= 0 ? foods[index] : null;
        const food = {
          ...(existing || {}),
          ...input,
          schemaVersion: SCHEMA_VERSION,
          id: input.id || createUuidInternal(),
          catId: input.catId || cache.catId,
          ownerId: input.ownerId || null,
          photoPath: options.photoDataUrl || (existing && existing.photoPath) || "",
          createdAt: Number(input.createdAt) || time(),
          updatedAt: time(),
          results: (existing && existing.results) || input.results || []
        };
        if (index >= 0) foods[index] = food;
        else foods.unshift(food);
        legacyWriteFoods(foods);
        return service.getFood(food.id);
      },

      async addResult(foodId, input) {
        const foods = cache.foods;
        const index = foods.findIndex((f) => f.id === foodId);
        if (index < 0) throw new Error("Food not found");
        foods[index].manualStatus = null;
        foods[index].results = foods[index].results || [];
        foods[index].results.push({
          ...input,
          schemaVersion: SCHEMA_VERSION,
          id: input.id || createUuidInternal(),
          foodId,
          catId: foods[index].catId || cache.catId,
          ownerId: input.ownerId || null,
          createdAt: Number(input.createdAt) || time(),
          updatedAt: time()
        });
        foods[index].updatedAt = time();
        legacyWriteFoods(foods);
        return service.getFood(foodId);
      },

      async updateFood(foodId, patch) {
        const foods = cache.foods;
        const index = foods.findIndex((f) => f.id === foodId);
        if (index < 0) throw new Error("Food not found");
        foods[index] = { ...foods[index], ...patch, updatedAt: time() };
        legacyWriteFoods(foods);
        return service.getFood(foodId);
      },

      async deleteFood(foodId) {
        legacyWriteFoods(cache.foods.filter((f) => f.id !== foodId));
      },

      async replaceFoods(nextFoods) {
        const ts = time();
        legacyWriteFoods(
          nextFoods.map((food) => ({
            ...food,
            schemaVersion: SCHEMA_VERSION,
            id: isUuid(food.id) ? food.id : createUuidInternal(),
            catId: cache.catId,
            ownerId: food.ownerId || null,
            createdAt: Number(food.createdAt) || ts,
            updatedAt: ts,
            results: (food.results || []).map((result) => ({
              ...result,
              schemaVersion: SCHEMA_VERSION,
              id: isUuid(result.id) ? result.id : createUuidInternal(),
              catId: cache.catId,
              ownerId: result.ownerId || null,
              createdAt: Number(result.createdAt) || ts,
              updatedAt: ts
            }))
          }))
        );
        return service.getFoods();
      },

      async saveCatProfile(input, options = {}) {
        const profile = {
          ...cache.catProfile,
          ...input,
          schemaVersion: SCHEMA_VERSION,
          id: cache.catId,
          ownerId: input.ownerId || null,
          photoPath: options.photoDataUrl || cache.catProfile.photoPath || "",
          createdAt: Number(input.createdAt) || time(),
          updatedAt: time()
        };
        if (!safeStorageSet(LEGACY_KEYS.catProfile, JSON.stringify(profile))) {
          throw new Error("Unable to save legacy cat profile");
        }
        refreshLegacyCache();
        return service.getCatProfile();
      },

      status() {
        return {
          mode: "legacy-fallback",
          schemaVersion: SCHEMA_VERSION,
          catId: cache.catId,
          participantId: cache.participantId,
          error: lastError ? String(lastError.message || lastError) : null,
          capabilities: {
            cloud: false,
            imageStorage: "file-path",
            transactions: false
          }
        };
      }
    };
    return service;
  }

  // ---- 顶层工厂：尝试 IDB，失败时回退 ----

  let indexeddbService = null;
  let legacyService = null;
  let cloudBootstrap = null;
  let lastError = null;

  function mergeStatus(innerStatus) {
    return {
      ...innerStatus,
      error: lastError ? String(lastError.message || lastError) : null
    };
  }

  async function tryInitialize(context) {
    if (!options.indexedDB || typeof options.indexedDB.open !== "function") {
      throw new Error("IndexedDB is unavailable");
    }
    const { service, cloudBootstrap: bootstrap } = buildIndexedDBService();
    await service.initialize(context);
    cloudBootstrap = bootstrap || null;
    // v1.1.4：CloudBase 走 PostgreSQL（PostgREST 协议），5 张表已建好，
    // 云同步默认开启 — user 上次明确要求"上云不丢"，不要再用本地兜底。
    // 即使 SDK 写失败，outbox 会把操作排队重试，本地 IndexedDB 数据流
    // 仍然独立可用。
    if (cloudBootstrap && cloudBootstrap.cloudSync && typeof cloudBootstrap.cloudSync.start === "function") {
      try {
        await cloudBootstrap.cloudSync.start();
      } catch (error) {
        // 起失败不阻塞本地 service；UI 看 cloudSync.getState() 知道详情
        // eslint-disable-next-line no-console
        if (typeof console !== "undefined" && console.warn) {
          console.warn("[data-store] CloudSync.start() failed during init:", error && error.message);
        }
      }
    }
    return service;
  }

  async function initialize(context = {}) {
    try {
      indexeddbService = await tryInitialize(context);
      lastError = null;
      return mergeStatus(indexeddbService.status());
    } catch (error) {
      lastError = error;
      legacyService = buildLegacyService();
      await legacyService.initialize(context);
      return mergeStatus(legacyService.status());
    }
  }

  function getActive() {
    return indexeddbService || legacyService;
  }

  function withActive(method, args) {
    const active = getActive();
    if (!active) {
      throw new Error("Data store is not initialized");
    }
    return active[method].apply(active, args);
  }

  // 顶层对象：暴露与 DataService 同形的 API，转发到 active service。
  // 兼容老调用方（preview.js、测试）直接对工厂对象调方法。
  const api = {
    async initialize(context) {
      return initialize(context);
    },
    constants: CONSTANTS,
    get indexeddb() {
      return indexeddbService;
    },
    get legacy() {
      return legacyService;
    },
    get active() {
      return getActive();
    },
    status() {
      const active = getActive();
      if (!active) {
        return mergeStatus({
          mode: "uninitialized",
          schemaVersion: SCHEMA_VERSION,
          catId: "",
          participantId: "",
          error: null,
          capabilities: {
            cloud: false,
            imageStorage: "blob",
            transactions: true
          }
        });
      }
      return mergeStatus(active.status());
    },
    createUuid() {
      return withActive("createUuid", arguments);
    },
    getFoods() {
      return withActive("getFoods", arguments);
    },
    getFood() {
      return withActive("getFood", arguments);
    },
    getCatProfile() {
      return withActive("getCatProfile", arguments);
    },
    saveFood() {
      return withActive("saveFood", arguments);
    },
    addResult() {
      return withActive("addResult", arguments);
    },
    updateFood() {
      return withActive("updateFood", arguments);
    },
    deleteFood() {
      return withActive("deleteFood", arguments);
    },
    replaceFoods() {
      return withActive("replaceFoods", arguments);
    },
    saveCatProfile() {
      return withActive("saveCatProfile", arguments);
    },

    // ---- CloudBase 集成入口 ----
    // 始终可用；CloudBase 未配置时 cloudSync 为 null
    get cloudSync() {
      return cloudBootstrap ? cloudBootstrap.cloudSync : null;
    },
    isCloudBaseConfigured() {
      if (options.cloudBaseEnv) return true;
      const config = getCloudBaseConfig();
      return Boolean(config && config.isConfigured());
    },
    // SDK 是否就绪（与 env 无关）。给 UI 用：
    // 当 SDK 就绪但 env 未配时，可显示 env 输入卡片引导用户开启云同步。
    isCloudBaseSdkAvailable() {
      if (options.cloudBaseSdk) return true;
      if (typeof globalThis !== "undefined" && globalThis.cloudbase) return true;
      return false;
    },
    getCloudBaseEnv() {
      if (options.cloudBaseEnv) return options.cloudBaseEnv;
      const config = getCloudBaseConfig();
      return config ? config.getEnv() : null;
    },
    setCloudBaseEnv(env) {
      const config = getCloudBaseConfig();
      if (config) config.setEnv(env);
    },
    // v1.1.4：CloudSync 已在 initialize() 阶段默认启动；这里保留 enableCloudSync()
    // API 是为了向后兼容 — 调用方可能仍用「点击按钮才开启」模式。已启动时直接
    // 返回 ok，幂等。
    async enableCloudSync() {
      if (!cloudBootstrap || !cloudBootstrap.cloudSync) {
        return { ok: false, error: "CloudBootstrap 不可用（SDK 未加载或 env 未配）" };
      }
      try {
        const state = cloudBootstrap.cloudSync.getState
          ? cloudBootstrap.cloudSync.getState()
          : null;
        if (state && state.phase && state.phase !== "idle" && state.phase !== "error") {
          // 已启动，幂等成功
          return { ok: true, phase: state.phase };
        }
        await cloudBootstrap.cloudSync.start();
        const newState = cloudBootstrap.cloudSync.getState
          ? cloudBootstrap.cloudSync.getState()
          : null;
        return { ok: true, phase: newState && newState.phase };
      } catch (err) {
        return { ok: false, error: err && err.message ? err.message : String(err) };
      }
    }
  };

  return api;
});
