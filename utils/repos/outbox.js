// utils/repos/outbox.js
//
// Outbox：离线写缓冲。SyncRepository 写云失败时，把这条操作记到本地
// outbox（IndexedDB 的一个特殊 collection）；启动时或定时器扫一遍
// outbox 重传，成功后删除。
//
// 这不是真正的事务保证，只是「最后尽力同步」。MVP 不实现 CRDT /
// 冲突解决，所以 outbox 顺序 = FIFO 即可。

(function attachOutbox(globalScope) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { createOutbox };
  }
  if (globalScope) {
    globalScope.CatEatOutbox = { createOutbox };
  }
})(typeof globalThis !== "undefined" ? globalThis : this);

const OUTBOX_COLLECTION = "outbox";
const MAX_RETRY = 8;

function createOutbox({ localRepo, cloudRepo, now, onFlush }) {
  if (!localRepo) throw new Error("Outbox requires a LocalRepository");
  if (!cloudRepo) throw new Error("Outbox requires a CloudRepository");
  const time = typeof now === "function" ? now : () => Date.now();

  // 写一条 outbox 记录
  async function enqueue(op, collection, record) {
    const id = `outbox-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const entry = {
      id,
      op, // "write" | "remove"
      collection,
      record: op === "write" ? JSON.parse(JSON.stringify(record || {})) : null,
      key: op === "remove" ? record : null,
      retry: 0,
      createdAt: time(),
      lastError: null
    };
    await localRepo.write(OUTBOX_COLLECTION, entry);
    return id;
  }

  async function removeEntry(id) {
    try {
      await localRepo.remove(OUTBOX_COLLECTION, id);
    } catch (error) {
      // ignore
    }
  }

  async function listPending() {
    return localRepo.readAll(OUTBOX_COLLECTION);
  }

  async function clear() {
    return localRepo.clear(OUTBOX_COLLECTION);
  }

  // 同步入口：写入云；失败重试，超 MAX_RETRY 次后保留在 outbox
  // 但更新 retry / lastError。返回值是 { flushed, failed, skipped }。
  async function flush(options = {}) {
    const verbose = options.verbose === true;
    const entries = await listPending();
    const result = { flushed: [], failed: [], skipped: [] };

    for (const entry of entries.sort((a, b) => a.createdAt - b.createdAt)) {
      if ((entry.retry || 0) >= MAX_RETRY) {
        result.skipped.push(entry);
        continue;
      }
      try {
        if (entry.op === "write") {
          await cloudRepo.write(entry.collection, entry.record);
        } else if (entry.op === "remove") {
          await cloudRepo.remove(entry.collection, entry.key);
        } else {
          throw new Error(`Unknown outbox op: ${entry.op}`);
        }
        await removeEntry(entry.id);
        result.flushed.push(entry);
        if (typeof onFlush === "function") {
          onFlush({ kind: "ok", entry });
        }
      } catch (error) {
        const next = {
          ...entry,
          retry: (entry.retry || 0) + 1,
          lastError: String(error.message || error),
          lastAttemptAt: time()
        };
        try {
          await localRepo.write(OUTBOX_COLLECTION, next);
        } catch (writeError) {
          // ignore
        }
        result.failed.push(next);
        if (typeof onFlush === "function") {
          onFlush({ kind: "error", entry: next, error });
        }
        if (verbose) {
          // eslint-disable-next-line no-console
          console.warn(`[outbox] flush failed for ${entry.op} ${entry.collection}`, error);
        }
      }
    }
    return result;
  }

  return {
    enqueue,
    flush,
    listPending,
    clear,
    get stats() {
      return {
        collection: OUTBOX_COLLECTION,
        maxRetry: MAX_RETRY
      };
    }
  };
}
