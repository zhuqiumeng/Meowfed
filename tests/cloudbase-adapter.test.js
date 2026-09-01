// tests/cloudbase-adapter.test.js
//
// CloudBaseAdapter 的核心行为测试：getAll / get / put / delete /
// runTransaction + 云存储 uploadFile / downloadFile / deleteFiles。
// 使用 tests/cloudbase-mock.js 模拟 SDK。

const test = require("node:test");
const assert = require("node:assert/strict");
const { createMockCloudBase } = require("./cloudbase-mock");
const { createIndexedDBAdapter } = require("../utils/adapters/indexeddb-adapter");
const { createLocalRepository } = require("../utils/repos/local-repository");
const { IDBFactory } = require("fake-indexeddb");
const { createCloudBaseAdapter } = require("../utils/adapters/cloudbase-adapter");

function makeSetup(options = {}) {
  const sdk = createMockCloudBase();
  const app = sdk.init({ env: options.env || "mock-env" });
  const adapter = createCloudBaseAdapter({ app, env: options.env || "mock-env" });
  return { app, adapter };
}

test("initialize 走匿名登录，得到 openId", async () => {
  const { adapter } = makeSetup();
  await adapter.initialize();
  const auth = await adapter.getAuthInfo();
  assert.match(auth.openid, /^openid-mock-env-/);
  assert.equal(auth.env, "mock-env");
  assert.equal(await adapter.isReady(), true);
});

test("getAll 返回空（首次启动）", async () => {
  const { adapter } = makeSetup();
  await adapter.initialize();
  const foods = await adapter.getAll("foods");
  assert.deepEqual(foods, []);
});

test("put + get 单条记录往返", async () => {
  const { adapter } = makeSetup();
  await adapter.initialize();
  const record = {
    id: "food-1",
    catId: "cat-1",
    brand: "Catz",
    name: "鸡肉火鸡",
    foodType: "staple_can",
    flavor: "鸡肉",
    texture: "肉泥",
    createdAt: 1_800_000_000_000,
    updatedAt: 1_800_000_000_000
  };
  await adapter.put("foods", record);
  const got = await adapter.get("foods", "food-1");
  assert.equal(got.id, "food-1");
  assert.equal(got.brand, "Catz");
  // 系统字段 _id / _openid 已被剥离
  assert.equal("_id" in got, false);
  assert.equal("_openid" in got, false);
});

test("不同 openid 的数据互相隔离", async () => {
  const sdk1 = createMockCloudBase();
  const app1 = sdk1.init({ env: "env-a" });
  const adapter1 = createCloudBaseAdapter({ app: app1, env: "env-a" });
  await adapter1.initialize();

  const sdk2 = createMockCloudBase();
  const app2 = sdk2.init({ env: "env-a" });
  const adapter2 = createCloudBaseAdapter({ app: app2, env: "env-a" });
  await adapter2.initialize();

  await adapter1.put("foods", { id: "f-1", catId: "c-1", brand: "X", name: "Y" });
  await adapter2.put("foods", { id: "f-1", catId: "c-1", brand: "Z", name: "W" });

  const all1 = await adapter1.getAll("foods");
  const all2 = await adapter2.getAll("foods");
  assert.equal(all1.length, 1);
  assert.equal(all1[0].brand, "X");
  assert.equal(all2.length, 1);
  assert.equal(all2[0].brand, "Z");
});

test("delete 成功；不存在记录不抛错", async () => {
  const { adapter } = makeSetup();
  await adapter.initialize();
  await adapter.put("foods", { id: "f-1", catId: "c-1", brand: "X" });
  await adapter.delete("foods", "f-1");
  const got = await adapter.get("foods", "f-1");
  assert.equal(got, null);
  // 不存在记录 delete 不抛
  await adapter.delete("foods", "f-not-exist");
});

test("runTransaction 走 snapshot + diff + 写回", async () => {
  const { adapter } = makeSetup();
  await adapter.initialize();
  // 预设两条
  await adapter.put("foods", { id: "f-1", catId: "c-1", brand: "X" });
  await adapter.put("foods", { id: "f-2", catId: "c-1", brand: "Y" });

  await adapter.runTransaction(["foods"], "readwrite", (stores) => {
    const all = stores.foods.getAll();
    // 删 f-1，新增 f-3，保留 f-2
    stores.foods.delete("f-1");
    stores.foods.put({ id: "f-3", catId: "c-1", brand: "Z" });
  });

  const after = await adapter.getAll("foods");
  const ids = after.map((r) => r.id).sort();
  assert.deepEqual(ids, ["f-2", "f-3"]);
});

test("云存储 uploadFile + downloadFile 往返", async () => {
  const { adapter } = makeSetup();
  await adapter.initialize();
  const blob = new Blob(["hello-world"], { type: "text/plain" });
  const result = await adapter.uploadFile(blob, { id: "asset-1", ext: "txt" });
  assert.equal(typeof result.fileID, "string");
  assert.match(result.cloudPath, /^cat-eat-assets-001\//);
  const downloaded = await adapter.downloadFile(result.fileID);
  // Node 的 Blob.text() 是 async；await 拿字符串
  const text = await downloaded.text();
  assert.equal(text, "hello-world");
});

test("deleteFiles 批量删 + 不存在不抛", async () => {
  const { adapter } = makeSetup();
  await adapter.initialize();
  const blob = new Blob(["x"], { type: "text/plain" });
  const r1 = await adapter.uploadFile(blob, { id: "a-1", ext: "txt" });
  await adapter.deleteFiles([r1.fileID, "cloud://does-not-exist"]);
  let threw = false;
  try {
    await adapter.downloadFile(r1.fileID);
  } catch (e) {
    threw = true;
  }
  assert.equal(threw, true);
});

test("与 IndexedDBAdapter 数据契约一致：相同字段读写", async () => {
  const sdk = createMockCloudBase();
  const app = sdk.init({ env: "env-x" });
  const cloudAdapter = createCloudBaseAdapter({ app, env: "env-x" });
  await cloudAdapter.initialize();

  const idbAdapter = createIndexedDBAdapter({
    indexedDB: new IDBFactory(),
    DB_NAME: "test-x",
    DB_VERSION: 2,
    setupSchema(db) {
      db.createObjectStore("foods", { keyPath: "id" });
    }
  });
  await idbAdapter.initialize();
  const idbRepo = createLocalRepository(idbAdapter);
  const cloudRepo = createCloudRepository(cloudAdapter);

  // 写一条到 IDB
  await idbRepo.write("foods", {
    id: "f-1",
    catId: "c-1",
    schemaVersion: 1,
    brand: "X",
    name: "Y",
    foodType: "staple_can",
    flavor: "",
    texture: "肉泥",
    createdAt: 1_800_000_000_000,
    updatedAt: 1_800_000_000_000
  });

  // 从 IDB 读，写到 Cloud
  const idbFoods = await idbRepo.readAll("foods");
  await cloudRepo.pushSnapshot({ foods: idbFoods });
  const cloudFoods = await cloudRepo.readAll("foods");
  assert.equal(cloudFoods.length, 1);
  assert.equal(cloudFoods[0].brand, "X");
  assert.equal(cloudFoods[0].foodType, "staple_can");
});

const { createCloudRepository } = require("../utils/repos/cloud-repository");
