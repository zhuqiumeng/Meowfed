// utils/adapters/cloudbase-adapter.js
//
// CloudBaseAdapter：把腾讯云开发 CloudBase 适配为 LocalRepository
// 期望的 Collection 抽象。
//
// 数据布局（v1.1.4 PG 数据层）：
//   - 5 张 PostgreSQL 表（meta / cats / foods / results / assets），
//     字段名与 IndexedDB Object Store 完全一致（DATA_SCHEMA.md）
//   - CloudBase 通过 app.rdb() 走 PostgREST 客户端写云端 PostgreSQL
//   - 真实环境：meowfed-d8gc79bfpabac02b3，PostgreSQL 实例 pgdb-ioy12otz
//   - 表已建，RLS anon_all 策略启用，dev 阶段 anon 可读写
//   - `_openid` 由 CloudBase 控制台 RLS policy 自动注入，SDK 写入不需要
//     显式带 _openid
//   - 图片资源走 CloudBase 云存储：assets 记录里的 `cloud_file_id` 字段
//     保存 fileID，`blob` / `path` 字段本地使用时由 AssetRepository 缓存。
//
// 不实现实时同步、watchCollection、冲突解决。
// 事务走 best-effort 逐条写（PostgREST 本身不支持跨 row 事务）。
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
  if (!app || typeof app.rdb !== "function") {
    throw new Error(
      "CloudBaseAdapter requires CloudBase SDK with app.rdb() (PostgREST) — v1.1.4 PG data layer"
    );
  }
  if (!env) {
    throw new Error("CloudBaseAdapter requires env ID");
  }

  // v1.1.3: CloudBase 存储桶名 = user 在新版 dev 平台 (tcb.cloud.tencent.com/dev)
  // 真创建的真实桶名。控制台旧版 UI 显示 `6d65-...` 是渲染占位，listBuckets
  // API 不返回这个 bucket（SDK 3.x 旧/新路径不一致）——但 upload 走
  // `app.storage.from(BUCKET).upload(name, content)` 实际能通。
  // 注意：换 env 时这里要同步改（user 引 dev/prod env 时改一份即可）。
  const STORAGE_ROOT = storageRoot || "cat-eat-assets-001";
  const STORAGE_BATCH = 100; // CloudBase 单次删除 fileList 上限

  // ---- Auth ----
  //
  // 默认匿名登录。`_openid` 由 CloudBase 控制台 RLS policy 自动注入到
  // 每条记录上，用于数据隔离。MVP 不实现真正的多用户 / 跨设备身份。

  let _openid = null;

  async function ensureAuth() {
    if (_openid) return _openid;
    if (typeof app.auth !== "function") {
      // 某些 SDK 上下文（如 wx-cloud-client-sdk 包装后）没有 auth()
      _openid = `anon-${env}`;
      return _openid;
    }
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
      // v1.1.3: SDK 3.x 实际返回 { user: { id, ... } } / { openId } 两种格式
      if (result && result.openId) {
        _openid = result.openId;
        return _openid;
      }
      if (result && result.user && (result.user.openId || result.user.id)) {
        _openid = result.user.openId || result.user.id;
        return _openid;
      }
    } catch (error) {
      // 失败时回退到一个固定的"未登录"标识；后续写会被 CloudBase 拒绝
      _openid = `anon-${env}`;
    }
    return _openid;
  }

  // ---- PostgREST helpers ----
  //
  // v1.1.4 切换到 app.rdb() PostgREST 客户端。
  // API 风格：
  //   app.rdb().from(table)
  //     .select('*')            -> 读
  //     .insert([{...}])        -> 插入
  //     .upsert([{...}])        -> upsert
  //     .update({...})          -> 批量更新（必须先 filter）
  //     .delete()               -> 批量删除（必须先 filter）
  //     .eq(col, val)           -> 过滤
  //     .match({...})           -> 多列等值过滤
  //     .in(col, [...])         -> IN 过滤
  //     .single()               -> 期待单行（不存在报 PGRST116）
  //     .maybeSingle()          -> 期待单行（不存在返回 null）
  // 返回 { data, error } 结构。error = null 表示成功。

  function rdb() {
    // v1.1.4: 必须传 database: 'public'。PostgREST 走 Accept-Profile / Content-Profile header
    // 指定 schema。不传时 SDK 默认把 envId 当 schema 名,会全部报 PGRST106 Invalid schema。
    return app.rdb({ database: "public" });
  }

  function undecorate(row) {
    if (!row) return row;
    const copy = { ...row };
    // RLS 自动注入的字段不暴露给上层
    delete copy._openid;
    delete copy.owner_id_filter; // 可能的 RLS 内部字段
    // v1.1.4-fix: PG 列名是 snake_case,转回 camelCase 给上层(保持 IDB 契约)
    return snakeToCamelKeys(copy);
  }

  // v1.1.4-fix: IDB 字段名是 camelCase,PG 列名是 snake_case
  // 通用双向转换(只改一层 key,JSONB 内的 nested object 不动)
  function camelToSnakeKeys(obj) {
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return obj;
    const out = {};
    for (const k of Object.keys(obj)) {
      const snake = k.replace(/([A-Z])/g, (m) => "_" + m.toLowerCase());
      out[snake] = obj[k];
    }
    return out;
  }
  function snakeToCamelKeys(obj) {
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return obj;
    const out = {};
    for (const k of Object.keys(obj)) {
      const camel = k.replace(/_([a-z])/g, (m, c) => c.toUpperCase());
      out[camel] = obj[k];
    }
    return out;
  }

  function isNotFoundError(error) {
    if (!error) return false;
    // PostgREST: PGRST116 = "Results contain 0 rows" (single/maybeSingle with no match)
    if (error.code === "PGRST116") return true;
    if (error.code && /PGRST/i.test(error.code)) return true;
    if (error.message && /not exist|0 rows|not found/i.test(error.message)) return true;
    return false;
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
      try {
        const { data, error } = await rdb()
          .from(storeName)
          .select("*");
        if (error) {
          // 表不存在视为空集合（dev 阶段可能还没建好）
          if (error.code && /PGRST205|not.*found/i.test(error.message || "")) {
            return [];
          }
          throw error;
        }
        return (data || []).map(undecorate);
      } catch (error) {
        if (error && /PGRST205|not.*found/i.test(error.message || "")) {
          return [];
        }
        throw new Error(`CloudBase getAll(${storeName}) failed: ${error.message || error}`);
      }
    },

    async get(storeName, key) {
      try {
        const idCol = storeName === "meta" ? "key" : "id";
        const { data, error } = await rdb()
          .from(storeName)
          .select("*")
          .eq(idCol, String(key))
          .maybeSingle();
        if (error) {
          if (isNotFoundError(error)) return null;
          throw error;
        }
        return data ? undecorate(data) : null;
      } catch (error) {
        if (isNotFoundError(error)) return null;
        throw new Error(`CloudBase get(${storeName}, ${key}) failed: ${error.message || error}`);
      }
    },

    async put(storeName, record) {
      await ensureAuth();
      try {
        // v1.1.4: 不要显式带 _id / _openid。PostgREST 表的主键是业务 id（meta.key 或 uuid id）。
        // RLS 会自动注入 _openid 字段（如果 policy 这么配的话）。
        const idCol = storeName === "meta" ? "key" : "id";
        if (record[idCol] == null && record.id == null && record.key == null) {
          throw new Error("Record must have id or key for CloudBase.put");
        }
        // v1.1.4-fix: IDB 字段 camelCase → PG 列 snake_case;schemaVersion strip
        const row = camelToSnakeKeys({ ...record });
        delete row._id;
        delete row._openid;
        delete row.schema_version;
        const { error } = await rdb().from(storeName).upsert([row]);
        if (error) throw error;
        return record;
      } catch (error) {
        throw new Error(`CloudBase put(${storeName}, ${record.id || record.key}) failed: ${error.message || error}`);
      }
    },

    async bulkPut(storeName, records) {
      if (!Array.isArray(records) || records.length === 0) return;
      // PostgREST 支持批量 insert/upsert；一次写一批
      const rows = records.map((r) => {
        // v1.1.4-fix: IDB 字段 camelCase → PG 列 snake_case(对 meta 表先做 value 包封再转)
        let copy = camelToSnakeKeys({ ...r });
        delete copy._id;
        delete copy._openid;
        // v1.1.4-fix: schemaVersion 是 IDB 内部元数据,PG 表没这列,strip
        delete copy.schema_version;
        // v1.1.4-fix: IDB 时间戳是 Unix ms (number),PG 是 TIMESTAMPTZ → ISO string
        for (const k of ["created_at", "updated_at", "manual_retry_after", "completed_at"]) {
          if (typeof copy[k] === "number" && copy[k] > 0) {
            copy[k] = new Date(copy[k]).toISOString();
          }
        }
        // v1.1.4-fix: owner_id 是 NOT NULL,IDB 没填时默认 "anonymous"
        if (copy.owner_id == null && storeName !== "meta") {
          copy.owner_id = "anonymous";
        }
        // v1.1.4-fix: meta 表 PG schema 只有 key + value 两列;旧 IDB 里的迁移记录
        // 仍可能带 status/source/completedAt 等扁平字段 — 全部塞进 value JSONB
        if (storeName === "meta") {
          const key = copy.key;
          let value = copy.value;
          if (value == null) {
            // 旧记录(扁平字段)塞进 value
            value = { ...copy };
            delete value.key;
          }
          return { key, value };
        }
        return copy;
      });
      try {
        const { error } = await rdb().from(storeName).upsert(rows);
        if (error) throw error;
      } catch (error) {
        throw new Error(`CloudBase bulkPut(${storeName}) failed: ${error.message || error}`);
      }
    },

    async delete(storeName, key) {
      await ensureAuth();
      try {
        const idCol = storeName === "meta" ? "key" : "id";
        const { error } = await rdb()
          .from(storeName)
          .delete()
          .eq(idCol, String(key));
        if (error && !isNotFoundError(error)) throw error;
      } catch (error) {
        if (isNotFoundError(error)) return;
        throw new Error(`CloudBase delete(${storeName}, ${key}) failed: ${error.message || error}`);
      }
    },

    async clear(storeName) {
      // MVP：不实现真「清空 collection」单调用；先 list 再逐条 delete。
      // 生产环境应改成云函数（避免权限扩散）。
      // v1.1.4-fix: 5 张表 schema 不统一(meta 是 key 主键无 id,其他 4 张是 id 主键),
      // 按 storeName 选列;同时 catch 住"列不存在"错误回退另一种尝试
      const tryCols = storeName === "meta" ? ["key", "id"] : ["id", "key"];
      let rows = [];
      for (const cols of tryCols) {
        try {
          const { data, error: listError } = await rdb()
            .from(storeName)
            .select(cols);
          if (listError) {
            if (listError.code && /PGRST205|not.*found/i.test(listError.message || "")) {
              return;
            }
            // 列不存在错误,回退到下一个 tryCols
            if (/does not exist/i.test(listError.message || "")) continue;
            throw listError;
          }
          rows = data || [];
          break;
        } catch (e) {
          if (/does not exist/i.test(e.message || "")) continue;
          throw e;
        }
      }
      for (const row of rows) {
        const k = row.id != null ? row.id : row.key;
        if (k != null) {
          await this.delete(storeName, k);
        }
      }
    },

    // best-effort 事务：先全量读 → plan 同步写 → 批量 put/delete。
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
        if (toWrite.length > 0) {
          await this.bulkPut(name, toWrite);
        }
      }
      return result;
    },

    // ---- 云存储 ----

    async uploadFile(blob, options = {}) {
      await ensureAuth();
      const { id, ext } = options;
      const filename = `${id || createLocalId()}.${ext || "jpg"}`;
      // v1.1.3: 用 storage.from(BUCKET).upload(name, content) 走新 SDK 路径；
      // 这是唯一能在 storage bucket 实际存在但 listBuckets 返回空的情况下通的方式。
      const cloudPath = `${STORAGE_ROOT}/${_openid}/${filename}`;
      try {
        const bucket = app.storage.from(STORAGE_ROOT);
        const result = await bucket.upload(filename, blob);
        // SDK 3.x 返回 { data: { id, path, fullPath } }；mock 返回 { fileID }。
        // fileID 跟 cloudPath 一致：`cloud://{BUCKET}/{cloudPath}`，
        // downloadFile 时从这个 fileID 反解 path 再调 SDK downloadFile。
        let fileID;
        if (result && result.fileID) {
          fileID = result.fileID;
        } else if (result && result.data && result.data.fullPath) {
          fileID = `cloud://${STORAGE_ROOT}/${result.data.fullPath}`;
        } else {
          fileID = `cloud://${STORAGE_ROOT}/${cloudPath}`;
        }
        return { fileID, cloudPath };
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
