// utils/repos/cloud-repository.js
//
// CloudRepository：把 CloudBaseAdapter 包装为 LocalRepository 同形 API，
// 外加「全量推送 / 拉取 / 状态查询」语义。
//
// 与 LocalRepository 的差异：
//   - 多一个 `kind: "cloudbase"` 标记，便于 DataService / 上层
//     区分"local-only"与"mirror"模式
//   - 提供 pushSnapshot / pullSnapshot，用于首次全量同步与恢复
//   - 不暴露 `adapter` 字段（避免业务侧直接绕开 repo 调底层 SDK）
//
// MVP 行为：
//   - 不实现增量同步
//   - 不实现冲突解决
//   - 写入是 best-effort（成功即返回；失败抛错由 SyncRepository 捕获）

(function attachCloudRepository(globalScope) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { createCloudRepository };
  }
  if (globalScope) {
    globalScope.CatEatCloudRepository = { createCloudRepository };
  }
})(typeof globalThis !== "undefined" ? globalThis : this);

const KNOWN_COLLECTIONS = ["meta", "cats", "foods", "results", "assets"];

function createCloudRepository(adapter) {
  if (!adapter || adapter.kind !== "cloudbase") {
    throw new Error("CloudRepository requires a CloudBaseAdapter");
  }

  async function readAllCollection(name) {
    return adapter.getAll(name);
  }

  async function findOne(name, key) {
    return adapter.get(name, key);
  }

  async function writeOne(name, record) {
    return adapter.put(name, record);
  }

  async function deleteOne(name, key) {
    return adapter.delete(name, key);
  }

  async function clearCollection(name) {
    return adapter.clear(name);
  }

  return {
    kind: "cloudbase",
    collections: KNOWN_COLLECTIONS.slice(),

    // ---- 与 LocalRepository 同形 API ----

    async readAll(collection) {
      if (!KNOWN_COLLECTIONS.includes(collection)) {
        throw new Error(`Unknown collection: ${collection}`);
      }
      return readAllCollection(collection);
    },

    async find(collection, id) {
      if (!KNOWN_COLLECTIONS.includes(collection)) {
        throw new Error(`Unknown collection: ${collection}`);
      }
      return findOne(collection, id);
    },

    async write(collection, record) {
      if (!KNOWN_COLLECTIONS.includes(collection)) {
        throw new Error(`Unknown collection: ${collection}`);
      }
      return writeOne(collection, record);
    },

    async writeMany(collection, records) {
      if (!KNOWN_COLLECTIONS.includes(collection)) {
        throw new Error(`Unknown collection: ${collection}`);
      }
      if (!Array.isArray(records) || records.length === 0) return;
      return adapter.bulkPut(collection, records);
    },

    async remove(collection, id) {
      if (!KNOWN_COLLECTIONS.includes(collection)) {
        throw new Error(`Unknown collection: ${collection}`);
      }
      return deleteOne(collection, id);
    },

    async clear(collection) {
      if (!KNOWN_COLLECTIONS.includes(collection)) {
        throw new Error(`Unknown collection: ${collection}`);
      }
      return clearCollection(collection);
    },

    async runTransaction(plan) {
      if (typeof plan !== "function") {
        throw new Error("runTransaction requires a plan function");
      }
      return adapter.runTransaction(KNOWN_COLLECTIONS, "readwrite", plan);
    },

    // ---- 快照语义（first-time upload / cloud recovery）----

    async pushSnapshot(snapshot) {
      // snapshot 形如 { meta, cats, foods, results, assets }
      // 不实现增量；按 collection 全量覆盖
      for (const name of KNOWN_COLLECTIONS) {
        const records = Array.isArray(snapshot[name]) ? snapshot[name] : [];
        await adapter.clear(name);
        if (records.length > 0) {
          await adapter.bulkPut(name, records);
        }
      }
      return { pushed: KNOWN_COLLECTIONS.map((c) => ({ collection: c, count: (snapshot[c] || []).length })) };
    },

    async pullSnapshot() {
      // 拉取该 _openid 下的所有 collection
      const snapshot = {};
      for (const name of KNOWN_COLLECTIONS) {
        snapshot[name] = await adapter.getAll(name);
      }
      return snapshot;
    },

    async isEmpty() {
      // 任一 collection 有数据即认为非空
      for (const name of KNOWN_COLLECTIONS) {
        const records = await adapter.getAll(name);
        if (records.length > 0) return false;
      }
      return true;
    },

    // ---- 元信息 ----

    async getAuthInfo() {
      return adapter.getAuthInfo ? adapter.getAuthInfo() : { env: adapter.env };
    },

    // 暴露云存储能力
    storage: {
      upload: (blob, options) => adapter.uploadFile(blob, options),
      download: (fileID) => adapter.downloadFile(fileID),
      deleteMany: (fileIDs) => adapter.deleteFiles(fileIDs),
      getTempURLs: (fileIDs) => adapter.getTempFileURLs(fileIDs)
    }
  };
}
