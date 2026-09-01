// tests/outbox.test.js
//
// Outbox 行为测试：写入 / flush / 重试上限 / 失败保留。

const test = require("node:test");
const assert = require("node:assert/strict");
const { IDBFactory } = require("fake-indexeddb");
const { createIndexedDBAdapter } = require("../utils/adapters/indexeddb-adapter");
const { createLocalRepository } = require("../utils/repos/local-repository");
const { createCloudBaseAdapter } = require("../utils/adapters/cloudbase-adapter");
const { createCloudRepository } = require("../utils/repos/cloud-repository");
const { createOutbox } = require("../utils/repos/outbox");
const { createMockCloudBase } = require("./cloudbase-mock");

async function makeFixture() {
  const adapter = createIndexedDBAdapter({
    indexedDB: new IDBFactory(),
    DB_NAME: "outbox-test",
    DB_VERSION: 2,
    setupSchema(db) {
      db.createObjectStore("foods", { keyPath: "id" });
      db.createObjectStore("outbox", { keyPath: "id" });
    }
  });
  await adapter.initialize();
  const local = createLocalRepository(adapter, { collections: ["foods", "outbox"] });

  const sdk = createMockCloudBase();
  const app = sdk.init({ env: "outbox-test" });
  const cloudAdapter = createCloudBaseAdapter({ app, env: "outbox-test" });
  await cloudAdapter.initialize();
  const cloud = createCloudRepository(cloudAdapter);

  const outbox = createOutbox({ localRepo: local, cloudRepo: cloud, now: () => 1_800_000_000_000 });
  return { local, cloud, outbox, cloudAdapter };
}

test("enqueue 把 op 写入 outbox collection", async () => {
  const { outbox, local } = await makeFixture();
  await outbox.enqueue("write", "foods", { id: "f-1", catId: "c-1", brand: "X" });
  const pending = await outbox.listPending();
  assert.equal(pending.length, 1);
  assert.equal(pending[0].op, "write");
  assert.equal(pending[0].collection, "foods");
  assert.equal(pending[0].retry, 0);
});

test("flush 成功：op 被 apply 到云 + outbox 记录被删", async () => {
  const { outbox, cloud } = await makeFixture();
  await outbox.enqueue("write", "foods", { id: "f-1", catId: "c-1", brand: "X" });
  const result = await outbox.flush();
  assert.equal(result.flushed.length, 1);
  assert.equal(result.failed.length, 0);
  const pending = await outbox.listPending();
  assert.equal(pending.length, 0);
  const cloudFoods = await cloud.readAll("foods");
  assert.equal(cloudFoods.length, 1);
});

test("flush 失败：retry + 1，保留在 outbox；恢复后 flush 成功", async () => {
  const { outbox, cloud, cloudAdapter } = await makeFixture();
  await outbox.enqueue("write", "foods", { id: "f-1", catId: "c-1", brand: "X" });

  // 模拟云端 put 失败
  const origPut = cloudAdapter.put.bind(cloudAdapter);
  cloudAdapter.put = async () => {
    throw new Error("network error");
  };

  const r1 = await outbox.flush();
  assert.equal(r1.failed.length, 1);
  assert.equal(r1.flushed.length, 0);
  const pending1 = await outbox.listPending();
  assert.equal(pending1[0].retry, 1);
  assert.match(pending1[0].lastError, /network error/);

  // 恢复
  cloudAdapter.put = origPut;
  const r2 = await outbox.flush();
  assert.equal(r2.flushed.length, 1);
  assert.equal(r2.failed.length, 0);
  const cloudFoods = await cloud.readAll("foods");
  assert.equal(cloudFoods.length, 1);
});

test("超过 MAX_RETRY (8) 的项被跳过", async () => {
  const { outbox, cloudAdapter } = await makeFixture();
  await outbox.enqueue("write", "foods", { id: "f-1", catId: "c-1", brand: "X" });
  // 把 retry 手动拉满
  const origPut = cloudAdapter.put.bind(cloudAdapter);
  cloudAdapter.put = async () => {
    throw new Error("permafail");
  };
  for (let i = 0; i < 8; i += 1) {
    await outbox.flush();
  }
  const result = await outbox.flush();
  assert.equal(result.flushed.length, 0);
  assert.equal(result.failed.length, 0); // 失败列表不包含（已被跳过的）
  assert.equal(result.skipped.length, 1);
  // pending 仍在
  const pending = await outbox.listPending();
  assert.equal(pending.length, 1);
  cloudAdapter.put = origPut;
});

test("remove op 也能 flush", async () => {
  const { outbox, cloud } = await makeFixture();
  // 预写一条
  await cloud.write("foods", { id: "f-1", catId: "c-1", brand: "X" });
  await outbox.enqueue("remove", "foods", "f-1");
  await outbox.flush();
  const after = await cloud.readAll("foods");
  assert.equal(after.length, 0);
});

test("clear 清空 outbox", async () => {
  const { outbox } = await makeFixture();
  await outbox.enqueue("write", "foods", { id: "f-1" });
  await outbox.enqueue("write", "foods", { id: "f-2" });
  await outbox.clear();
  const pending = await outbox.listPending();
  assert.equal(pending.length, 0);
});
