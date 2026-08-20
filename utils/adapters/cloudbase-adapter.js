// utils/adapters/cloudbase-adapter.js
//
// CloudBaseAdapter：把腾讯云开发 CloudBase 适配为 LocalRepository
// 期望的 Collection 抽象。
//
// 数据布局：
//   - 5 个 collection（meta / cats / foods / results / assets），
//     字段名与 IndexedDB Object Store 完全一致（DATA_SCHEMA.md）
//   - CloudBase 系统字段 `_id` 与 `_openid` 由 Adapter 自动注入 / 剥离
//   - 图片资源走 CloudBase 云存储：assets 记录里的 `cloudPath` 字段
//     保存 fileID，`blob` / `path` 字段本地使用时由 AssetRepository
//     缓存。
//
// 不实现实时同步、watchCollection、冲突解决。
// 事务走云函数 aggregate 或 best-effort 逐条写。
//
// 这一层是为 CloudBase 接入的物理实现，与 IndexedDBAdapter /
// WxStorageAdapter 同形。

(function attachCloudBaseAdapter(globalScope) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { createCloudBaseAdapter };
  }
  if (globalScope) {
    globalScope.CatEatCloudBaseAdapter = { createCloudBaseAdapter };
  }
})(typeof globalThis !== "undefined" ? globalThis : this);

function createCloudBaseAdapter({ app, env, storageRoot }) {
  if (!app || typeof app.database !== "function") {
    throw new Error("CloudBaseAdapter requires a CloudBase app instance");
  }
  if (!env) {
    throw new Error("CloudBaseAdapter requires env ID");
  }

  const db = app.database();
  const STORAGE_ROOT = storageRoot || "cat-eat-assets";
  const STORAGE_BATCH = 100; // CloudBase 单次删除 fileList 上限

  // ---- Auth ----
  //
  // 默认匿名登录。`_openid` 由 CloudBase 自动注入到每条记录上，
  // 用于数据隔离。MVP 不实现真正的多用户 / 跨设备身份。

  let _openid = null;

  async function ensureAuth() {
    if (_openid) return _openid;
    const auth = app.auth();
    try {
      // 先看本地是否已有登录态
      const current = await auth.getCurrentUser();
      if (current && current.openId) {
        _openid = current.openId;
        return _openid;
      }
    } catch (error) {
      // ignore
    }
    try {
      const result = await auth.signInAnonymously();
      if (result && result.openId) {
        _openid = result.openId;
        return _openid;
      }
      // signInAnonymously 可能返回 user 对象
      if (result && result.user && result.user.openId) {
        _openid = result.user.openId;
        return _openid;
      }
    } catch (error) {
      // 失败时回退到一个固定的"未登录"标识；后续写会被 CloudBase 拒绝
      _openid = null;
    }
    return _openid;
  }

  function decorate(record) {
    if (!record) return record;
    const copy = { ...record };
    // _id 是 CloudBase 主键；保证与 record.id 一致
    if (record.id) copy._id = String(record.id);
    if (record.key && !record.id) copy._id = String(record.key);
    return copy;
  }

  function undecorate(record) {
    if (!record) return record;
    const copy = { ...record };
    delete copy._id;
    delete copy._openid;
    return copy;
  }

  async function getCollection(name) {
    // 数据隔离：所有读都带 _openid 过滤
    await ensureAuth();
    return db.collection(name);
  }

  async function getScopedQuery(name) {
    await ensureAuth();
    return db.collection(name).where({ _openid: _openid || "" });
  }

  return {
    kind: "cloudbase",
    env,

    async initialize() {
      await ensureAuth();
    },

    async isReady() {
      return _openid !== null;
    },

    async getAuthInfo() {
      return { openid: _openid, env };
    },

    async getAll(storeName) {
      const query = await getScopedQuery(storeName);
      try {
        const { data } = await query.get();
        return (data || []).map(undecorate);
      } catch (error) {
        throw new Error(`CloudBase getAll(${storeName}) failed: ${error.message || error}`);
      }
    },

    async get(storeName, key) {
      const col = await getCollection(storeName);
      try {
        const { data } = await col.doc(String(key)).get();
        if (data && data.length > 0) return undecorate(data[0]);
        return null;
      } catch (error) {
        if (error && (error.code === "DATABASE_DOC_NOT_EXIST" || /not exist/i.test(error.message || ""))) {
          return null;
        }
        throw new Error(`CloudBase get(${storeName}, ${key}) failed: ${error.message || error}`);
      }
    },

    async put(storeName, record) {
      await ensureAuth();
      try {
        const decorated = decorate(record);
        const id = String(record.id || record.key);
        if (!id) {
          throw new Error("Record must have id or key for CloudBase.put");
        }
        await db.collection(storeName).doc(id).set(decorated);
        return record;
      } catch (error) {
        throw new Error(`CloudBase put(${storeName}, ${record.id || record.key}) failed: ${error.message || error}`);
      }
    },

    async bulkPut(storeName, records) {
      if (!Array.isArray(records) || records.length === 0) return;
      // CloudBase 单 doc 写入；批量串行写
      for (const record of records) {
        await this.put(storeName, record);
      }
    },

    async delete(storeName, key) {
      await ensureAuth();
      try {
        await db.collection(storeName).doc(String(key)).remove();
      } catch (error) {
        // doc 不存在视为成功
        if (error && /not exist/i.test(error.message || "")) {
          return;
        }
        throw new Error(`CloudBase delete(${storeName}, ${key}) failed: ${error.message || error}`);
      }
    },

    async clear(storeName) {
      // MVP：不实现真「清空 collection」单调用；走 _openid 过滤后
      // 批量删。生产环境应改成云函数（避免权限扩散）。
      const query = await getScopedQuery(storeName);
      try {
        const { data } = await query.limit(1000).get();
        const ids = (data || []).map((r) => r._id).filter(Boolean);
        for (const id of ids) {
          await db.collection(storeName).doc(id).remove();
        }
      } catch (error) {
        throw new Error(`CloudBase clear(${storeName}) failed: ${error.message || error}`);
      }
    },

    // best-effort 事务：先全量读 → plan 同步写 → 逐条 put/delete。
    // MVP 简化：不做服务端冲突检测。生产环境应走云函数 _runTransaction。
    async runTransaction(storeNames, _mode, plan) {
      const snapshots = {};
      const stores = {};
      for (const name of storeNames) {
        snapshots[name] = await this.getAll(name);
        const working = [...snapshots[name]];
        stores[name] = {
          get: (key) => working.find((r) => String(r.id || r.key) === String(key)) || null,
          getAll: () => [...working],
          put: (rec) => {
            const k = String(rec.id || rec.key);
            const i = working.findIndex((r) => String(r.id || r.key) === k);
            if (i >= 0) working[i] = rec;
            else working.push(rec);
          },
          delete: (key) => {
            const i = working.findIndex((r) => String(r.id || r.key) === String(key));
            if (i >= 0) working.splice(i, 1);
          },
          clear: () => {
            working.length = 0;
          }
        };
      }
      const result = plan(stores);
      // 写回：diff snapshots vs working；删除 / 新增 / 更新
      for (const name of storeNames) {
        const before = new Map(snapshots[name].map((r) => [String(r.id || r.key), r]));
        const after = new Map(stores[name].getAll().map((r) => [String(r.id || r.key), r]));
        const toDelete = [...before.keys()].filter((k) => !after.has(k));
        const toWrite = [...after.values()].filter(
          (r) => !before.has(String(r.id || r.key)) || before.get(String(r.id || r.key)) !== r
        );
        for (const k of toDelete) {
          await this.delete(name, k);
        }
        for (const rec of toWrite) {
          await this.put(name, rec);
        }
      }
      return result;
    },

    // ---- 云存储 ----

    async uploadFile(blob, options = {}) {
      await ensureAuth();
      const { id, ext } = options;
      const filename = `${id || createLocalId()}.${ext || "jpg"}`;
      const cloudPath = `${STORAGE_ROOT}/${_openid}/${filename}`;
      try {
        const result = await app.uploadFile({
          cloudPath,
          fileContent: blob
        });
        return {
          fileID: result.fileID,
          cloudPath
        };
      } catch (error) {
        throw new Error(`CloudBase uploadFile failed: ${error.message || error}`);
      }
    },

    async downloadFile(fileID) {
      try {
        const result = await app.downloadFile({ fileID });
        return result.fileContent;
      } catch (error) {
        throw new Error(`CloudBase downloadFile failed: ${error.message || error}`);
      }
    },

    async deleteFiles(fileIDs) {
      if (!Array.isArray(fileIDs) || fileIDs.length === 0) return;
      // 100 个 / 批
      for (let i = 0; i < fileIDs.length; i += STORAGE_BATCH) {
        const batch = fileIDs.slice(i, i + STORAGE_BATCH);
        try {
          await app.deleteFile({ fileList: batch });
        } catch (error) {
          throw new Error(`CloudBase deleteFiles failed: ${error.message || error}`);
        }
      }
    },

    async getTempFileURLs(fileIDs) {
      if (!Array.isArray(fileIDs) || fileIDs.length === 0) return [];
      try {
        const result = await app.getTempFileURL({ fileList: fileIDs });
        return (result.fileList || []).map((item) => ({
          fileID: item.fileID,
          tempFileURL: item.tempFileURL
        }));
      } catch (error) {
        throw new Error(`CloudBase getTempFileURLs failed: ${error.message || error}`);
      }
    }
  };
}

function createLocalId() {
  return `asset-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
