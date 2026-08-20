// utils/repos/sync-repository.js
//
// SyncRepository：把 LocalRepository 与 CloudRepository 组合，
// 实现「本地优先 + 异步 push 到云 + 失败入 outbox」语义。
//
// 给 DataService 暴露的接口与 LocalRepository 完全一致（DataService
// 不感知自己在 mirror 模式）。额外的 push / pull 由 CloudSync 编排。
//
// MVP 行为：
//   - 读：永远走本地（local 永远有完整数据，因为每次写都先写本地）
//   - 写：先写本地 → 立即返回 → 异步 push 到云
//   - push 失败：把 op 入 outbox，下次启动或定时重试
//   - 不实现实时同步 / watchCollection / 冲突解决
//   - 启动时 SyncRepository 不会自动 flush outbox；CloudSync 负责

(function attachSyncRepository(globalScope) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { createSyncRepository };
  }
  if (globalScope) {
    globalScope.CatEatSyncRepository = { createSyncRepository };
  }
})(typeof globalThis !== "undefined" ? globalThis : this);

function createSyncRepository({ local, cloud, outbox, onError }) {
  if (!local) throw new Error("SyncRepository requires a LocalRepository");
  if (!cloud) throw new Error("SyncRepository requires a CloudRepository");
  if (!outbox) throw new Error("SyncRepository requires an Outbox");

  // 追踪 in-flight push：pullFromCloud 前需要等所有 in-flight 写完成
  const pendingPushes = new Set();

  function reportError(label, error) {
    if (typeof onError === "function") {
      try {
        onError({ label, error });
      } catch (handlerError) {
        // ignore
      }
    }
  }

  // 推云前剥离 blob / File 等不可序列化或大体积字段；图片走云存储
  // 由 cloud-sync.js 单独处理。MVP 简化：只处理 blob 字段。
  function stripNonSerializable(record) {
    if (!record || typeof record !== "object") return record;
    const copy = { ...record };
    if (copy.blob && typeof Blob !== "undefined" && copy.blob instanceof Blob) {
      delete copy.blob;
    }
    return copy;
  }

  // 异步 push 单条 op；失败入 outbox
  function schedulePush(op, collection, recordOrKey) {
    const payload = stripNonSerializable(recordOrKey);
    // 把 push 包成 Promise 并登记到 pendingPushes
    const pushPromise = Promise.resolve()
      .then(() => {
        if (op === "write") {
          return cloud.write(collection, payload);
        }
        if (op === "remove") {
          return cloud.remove(collection, payload);
        }
        throw new Error(`Unknown sync op: ${op}`);
      })
      .catch((error) => {
        reportError(op === "write" ? "push-write" : "push-remove", error);
        return outbox.enqueue(op, collection, payload);
      })
      .finally(() => {
        pendingPushes.delete(pushPromise);
      });
    pendingPushes.add(pushPromise);
  }

  return {
    kind: "mirror",
    collections: local.collections.slice(),
    local,
    cloud,
    outbox,
    // 透传：DataService 用 repo.adapter.initialize() 初始化底层存储
    adapter: local.adapter,

    // ---- 与 LocalRepository 同形 API ----
    // 读：永远走本地
    async readAll(collection) {
      return local.readAll(collection);
    },

    async find(collection, id) {
      return local.find(collection, id);
    },

    // 写：本地先写；返回后异步 push 到云
    async write(collection, record) {
      const result = await local.write(collection, record);
      schedulePush("write", collection, record);
      return result;
    },

    async writeMany(collection, records) {
      if (!Array.isArray(records) || records.length === 0) return;
      const result = await local.writeMany(collection, records);
      for (const record of records) {
        schedulePush("write", collection, record);
      }
      return result;
    },

    async remove(collection, id) {
      const result = await local.remove(collection, id);
      schedulePush("remove", collection, id);
      return result;
    },

    async clear(collection) {
      const result = await local.clear(collection);
      // 不主动 push clear；first-time upload / pushSnapshot 时会处理
      return result;
    },

    async runTransaction(plan) {
      // 同步 plan 内的 put / delete 立即追踪；clear 用「前后 snapshot diff」
      // 异步计算（因为 getAll 是 async，plan 是 sync 上下文）。
      //
      // 流程：
      //   1. 跑 plan 前 snapshot 所有相关 collection
      //   2. 同步追踪 put / delete；记录被 clear 的 collection
      //   3. 跑原 transaction
      //   4. 拿 post-snapshot；和 pre-snapshot diff，生成被 clear 的 key 的 remove ops
      //   5. 合并 put/delete/clear-diff 推到云
      const changes = []; // 同步追踪的 put / delete
      const clearedCollections = new Set(); // 被 clear 的 collection
      // 1. pre-snapshot
      const preSnapshots = {};
      for (const name of local.collections) {
        try {
          preSnapshots[name] = await local.readAll(name);
        } catch (error) {
          preSnapshots[name] = [];
        }
      }
      const originalRun = local.runTransaction.bind(local);
      const wrappedPlan = (stores) => {
        const wrapped = {};
        for (const [name, store] of Object.entries(stores)) {
          const origPut = store.put.bind(store);
          const origDelete = store.delete ? store.delete.bind(store) : null;
          const origClear = store.clear ? store.clear.bind(store) : null;
          wrapped[name] = {
            ...store,
            put: (rec) => {
              changes.push({ op: "write", collection: name, record: JSON.parse(JSON.stringify(rec)) });
              return origPut(rec);
            },
            delete: (key) => {
              changes.push({ op: "remove", collection: name, key });
              if (origDelete) return origDelete(key);
            },
            clear: () => {
              clearedCollections.add(name);
              if (origClear) return origClear();
            }
          };
        }
        return plan(wrapped);
      };
      const result = await originalRun(wrappedPlan);
      // 4. post-snapshot + diff（处理被 clear 的 collection）
      for (const name of clearedCollections) {
        let post;
        try {
          post = await local.readAll(name);
        } catch (error) {
          post = [];
        }
        const postKeys = new Set((post || []).map((r) => r && (r.id || r.key)).filter(Boolean));
        for (const r of (preSnapshots[name] || [])) {
          const k = r && (r.id || r.key);
          if (k && !postKeys.has(k)) {
            changes.push({ op: "remove", collection: name, key: k });
          }
        }
      }
      // 5. 推到云
      for (const change of changes) {
        if (change.op === "write") {
          schedulePush("write", change.collection, change.record);
        } else if (change.op === "remove") {
          schedulePush("remove", change.collection, change.key);
        }
      }
      return result;
    },

    // ---- 元信息 ----

    isRemote() {
      return true;
    },

    // 等待所有 in-flight push 完成（或入 outbox）
    async flushPending() {
      if (pendingPushes.size === 0) return;
      await Promise.allSettled(Array.from(pendingPushes));
    }
  };
}
