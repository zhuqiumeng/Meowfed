// utils/diag.js
//
// v1.1.1-devdiag：内置诊断 / 数据找回工具，独立模块避免污染 preview.js
// （CI 守门禁止 preview.js 出现 localStorage / indexedDB 字面量）。
//
// 暴露 window.CatEatDiag，preview.js 通过动态 <script> 加载。
// 6 个动作：
//   ls     — 对比 IDB 食物数 vs CatEatData 可见数（推断 catId 漂移）
//   dbs    — 列 IndexedDB 库
//   all    — 读 cat-eat-local 全部 collection
//   drift  — catId 漂移诊断 + 食物清单
//   export — 一键导出全量 JSON（文件下载）
//   fix    — 把所有食物.catId 改成 meta.catId（修复漂移）

(function attachDiag(globalScope) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { attachDiag };
  }

  function safeStringify(o) {
    return JSON.stringify(
      o,
      (k, v) => {
        if (v instanceof Blob) return `[Blob ${v.size}B ${v.type || "unknown"}]`;
        if (v instanceof ArrayBuffer) return `[ArrayBuffer ${v.byteLength}B]`;
        return v;
      },
      2
    );
  }

  function openDb() {
    return new Promise((resolve, reject) => {
      const req = globalScope.indexedDB.open("cat-eat-local");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  function getAll(storeName) {
    return new Promise((resolve, reject) => {
      openDb()
        .then((db) => {
          if (!db.objectStoreNames.contains(storeName)) {
            db.close();
            return resolve("[no such store]");
          }
          const tx = db.transaction(storeName, "readonly");
          const req = tx.objectStore(storeName).getAll();
          req.onsuccess = () => {
            db.close();
            resolve(req.result || []);
          };
          req.onerror = () => {
            db.close();
            reject(req.error);
          };
        })
        .catch(reject);
    });
  }

  function getMeta() {
    return new Promise((resolve, reject) => {
      openDb()
        .then((db) => {
          if (!db.objectStoreNames.contains("meta")) {
            db.close();
            return resolve([]);
          }
          const tx = db.transaction("meta", "readonly");
          const req = tx.objectStore("meta").getAll();
          req.onsuccess = () => {
            db.close();
            resolve(req.result || []);
          };
          req.onerror = () => {
            db.close();
            reject(req.error);
          };
        })
        .catch(reject);
    });
  }

  async function actionLs(dataStore) {
    let rawFoods = 0;
    let visibleFoods = 0;
    let dataStoreInfo = "CatEatData 不可用";
    try {
      const foods = await getAll("foods");
      rawFoods = Array.isArray(foods) ? foods.length : 0;
    } catch (e) {
      dataStoreInfo = "读 IDB 失败: " + e.message;
    }
    try {
      if (dataStore && typeof dataStore.getFoods === "function") {
        const visible = dataStore.getFoods();
        visibleFoods = Array.isArray(visible) ? visible.length : 0;
        dataStoreInfo = "OK";
      }
    } catch (e) {
      dataStoreInfo = "读 listFoods 失败: " + e.message;
    }
    return safeStringify({
      origin: globalScope.location.origin,
      rawIndexedDbFoods: rawFoods,
      visibleFoodsThroughDataStore: visibleFoods,
      dataStoreStatus: dataStoreInfo,
      hint:
        rawFoods > 0 && visibleFoods === 0
          ? "⚠️ 食物都在 IDB 里，但被 catId filter 掉了 → 点 fix 修复"
          : rawFoods === 0 && visibleFoods === 0
          ? "IDB 也没食物 → 数据真的丢了，或在别的 origin"
          : "数据正常"
    });
  }

  async function actionDbs() {
    if (!globalScope.indexedDB.databases) {
      return "浏览器不支持 indexedDB.databases()，用「读 cat-eat-local 全部」看具体内容";
    }
    const dbs = await globalScope.indexedDB.databases();
    return safeStringify(dbs.map((d) => ({ name: d.name, version: d.version })));
  }

  async function actionAll() {
    try {
      const meta = await getMeta();
      const cats = await getAll("cats");
      const foods = await getAll("foods");
      const results = await getAll("results");
      const assets = await getAll("assets");
      return safeStringify({
        meta,
        counts: { cats: cats.length, foods: foods.length, results: results.length, assets: assets.length },
        cats: cats.map((c) => ({ id: c.id, nickname: c.nickname, ageYears: c.ageYears, photoAssetId: c.photoAssetId })),
        foods: foods.map((f) => ({
          id: f.id,
          catId: f.catId,
          legacyId: f.legacyId,
          brand: f.brand,
          name: f.name,
          createdAt: f.createdAt,
          photoAssetId: f.photoAssetId
        })),
        resultsCount: results.length,
        assetsCount: assets.length
      });
    } catch (e) {
      return "ERR: " + e.message;
    }
  }

  async function actionDrift() {
    try {
      const meta = await getMeta();
      const catMeta = meta.find((m) => m.key === "catId");
      const currentCatId = catMeta && catMeta.value;
      const foods = await getAll("foods");
      const cats = await getAll("cats");
      const lines = [];
      lines.push("meta.catId = " + currentCatId);
      lines.push("foods 总数: " + foods.length);
      lines.push("cats 总数: " + cats.length);
      const foodCatIds = new Set(foods.map((f) => f.catId));
      const catIds = new Set(cats.map((c) => c.id));
      lines.push("foods 涉及 catId: " + safeStringify(Array.from(foodCatIds)));
      lines.push("cats 涉及 catId: " + safeStringify(Array.from(catIds)));
      lines.push("---");
      lines.push("匹配当前 catId 的食物数: " + foods.filter((f) => f.catId === currentCatId).length);
      lines.push("不匹配的食物数: " + foods.filter((f) => f.catId !== currentCatId).length);
      lines.push("---");
      lines.push("每条食物的 catId / brand / name:");
      foods.forEach((f, i) => {
        const mark = f.catId === currentCatId ? "✓" : "✗ DRIFT";
        lines.push((i + 1) + ". [" + mark + "] catId=" + f.catId + " | " + (f.brand || "?") + " / " + (f.name || "?"));
      });
      lines.push("---");
      lines.push("每条 cat 的 id / nickname:");
      cats.forEach((c, i) => {
        const mark = c.id === currentCatId ? "✓ current" : "";
        lines.push((i + 1) + ". " + c.id + " (" + (c.nickname || "") + ") " + mark);
      });
      return lines.join("\n");
    } catch (e) {
      return "ERR: " + e.message;
    }
  }

  async function actionExport() {
    try {
      const meta = await getMeta();
      const cats = await getAll("cats");
      const foods = await getAll("foods");
      const results = await getAll("results");
      const assets = await getAll("assets");
      const dump = {
        _exportedAt: new Date().toISOString(),
        origin: globalScope.location.origin,
        meta,
        cats,
        foods,
        results,
        assets
      };
      const blob = new Blob([safeStringify(dump)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "cat-eat-rescue-" + Date.now() + ".json";
      a.click();
      URL.revokeObjectURL(url);
      return "✅ 下载已触发，文件大小 " + (blob.size / 1024).toFixed(1) + " KB（没看到下载检查浏览器下载设置）";
    } catch (e) {
      return "ERR: " + e.message;
    }
  }

  async function actionFix() {
    if (!globalScope.confirm("这会把所有食物的 catId 改成 meta.catId（修复 §6.1 漂移）。确认吗？")) {
      return "已取消";
    }
    try {
      const meta = await getMeta();
      const catMeta = meta.find((m) => m.key === "catId");
      const currentCatId = catMeta && catMeta.value;
      if (!currentCatId) return "❌ meta 里没有 catId";
      const foods = await getAll("foods");
      const targets = foods.filter((f) => f.catId !== currentCatId);
      if (targets.length === 0) return "没有需要修复的食物（都已匹配当前 catId）";
      await new Promise((resolve, reject) => {
        const req = globalScope.indexedDB.open("cat-eat-local");
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction("foods", "readwrite");
          const store = tx.objectStore("foods");
          targets.forEach((f) => {
            f.catId = currentCatId;
            store.put(f);
          });
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => {
            db.close();
            reject(tx.error);
          };
        };
        req.onerror = () => reject(req.error);
      });
      return "✅ 已修复 " + targets.length + " 条食物的 catId。刷新 H5 页面看效果。";
    } catch (e) {
      return "ERR: " + e.message;
    }
  }

  const routes = {
    ls: actionLs,
    dbs: actionDbs,
    all: actionAll,
    drift: actionDrift,
    export: actionExport,
    fix: actionFix
  };

  globalScope.CatEatDiag = {
    run(action, dataStore) {
      const fn = routes[action];
      if (!fn) return Promise.resolve("未知动作: " + action);
      return fn(dataStore);
    },
    routes
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
