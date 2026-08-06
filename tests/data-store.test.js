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
