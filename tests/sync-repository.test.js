// tests/sync-repository.test.js
//
// SyncRepository 行为测试：写本地优先 + 异步 push 到云 + 失败入 outbox。

const test = require("node:test");
const assert = require("node:assert/strict");
const { IDBFactory } = require("fake-indexeddb");
const { createIndexedDBAdapter } = require("../utils/adapters/indexeddb-adapter");
const { createLocalRepository } = require("../utils/repos/local-repository");
const { createCloudBaseAdapter } = require("../utils/adapters/cloudbase-adapter");
const { createCloudRepository } = require("../utils/repos/cloud-repository");
const { createOutbox } = require("../utils/repos/outbox");
const { createSyncRepository } = require("../utils/repos/sync-repository");
const { createMockCloudBase } = require("./cloudbase-mock");

function makeLocalRepo(name = "sync-test") {
  const adapter = createIndexedDBAdapter({
    indexedDB: new IDBFactory(),
    DB_NAME: name,
    DB_VERSION: 2,
    setupSchema(db) {
      // LocalRepository 会把 KNOWN_COLLECTIONS（meta/cats/foods/results/assets）
      // 和 options.collections 合并，所以 IDB 必须包含全部 6 个 store
      db.createObjectStore("meta", { keyPath: "key" });
      db.createObjectStore("cats", { keyPath: "id" });
      db.createObjectStore("foods", { keyPath: "id" });
      db.createObjectStore("results", { keyPath: "id" });
      db.createObjectStore("assets", { keyPath: "id" });
      db.createObjectStore("outbox", { keyPath: "id" });
    }
  });
  return adapter
    .initialize()
    .then(() => createLocalRepository(adapter, { collections: ["foods", "assets", "outbox"] }));
}

function makeCloudAdapter() {
  const sdk = createMockCloudBase();
  const app = sdk.init({ env: "sync-test" });
  const adapter = createCloudBaseAdapter({ app, env: "sync-test" });
  return adapter.initialize().then(() => ({ app, adapter }));
}

async function makeSync({ cloudShouldFail = false } = {}) {
  const local = await makeLocalRepo();
  const { app, adapter: cloudAdapter } = await makeCloudAdapter();
  const cloud = createCloudRepository(cloudAdapter);
  const outbox = createOutbox({ localRepo: local, cloudRepo: cloud, now: () => 1_800_000_000_000 });
  const sync = createSyncRepository({
    local,
    cloud,
    outbox,
    onError: (e) => {
      // 收集错误（仅在 cloudShouldFail 时有用）
      if (cloudShouldFail) throw e.error;
    }
  });
  return { local, cloud, outbox, sync, app, cloudAdapter };
}

test("读：永远走本地", async () => {
  const { local, sync } = await makeSync();
  await local.write("foods", { id: "f-1", catId: "c-1", brand: "X" });
  // 直接云端写一条「云端独有」记录；sync 读应该看不到
  await sync.cloud.write("foods", { id: "f-2", catId: "c-1", brand: "Y" });
  const all = await sync.readAll("foods");
  assert.equal(all.length, 1);
  assert.equal(all[0].id, "f-1");
});

test("写：本地先写 + 异步 push；本地立刻可读", async () => {
  const { sync, cloud } = await makeSync();
  const record = { id: "f-1", catId: "c-1", brand: "X", name: "Y" };
  await sync.write("foods", record);
  // 同步：本地立刻有
  const fromLocal = await sync.readAll("foods");
  assert.equal(fromLocal.length, 1);
  // 异步：等云端 push
  await waitFor(async () => (await cloud.readAll("foods")).length === 1, 1000);
  const fromCloud = await cloud.readAll("foods");
  assert.equal(fromCloud.length, 1);
  assert.equal(fromCloud[0].brand, "X");
});

test("写：blob 在 push 时被剥离（避免大字段写云记录）", async () => {
  const { sync, cloud } = await makeSync();
  const blob = new Blob(["photo-bytes"], { type: "image/jpeg" });
  const record = {
    id: "asset-1",
    catId: "c-1",
    kind: "food-photo",
    mimeType: "image/jpeg",
    blob
  };
  await sync.write("assets", record);
  // 本地：blob 保留
  const localAsset = await sync.local.find("assets", "asset-1");
  assert.ok(localAsset.blob instanceof Blob);
  // 云：blob 字段被剥离
  await waitFor(async () => (await cloud.readAll("assets")).length === 1, 1000);
  const cloudAsset = await cloud.readAll("assets");
  assert.equal(cloudAsset[0].blob, undefined);
});

test("写：云 push 失败时入 outbox，本地仍然成功", async () => {
  const { sync, outbox, cloudAdapter, cloud } = await makeSync();
  // 把云端 collection 弄坏：mock 一个 doc.set 失败的适配器
  // 简单方式：override put 方法让它抛错
  const origPut = cloudAdapter.put.bind(cloudAdapter);
  cloudAdapter.put = async () => {
    throw new Error("simulated network error");
  };

  const record = { id: "f-1", catId: "c-1", brand: "X" };
  await sync.write("foods", record);

  // 等待异步 push 失败 + 入 outbox
  await waitFor(async () => (await outbox.listPending()).length === 1, 1000);
  const pending = await outbox.listPending();
  assert.equal(pending.length, 1);
  assert.equal(pending[0].op, "write");
  assert.equal(pending[0].collection, "foods");
  assert.equal(pending[0].record.brand, "X");

  // 本地仍然有这条
  const localFoods = await sync.readAll("foods");
  assert.equal(localFoods.length, 1);

  // 恢复云端 put，让 outbox.flush 能成功
  cloudAdapter.put = origPut;
  const result = await outbox.flush();
  assert.equal(result.flushed.length, 1);
  assert.equal(result.failed.length, 0);
  // flush 后云端有
  const cloudFoods = await cloud.readAll("foods");
  assert.equal(cloudFoods.length, 1);
});

test("remove：本地删 + 异步 push 到云", async () => {
  const { sync, cloud } = await makeSync();
  await sync.write("foods", { id: "f-1", catId: "c-1", brand: "X" });
  await waitFor(async () => (await cloud.readAll("foods")).length === 1, 1000);
  await sync.remove("foods", "f-1");
  await waitFor(async () => (await cloud.readAll("foods")).length === 0, 1000);
  const cloudFoods = await cloud.readAll("foods");
  assert.equal(cloudFoods.length, 0);
});

test("writeMany 批量写：每条都触发 push", async () => {
  const { sync, cloud } = await makeSync();
  await sync.writeMany("foods", [
    { id: "f-1", catId: "c-1", brand: "X" },
    { id: "f-2", catId: "c-1", brand: "Y" },
    { id: "f-3", catId: "c-1", brand: "Z" }
  ]);
  await waitFor(async () => (await cloud.readAll("foods")).length === 3, 2000);
  const cloudFoods = await cloud.readAll("foods");
  assert.equal(cloudFoods.length, 3);
});

test("runTransaction 中的 clear() 也会被推送到云（防止云端留旧数据）", async () => {
  const { sync, cloud, outbox } = await makeSync();
  // 先写 3 条食物
  await sync.writeMany("foods", [
    { id: "f-1", catId: "c-1", brand: "X" },
    { id: "f-2", catId: "c-1", brand: "Y" },
    { id: "f-3", catId: "c-1", brand: "Z" }
  ]);
  await waitFor(async () => (await cloud.readAll("foods")).length === 3, 2000);

  // 在 runTransaction 里 clear + 写新数据
  await sync.runTransaction(({ foods }) => {
    foods.clear();
    foods.put({ id: "f-NEW", catId: "c-1", brand: "NEW" });
  });

  // 等待云端清掉旧的 + 写新的
  await waitFor(async () => {
    const all = await cloud.readAll("foods");
    return all.length === 1 && all[0].id === "f-NEW";
  }, 2000);

  const cloudFoods = await cloud.readAll("foods");
  assert.equal(cloudFoods.length, 1);
  assert.equal(cloudFoods[0].id, "f-NEW");
  // 验证 outbox 中没有残留的 remove op（都被成功 apply 了）
  const pending = await outbox.listPending();
  assert.equal(pending.length, 0);
});

async function waitFor(predicate, timeout = 1000, interval = 10) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await predicate()) return;
    await new Promise((r) => setTimeout(r, interval));
  }
  throw new Error("waitFor timeout");
}
