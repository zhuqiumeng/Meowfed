// utils/adapters/wx-storage-adapter.js
//
// WxStorageAdapter：把 wx storage（小程序）适配为 LocalRepository
// 期望的 Collection 接口。底层用 wx.getStorageSync / wx.setStorageSync。
//
// 每个 collection（meta / cats / foods / results / assets）对应一个
// wx storage key，数据以 JSON 数组形式序列化。
//
// 不支持真正的「事务」：runTransaction 走 snapshot → in-memory mutate →
// writeback 的 best-effort 流程，与 wx storage 实际能力对齐。
//
// 这一层是为下一阶段替换 CloudBase Adapter 预留的接口边界。

(function attachWxStorageAdapter(globalScope) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { createWxStorageAdapter };
  }
  if (globalScope) {
    globalScope.CatEatWxStorageAdapter = { createWxStorageAdapter };
  }
})(typeof globalThis !== "undefined" ? globalThis : this);

const KEY_PREFIX = "cat-eat-v1:";
const COLLECTION_KEYS = {
  meta: `${KEY_PREFIX}meta`,
  cats: `${KEY_PREFIX}cats`,
  foods: `${KEY_PREFIX}foods`,
  results: `${KEY_PREFIX}results`,
  assets: `${KEY_PREFIX}assets`
};

function createWxStorageAdapter({ wx, now }) {
  if (!wx || typeof wx.getStorageSync !== "function") {
    throw new Error("wx storage API is unavailable");
  }
  const time = typeof now === "function" ? now : () => Date.now();

  function readCollection(name) {
    const key = COLLECTION_KEYS[name];
    try {
      const raw = wx.getStorageSync(key);
      if (raw === "" || raw === null || raw === undefined) return [];
      if (typeof raw === "string") return JSON.parse(raw);
      return raw;
    } catch (error) {
      return [];
    }
  }

  function writeCollection(name, records) {
    const key = COLLECTION_KEYS[name];
    try {
      wx.setStorageSync(key, JSON.stringify(records));
    } catch (error) {
      throw new Error(`Unable to write wx storage collection ${name}: ${error.message}`);
    }
  }

  function stableKey(record) {
    if (record && "key" in record) return record.key;
    if (record && "id" in record) return record.id;
    return null;
  }

  function clone(value) {
    return value === null || value === undefined
      ? value
      : JSON.parse(JSON.stringify(value));
  }

  return {
    kind: "wx-storage",

    async initialize() {
      // wx storage 不需要 schema 初始化；collections 第一次写入时建出空数组。
      return;
    },

    async isReady() {
      return true;
    },

    async getAll(storeName) {
      if (!COLLECTION_KEYS[storeName]) {
        throw new Error(`Unknown collection: ${storeName}`);
      }
      return readCollection(storeName);
    },

    async get(storeName, key) {
      const records = readCollection(storeName);
      return records.find((r) => stableKey(r) === key) || null;
    },

    async put(storeName, record) {
      const records = readCollection(storeName);
      const key = stableKey(record);
      if (key === null) {
        throw new Error(`Record must have 'id' or 'key' field`);
      }
      const index = records.findIndex((r) => stableKey(r) === key);
      if (index >= 0) records[index] = record;
      else records.push(record);
      writeCollection(storeName, records);
      return record;
    },

    async bulkPut(storeName, newRecords) {
      if (!Array.isArray(newRecords) || newRecords.length === 0) return;
      const records = readCollection(storeName);
      const byKey = new Map(records.map((r) => [stableKey(r), r]));
      newRecords.forEach((r) => byKey.set(stableKey(r), r));
      writeCollection(storeName, Array.from(byKey.values()));
    },

    async delete(storeName, key) {
      const records = readCollection(storeName);
      const filtered = records.filter((r) => stableKey(r) !== key);
      writeCollection(storeName, filtered);
    },

    async clear(storeName) {
      writeCollection(storeName, []);
    },

    // best-effort transaction：snapshot 全部 collection → plan 同步写 →
    // 一次性写回。wx storage 无真事务，但 UI 写入是单 tab 同步，足以
    // 满足日常需求。
    async runTransaction(storeNames, _mode, plan) {
      const snapshots = {};
      storeNames.forEach((name) => {
        snapshots[name] = readCollection(name);
      });
      const stores = {};
      storeNames.forEach((name) => {
        const working = clone(snapshots[name]);
        const byKey = new Map(working.map((r) => [stableKey(r), r]));
        stores[name] = {
          get: (key) => working.find((r) => stableKey(r) === key) || null,
          getAll: () => clone(working),
          put: (record) => {
            const k = stableKey(record);
            if (k === null) {
              throw new Error(`Record must have 'id' or 'key' field`);
            }
            const index = working.findIndex((r) => stableKey(r) === k);
            if (index >= 0) working[index] = record;
            else working.push(record);
            byKey.set(k, record);
          },
          delete: (key) => {
            const index = working.findIndex((r) => stableKey(r) === key);
            if (index >= 0) working.splice(index, 1);
            byKey.delete(key);
          },
          clear: () => {
            working.length = 0;
            byKey.clear();
          }
        };
      });
      const result = plan(stores);
      // 写回
      storeNames.forEach((name) => {
        writeCollection(name, snapshots[name]);
      });
      return result;
    }
  };
}
