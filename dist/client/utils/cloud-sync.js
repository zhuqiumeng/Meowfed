// utils/cloud-sync.js
//
// CloudSync 编排器：负责「首次上传 / 云端恢复 / 状态机 / 资源同步」。
//
// 接入流程：
//   1. UI 调用 createCloudSync({ adapter, cloudRepo, localRepo, outbox, ... })
//   2. UI 调用 cloudSync.start() 启动：
//        - adapter.initialize() 走匿名登录
//        - flush outbox（之前失败的写）
//        - 启动 30s 自动 retry 定时器 + 监听 online 事件
//   3. UI 调用 cloudSync.pushFirstTime() 首次全量推云
//        或 cloudSync.pullFromCloud() 从云拉回（恢复）
//   4. 之后业务侧每次写，自动走 SyncRepository 的本地优先 + 异步 push
//
// 状态机：
//   idle → connecting → ready → syncing → idle
//                     ↓
//                    error
//
// MVP 行为：
//   - 不实现实时同步
//   - 不实现冲突解决（push 覆盖 pull；pull 覆盖 local）
//   - 图片：syncAssets 上传本地所有 blob 到云存储；restoreAssets 拉回
//   - outbox：FIFO 重试，MAX_RETRY=8 后跳过；后台 setInterval 30s 自动重试
//   - 启动/手动 flush 的失败会 surface 到 state.lastFlush / state.error

(function attachCloudSync(globalScope) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { createCloudSync };
  }
  if (globalScope) {
    globalScope.CatEatCloudSync = { createCloudSync };
  }
})(typeof globalThis !== "undefined" ? globalThis : this);

const SYNC_COLLECTIONS = ["meta", "cats", "foods", "results", "assets"];
const RETRY_INTERVAL_MS = 30_000;
const DOWNLOAD_CONCURRENCY = 4;
const UPLOAD_CONCURRENCY = 4;

function createCloudSync({ adapter, cloudRepo, localRepo, outbox, now, onLocalChanged, syncRepo }) {
  if (!adapter) throw new Error("CloudSync requires a CloudBaseAdapter");
  if (!cloudRepo) throw new Error("CloudSync requires a CloudRepository");
  if (!localRepo) throw new Error("CloudSync requires a LocalRepository");
  if (!outbox) throw new Error("CloudSync requires an Outbox");

  const time = typeof now === "function" ? now : () => Date.now();
  const listeners = new Set();
  let state = {
    phase: "idle", // idle | connecting | ready | syncing | error
    error: null,
    lastSyncAt: null,
    pendingPush: 0,
    lastFlush: null
  };

  // ---- 内部：并发锁 + 自动 retry ----

  let flushing = false; // 防止 outbox.flush 并发执行
  let retryTimer = null; // 30s 自动 retry 定时器
  let onlineHandler = null; // 监听 online 事件立即 flush

  function notifyLocalChanged() {
    if (typeof onLocalChanged === "function") {
      try {
        onLocalChanged();
      } catch (error) {
        // ignore
      }
    }
  }

  function emit() {
    for (const fn of listeners) {
      try {
        fn(state);
      } catch (error) {
        // ignore
      }
    }
  }

  function setState(patch) {
    state = { ...state, ...patch };
    emit();
  }

  function subscribe(fn) {
    listeners.add(fn);
    fn(state);
    return () => listeners.delete(fn);
  }

  // 串行化的 outbox flush；带并发锁
  async function safeFlushOutbox(opts = {}) {
    if (flushing) return { flushed: [], failed: [], skipped: [], deduplicated: true };
    flushing = true;
    try {
      const result = await outbox.flush({ verbose: !!opts.verbose });
      return result;
    } finally {
      flushing = false;
    }
  }

  function startAutoRetry() {
    if (retryTimer) return; // 已启动
    if (typeof globalThis !== "undefined" && typeof globalThis.setInterval === "function") {
      retryTimer = globalThis.setInterval(() => {
        safeFlushOutbox().catch(() => {});
      }, RETRY_INTERVAL_MS);
      // Node 环境下 unref，避免测试 process 因为定时器无法退出
      if (retryTimer && typeof retryTimer.unref === "function") {
        retryTimer.unref();
      }
    }
    // online 事件触发立即 flush（仅浏览器环境）
    if (typeof globalThis !== "undefined" && typeof globalThis.addEventListener === "function") {
      onlineHandler = () => {
        safeFlushOutbox().catch(() => {});
      };
      globalThis.addEventListener("online", onlineHandler);
    }
  }

  function stopAutoRetry() {
    if (retryTimer && typeof globalThis !== "undefined" && typeof globalThis.clearInterval === "function") {
      globalThis.clearInterval(retryTimer);
      retryTimer = null;
    }
    if (onlineHandler && typeof globalThis !== "undefined" && typeof globalThis.removeEventListener === "function") {
      globalThis.removeEventListener("online", onlineHandler);
      onlineHandler = null;
    }
  }

  async function start() {
    setState({ phase: "connecting", error: null });
    try {
      await adapter.initialize();
      const auth = await cloudRepo.getAuthInfo();
      // 启动时先等 in-flight push（来自 ensureDefaults 等），再 flush outbox
      // 这样后续 pullFromCloud 不会撞上半完成的 push
      await flushPendingPushes();
      // 不再静默吞掉 outbox.flush 失败；把结果存到 state
      const flushResult = await safeFlushOutbox();
      const hasFlushFailure = (flushResult.failed || []).length > 0;
      startAutoRetry();
      setState({
        phase: hasFlushFailure ? "error" : "ready",
        error: hasFlushFailure
          ? `${flushResult.failed.length} 条 outbox 推送失败，将在下次重试`
          : null,
        auth,
        lastFlush: { at: time(), ...flushResult }
      });
      return { ok: !hasFlushFailure, auth, flushResult };
    } catch (error) {
      setState({ phase: "error", error: String(error.message || error) });
      return { ok: false, error: String(error.message || error) };
    }
  }

  async function flushOutbox() {
    setState({ phase: "syncing" });
    const result = await safeFlushOutbox();
    const hasFailure = (result.failed || []).length > 0;
    setState({
      phase: hasFailure ? "error" : "ready",
      error: hasFailure
        ? `${result.failed.length} 条 outbox 推送失败`
        : null,
      lastFlush: { at: time(), ...result }
    });
    return result;
  }

  // ---- 首次上传：本地全量推云 ----
  //
  // 顺序：
  //   1. isEmpty() 保护：云端已有数据时拒绝（避免覆盖另一台设备）
  //   2. syncAssetsToCloud()：上传本地 blob 到云存储，剥离本地 asset.blob
  //   3. pushSnapshot()：把本地数据全量推云（这时 asset 已无 blob，不会撞 1MB 限制）

  async function pushFirstTime() {
    setState({ phase: "syncing", error: null });
    try {
      // 1. 保护：云端已有数据拒绝覆盖
      const empty = await cloudRepo.isEmpty();
      if (!empty) {
        const msg = "云端已有数据，请先在另一台设备执行「从云恢复」";
        setState({ phase: "error", error: msg });
        return { ok: false, error: msg };
      }

      // 2. 先上传图片（剥离本地 blob）
      const assetResult = await syncAssetsToCloud();

      // 3. 再推数据快照（asset 记录此时已无 blob）
      const snapshot = {};
      for (const name of SYNC_COLLECTIONS) {
        snapshot[name] = await localRepo.readAll(name);
      }
      await cloudRepo.pushSnapshot(snapshot);

      setState({ phase: "ready", lastSyncAt: time() });
      return {
        ok: true,
        counts: SYNC_COLLECTIONS.reduce((acc, c) => {
          acc[c] = (snapshot[c] || []).length;
          return acc;
        }, {}),
        assets: assetResult
      };
    } catch (error) {
      // v1.1.4 debug: 暴露 push 真错到 globalThis + DOM,1.5s 闪过的 toast 看不到全栈
      const msg = String(error.message || error);
      const stack = String(error.stack || "");
      try { globalThis.__PUSH_FIRST_TIME_ERROR__ = msg; globalThis.__PUSH_FIRST_TIME_STACK__ = stack; } catch {}
      try {
        let dom = document.getElementById("__push-first-time-error__");
        if (!dom) {
          dom = document.createElement("pre");
          dom.id = "__push-first-time-error__";
          dom.style.cssText = "position:fixed;top:0;left:0;right:0;background:#fee;color:#c00;padding:6px;font-size:11px;z-index:99999;white-space:pre-wrap;word-break:break-all;font-family:monospace;";
          (document.body || document.documentElement).appendChild(dom);
        }
        dom.textContent = "[pushFirstTime] " + msg + "\n" + stack;
      } catch {}
      setState({ phase: "error", error: msg });
      return { ok: false, error: msg };
    }
  }

  // ---- 云端恢复：清空本地、把云端全量拉回 ----
  //
  // MVP：调用前会要求用户二次确认（UI 处理）。
  //     不会自动 merge，因为没有冲突解决。
  // 已知风险：clear 后 writeMany 失败时本地数据丢失；outbox.flush 失败
  //           会被 surface 到 state，UI 提示「本地有 N 条变更未上云」。

  async function pullFromCloud() {
    setState({ phase: "syncing", error: null });
    try {
      // 先等 in-flight push 完成，避免被自己未完成的写入污染云端
      await flushPendingPushes();
      // 再 flush outbox（不再静默吞失败，记到 state）
      const preFlush = await safeFlushOutbox();
      const snapshot = await cloudRepo.pullSnapshot();
      // 清空本地所有 collection
      for (const name of SYNC_COLLECTIONS) {
        await localRepo.clear(name);
      }
      // 写回本地
      for (const name of SYNC_COLLECTIONS) {
        const records = snapshot[name] || [];
        if (records.length > 0) {
          await localRepo.writeMany(name, records);
        }
      }
      // 拉图
      const assetResult = await restoreAssetsFromCloud();
      // 通知上层：本地数据已重写，需要刷新 DataService 缓存
      notifyLocalChanged();
      const preFlushFailure = (preFlush.failed || []).length > 0;
      setState({
        phase: preFlushFailure ? "error" : "ready",
        error: preFlushFailure
          ? `已恢复，但 ${preFlush.failed.length} 条本地变更未上云（云端是更新的版本）`
          : null,
        lastSyncAt: time(),
        lastFlush: { at: time(), ...preFlush }
      });
      return {
        ok: !preFlushFailure,
        counts: SYNC_COLLECTIONS.reduce((acc, c) => {
          acc[c] = (snapshot[c] || []).length;
          return acc;
        }, {}),
        assets: assetResult
      };
    } catch (error) {
      setState({ phase: "error", error: String(error.message || error) });
      return { ok: false, error: String(error.message || error) };
    }
  }

  // ---- 图片资源同步 ----

  async function syncAssetsToCloud() {
    const assets = await localRepo.readAll("assets");
    if (assets.length === 0) return { uploaded: 0, skipped: 0, failed: 0 };
    // 拆出需要上传的（带 blob 且无 cloudPath）
    const todo = assets.filter((a) => a.blob && !a.cloudPath);
    const skipped = assets.length - todo.length;
    let uploaded = 0;
    let failed = 0;

    // 4 并发上传
    for (let i = 0; i < todo.length; i += UPLOAD_CONCURRENCY) {
      const batch = todo.slice(i, i + UPLOAD_CONCURRENCY);
      const results = await Promise.allSettled(batch.map(async (asset) => {
        const result = await adapter.uploadFile(asset.blob, {
          id: asset.id,
          ext: mimeToExt(asset.mimeType)
        });
        const updated = {
          ...asset,
          cloudPath: result.cloudPath,
          cloudFileID: result.fileID
        };
        // 写本地 + 写云（资产记录本身；blob 字段置 null）
        await localRepo.write("assets", { ...updated, blob: null });
        await cloudRepo.write("assets", { ...updated, blob: null });
        return asset.id;
      }));
      results.forEach((r) => {
        if (r.status === "fulfilled") uploaded += 1;
        else failed += 1;
      });
    }
    return { uploaded, skipped, failed };
  }

  async function restoreAssetsFromCloud() {
    const assets = await localRepo.readAll("assets");
    // 拆出需要下载的（无 blob 但有 cloudFileID）
    const todo = assets.filter((a) => !a.blob && a.cloudFileID);
    const skipped = assets.length - todo.length;
    let downloaded = 0;
    let failed = 0;

    // 4 并发下载
    for (let i = 0; i < todo.length; i += DOWNLOAD_CONCURRENCY) {
      const batch = todo.slice(i, i + DOWNLOAD_CONCURRENCY);
      const results = await Promise.allSettled(batch.map(async (asset) => {
        const blob = await adapter.downloadFile(asset.cloudFileID);
        const updated = { ...asset, blob };
        await localRepo.write("assets", updated);
        return asset.id;
      }));
      results.forEach((r) => {
        if (r.status === "fulfilled") downloaded += 1;
        else failed += 1;
      });
    }
    return { downloaded, skipped, failed };
  }

  function getState() {
    return { ...state };
  }

  // 等待 syncRepo 中所有 in-flight push 完成（被 pullFromCloud 调用前需要）
  async function flushPendingPushes() {
    if (syncRepo && typeof syncRepo.flushPending === "function") {
      await syncRepo.flushPending();
    }
  }

  return {
    start,
    stop: stopAutoRetry,
    flushOutbox,
    pushFirstTime,
    pullFromCloud,
    syncAssetsToCloud,
    restoreAssetsFromCloud,
    subscribe,
    getState,
    outbox,
    local: localRepo,
    cloud: cloudRepo,
    flushPendingPushes
  };
}

function mimeToExt(mime) {
  if (!mime) return "bin";
  if (/jpeg|jpg/i.test(mime)) return "jpg";
  if (/png/i.test(mime)) return "png";
  if (/webp/i.test(mime)) return "webp";
  if (/gif/i.test(mime)) return "gif";
  return "bin";
}
