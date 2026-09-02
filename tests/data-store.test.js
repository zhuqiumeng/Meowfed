const test = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { IDBFactory } = require("fake-indexeddb");
const createDataStore = require("../utils/data-store");

class MemoryStorage {
  constructor(entries = {}) {
    this.values = new Map(Object.entries(entries));
    this.removed = [];
  }

  getItem(key) {
    return this.values.has(key) ? this.values.get(key) : null;
  }

  setItem(key, value) {
    this.values.set(key, String(value));
  }

  removeItem(key) {
    this.removed.push(key);
    this.values.delete(key);
  }
}

function objectUrlApi() {
  let sequence = 0;
  return {
    createObjectURL(blob) {
      sequence += 1;
      return `blob:test-${sequence}-${blob.size}`;
    },
    revokeObjectURL() {}
  };
}

function createStore(indexedDB, localStorage = new MemoryStorage()) {
  return createDataStore({
    indexedDB,
    localStorage,
    crypto: { randomUUID },
    URL: objectUrlApi(),
    now: () => 1_800_000_000_000
  });
}

function requestValue(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readAll(indexedDB, databaseName, storeName) {
  const database = await requestValue(indexedDB.open(databaseName));
  const transaction = database.transaction(storeName, "readonly");
  const records = await requestValue(transaction.objectStore(storeName).getAll());
  database.close();
  return records;
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

test("首次启动创建带版本、UUID 和 catId 的 IndexedDB 数据", async () => {
  const indexedDB = new IDBFactory();
  const store = createStore(indexedDB);
  const status = await store.initialize();

  assert.equal(status.mode, "indexeddb");
  assert.equal(status.schemaVersion, 1);
  assert.equal(isUuid(status.catId), true);
  assert.equal(isUuid(status.participantId), true);

  const cats = await readAll(indexedDB, store.constants.DB_NAME, "cats");
  assert.equal(cats.length, 1);
  assert.equal(cats[0].schemaVersion, 1);
  assert.equal(cats[0].id, status.catId);
  assert.equal(cats[0].ownerId, null);
  assert.equal(cats[0].createdAt, 1_800_000_000_000);
  assert.equal(cats[0].updatedAt, 1_800_000_000_000);
});

test("旧 localStorage 数据和照片会一次性迁移，验证成功后才清理原键", async () => {
  const indexedDB = new IDBFactory();
  const photo = `data:image/jpeg;base64,${Buffer.from("food-photo").toString("base64")}`;
  const avatar = `data:image/jpeg;base64,${Buffer.from("cat-avatar").toString("base64")}`;
  const legacyFood = {
    id: "food-legacy-1",
    brand: "Catz Finefood",
    name: "鸡肉火鸡主食罐",
    foodType: "staple_can",
    flavor: "鸡肉 · 火鸡",
    texture: "肉泥",
    photoPath: photo,
    createdAt: 1_700_000_000_000,
    results: [
      {
        id: "result-legacy-1",
        outcome: "eager",
        note: "主动吃",
        createdAt: 1_700_000_100_000
      }
    ]
  };
  const storage = new MemoryStorage({
    CAT_EAT_H5_FOODS_V2: JSON.stringify([legacyFood]),
    CAT_EAT_H5_INITIALIZED_V2: "1",
    CAT_EAT_H5_PARTICIPANT_V1: "invite:tester",
    CAT_EAT_H5_CAT_PROFILE_V1: JSON.stringify({ nickname: "噜噜", photoPath: avatar })
  });
  const store = createStore(indexedDB, storage);
  const status = await store.initialize();

  assert.equal(status.mode, "indexeddb");
  assert.equal(status.participantId, "invite:tester");
  assert.equal(storage.getItem("CAT_EAT_H5_FOODS_V2"), null);
  assert.deepEqual(
    new Set(storage.removed),
    new Set(Object.values(store.constants.LEGACY_KEYS))
  );

  const foods = store.getFoods();
  assert.equal(foods.length, 1);
  assert.equal(isUuid(foods[0].id), true);
  assert.equal(isUuid(foods[0].catId), true);
  assert.equal(foods[0].schemaVersion, 1);
  assert.equal(foods[0].ownerId, null);
  assert.equal(foods[0].createdAt, 1_700_000_000_000);
  assert.equal(foods[0].updatedAt, 1_700_000_100_000);
  assert.match(foods[0].photoPath, /^blob:test-/);
  assert.equal(foods[0].results.length, 1);
  assert.equal(isUuid(foods[0].results[0].id), true);
  assert.equal(foods[0].results[0].foodId, foods[0].id);
  assert.equal(foods[0].results[0].catId, foods[0].catId);

  const rawFoods = await readAll(indexedDB, store.constants.DB_NAME, "foods");
  const rawResults = await readAll(indexedDB, store.constants.DB_NAME, "results");
  const assets = await readAll(indexedDB, store.constants.DB_NAME, "assets");
  assert.equal("photoPath" in rawFoods[0], false);
  assert.equal("results" in rawFoods[0], false);
  assert.equal(rawResults.length, 1);
  assert.equal(assets.length, 2);
  assert.equal(assets.every((asset) => asset.blob instanceof Blob), true);
  assert.equal(assets.every((asset) => isUuid(asset.id)), true);
});

test("IndexedDB 初始化失败时保留原 localStorage 数据并进入兼容模式", async () => {
  const storage = new MemoryStorage({
    CAT_EAT_H5_FOODS_V2: JSON.stringify([{ id: "legacy-food", name: "旧记录", results: [] }]),
    CAT_EAT_H5_INITIALIZED_V2: "1"
  });
  const store = createStore(
    {
      open() {
        throw new Error("database unavailable");
      }
    },
    storage
  );
  const status = await store.initialize();

  assert.equal(status.mode, "legacy-fallback");
  assert.match(status.error, /database unavailable/);
  assert.equal(store.getFoods().length, 1);
  assert.notEqual(storage.getItem("CAT_EAT_H5_FOODS_V2"), null);
  assert.equal(storage.removed.length, 0);
});

test("读取旧 localStorage 异常时不会误判为空或执行清理", async () => {
  const indexedDB = new IDBFactory();
  let removeCount = 0;
  const storage = {
    getItem() {
      throw new Error("storage read blocked");
    },
    setItem() {},
    removeItem() {
      removeCount += 1;
    }
  };
  const store = createStore(indexedDB, storage);
  const status = await store.initialize();

  assert.equal(status.mode, "legacy-fallback");
  assert.match(status.error, /storage read blocked/);
  assert.equal(removeCount, 0);
});

test("新照片以 Blob 独立保存，结构化记录重启后仍可读取", async () => {
  const indexedDB = new IDBFactory();
  const storage = new MemoryStorage();
  const store = createStore(indexedDB, storage);
  await store.initialize();
  const photo = `data:image/jpeg;base64,${Buffer.from("new-photo").toString("base64")}`;
  const foodId = store.createUuid();
  const saved = await store.saveFood(
    {
      id: foodId,
      catId: store.status().catId,
      brand: "品牌",
      name: "新品",
      foodType: "staple_can",
      flavor: "鸡肉",
      texture: "肉泥",
      createdAt: 1_800_000_000_000
    },
    { photoDataUrl: photo }
  );
  await store.addResult(saved.id, {
    id: store.createUuid(),
    outcome: "okay",
    createdAt: 1_800_000_000_100
  });

  const rawFoods = await readAll(indexedDB, store.constants.DB_NAME, "foods");
  const assets = await readAll(indexedDB, store.constants.DB_NAME, "assets");
  assert.equal(rawFoods.length, 1);
  assert.equal("photoPath" in rawFoods[0], false);
  assert.equal(isUuid(rawFoods[0].photoAssetId), true);
  assert.equal(assets.length, 1);
  assert.equal(assets[0].blob instanceof Blob, true);

  const reopened = createStore(indexedDB, storage);
  const status = await reopened.initialize();
  assert.equal(status.mode, "indexeddb");
  assert.equal(reopened.getFoods().length, 1);
  assert.equal(reopened.getFoods()[0].results.length, 1);
  assert.match(reopened.getFoods()[0].photoPath, /^blob:test-/);
});

test("v1 schema IDB(无 outbox store)初始化不抛,saveFood 仍 work", async () => {
  // 模拟 iPhone PWA 老 IDB:只 5 个 store 没 outbox(runTransaction 传 6-store 会抛)
  const indexedDB = new IDBFactory();
  const storage = new MemoryStorage();
  // 手动用 v1 schema 创建 IDB(没 outbox)
  await new Promise((resolve, reject) => {
    const req = indexedDB.open("cat-eat-local", 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      db.createObjectStore("meta", { keyPath: "key" });
      db.createObjectStore("cats", { keyPath: "id" });
      db.createObjectStore("foods", { keyPath: "id" }).createIndex("catId", "catId");
      const r = db.createObjectStore("results", { keyPath: "id" });
      r.createIndex("foodId", "foodId");
      r.createIndex("catId", "catId");
      const a = db.createObjectStore("assets", { keyPath: "id" });
      a.createIndex("catId", "catId");
      a.createIndex("kind", "kind");
      // 注意:没有 outbox store
    };
    req.onsuccess = () => {
      req.result.close();
      resolve();
    };
    req.onerror = () => reject(req.error);
  });

  // 现在 data-store 用 v2 schema open,会触发 onupgradeneeded 加 outbox
  // 但为了测\"DB 还停在 v1\"的极端场景(比如 onupgradeneeded 被 blocked 跳过),
  // 我们用 v1 version 再开一次,但不触发 upgrade
  const v1Storage = new MemoryStorage();
  const store = createStore(indexedDB, v1Storage);
  // 不调 initialize,直接操作 IDB
  // 但 store.initialize 会 open v2 → 触发 upgrade 加 outbox
  // 所以我们让 initialize 跑,确认 v1 → v2 upgrade + outbox store 创建 + saveFood 仍 work
  const status = await store.initialize();
  assert.equal(status.mode, "indexeddb");
  // saveFood 在 v2(已含 outbox)IDB 上跑,runTransaction 6-store 全部存在,不抛
  const foodId = store.createUuid();
  const saved = await store.saveFood({
    id: foodId,
    catId: store.status().catId,
    brand: "测试",
    name: "v1→v2 升级测试",
    foodType: "staple_can",
    flavor: "鸡肉",
    texture: "肉泥",
    createdAt: Date.now()
  });
  assert.ok(saved && saved.id === foodId);
});

test("v1 schema IDB 即使缺 outbox store,runTransaction 也不抛(saveFood work)", async () => {
  // v1.1.4-hotfix: IndexedDBAdapter.runTransaction 之前硬传 6 个 store 给
  // database.transaction(),如果 v1 IDB 没 outbox 会抛 "object store was
  // not found" → saveFood 失败 → toast "照片或数据没保存成功"。
  // 修:过滤掉缺失 store 给 no-op stub,plan 跑空写但不抛。
  const indexedDB = new IDBFactory();
  // 手动建 v1 IDB(没 outbox)
  await new Promise((resolve, reject) => {
    const req = indexedDB.open("cat-eat-local", 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      db.createObjectStore("meta", { keyPath: "key" });
      db.createObjectStore("cats", { keyPath: "id" });
      db.createObjectStore("foods", { keyPath: "id" }).createIndex("catId", "catId");
      const r = db.createObjectStore("results", { keyPath: "id" });
      r.createIndex("foodId", "foodId");
      r.createIndex("catId", "catId");
      const a = db.createObjectStore("assets", { keyPath: "id" });
      a.createIndex("catId", "catId");
      a.createIndex("kind", "kind");
    };
    req.onsuccess = () => {
      req.result.close();
      resolve();
    };
    req.onerror = () => reject(req.error);
  });

  // 现在 IndexedDBAdapter 用 v2 open → onupgradeneeded 触发 → 加 outbox
  // 但我们想测\"升级失败/被 skip,DB 还在 v1\"的极端路径
  // 模拟:用 fake-indexeddb 直接打开 v1 DB,不让它升级
  const v1DB = await new Promise((resolve, reject) => {
    const req = indexedDB.open("cat-eat-local", 1); // 跟原来 version 一样,不触发 upgrade
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  // 确认 v1 schema 确实没 outbox
  assert.equal(v1DB.objectStoreNames.contains("outbox"), false);

  // 用 IndexedDBAdapter 在这个 v1 DB 上调 runTransaction(包括 outbox)
  const { createIndexedDBAdapter } = require("../utils/adapters/indexeddb-adapter");
  const setupSchema = (db) => {
    if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta", { keyPath: "key" });
    if (!db.objectStoreNames.contains("cats")) db.createObjectStore("cats", { keyPath: "id" });
    if (!db.objectStoreNames.contains("foods")) db.createObjectStore("foods", { keyPath: "id" });
    if (!db.objectStoreNames.contains("results")) db.createObjectStore("results", { keyPath: "id" });
    if (!db.objectStoreNames.contains("assets")) db.createObjectStore("assets", { keyPath: "id" });
    if (!db.objectStoreNames.contains("outbox")) db.createObjectStore("outbox", { keyPath: "id" });
  };
  const adapter = createIndexedDBAdapter({
    indexedDB,
    DB_NAME: "cat-eat-local",
    DB_VERSION: 1, // 关键:跟 v1 一样,不触发 upgrade
    setupSchema
  });
  // 必须先 initialize,让 adapter 内部 open DB
  await adapter.initialize();
  // 测 runTransaction 跨 2 store,其中一个不存在(foods 有,outbox 没有)
  const plan = ({ foods, outbox }) => {
    foods.put({ id: "f1", catId: "c1", brand: "test", name: "t" });
    outbox.put({ id: "o1", op: "write", collection: "foods", record: { id: "f1" } });
  };
  // 不应抛(即使 outbox store 不存在,filtered 掉了,只开 foods 的 tx)
  await adapter.runTransaction(["foods", "outbox"], "readwrite", plan);
  // foods 应该被写入
  const foods = await adapter.getAll("foods");
  assert.equal(foods.length, 1);
  assert.equal(foods[0].id, "f1");
});
