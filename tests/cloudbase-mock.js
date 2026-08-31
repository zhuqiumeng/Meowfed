// tests/cloudbase-mock.js
//
// 用于测试的 CloudBase SDK mock。提供和真实 SDK 同形 API 的最小实现：
//   - v1.1.4 主路径: app.rdb() PostgREST 客户端
//     .from(table).select('*').eq('id', val).maybeSingle() / .single()
//     .insert([...]) / .upsert([...]) / .update({...}) / .delete()
//   - 旧路径: database() / auth() / uploadFile() / downloadFile() /
//     deleteFile() / getTempFileURL()
//   - 数据存在内存中，跨 collection 隔离
//   - 每次启动可注入 openid 模拟已登录

// ============================================================================
// v1.1.4: PostgREST 风格 rdb() 客户端
// ============================================================================

class MockRdbQuery {
  constructor(store) {
    this.store = store; // MockRdbStore
    this.table = null;
    this.mode = null; // 'select' | 'insert' | 'upsert' | 'update' | 'delete'
    this.payload = null; // insert/upsert/update 的数据
    this.filters = []; // [{type:'eq',col,val}, {type:'in',col,vals}, {type:'match',obj}]
    this._limit = null;
    this._terminal = null; // 'single' | 'maybeSingle' | null
  }

  from(table) {
    this.table = table;
    return this;
  }

  select(_cols = "*") {
    this.mode = "select";
    return this;
  }

  insert(rows) {
    this.mode = "insert";
    this.payload = Array.isArray(rows) ? rows : [rows];
    return this;
  }

  upsert(rows) {
    this.mode = "upsert";
    this.payload = Array.isArray(rows) ? rows : [rows];
    return this;
  }

  update(patch) {
    this.mode = "update";
    this.payload = patch;
    return this;
  }

  delete() {
    this.mode = "delete";
    return this;
  }

  eq(col, val) {
    this.filters.push({ type: "eq", col, val });
    return this;
  }

  match(obj) {
    for (const [col, val] of Object.entries(obj || {})) {
      this.filters.push({ type: "eq", col, val });
    }
    return this;
  }

  in(col, vals) {
    this.filters.push({ type: "in", col, vals: Array.isArray(vals) ? vals : [vals] });
    return this;
  }

  limit(n) {
    this._limit = n;
    return this;
  }

  single() {
    this._terminal = "single";
    return this._exec();
  }

  maybeSingle() {
    this._terminal = "maybeSingle";
    return this._exec();
  }

  // 不带 terminal 的 await -> 数组
  then(resolve, reject) {
    return this._exec().then(resolve, reject);
  }

  catch(reject) {
    return this._exec().catch(reject);
  }

  async _exec() {
    const store = this.store;
    const table = this.table;
    if (!table) {
      return { data: null, error: { code: "PGRST001", message: "from() not called" } };
    }
    const rows = store.list(table);

    if (this.mode === "select" || this.mode == null) {
      const matched = rows.filter((r) => applyFilters(r, this.filters));
      const limited = typeof this._limit === "number" ? matched.slice(0, this._limit) : matched;
      if (this._terminal === "single" || this._terminal === "maybeSingle") {
        if (limited.length === 0) {
          if (this._terminal === "single") {
            return { data: null, error: { code: "PGRST116", message: "Results contain 0 rows" } };
          }
          return { data: null, error: null };
        }
        if (limited.length > 1 && this._terminal === "single") {
          return {
            data: null,
            error: { code: "PGRST116", message: "Results contain more than 1 rows" }
          };
        }
        return { data: limited[0], error: null };
      }
      return { data: limited, error: null };
    }

    if (this.mode === "insert") {
      const inserted = [];
      for (const row of this.payload) {
        const id = row.id != null ? String(row.id) : row.key != null ? String(row.key) : null;
        if (id) {
          if (store.has(table, idCol(row), id)) {
            return { data: null, error: { code: "PGRST409", message: `duplicate key: ${id}` } };
          }
        }
        const stored = store.put(table, row);
        inserted.push(stored);
      }
      return { data: inserted, error: null };
    }

    if (this.mode === "upsert") {
      const upserted = [];
      for (const row of this.payload) {
        const stored = store.put(table, row);
        upserted.push(stored);
      }
      return { data: upserted, error: null };
    }

    if (this.mode === "update") {
      const matched = rows.filter((r) => applyFilters(r, this.filters));
      for (const row of matched) {
        store.patch(table, idOf(row), this.payload);
      }
      return { data: matched.map((r) => store.get(table, idOf(r))).filter(Boolean), error: null };
    }

    if (this.mode === "delete") {
      const matched = rows.filter((r) => applyFilters(r, this.filters));
      for (const row of matched) {
        store.remove(table, idOf(row), idCol(row));
      }
      return { data: null, error: null };
    }

    return { data: null, error: { code: "PGRST001", message: `unknown mode: ${this.mode}` } };
  }
}

function idCol(row) {
  if (row && row.id != null) return "id";
  if (row && row.key != null) return "key";
  return "id";
}

function idOf(row) {
  if (!row) return null;
  return row.id != null ? String(row.id) : row.key != null ? String(row.key) : null;
}

function applyFilters(row, filters) {
  for (const f of filters) {
    if (f.type === "eq") {
      if (String(row[f.col]) !== String(f.val)) return false;
    } else if (f.type === "in") {
      const set = new Set((f.vals || []).map(String));
      if (!set.has(String(row[f.col]))) return false;
    }
  }
  return true;
}

class MockRdbStore {
  constructor() {
    // table -> Map(idCol_value -> row)
    this.tables = new Map();
  }
  _bucket(table) {
    if (!this.tables.has(table)) this.tables.set(table, new Map());
    return this.tables.get(table);
  }
  list(table) {
    return Array.from(this._bucket(table).values());
  }
  has(table, idCol, id) {
    return this._bucket(table).has(`${idCol}:${id}`);
  }
  get(table, id) {
    return this._bucket(table).get(`id:${id}`) || this._bucket(table).get(`key:${id}`) || null;
  }
  put(table, row) {
    const id = idOf(row);
    if (!id) return row;
    const col = idCol(row);
    this._bucket(table).set(`${col}:${id}`, { ...row });
    return this._bucket(table).get(`${col}:${id}`);
  }
  patch(table, id, patch) {
    if (!id) return;
    const realId = id.split(":").pop();
    // 尝试两个 col 都能找到
    for (const col of ["id", "key"]) {
      const existing = this._bucket(table).get(`${col}:${realId}`);
      if (existing) {
        const updated = { ...existing, ...patch };
        this._bucket(table).set(`${col}:${realId}`, updated);
        return;
      }
    }
  }
  remove(table, id, col) {
    if (!id) return;
    const realCol = col || "id";
    this._bucket(table).delete(`${realCol}:${id}`);
  }
  clear() {
    this.tables.clear();
  }
}

class MockRdb {
  constructor(store) {
    this.store = store;
  }
  from(table) {
    const q = new MockRdbQuery(this.store);
    return q.from(table);
  }
  rpc(fnName, _args) {
    // mock 不支持 PG function DDL
    return Promise.resolve({
      data: null,
      error: {
        code: "EXCEED_AUTHORITY",
        message: `Request exceeds granted authority (mock: rpc(${fnName}) disabled)`
      }
    });
  }
}

// ============================================================================
// 旧路径: database() + auth() + storage() (向后兼容)
// ============================================================================

class MockQuery {
  constructor(collection) {
    this.collection = collection;
    this.filters = {};
  }
  where(filters) {
    const next = new MockQuery(this.collection);
    next.filters = { ...this.filters, ...filters };
    return next;
  }
  limit(n) {
    this._limit = n;
    return this;
  }
  async get() {
    const records = this.collection.list().filter((r) => matchFilters(r, this.filters));
    const limited = typeof this._limit === "number" ? records.slice(0, this._limit) : records;
    return { data: limited };
  }
  async update(patch) {
    const records = this.collection.list().filter((r) => matchFilters(r, this.filters));
    for (const record of records) {
      this.collection.upsert({ ...record, ...patch });
    }
    return { updated: records.length };
  }
  async remove() {
    const records = this.collection.list().filter((r) => matchFilters(r, this.filters));
    for (const record of records) {
      this.collection.remove(record._id);
    }
    return { deleted: records.length };
  }
}

class MockDocRef {
  constructor(collection, id, openId) {
    this.collection = collection;
    this.id = String(id);
    this.openId = openId;
  }
  async get() {
    const record = this.collection.find(this.id);
    if (!record) {
      const err = new Error(`document not exist: ${this.id}`);
      err.code = "DATABASE_DOC_NOT_EXIST";
      throw err;
    }
    return { data: [record] };
  }
  async set(data) {
    const record = { ...data, _id: this.id, _openid: this.openId || data._openid || null };
    this.collection.upsert(record);
    return { updated: 1, _id: this.id };
  }
  async remove() {
    this.collection.remove(this.id);
    return { deleted: 1 };
  }
  async update(patch) {
    const existing = this.collection.find(this.id);
    if (!existing) {
      const err = new Error(`document not exist: ${this.id}`);
      err.code = "DATABASE_DOC_NOT_EXIST";
      throw err;
    }
    this.collection.upsert({ ...existing, ...patch, _openid: this.openId || existing._openid });
    return { updated: 1 };
  }
}

class MockCollection {
  constructor(name, store, app) {
    this.name = name;
    this.store = store;
    this.app = app;
  }
  list() {
    return Array.from(this.store.values());
  }
  find(id) {
    return this.store.get(String(id)) || null;
  }
  upsert(record) {
    this.store.set(String(record._id), { ...record });
  }
  remove(id) {
    this.store.delete(String(id));
  }
  where(filters) {
    return new MockQuery(this).where(filters);
  }
  doc(id) {
    return new MockDocRef(this, id, this.app ? this.app._currentUser && this.app._currentUser.openId : null);
  }
}

class MockDatabase {
  constructor(app) {
    this.app = app;
    this.collections = new Map();
  }
  collection(name) {
    if (!this.collections.has(name)) {
      this.collections.set(name, new MockCollection(name, new Map(), this.app));
    }
    return this.collections.get(name);
  }
  // 调试用
  _all() {
    const out = {};
    for (const [name, col] of this.collections.entries()) {
      out[name] = col.list();
    }
    return out;
  }
}

class MockAuth {
  constructor(app) {
    this.app = app;
  }
  async getCurrentUser() {
    return this.app._currentUser;
  }
  async signInAnonymously() {
    // 与真实 SDK 行为对齐：返回 { user: { openId, ... } }
    if (!this.app._currentUser) {
      this.app._currentUser = {
        openId: this.app._nextOpenId(),
        isAnonymous: true
      };
    }
    return { user: this.app._currentUser, openId: this.app._currentUser.openId };
  }
  async signOut() {
    this.app._currentUser = null;
  }
}

class MockStorage {
  constructor(app) {
    this.app = app;
    this.files = new Map(); // cloudPath -> { content, fileID }
    this._idCounter = 0;
  }
  // v1.1.3: 与真实 SDK 3.x 对齐——app.storage.from(bucket) 返回 Bucket 实例
  from(bucketId) {
    this._currentBucket = bucketId;
    return this;
  }
  _nextFileID() {
    this._idCounter += 1;
    return `cloud://mock-bucket/${this.app._currentUser ? this.app._currentUser.openId : "anon"}/file-${this._idCounter}`;
  }
  // v1.1.3: 内部实现；外部同时支持两种调用形式：
  //  - 旧 app.uploadFile({ cloudPath, fileContent })
  //  - 新 app.storage.from(bucket).upload(name, content) ← 适配器用这条路径
  async _doUpload(cloudPath, fileContent) {
    const openid = this.app._currentUser ? this.app._currentUser.openId : "anon";
    const bucket = this._currentBucket || "mock-bucket";
    // 适配器传进来的是 "cat-eat-assets-001/openid-xxx/filename.ext" 这种带 bucket 前缀的 path
    // mock 直接用 cloudPath 当 storage key
    const finalPath = cloudPath;
    const fileID = `cloud://${bucket}/${cloudPath}`;
    this.files.set(finalPath, { content: fileContent, fileID });
    this.files.set(fileID, { content: fileContent, cloudPath: finalPath });
    return { fileID, requestId: `req-${Date.now()}` };
  }
  async uploadFile(arg1, arg2) {
    if (arg1 && typeof arg1 === "object" && "cloudPath" in arg1) {
      return this._doUpload(arg1.cloudPath, arg1.fileContent);
    }
    return this._doUpload(arg1, arg2);
  }
  // v1.1.3: storage.from(bucket).upload(name, content) 走这条
  async upload(name, content) {
    return this._doUpload(name, content);
  }
  async downloadFile({ fileID }) {
    const entry = this.files.get(fileID);
    if (!entry) {
      const err = new Error(`file not found: ${fileID}`);
      err.code = "STORAGE_FILE_NOT_EXIST";
      throw err;
    }
    return { fileContent: entry.content };
  }
  async deleteFile({ fileList }) {
    const result = { fileList: [] };
    for (const fileID of fileList) {
      const entry = this.files.get(fileID);
      if (entry) {
        this.files.delete(fileID);
        if (entry.cloudPath) this.files.delete(entry.cloudPath);
        result.fileList.push({ fileID, code: "SUCCESS" });
      } else {
        result.fileList.push({ fileID, code: "FILE_NOT_EXISTS" });
      }
    }
    return result;
  }
  async getTempFileURL({ fileList }) {
    const result = { fileList: [] };
    for (const fileID of fileList) {
      result.fileList.push({
        fileID,
        tempFileURL: `https://mock-temp.example/${fileID}`,
        maxAge: 7200
      });
    }
    return result;
  }
}

class MockCloudBaseApp {
  constructor(options = {}) {
    this.env = options.env || "mock-env";
    this._currentUser = null;
    this._openidCounter = 0;
    this._collections = new Map();
    this._database = new MockDatabase(this);
    this._auth = new MockAuth(this);
    this._storage = new MockStorage(this);
    this._rdbStore = new MockRdbStore();
    this._rdb = new MockRdb(this._rdbStore);
    if (options.preauthOpenId) {
      this._currentUser = { openId: options.preauthOpenId, isAnonymous: true };
    }
  }
  _nextOpenId() {
    this._openidCounter += 1;
    return `openid-${this.env}-${this._openidCounter}`;
  }
  database() {
    return this._database;
  }
  auth() {
    return this._auth;
  }
  // v1.1.4: PostgREST 客户端
  rdb() {
    return this._rdb;
  }
  uploadFile(params) {
    return this._storage.uploadFile(params);
  }
  downloadFile(params) {
    return this._storage.downloadFile(params);
  }
  deleteFile(params) {
    return this._storage.deleteFile(params);
  }
  getTempFileURL(params) {
    return this._storage.getTempFileURL(params);
  }
  // v1.1.3: 与真实 SDK 3.x 对齐——app.storage 暴露 storage 实例（带 .from/.listBuckets 等）
  get storage() {
    return this._storage;
  }
  // 调试
  _dump() {
    return this._database._all();
  }
  // v1.1.4: dump rdb 数据（PostgreSQL 表）
  _rdbDump() {
    const out = {};
    for (const [table, bucket] of this._rdbStore.tables.entries()) {
      out[table] = Array.from(bucket.values());
    }
    return out;
  }
}

function matchFilters(record, filters) {
  for (const [k, v] of Object.entries(filters)) {
    if (record[k] !== v) return false;
  }
  return true;
}

function createMockCloudBase(options = {}) {
  // 模仿 cloudbase.init({ env })
  // 同 env 共享同一 app 实例（让 storeA / storeB 看到同一份云端数据）
  const cache = new Map();
  return {
    init: (config) => {
      const env = (config && config.env) || options.env || "mock-env";
      if (!cache.has(env)) {
        cache.set(env, new MockCloudBaseApp({ ...config, ...options }));
      }
      return cache.get(env);
    }
  };
}

module.exports = {
  createMockCloudBase,
  MockCloudBaseApp,
  MockDatabase,
  MockCollection,
  MockQuery,
  MockDocRef,
  MockRdb,
  MockRdbQuery,
  MockRdbStore
};
