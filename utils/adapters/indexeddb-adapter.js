// utils/adapters/indexeddb-adapter.js
//
// IndexedDB 物理层 Adapter：只负责打开数据库、声明 schema、执行原始的
// get/put/delete/clear 与 transaction，不感知任何业务字段或「foods /
// cats / results / assets」业务语义。
//
// 业务侧（DataService / LocalRepository）只通过本文件暴露的
// `runTransaction(plan)` / `getAll` / `get` / `put` / `delete` / `clear` 操作。
//
// 这是为下一阶段替换为 CloudBase Adapter 预留的接口边界：CloudBase
// Adapter 将实现同样的「Collection 抽象」契约，但底层是 HTTP / 缓存
// 队列，而不是 IndexedDB。

(function attachIndexedDBAdapter(globalScope) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { createIndexedDBAdapter };
  }
  if (globalScope) {
    globalScope.CatEatIndexedDBAdapter = { createIndexedDBAdapter };
  }
})(typeof globalThis !== "undefined" ? globalThis : this);

function createIndexedDBAdapter({ indexedDB, DB_NAME, DB_VERSION, setupSchema }) {
  if (!indexedDB || typeof indexedDB.open !== "function") {
    throw new Error("IndexedDB is unavailable");
  }
  if (typeof setupSchema !== "function") {
    throw new Error("setupSchema callback is required");
  }

  let database = null;

  function requestValue(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () =>
        reject(request.error || new Error("IndexedDB request failed"));
    });
  }

  function transactionDone(transaction) {
    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () =>
        reject(transaction.error || new Error("IndexedDB transaction failed"));
      transaction.onabort = () =>
        reject(transaction.error || new Error("IndexedDB transaction aborted"));
    });
  }

  function openDatabase() {
    return new Promise((resolve, reject) => {
      let request;
      try {
        request = indexedDB.open(DB_NAME, DB_VERSION);
      } catch (error) {
        reject(error);
        return;
      }

      request.onupgradeneeded = () => {
        const db = request.result;
        setupSchema(db);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () =>
        reject(request.error || new Error("Unable to open IndexedDB"));
      request.onblocked = () => reject(new Error("IndexedDB upgrade is blocked"));
    });
  }

  async function singleStoreRead(storeName, mode, operation) {
    if (!database) throw new Error("IndexedDBAdapter is not initialized");
    const transaction = database.transaction(storeName, mode);
    const result = await operation(transaction.objectStore(storeName));
    return result;
  }

  return {
    kind: "indexeddb",

    async initialize() {
      database = await openDatabase();
    },

    async isReady() {
      return database !== null;
    },

    async getAll(storeName) {
      if (!database) throw new Error("IndexedDBAdapter is not initialized");
      return requestValue(
        database.transaction(storeName, "readonly").objectStore(storeName).getAll()
      );
    },

    async get(storeName, key) {
      if (!database) throw new Error("IndexedDBAdapter is not initialized");
      return requestValue(
        database.transaction(storeName, "readonly").objectStore(storeName).get(key)
      );
    },

    async put(storeName, record) {
      if (!database) throw new Error("IndexedDBAdapter is not initialized");
      const transaction = database.transaction(storeName, "readwrite");
      transaction.objectStore(storeName).put(record);
      await transactionDone(transaction);
      return record;
    },

    async bulkPut(storeName, records) {
      if (!database) throw new Error("IndexedDBAdapter is not initialized");
      if (!Array.isArray(records) || records.length === 0) return;
      const transaction = database.transaction(storeName, "readwrite");
      const store = transaction.objectStore(storeName);
      records.forEach((record) => store.put(record));
      await transactionDone(transaction);
    },

    async delete(storeName, key) {
      if (!database) throw new Error("IndexedDBAdapter is not initialized");
      const transaction = database.transaction(storeName, "readwrite");
      transaction.objectStore(storeName).delete(key);
      await transactionDone(transaction);
    },

    async clear(storeName) {
      if (!database) throw new Error("IndexedDBAdapter is not initialized");
      const transaction = database.transaction(storeName, "readwrite");
      transaction.objectStore(storeName).clear();
      await transactionDone(transaction);
    },

    // 跨 collection 事务：plan(stores) 同步写入；返回 stores 以便读。
    async runTransaction(storeNames, mode, plan) {
      if (!database) throw new Error("IndexedDBAdapter is not initialized");
      const tx = database.transaction(storeNames, mode);
      const stores = {};
      for (const name of storeNames) {
        const store = tx.objectStore(name);
        stores[name] = {
          get: (key) => requestValue(store.get(key)),
          getAll: () => requestValue(store.getAll()),
          put: (record) => {
            store.put(record);
          },
          delete: (key) => {
            store.delete(key);
          },
          clear: () => {
            store.clear();
          }
        };
      }
      plan(stores);
      await transactionDone(tx);
      return stores;
    }
  };
}
