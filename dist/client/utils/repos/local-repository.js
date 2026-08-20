// utils/repos/local-repository.js
//
// LocalRepository：把底层 Adapter（IndexedDB / WxStorage / LocalStorage
// / 未来的 CloudBase）抽象为一组「Collection」级别的操作。
//
// 业务代码（DataService）只面对 Collection 概念：list / find /
// write / remove / clear / runTransaction，不直接接触
// `IDBTransaction` / `wx.getStorageSync` / HTTP 之类底层细节。
//
// 这是为下一阶段替换为 CloudBase Repository 预留的接口边界：CloudBase
// Repository 将实现同样的 Collection 抽象，但底层走远端 API + 本地
// 缓存队列。

(function attachLocalRepository(globalScope) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { createLocalRepository };
  }
  if (globalScope) {
    globalScope.CatEatLocalRepository = { createLocalRepository };
  }
})(typeof globalThis !== "undefined" ? globalThis : this);

const KNOWN_COLLECTIONS = ["meta", "cats", "foods", "results", "assets"];

function createLocalRepository(adapter, options = {}) {
  if (!adapter || typeof adapter.runTransaction !== "function") {
    throw new Error("LocalRepository requires an adapter with runTransaction()");
  }

  const collections = Array.isArray(options.collections)
    ? Array.from(new Set([...KNOWN_COLLECTIONS, ...options.collections]))
    : KNOWN_COLLECTIONS.slice();

  function isKnown(name) {
    return collections.includes(name);
  }

  return {
    kind: adapter.kind,
    adapter,
    collections: collections.slice(),

    // 读：返回整 collection 数组
    async readAll(collection) {
      if (!isKnown(collection)) {
        throw new Error(`Unknown collection: ${collection}`);
      }
      return adapter.getAll(collection);
    },

    // 读：按 id 取单条
    async find(collection, id) {
      if (!isKnown(collection)) {
        throw new Error(`Unknown collection: ${collection}`);
      }
      return adapter.get(collection, id);
    },

    // 写：单条 upsert
    async write(collection, record) {
      if (!isKnown(collection)) {
        throw new Error(`Unknown collection: ${collection}`);
      }
      return adapter.put(collection, record);
    },

    // 写：批量 upsert
    async writeMany(collection, records) {
      if (!isKnown(collection)) {
        throw new Error(`Unknown collection: ${collection}`);
      }
      if (!Array.isArray(records) || records.length === 0) return;
      return adapter.bulkPut(collection, records);
    },

    // 删
    async remove(collection, id) {
      if (!isKnown(collection)) {
        throw new Error(`Unknown collection: ${collection}`);
      }
      return adapter.delete(collection, id);
    },

    // 清空整 collection
    async clear(collection) {
      if (!isKnown(collection)) {
        throw new Error(`Unknown collection: ${collection}`);
      }
      return adapter.clear(collection);
    },

    // 事务：plan 同步写入；plan 函数签名 (stores) => void，
    // stores = { meta, cats, foods, results, assets }，每个子项
    // 提供 get / getAll / put / delete / clear 方法。
    //
    // 注意：在 IndexedDBAdapter 实现里，stores.get 是 async；
    // 在 WxStorageAdapter 实现里，stores.get 是 sync。
    // 业务侧要 await 所有 get 调用以保持兼容。
    async runTransaction(plan) {
      if (typeof plan !== "function") {
        throw new Error("runTransaction requires a plan function");
      }
      return adapter.runTransaction(collections, "readwrite", plan);
    }
  };
}
