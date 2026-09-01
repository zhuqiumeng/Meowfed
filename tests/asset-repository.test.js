// tests/asset-repository.test.js
//
// AssetRepository 单元测试。重点覆盖 BUG 4：preload 遇到 cloudFileID
// 但无 blob 的 asset 时，能从云端拉回。

const test = require("node:test");
const assert = require("node:assert/strict");
const { IDBFactory } = require("fake-indexeddb");
const { createIndexedDBAdapter } = require("../utils/adapters/indexeddb-adapter");
const { createLocalRepository } = require("../utils/repos/local-repository");
const { createAssetRepository } = require("../utils/repos/asset-repository");
const { randomUUID } = require("node:crypto");

function makeLocal() {
  const adapter = createIndexedDBAdapter({
    indexedDB: new IDBFactory(),
    DB_NAME: "asset-test",
    DB_VERSION: 2,
    setupSchema(db) {
      db.createObjectStore("assets", { keyPath: "id" });
      db.createObjectStore("foods", { keyPath: "id" });
      db.createObjectStore("cats", { keyPath: "id" });
    }
  });
  return adapter.initialize().then(() =>
    createLocalRepository(adapter, { collections: ["assets", "foods", "cats"] })
  );
}

let urlSeq = 0;
function urlApi() {
  return {
    createObjectURL(blob) {
      urlSeq += 1;
      return `blob:test-${urlSeq}-${blob.size}`;
    },
    revokeObjectURL() {}
  };
}

test("preload 优先用本地 blob 建 ObjectURL（H5 主路径）", async () => {
  const local = await makeLocal();
  await local.write("assets", {
    id: "a-local",
    schemaVersion: 1,
    catId: "c-1",
    kind: "food-photo",
    mimeType: "image/jpeg",
    blob: new Blob(["local"], { type: "image/jpeg" })
  });
  const assetRepo = createAssetRepository({
    repo: local,
    urlApi: urlApi(),
    createUuid: randomUUID,
    now: () => 1_800_000_000_000,
    SCHEMA_VERSION: 1
  });
  await assetRepo.preload(["a-local"]);
  const url = assetRepo.getUrl("a-local");
  assert.match(url, /^blob:test-\d+/);
});

test("preload 遇到 cloudFileID 但无 blob：通过 downloadAsset 拉回", async () => {
  const local = await makeLocal();
  await local.write("assets", {
    id: "a-cloud",
    schemaVersion: 1,
    catId: "c-1",
    kind: "food-photo",
    mimeType: "image/jpeg",
    blob: null, // 关键：本地没 blob
    cloudFileID: "cloud://test/a-cloud",
    cloudPath: "cat-eat-assets/test/a-cloud.jpg"
  });

  let downloadCalled = 0;
  const downloadAsset = async (fileID) => {
    downloadCalled += 1;
    assert.equal(fileID, "cloud://test/a-cloud");
    return new Blob(["cloud-data"], { type: "image/jpeg" });
  };

  const assetRepo = createAssetRepository({
    repo: local,
    urlApi: urlApi(),
    createUuid: randomUUID,
    now: () => 1_800_000_000_000,
    SCHEMA_VERSION: 1,
    downloadAsset
  });
  await assetRepo.preload(["a-cloud"]);

  assert.equal(downloadCalled, 1);
  // 拉回后 ObjectURL 已建
  const url = assetRepo.getUrl("a-cloud");
  assert.match(url, /^blob:test-\d+/);
  // 写回本地（下次冷启动直接命中本地）
  const localAsset = await local.find("assets", "a-cloud");
  assert.ok(localAsset.blob instanceof Blob);
});

test("preload 多条 cloudFileID asset：并发下载（4 并发）", async () => {
  const local = await makeLocal();
  // 写 10 条云端 asset
  const ids = [];
  for (let i = 0; i < 10; i += 1) {
    const id = `a-cloud-${i}`;
    ids.push(id);
    await local.write("assets", {
      id,
      schemaVersion: 1,
      catId: "c-1",
      kind: "food-photo",
      mimeType: "image/jpeg",
      blob: null,
      cloudFileID: `cloud://test/${id}`,
      cloudPath: `cat-eat-assets/test/${id}.jpg`
    });
  }

  let activeCount = 0;
  let maxConcurrent = 0;
  const downloadAsset = async () => {
    activeCount += 1;
    maxConcurrent = Math.max(maxConcurrent, activeCount);
    await new Promise((r) => setTimeout(r, 20));
    activeCount -= 1;
    return new Blob(["x"], { type: "image/jpeg" });
  };

  const assetRepo = createAssetRepository({
    repo: local,
    urlApi: urlApi(),
    createUuid: randomUUID,
    now: () => 1_800_000_000_000,
    SCHEMA_VERSION: 1,
    downloadAsset
  });
  await assetRepo.preload(ids);

  // 4 并发：理论上 maxConcurrent <= 4
  assert.ok(maxConcurrent > 1, "should download concurrently");
  assert.ok(maxConcurrent <= 4, `max concurrency should be <= 4, got ${maxConcurrent}`);
  // 10 个 URL 都建好了
  ids.forEach((id) => {
    assert.match(assetRepo.getUrl(id), /^blob:test-/);
  });
});

test("preload 没传 downloadAsset 时 cloudFileID asset 静默跳过", async () => {
  const local = await makeLocal();
  await local.write("assets", {
    id: "a-cloud",
    schemaVersion: 1,
    catId: "c-1",
    kind: "food-photo",
    mimeType: "image/jpeg",
    blob: null,
    cloudFileID: "cloud://test/a-cloud",
    cloudPath: "cat-eat-assets/test/a-cloud.jpg"
  });

  // 不传 downloadAsset
  const assetRepo = createAssetRepository({
    repo: local,
    urlApi: urlApi(),
    createUuid: randomUUID,
    now: () => 1_800_000_000_000,
    SCHEMA_VERSION: 1
  });
  await assetRepo.preload(["a-cloud"]);
  // 没下载，URL 为空
  assert.equal(assetRepo.getUrl("a-cloud"), "");
});

test("preload 单条下载失败不阻断其他 asset", async () => {
  const local = await makeLocal();
  await local.write("assets", {
    id: "a-fail",
    schemaVersion: 1,
    catId: "c-1",
    kind: "food-photo",
    mimeType: "image/jpeg",
    blob: null,
    cloudFileID: "cloud://test/a-fail"
  });
  await local.write("assets", {
    id: "a-ok",
    schemaVersion: 1,
    catId: "c-1",
    kind: "food-photo",
    mimeType: "image/jpeg",
    blob: null,
    cloudFileID: "cloud://test/a-ok"
  });

  const downloadAsset = async (fileID) => {
    if (fileID === "cloud://test/a-fail") {
      throw new Error("simulated download failure");
    }
    return new Blob(["ok"], { type: "image/jpeg" });
  };

  const assetRepo = createAssetRepository({
    repo: local,
    urlApi: urlApi(),
    createUuid: randomUUID,
    now: () => 1_800_000_000_000,
    SCHEMA_VERSION: 1,
    downloadAsset
  });
  await assetRepo.preload(["a-fail", "a-ok"]);

  // 失败的没 URL，成功的有
  assert.equal(assetRepo.getUrl("a-fail"), "");
  assert.match(assetRepo.getUrl("a-ok"), /^blob:test-/);
});
