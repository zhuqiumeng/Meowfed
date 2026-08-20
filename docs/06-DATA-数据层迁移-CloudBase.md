# 数据层迁移到 CloudBase · 实施指南

> 本文档是「数据层第一阶段改造」的延伸：当前 PR 完成了「DataService
> + LocalRepository + IndexedDBAdapter」分层，H5 与小程序均接入同一套
> DataService 业务契约。本文说明：未来需要把数据落到腾讯云开发
> CloudBase 时，应该替换哪些 adapter / repository、哪些代码必须改、
> 哪些不动，并给出可执行的步骤与回滚预案。
>
> 适用范围：`agent/import-h5-app` 分支（v34+ 之后的 H5/PWA + 微信小程序）。
> 撰写日期：2026-08-19。

---

## 0. 当前状态速读

- 业务层：`utils/data-service.js` —— 唯一业务 API 入口，方法与字段
  形状对 H5 / 小程序一致。
- 抽象层：`utils/repos/local-repository.js` + `utils/repos/asset-repository.js`。
- 物理层：
  - `utils/adapters/indexeddb-adapter.js`（H5 主路径）
  - `utils/adapters/wx-storage-adapter.js`（小程序）
  - H5 入口：`utils/data-store.js`（薄壳，挂 `window.CatEatData`，CI 守门）
  - 小程序入口：`utils/store.js`（保持 sync 旧 API，pages/*.js 无需改）
- CI 守门（`tests/h5-ui-contract.test.js:404-416`）：
  - H5 UI 源里不得出现 `localStorage` / `indexedDB` 字面量
  - 仍需 `const dataStore = window.CatEatData`
  - `utils/data-store.js` 仍需含 `DB_NAME = "cat-eat-local"` + 3 个 `createObjectStore` + `migration.localStorageV2`
- 业务字段（v1 schema）：`cats` / `foods` / `results` / `assets` / `meta`，详见 `DATA_SCHEMA.md`。

**关键结论：CloudBase 接入是「换一个 Adapter + 加一个同步层」，不动 DataService 与业务字段。**

---

## 1. CloudBase 接入后会变成什么

### 1.1 目标架构

```
┌──────────────────────────────────────────────────────────┐
│  UI / Page 层                                            │
│  - preview/preview.js (H5)                               │
│  - pages/*.js (小程序)                                    │
└────────────────────┬─────────────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────────────────┐
│  DataService (utils/data-service.js) —— 不动            │
└──┬──────────────┬──────────────┬──────────────┬──────────┘
   │              │              │              │
   ▼              ▼              ▼              ▼
┌────────┐  ┌────────────┐  ┌──────────┐  ┌───────────────┐
│ Local  │  │ Asset      │  │ Sync     │  │ Cloud         │
│ Repo   │  │ Repo       │  │ Repo     │  │ Repo (新)     │
└────┬───┘  └─────┬──────┘  └────┬─────┘  └────┬──────────┘
     │            │              │             │
     ▼            ▼              ▼             ▼
┌──────────────────────────────────────────────────────────┐
│  Adapters                                                │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐          │
│  │ IndexedDB  │  │ WxStorage  │  │ CloudBase  │  ← 新   │
│  │ Adapter    │  │ Adapter    │  │ Adapter    │          │
│  └────────────┘  └────────────┘  └────────────┘          │
└──────────────────────────────────────────────────────────┘
                     │
                     ▼
            ┌────────────────┐
            │ 腾讯云 CloudBase │
            │  - 数据库        │
            │  - 云存储        │
            │  - 云函数        │
            └────────────────┘
```

### 1.2 行为分级

| 模式 | 触发 | 行为 | 适用阶段 |
| --- | --- | --- | --- |
| `local-only`（当前） | 未登录 / 未连接 CloudBase | 只写 IndexedDB / wx storage | 现在 |
| `mirror` | 已登录，离线时仍可用 | 本地写入 + 后台 push；读时优先本地 | CloudBase 第一步 |
| `primary` | 已登录 + 在线 | CloudBase 为主，本地缓存为辅；冲突解决 | CloudBase 第二步 |

本文档聚焦 `mirror` 模式（推荐起点），`primary` 模式是后续工作。

---

## 2. 需要新增的模块

### 2.1 `utils/adapters/cloudbase-adapter.js`（新）

实现 `IndexedDBAdapter` 的同形 `StorageAdapter` 接口，但底层走 CloudBase SDK。

```js
// 伪代码示意
function createCloudBaseAdapter({ app, databaseName, schema, getAuth }) {
  const db = app.database();
  const auth = getAuth();  // 返回当前 user 的 _openid
  
  return {
    kind: "cloudbase",
    
    async initialize() {
      // 检查集合是否存在；不存在则通过云函数创建
      // 数据 schema 写在云端，与本地 IndexedDB schema 保持一致字段
    },
    
    async getAll(collection) {
      // db.collection(collection).where({ catId: auth.catId }).get()
      // 返回数组
    },
    
    async get(collection, key) {
      // db.collection(collection).doc(key).get()
    },
    
    async put(collection, record) {
      // db.collection(collection).doc(record.id).set(record)
    },
    
    async bulkPut(collection, records) {
      // 批量 set；CloudBase 限制单次 1000 条
    },
    
    async delete(collection, key) {
      // db.collection(collection).doc(key).remove()
    },
    
    async clear(collection) {
      // ⚠️ CloudBase 没有「清空 collection」单调用；走云函数批量删
    },
    
    async runTransaction(storeNames, mode, plan) {
      // CloudBase 没有真正事务；走云函数 aggregate 事务（_runTransaction）
      // 或者：用「乐观锁 + 冲突检测」实现 best-effort 事务
    }
  };
}
```

**关键实现要求：**
- **鉴权**：`getAuth()` 在每次调用时返回当前用户 openid；`catId`
  作为数据隔离主键。
- **权限**：CloudBase 控制台要配置「仅创建者可读写」安全规则。
- **限频**：`.get()` 限 50 QPS（默认），需要走云函数 / 缓存。
- **离线**：网络失败时不抛错，返回空数组；上层标记「离线」。

### 2.2 `utils/repos/cloud-repository.js`（新）

把 CloudBase Adapter 包装成 LocalRepository 同形 API，外加「远端」语义：

```js
function createCloudRepository(adapter) {
  return {
    kind: adapter.kind,
    collections: KNOWN_COLLECTIONS.slice(),
    isRemote: true,
    
    // 与 LocalRepository 同形 API，但底层走 CloudBase
    async readAll(collection) { return adapter.getAll(collection); },
    async find(collection, id) { return adapter.get(collection, id); },
    async write(collection, record) { return adapter.put(collection, record); },
    // ... etc
    
    // 新增：「推/拉」语义
    async pushSnapshot(snapshot) { /* 全量或增量推送 */ },
    async pullSince(cursor) { /* 自 cursor 起的变更 */ },
    async watchCollection(collection, callback) { /* 实时监听 */ }
  };
}
```

### 2.3 `utils/repos/sync-repository.js`（新，mirror 模式核心）

把 LocalRepository 与 CloudRepository 组合，给 DataService 暴露「看似
LocalRepository」的接口。**实际是：写本地 + 异步 push 到云；读本地，
本地 miss 时 fallback 到云。**

```js
function createSyncRepository({ local, cloud, conflictPolicy }) {
  return {
    kind: "mirror",
    collections: local.collections,
    
    async readAll(collection) {
      const localData = await local.readAll(collection);
      if (localData.length > 0) return localData;
      // 本地为空：从云拉一次，写入本地
      const remoteData = await cloud.readAll(collection);
      if (remoteData.length > 0) {
        await local.writeMany(collection, remoteData);
      }
      return remoteData;
    },
    
    async write(collection, record) {
      // 1. 写本地
      await local.write(collection, record);
      // 2. 异步 push（失败重试 3 次）
      cloud.write(collection, record).catch(err => {
        // 写本地「outbox」表，下次启动时重传
      });
    },
    
    // ... 其他方法类似
  };
}
```

### 2.4 `utils/repos/outbox.js`（新，离线写缓冲）

在 IndexedDB 中新增 `outbox` collection，存「本地写但云 push 失败的
变更」列表；启动时扫描 outbox 重新 push。

```js
function createOutbox(repo) {
  return {
    async enqueue(collection, record, op) {
      await repo.write("outbox", { id: uuid(), collection, record, op, createdAt: Date.now(), retry: 0 });
    },
    async flush(cloud) {
      const items = await repo.readAll("outbox");
      for (const item of items) {
        try {
          await cloud[item.op](item.collection, item.record);
          await repo.remove("outbox", item.id);
        } catch (e) {
          await repo.write("outbox", { ...item, retry: item.retry + 1 });
        }
      }
    }
  };
}
```

### 2.5 `utils/data-service.js`（小改）

DataService **本身不动**，但构造函数加 `repo.adapter` 探测，让
`status().capabilities` 反映当前是 `local-only` / `mirror` / `primary`：

```js
function detectMode(repo) {
  if (repo.kind === "mirror") return "mirror";
  if (repo.kind === "cloudbase") return "primary";
  return "local-only";
}
```

`status()` 返回里 `mode` 与 `capabilities.cloud` 同步切换。

---

## 3. 需要修改的文件

### 3.1 `utils/data-store.js`（H5 入口）

`buildIndexedDBService()` 之外加一条分支：

```js
async function tryInitialize(context) {
  // 已登录 + CloudBase 已配置 → mirror 模式
  if (isCloudBaseConfigured() && isSignedIn()) {
    const cloudAdapter = createCloudBaseAdapter({...});
    const cloudRepo = createCloudRepository(cloudAdapter);
    const localAdapter = createIndexedDBAdapter({...});
    const localRepo = createLocalRepository(localAdapter);
    const syncRepo = createSyncRepository({ local: localRepo, cloud: cloudRepo, ... });
    const outbox = createOutbox(localRepo);
    
    const service = buildDataService({ repo: syncRepo, assetRepo, ... });
    await service.initialize();
    
    // 启动时 flush outbox
    await outbox.flush(cloudRepo);
    return service;
  }
  
  // 旧的：纯本地 IndexedDB
  // ...
}
```

`status()` 增加 `capabilities.cloud: true` 与 `capabilities.syncMode`。
`legacy-fallback` 路径保留。

### 3.2 `utils/store.js`（小程序入口）

小程序上 CloudBase 通过 `wx.cloud` 调用。store.js 增加：

```js
const cloudApp = isCloudEnabled() ? requireWxCloud() : null;

function buildRepository() {
  if (cloudApp) {
    return createSyncRepository({
      local: createLocalRepository(createWxStorageAdapter({ wx })),
      cloud: createCloudRepository(createCloudBaseAdapter({ app: cloudApp, ... }))
    });
  }
  return createLocalRepository(createWxStorageAdapter({ wx }));
}
```

但因为 `utils/store.js` 当前是**同步** API（pages 没用 await），
mirror 模式下写入必须是 sync（local 写、cloud fire-and-forget）。
读可以保持 sync（来自 local cache）。这一点和 `primary` 模式（云优先）
不同，**mirror 模式兼容当前 sync 入口**。

### 3.3 `tests/` 适配

- `tests/h5-ui-contract.test.js`：CI 守门继续生效，新增
  `assert.doesNotMatch(source, /localStorage|indexedDB/)`，确保 H5 UI
  不直访底层。
- `tests/data-store.test.js`：增加 CloudBase Adapter 的 mock 测试。
- 新增 `tests/cloudbase-adapter.test.js`：用 fake cloudbase 测一遍
  readAll / write / runTransaction。
- 新增 `tests/sync-repository.test.js`：测「本地写 + 异步 push + 失败入 outbox」。

### 3.4 `docs/` 与 ADR

- 新增 `docs/06-DATA-数据层迁移-CloudBase.md`（本文档的归位）。
- 新增 `docs/adr/0001-cloudbase-mirror-mode.md`，明确：
  - 为什么选 mirror 模式作为第一阶段
  - 不做云优先的原因
  - 冲突解决策略（v1 暂用「最新写入获胜」，v2 再做 LWW / CRDT）

---

## 4. 必改的硬性约束

### 4.1 Schema 一致性

CloudBase 数据库的 collection 名 / 字段名必须与 IndexedDB 完全一致：

| Collection | 字段 | 备注 |
| --- | --- | --- |
| `meta` | `key`, `value` | 同 IndexedDB |
| `cats` | `id`, `schemaVersion`, `ownerId`, `nickname`, `ageYears`, `photoAssetId`, `createdAt`, `updatedAt` | 同 |
| `foods` | `id`, `catId`, `schemaVersion`, `brand`, `name`, `specification`, `foodType`, `flavor`, `texture`, `photoAssetId`, `manualStatus`, `manualRetryAfter`, `everQualified`, `createdAt`, `updatedAt`, `legacyId`, `ownerId` | 同 |
| `results` | `id`, `foodId`, `catId`, `schemaVersion`, `outcome`, `assistedBy`, `note`, `createdAt`, `updatedAt`, `legacyId`, `ownerId` | 同 |
| `assets` | `id`, `catId`, `schemaVersion`, `kind`, `mimeType`, `size`, `blob` / `path` / `url`, `createdAt`, `updatedAt`, `ownerId` | blob/path 二选一；H5 写 blob，小程序写 path，CloudBase 写 url |

### 4.2 ID 唯一性

CloudBase 默认使用 `_id` 作为主键。要保持与 IndexedDB 的 `id` 兼容：

- CloudBase Adapter 写数据时**显式设置 `_id = record.id`**。
- 读数据时把 `_id` 映射回 `id`。
- 或者：迁移时把 IndexedDB 的所有 `id` 字段重命名为 `_id`（破坏现有用户数据，不推荐）。

**建议方案**：CloudBase 端把 `id` 当业务主键，自己用 `_id` 作 CloudBase
系统字段；Schema 写时显式 `_id: record.id`。

### 4.3 图片资源

IndexedDB 把图片作为 `Blob` 存在 `assets` collection。CloudBase 没有
Blob 类型，要把图片上传到 CloudBase **云存储**：

- `kind: "food-photo"` / `kind: "cat-avatar"` 的资源，上传后存 `cloudPath: "photos/{id}.jpg"`。
- `assets` 记录里加 `cloudPath` 字段，H5 端读时按 `cloudPath` 走 CDN URL。
- AssetRepository 在 CloudBase 模式下，`putFoodPhoto` 流程：
  1. 把 Blob 上传到云存储，得到 fileID / cloudPath
  2. 写 `assets` 记录（`blob: null, cloudPath: "..."`）
  3. 写 `foods` 记录（`photoAssetId: assetId`）

### 4.4 鉴权与隔离

- CloudBase 端开启「仅创建者可读写」安全规则。
- 每次 `getAuth()` 拿当前用户的 `openid`。
- 数据 `catId` 不直接来自用户；要靠 `meta.catId` 关联到当前用户。
- **新用户注册时**：
  1. CloudBase 端创建空 cat / 空 foods / 空 results。
  2. 本地 IndexedDB 全量 push 到云（首次同步）。
  3. 之后所有写走 mirror 模式。

### 4.5 老用户升级

已存在 IndexedDB 数据的用户第一次连云时：
1. 登录 CloudBase
2. 触发 `pushSnapshot(localSnapshot)`：全量 foods / results / cats / assets 上传
3. 上传完成后 `outbox` 清空
4. 切到 mirror 模式

迁移失败时回退到 local-only，不破坏现有体验。

---

## 5. 实施步骤（推荐顺序）

### Step 1：基础设施（不动业务）
- 新建 CloudBase 项目，开通数据库 + 云存储 + 云函数。
- 配置安全规则：每个 collection 仅 `auth.uid` 可读写。
- 写一个 `cloudfunction-bootstrap/` 云函数，做 `initUser()`：创建空 cats / 初始化 meta。

### Step 2：CloudBase Adapter
- 新建 `utils/adapters/cloudbase-adapter.js`，实现 `StorageAdapter` 接口。
- 用 `wx-server-sdk` 在 Node 测试环境跑 fake cloudbase。
- CI：新增 `tests/cloudbase-adapter.test.js`，断言 getAll / put / delete 行为与 IndexedDB Adapter 等价。

### Step 3：CloudRepository
- 新建 `utils/repos/cloud-repository.js`，提供 LocalRepository 同形 API。
- 在 `data-store.js` 暴露 `setCloudBaseCredentials(...)`，运行时切换。
- 默认不开启 CloudBase（`capabilities.cloud === false`）。

### Step 4：SyncRepository + Outbox
- 新建 `utils/repos/sync-repository.js` + `utils/repos/outbox.js`。
- 把数据写入逻辑改成「写本地 + 入 outbox + 后台 push」。
- 启动时自动 flush outbox。
- CI：mock 网络失败，验证 outbox 积累 + 恢复后自动重传。

### Step 5：登录态
- H5：弹登录页（手机号 / 微信扫码）。
- 小程序：用 `wx.cloud` 默认匿名登录，必要时升级为正式用户。
- 登录成功后 `dataService.status().capabilities.cloud === true`。

### Step 6：首次同步
- 检测到云端 `meta.catId` 与本地不一致 → 弹「合并 / 覆盖」选项（v1 暂用「本地优先」，v2 再做合并）。
- 用户选择后执行全量 push 或 pull。
- 完成后进入稳定的 mirror 模式。

### Step 7：渐进发布
- 灰度：先在开发 / 内测环境跑，监控 CloudBase 配额、错误率。
- 灰度放量：5% → 25% → 100%，每步观察 3-7 天。
- 全量后保留 local-only 兜底：网络 / CloudBase 故障时降级。

---

## 6. 不需要修改的代码

- `utils/data-service.js`（除了 `status().capabilities` 探测）
- `utils/repos/local-repository.js`
- `utils/repos/asset-repository.js`（除了云端图片上传逻辑）
- `utils/rules.js`
- `preview/preview.js`（H5 UI 只调 `dataStore.X()`，DataService 接口不变）
- `pages/*.js`（小程序 UI 只调 `store.X()`，store.js 接口不变）
- `tests/h5-ui-contract.test.js` 的核心断言（4 个字符串守门）
- `tests/rules.test.js`
- `tests/data-store.test.js` 的 IDB 部分

---

## 7. 回滚预案

每个 Step 都允许单独回滚：

- **Step 1-2 回滚**：删除新文件，不影响任何调用方。
- **Step 3 回滚**：`data-store.js` 的 `tryInitialize` 退回到纯 IndexedDB 路径。
- **Step 4 回滚**：去掉 SyncRepository 包装，恢复直接 LocalRepository。
- **Step 5-6 回滚**：保留代码但 `capabilities.cloud === false` 即可。
- **Step 7 回滚**：feature flag 关闭 → 全部用户回 local-only。

每一阶段都必须保留「CloudBase 不可用 → 走 local-only」路径，
不能因 CloudBase 故障破坏离线体验。

---

## 8. 验证矩阵

| 阶段 | CI 守门 | 手动验证 |
| --- | --- | --- |
| Step 1 | `npm test` 54/54 | CloudBase 控制台可见项目 |
| Step 2 | + `tests/cloudbase-adapter.test.js` 6+ 用例 | 在 Node REPL 跑通 SDK 调用 |
| Step 3 | `data-store.test.js` 增加 cloud repo 测试 | `dataStore.status().capabilities.cloud === true` |
| Step 4 | `sync-repository.test.js` 8+ 用例 | 断网 → 写 → 上线 → 数据自动同步 |
| Step 5 | 登录态测试 | 真机扫码登录 |
| Step 6 | 合并场景测试 | 模拟两端都有数据 |
| Step 7 | 灰度监控 | 7 天无异常 → 全量 |

---

## 9. 已知风险

1. **CloudBase 配额**：每用户免费额度 2GB 存储 + 5GB 月流量 + 5 万次读 / 3 万次写每天。猫粮试用类应用大概率不超，但需要监控。
2. **小程序同步**：小程序天然有「前后台切换 / 杀掉重启」节奏，outbox flush 时机要选好（建议 `onShow` + 启动时）。
3. **H5 同步在跨标签页**：IndexedDB 跨标签页一致，CloudBase 通过 `watchCollection` 实时推送；但 v1 暂用「刷新时拉一次」即可。
4. **冲突解决**：mirror 模式下，本地写后云还没同步时，另一端写了同一条记录 → 后写者覆盖前写者。v1 接受这个简化，v2 引入 version 字段做 LWW。
5. **图片数据量**：每张照片可能 100-500KB；单用户 1000 张照片 ≈ 100-500MB。要在客户端压缩 + CloudBase 端用「标准存储」（非低频）以保访问速度。

---

## 10. 后续工作（不在本文档范围）

- 业务字段再决策：是否把 `color / country / quantityBought` 写进 H5 标准 schema（建议单独 ADR）。
- 多端实时同步：引入 CRDT / Yjs。
- 团队 / 共享：多用户养同一只猫，引入「cat.collaborators[]」与权限模型。
- 离线编辑队列优先级：现在 outbox 是 FIFO；未来要按 record 重要性 / 时间排序。

---

## 附录 A · CloudBase 数据集 vs IndexedDB Object Store 对照

| CloudBase collection | IndexedDB Object Store | 备注 |
| --- | --- | --- |
| `meta` | `meta` | keyPath: `key`（不是 `id`） |
| `cats` | `cats` | keyPath: `id` / `_id` |
| `foods` | `foods` | 同上 |
| `results` | `results` | 同上 |
| `assets` | `assets` | 图片走云存储，assets 存 cloudPath |
| `outbox` | （新增 Object Store） | 离线写缓冲 |

---

## 附录 B · 改动文件总览

新增：
- `utils/adapters/cloudbase-adapter.js`
- `utils/repos/cloud-repository.js`
- `utils/repos/sync-repository.js`
- `utils/repos/outbox.js`
- `cloudfunctions/bootstrap/index.js`
- `tests/cloudbase-adapter.test.js`
- `tests/sync-repository.test.js`
- `tests/outbox.test.js`
- `docs/adr/0001-cloudbase-mirror-mode.md`

修改（仅插入分支 / 探测点，不改主路径）：
- `utils/data-service.js`（`status().capabilities` 探测）
- `utils/data-store.js`（`tryInitialize` 增加 cloud 分支）
- `utils/store.js`（`buildRepository` 增加 cloud 分支）
- `utils/repos/asset-repository.js`（云存储上传）
- `tests/h5-ui-contract.test.js`（增加云相关的守门）
- `tests/data-store.test.js`（增加 cloud repo 测试）

不动：
- `utils/data-service.js` 的业务方法体
- `utils/rules.js`
- `utils/repos/local-repository.js`
- `preview/preview.js`
- `pages/**/*.js`
- `tests/rules.test.js`
- `DATA_SCHEMA.md`（如果需要扩展字段再开 ADR）
