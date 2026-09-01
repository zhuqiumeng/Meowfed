// tests/cloud-sync.test.js
//
// CloudSync 编排器测试：start / pushFirstTime / pullFromCloud /
// syncAssetsToCloud / restoreAssetsFromCloud + 状态机。

const test = require("node:test");
const assert = require("node:assert/strict");
const { IDBFactory } = require("fake-indexeddb");
const { createIndexedDBAdapter } = require("../utils/adapters/indexeddb-adapter");
const { createLocalRepository } = require("../utils/repos/local-repository");
const { createCloudBaseAdapter } = require("../utils/adapters/cloudbase-adapter");
const { createCloudRepository } = require("../utils/repos/cloud-repository");
const { createOutbox } = require("../utils/repos/outbox");
const { createCloudSync } = require("../utils/cloud-sync");
const { createMockCloudBase } = require("./cloudbase-mock");

const COLLECTIONS = ["meta", "cats", "foods", "results", "assets", "outbox"];

async function makeFixture() {
  const adapter = createIndexedDBAdapter({
    indexedDB: new IDBFactory(),
    DB_NAME: "cloud-sync-test",
    DB_VERSION: 2,
    setupSchema(db) {
      for (const name of COLLECTIONS) {
        db.createObjectStore(name, { keyPath: name === "meta" ? "key" : "id" });
      }
    }
  });
  await adapter.initialize();
  const local = createLocalRepository(adapter, { collections: COLLECTIONS });

  const sdk = createMockCloudBase();
  const app = sdk.init({ env: "cloud-sync-test" });
  const cloudAdapter = createCloudBaseAdapter({ app, env: "cloud-sync-test" });
  await cloudAdapter.initialize();
  const cloud = createCloudRepository(cloudAdapter);

  const outbox = createOutbox({ localRepo: local, cloudRepo: cloud });
  const cloudSync = createCloudSync({ adapter: cloudAdapter, cloudRepo: cloud, localRepo: local, outbox });
  return { local, cloud, outbox, cloudSync, cloudAdapter, app };
}

test("start 后 phase 走到 ready，auth 有 openid", async () => {
  const { cloudSync } = await makeFixture();
  const result = await cloudSync.start();
  assert.equal(result.ok, true);
  // start 会异步触发 flushOutbox；等到回到 ready
  await waitFor(() => cloudSync.getState().phase === "ready", 1000);
  const state = cloudSync.getState();
  assert.equal(state.phase, "ready");
  assert.match(state.auth.openid, /^openid-/);
});

test("start 失败时 phase = error，error 字段有信息", async () => {
  const { cloudSync, cloudAdapter } = await makeFixture();
  cloudAdapter.initialize = async () => {
    throw new Error("auth failed");
  };
  const result = await cloudSync.start();
  assert.equal(result.ok, false);
  assert.match(result.error, /auth failed/);
  assert.equal(cloudSync.getState().phase, "error");
});

test("pushFirstTime 把本地全部 collection 推到云", async () => {
  const { local, cloud, cloudSync } = await makeFixture();
  // 准备本地数据
  await local.write("cats", { id: "cat-1", schemaVersion: 1, nickname: "噜噜" });
  await local.write("foods", { id: "f-1", schemaVersion: 1, catId: "cat-1", brand: "X", name: "Y" });
  await local.write("results", { id: "r-1", schemaVersion: 1, foodId: "f-1", catId: "cat-1", outcome: "eager" });
  await local.write("meta", { key: "catId", value: "cat-1" });

  await cloudSync.start();
  const result = await cloudSync.pushFirstTime();
  assert.equal(result.ok, true);
  assert.equal(result.counts.cats, 1);
  assert.equal(result.counts.foods, 1);
  assert.equal(result.counts.results, 1);
  assert.equal(result.counts.meta, 1);

  const cloudCats = await cloud.readAll("cats");
  const cloudFoods = await cloud.readAll("foods");
  assert.equal(cloudCats.length, 1);
  assert.equal(cloudFoods.length, 1);
});

test("pullFromCloud 把云端数据拉回本地（清空 + 写回）", async () => {
  const { local, cloud, cloudSync } = await makeFixture();
  // 本地有旧数据
  await local.write("foods", { id: "f-OLD", schemaVersion: 1, catId: "c-1", brand: "OLD" });
  // 云端有新数据
  await cloud.write("foods", { id: "f-NEW", schemaVersion: 1, catId: "c-1", brand: "NEW" });
  await cloud.write("cats", { id: "c-1", schemaVersion: 1, nickname: "噜噜" });

  await cloudSync.start();
  const result = await cloudSync.pullFromCloud();
  assert.equal(result.ok, true);

  const localFoods = await local.readAll("foods");
  const localCats = await local.readAll("cats");
  assert.equal(localFoods.length, 1);
  assert.equal(localFoods[0].id, "f-NEW");
  assert.equal(localCats.length, 1);
  assert.equal(localCats[0].nickname, "噜噜");
});

test("syncAssetsToCloud 上传本地 blob 到云存储 + 更新 asset 记录", async () => {
  const { local, cloud, cloudSync } = await makeFixture();
  const blob = new Blob(["photo-data"], { type: "image/jpeg" });
  await local.write("assets", {
    id: "asset-1",
    catId: "c-1",
    schemaVersion: 1,
    kind: "food-photo",
    mimeType: "image/jpeg",
    size: blob.size,
    blob,
    createdAt: 1_800_000_000_000,
    updatedAt: 1_800_000_000_000
  });

  await cloudSync.start();
  const result = await cloudSync.syncAssetsToCloud();
  assert.equal(result.uploaded, 1);
  assert.equal(result.skipped, 0);

  // 本地 asset 记录被更新：保留 cloudPath，blob 置 null
  const localAsset = await local.find("assets", "asset-1");
  assert.match(localAsset.cloudPath, /^cat-eat-assets-001\/openid-/);
  assert.equal(localAsset.blob, null);

  // 云端 asset 记录也存在（blob 字段在 push 时被剥离）
  const cloudAsset = await cloud.find("assets", "asset-1");
  assert.match(cloudAsset.cloudPath, /^cat-eat-assets-001\/openid-/);
  assert.ok(cloudAsset.blob === undefined || cloudAsset.blob === null);
});

test("restoreAssetsFromCloud 从云存储下载到本地", async () => {
  const { local, cloud, cloudAdapter, cloudSync } = await makeFixture();
  // 准备云端 asset（有 cloudFileID / 无 blob）
  const blob = new Blob(["photo-data"], { type: "image/jpeg" });
  const uploaded = await cloudAdapter.uploadFile(blob, { id: "asset-1", ext: "jpg" });
  await cloud.write("assets", {
    id: "asset-1",
    catId: "c-1",
    schemaVersion: 1,
    kind: "food-photo",
    mimeType: "image/jpeg",
    size: blob.size,
    cloudFileID: uploaded.fileID,
    cloudPath: uploaded.cloudPath,
    createdAt: 1_800_000_000_000,
    updatedAt: 1_800_000_000_000
  });
  // 准备本地 asset（无 blob）
  await local.write("assets", {
    id: "asset-1",
    catId: "c-1",
    schemaVersion: 1,
    kind: "food-photo",
    mimeType: "image/jpeg",
    size: blob.size,
    cloudFileID: uploaded.fileID,
    cloudPath: uploaded.cloudPath,
    createdAt: 1_800_000_000_000,
    updatedAt: 1_800_000_000_000
  });

  await cloudSync.start();
  const result = await cloudSync.restoreAssetsFromCloud();
  assert.equal(result.downloaded, 1);

  const localAsset = await local.find("assets", "asset-1");
  assert.ok(localAsset.blob instanceof Blob);
});

test("subscribe 收到状态变更通知", async () => {
  const { cloudSync } = await makeFixture();
  const states = [];
  const unsub = cloudSync.subscribe((s) => states.push(s.phase));
  await cloudSync.start();
  unsub();
  // 至少经历 idle → connecting → ready
  assert.ok(states.includes("connecting"));
  assert.ok(states.includes("ready"));
});

test("flushOutbox 触发已积累的失败重试", async () => {
  const { local, cloud, outbox, cloudSync, cloudAdapter } = await makeFixture();
  // 先启动（让 start 的 auto-flush 跑完）
  await cloudSync.start();
  await waitFor(() => cloudSync.getState().phase === "ready", 1000);
  // 强制 put 失败一次
  const origPut = cloudAdapter.put.bind(cloudAdapter);
  let failed = false;
  cloudAdapter.put = async (...args) => {
    if (!failed) {
      failed = true;
      throw new Error("once");
    }
    return origPut(...args);
  };
  // 现在再 enqueue 一条 outbox 记录
  await outbox.enqueue("write", "foods", { id: "f-1", catId: "c-1", brand: "X" });
  // 第一次 flush：失败，retry + 1
  await cloudSync.flushOutbox();
  let pending = await outbox.listPending();
  assert.equal(pending.length, 1);
  assert.equal(pending[0].retry, 1);
  // 第二次 flush：成功
  await cloudSync.flushOutbox();
  pending = await outbox.listPending();
  assert.equal(pending.length, 0);
});

test("pushFirstTime 云端已有数据时拒绝覆盖（isEmpty 保护）", async () => {
  const { local, cloud, cloudSync } = await makeFixture();
  // 先在云端写一条「别的设备」的记录
  await cloud.write("foods", { id: "f-other", catId: "c-1", brand: "OTHER" });

  await cloudSync.start();
  const result = await cloudSync.pushFirstTime();
  assert.equal(result.ok, false);
  assert.match(result.error, /云端已有数据/);
  // 本地数据没动
  const localFoods = await local.readAll("foods");
  assert.equal(localFoods.length, 0);
});

test("pushFirstTime 含 blob asset：云 DB 记录无 blob 字段（顺序倒置生效）", async () => {
  const { local, cloud, cloudSync } = await makeFixture();
  // 准备本地带 blob 的 asset
  const blob = new Blob([new Uint8Array(2 * 1024 * 1024)], { type: "image/jpeg" }); // 2MB
  await local.write("assets", {
    id: "asset-1",
    catId: "c-1",
    schemaVersion: 1,
    kind: "food-photo",
    mimeType: "image/jpeg",
    size: blob.size,
    blob,
    createdAt: 1_800_000_000_000,
    updatedAt: 1_800_000_000_000
  });

  await cloudSync.start();
  const result = await cloudSync.pushFirstTime();
  assert.equal(result.ok, true);
  assert.equal(result.assets.uploaded, 1);
  // 云端 asset 记录：blob 字段必须被剥离（null 或 undefined 都行）
  const cloudAsset = await cloud.find("assets", "asset-1");
  assert.ok(cloudAsset);
  assert.ok(!cloudAsset.blob, `blob should be stripped, got ${cloudAsset.blob}`);
  assert.match(cloudAsset.cloudPath, /^cat-eat-assets-001\//);
  assert.ok(cloudAsset.cloudFileID);
});

test("outbox.flush 失败会被 surface 到 state（不再静默吞掉）", async () => {
  const { cloudSync, cloudAdapter, outbox } = await makeFixture();
  // 强制所有 put 失败
  const origPut = cloudAdapter.put.bind(cloudAdapter);
  cloudAdapter.put = async () => {
    throw new Error("permanent failure");
  };

  await cloudSync.start();
  // start 自身走的是空 outbox，所以 phase = ready；现在再 enqueue 失败
  await outbox.enqueue("write", "foods", { id: "f-1", catId: "c-1", brand: "X" });

  // 触发一次 flush
  await cloudSync.flushOutbox();
  const state = cloudSync.getState();
  assert.equal(state.phase, "error");
  assert.match(state.error, /失败/);
  assert.ok(state.lastFlush);
  assert.equal(state.lastFlush.failed.length, 1);

  // 恢复
  cloudAdapter.put = origPut;
  await cloudSync.flushOutbox();
  assert.equal(cloudSync.getState().phase, "ready");
  assert.equal(cloudSync.getState().error, null);
});

test("stop() 清理自动 retry 定时器", async () => {
  const { cloudSync } = await makeFixture();
  await cloudSync.start();
  // stop 之后能再次调用，不抛错
  cloudSync.stop();
  cloudSync.stop(); // 幂等
  assert.equal(cloudSync.getState().phase, "ready");
});

test("并发的 outbox.flush 由并发锁保护（不会重复处理）", async () => {
  const { cloudSync, outbox } = await makeFixture();
  // 先启动（让 start 的 auto-flush 跑完，outbox 此时是空的）
  await cloudSync.start();
  await waitFor(() => cloudSync.getState().phase === "ready", 1000);

  // enqueue 3 条（start 之后才入队，避免被 start 的 flush 抢走）
  await outbox.enqueue("write", "foods", { id: "f-1", catId: "c-1", brand: "X" });
  await outbox.enqueue("write", "foods", { id: "f-2", catId: "c-1", brand: "Y" });
  await outbox.enqueue("write", "foods", { id: "f-3", catId: "c-1", brand: "Z" });

  // 并发触发两次 flush
  const [r1, r2] = await Promise.all([cloudSync.flushOutbox(), cloudSync.flushOutbox()]);
  // 第一次：3 条全成功；第二次：被并发锁挡住，deduplicated=true，flushed=[]
  const sumFlushed = (r1.flushed || []).length + (r2.flushed || []).length;
  assert.equal(sumFlushed, 3);
  // 至少一个标记 deduplicated
  const hasDedup = r1.deduplicated || r2.deduplicated;
  assert.equal(hasDedup, true);
  // outbox 已空
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
