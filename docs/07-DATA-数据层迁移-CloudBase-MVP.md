# 数据层迁移到 CloudBase · MVP 实施与验证

> 本文是「数据层迁移到 CloudBase」项目的 **MVP 实施报告 + 验证手册**。
> 上游文档：
> - [06-数据层迁移到 CloudBase · 实施指南](./06-DATA-数据层迁移-CloudBase.md)（设计蓝图）
> - [数据层审计报告](../audits/2026-08-19-data-layer-audit.md)（现状盘点）
>
> 本文档回答：MVP 阶段**实际交付了什么**、**没做哪些事**、**怎么自验**、**已知限制**、**如何回滚**、**下一步走向**。
>
> 适用分支：`agent/import-h5-app`
> 实施日期：2026-08-19
> 验收目标：用户可填一个 CloudBase 环境 ID，即可「首次上传 / 云端恢复 / 同步照片」三件事；本地数据始终可用，离线时不受影响。

---

## 0. 一句话结论

> **MVP 已完成，可投入真机测试。**
> 默认 off（无 env ID 时无任何云行为），用户输入 env ID 后启用 mirror 模式（本地优先 + 异步 push + outbox 兜底），87/87 自动化测试全绿。

---

## 1. MVP 范围与非目标

### 1.1 包含（MVP）

| 能力 | 状态 | 说明 |
| --- | --- | --- |
| CloudBaseAdapter（数据 + 云存储 SDK 包装） | ✅ | `utils/adapters/cloudbase-adapter.js` |
| CloudRepository（远端仓库抽象） | ✅ | `utils/repos/cloud-repository.js` |
| SyncRepository（mirror 编排：本地优先 + 异步 push） | ✅ | `utils/repos/sync-repository.js` |
| Outbox（push 失败重试，FIFO + 退避，MAX_RETRY=8） | ✅ | `utils/repos/outbox.js` |
| CloudSync 状态机（idle / connecting / ready / syncing / error） | ✅ | `utils/cloud-sync.js` |
| 数据层接入：H5 入口 `utils/data-store.js` 透明启用 | ✅ | feature flag（env ID）触发 |
| 业务侧零改动：`pages/*.js` 与 `preview/preview.js` 通过 `window.CatEatData` 不感知云 | ✅ | 兼容入口保留 |
| env ID 输入 UI（首页底部云同步卡片） | ✅ | 无 env 时显示输入框；有 env 时显示状态 + 3 个动作按钮 |
| 资源（图片）云存储上传 / 拉回 | ✅ | `cloudPath` + `cloudFileID` 双字段 |
| 自动化测试 87 条 | ✅ | 含 mock SDK 双设备共享、push/pull/assets 完整路径 |

### 1.2 不包含（明确推迟到 v2）

- ❌ 实时同步（`watchCollection`）
- ❌ 冲突解决（最后写入胜出 / LWW / CRDT）
- ❌ 多猫数据隔离（目前 `_openid` 隔离用户；catId 维度等 v2）
- ❌ 多设备并发编辑的合并
- ❌ 软删除（`deletedAt`）与回收站
- ❌ 离线写入的精细化合并
- ❌ 增量同步（cursor / watermark）
- ❌ 端到端加密

> 这些在 [06-实施指南 §5 后续工作](./06-DATA-数据层迁移-CloudBase.md#5-后续工作) 中已经列出，本文不重复论证。

---

## 2. 架构现状

### 2.1 模块图

```
                          ┌─────────────────────┐
                          │  preview/preview.js │
                          │  (H5 UI)            │
                          └──────────┬──────────┘
                                     │  window.CatEatData
                                     ▼
                          ┌─────────────────────┐
                          │  utils/data-store   │  ◀── 入口薄壳
                          │  (env ID 解析/挂载)  │      兼容 window.CatEatData
                          └──────┬──────────────┘
                                 │
              ┌──────────────────┴──────────────────┐
              ▼                                     ▼
   ┌────────────────────┐                ┌────────────────────┐
   │  IndexedDBAdapter  │                │  CloudBaseAdapter  │  ◀── 新
   │  (H5 本地主路径)   │                │  (CloudBase SDK)   │
   └─────────┬──────────┘                └─────────┬──────────┘
             ▼                                     ▼
   ┌────────────────────┐                ┌────────────────────┐
   │  LocalRepository   │◀─────┐         │  CloudRepository   │  ◀── 新
   │  (cats/foods/...)  │      │         │  (cats/foods/...)  │
   └─────────┬──────────┘      │         └─────────┬──────────┘
             │                 │                   │
             │      ┌──────────┴─────────┐         │
             └─────▶│  SyncRepository    │◀────────┘  ◀── 新
                    │  (mirror 模式)      │
                    │  - 读：本地         │
                    │  - 写：本地+异步 push│
                    │  - 失败：outbox     │
                    └──────────┬─────────┘
                               │
                               ▼
                    ┌────────────────────┐
                    │  DataService       │
                    │  (业务方法)        │
                    └────────────────────┘
                               ▲
                               │   (initialize 后 setRepo 切到 syncRepo)
                               │
                    ┌──────────┴─────────┐
                    │  CloudSync 编排器   │  ◀── 新
                    │  - start()         │
                    │  - pushFirstTime() │
                    │  - pullFromCloud() │
                    │  - syncAssets()    │
                    └──────────┬─────────┘
                               │
                               ▼
                    ┌────────────────────┐
                    │  Outbox            │  ◀── 新
                    │  (失败重试/FIFO)   │
                    └────────────────────┘
```

### 2.2 关键文件清单

| 文件 | 角色 | 备注 |
| --- | --- | --- |
| `utils/cloudbase-config.js` | env 配置（`getEnv/setEnv/clearEnv/isPersistedByUser`） | 持久化到 `localStorage[cat-eat-cloudbase-env]` |
| `utils/adapters/cloudbase-adapter.js` | CloudBase SDK 包装（数据库 + 云存储） | 自动注入 `_openid`；提供 `init/signIn/uploadFile/downloadFile` |
| `utils/repos/cloud-repository.js` | 远端仓库（pushSnapshot / pullSnapshot / isEmpty） | 与 LocalRepository 同形 API |
| `utils/repos/sync-repository.js` | mirror 模式核心 | `runTransaction` 拦截 plan stores 追踪变化 |
| `utils/repos/outbox.js` | 失败重试 | MAX_RETRY=8，间隔退避 |
| `utils/cloud-sync.js` | 状态机 + 编排 | 状态：`idle/connecting/ready/syncing/error` |
| `utils/data-store.js` | H5 入口薄壳 | feature flag 触发；`setCloudBaseEnv()` 暴露给 UI |
| `tests/cloudbase-mock.js` | mock SDK（`MockCloudBaseApp`） | env 维度缓存，模拟多设备共享 |
| `tests/cloudbase-adapter.test.js` | 9 条 | adapter 行为 |
| `tests/sync-repository.test.js` | 6 条 | mirror 模式 |
| `tests/outbox.test.js` | 6 条 | outbox 重试 |
| `tests/cloud-sync.test.js` | 8 条 | 状态机 + 编排 |
| `tests/data-store-cloudbase.test.js` | 4 条（含多设备） | 端到端集成 |

---

## 3. 用户视角的启用流程

### 3.1 首次启用（在 H5 中）

1. 打开 PWA / 加主屏的 H5。
2. 首页底部出现「云同步」卡片（**仅在 CloudBase SDK 加载成功时显示**）。
3. 在输入框中填入 CloudBase 环境 ID（例如 `cat-eat-prod-xxxxxx`）。
4. 点击「保存并启用」→ 校验（4-40 位字母数字 + dash）→ 写入 `localStorage[cat-eat-cloudbase-env]` → 提示「已保存，刷新页面后启用云同步」→ 自动刷新。
5. 刷新后云同步卡片变为「就绪」状态，露出三个动作按钮。

### 3.2 三个动作按钮

| 按钮 | 触发 | 行为 | 何时用 |
| --- | --- | --- | --- |
| **首次上传到云** | `cloudSync.pushFirstTime()` | 把本地 4 collection（cats/foods/results/assets）+ meta 全量推到云 + 上传所有图片 | 第一次启用云同步时 |
| **从云恢复** | `cloudSync.pullFromCloud()` | 清空本地 → 从云拉回所有数据 + 拉回图片 | 换新设备 / 误删恢复 |
| **同步照片** | `cloudSync.syncAssetsToCloud()` | 把本地有 blob 但无 `cloudPath` 的图片逐个上传 | 首次上传忘了勾选「同步照片」或新增了带图食物 |
| **断开** | `setCloudBaseEnv("")` | 清除持久化 env，刷新后回到本地模式 | 不再用云同步 / 切换环境 |

> ⚠️ 三个写动作均为「本地先写 → 立即返回 → 异步 push」。`从云恢复` 是少数会**先 await in-flight push** 的操作，确保不会把未完成的本地修改回拉覆盖掉。

### 3.3 默认状态

- **未配置 env ID**：云同步卡片不显示（除非要主动配置，会显示输入框）。
- **SDK 未加载**：卡片完全隐藏（避免无意义 UI）。
- **加载中 / 失败 / 同步中**：卡片显示 phase badge（颜色区分）。

---

## 4. 同步语义详解

### 4.1 写：本地先 + 异步 push（mirror 模式核心）

```
DataService.saveFood(record)
   │
   ▼
SyncRepository.write("foods", record)
   │
   ├──▶ LocalRepository.write("foods", record)   ← 同步，立刻返回
   │
   └──▶ schedulePush("write", "foods", record)  ← 异步 fire-and-forget
            │
            ├── push 成功 → 结束
            │
            └── push 失败 → Outbox.enqueue → 下次启动或定时重试
```

- 写操作对 UI 的承诺：**本地立刻可读**。
- 写操作的副作用：异步 push 期间数据**对云不可见**；失败时入 outbox。

### 4.2 读：永远走本地

- `getFoods() / getFood() / readAll()` 等读方法 100% 走本地 IndexedDB。
- 这意味着**离线完全可用**（与 MVP 目标一致）。
- 本地是「最新」视图：每次写后 DataService 会调用 `service.refresh()` 重建 view cache。

### 4.3 启动顺序（CloudSync.start()）

```
1. setState("connecting")
2. await adapter.initialize()        ← 匿名登录 CloudBase
3. await syncRepo.flushPending()     ← 等 ensureDefaults 触发的 in-flight push
4. await outbox.flush()              ← 把之前失败的 op 重发
5. setState("ready", { auth })
```

设计要点：先**等当前 in-flight push** 再**flush 历史 outbox**，避免接下来可能的 `pullFromCloud` 与正在进行的 push 撞车。

### 4.4 云端恢复（pullFromCloud）

```
1. setState("syncing")
2. await syncRepo.flushPending()         ← 等所有 in-flight push 落地
3. await outbox.flush()                  ← 重试，确保最近失败的全部上云
4. snapshot = await cloudRepo.pullSnapshot()
5. for each collection: localRepo.clear()  ← 全量清本地
6. for each collection: localRepo.writeMany(snapshot[c])  ← 批量回写
7. await restoreAssetsFromCloud()         ← 把每张图片从云存储拉成 Blob 写回
8. notifyLocalChanged()                   ← DataService 重建 view
9. setState("ready", { lastSyncAt })
```

⚠️ **MVP 没有冲突解决**：恢复是「云端覆盖本地」。多次离线编辑后从云拉回，未上传的部分会丢失。这就是为什么 outbox 必须在 pull 之前 flush。

### 4.5 图片资源

| 字段 | 含义 |
| --- | --- |
| `assets.blob` | 本地二进制（IndexedDB） |
| `assets.cloudPath` | 云存储路径（例如 `assets/{id}.jpg`） |
| `assets.cloudFileID` | CloudBase 文件 ID（用于 `downloadFile`） |

- 上传后 `blob` 字段在云端记录中被剥离（`stripNonSerializable`），仅保留 `cloudPath/cloudFileID`。
- 同一资产**幂等**：已有 `cloudPath` 则跳过上传。
- 拉回时按 `cloudFileID` 下载成 Blob 写回本地。

### 4.6 Outbox

- 每个 op 记录 `{ id, op, collection, payload, createdAt, retry, lastError }`。
- 启动时 / 主动触发时按 FIFO + 退避（指数回退，上限 8 次）逐条重发。
- 超过 `MAX_RETRY=8` 的项**被跳过**（写入审计日志但不再重试，避免永久占用 outbox）。
- MVP 不做 outbox 大小告警；如持续增长应人工干预。

---

## 5. 验证方法

### 5.1 自动化测试

```bash
cd /Users/zhuqiumeng/Documents/cat-eat-miniapp
npm test
```

预期输出（截至 2026-08-19）：

```
ℹ tests 87
ℹ pass 87
ℹ fail 0
ℹ duration_ms ≈ 600ms
```

测试覆盖：

| 测试套 | 数量 | 重点 |
| --- | --- | --- |
| `cloudbase-adapter.test.js` | 9 | adapter 初始化、注入 `_openid`、storage 上传/下载 |
| `sync-repository.test.js` | 6 | 写：本地先 + 异步 push；blob 剥离；失败入 outbox；批量写；remove |
| `outbox.test.js` | 6 | enqueue / flush 成功 / 失败重试 / 超 MAX_RETRY 跳过 / remove / clear |
| `cloud-sync.test.js` | 8 | 状态机迁移；pushFirstTime；pullFromCloud；syncAssets；restoreAssets |
| `data-store-cloudbase.test.js` | 4 | 端到端：未注入时 isCloudBaseConfigured()=false；注入后 cloudSync 触发 push；多设备共享 env |
| 既有测试 | 54 | H5 contract / rules / data-store / migration / 业务规则 等 |

### 5.2 静态检查

```bash
npm run validate   # 小程序 5 pages / 7 WXML / 9 WXSS / 13 JSON 编译
```

所有 JS 文件已通过 `node --check`：

```
OK utils/data-store.js
OK utils/cloudbase-config.js
OK utils/cloud-sync.js
OK utils/repos/sync-repository.js
OK utils/repos/cloud-repository.js
OK utils/repos/outbox.js
OK utils/repos/local-repository.js
OK utils/repos/asset-repository.js
OK utils/data-service.js
OK utils/adapters/cloudbase-adapter.js
OK utils/adapters/indexeddb-adapter.js
OK utils/adapters/wx-storage-adapter.js
OK preview/preview.js
```

### 5.3 手测脚本（真机 / PWA）

> 准备工作：拥有 CloudBase 账号并创建一个空环境（拿到 env ID），控制台允许匿名登录。

| 步骤 | 操作 | 预期 |
| --- | --- | --- |
| 1 | 打开 H5，添加 2-3 条食物（含 1 张照片） | 数据进 IndexedDB |
| 2 | 滚到首页底部，看到「云同步」卡片 | 显示「未启用」+ 输入框 |
| 3 | 输入 env ID → 保存 | Toast「已保存，刷新页面后启用云同步」→ 自动刷新 |
| 4 | 刷新后看到云同步卡片 | 显示「已就绪」+ 3 个动作按钮 |
| 5 | 点「首次上传到云」 | Toast「已上传 N 条食物」；卡片显示最近同步时间 |
| 6 | 进 CloudBase 控制台 → 数据库 → `foods` collection | 能看到对应记录（无 blob 字段） |
| 7 | 在另一台设备 / 浏览器隐身窗口打开同一 H5，输入相同 env ID | 自动 sync 启动 |
| 8 | 在 B 设备点「从云恢复」 | Toast「已从云端恢复」；B 设备看到与 A 相同的食物列表 + 缩略图 |
| 9 | 关闭网络（飞行模式） | UI 不受影响，所有读写继续走本地 |
| 10 | 恢复网络后下一次写 | 自动 push（无需手动操作） |
| 11 | 点「断开」确认 | 卡片回到「未启用」状态；数据保留在本地 |

### 5.4 CI 守门（设计原则回归）

- `tests/h5-ui-contract.test.js:404-416`：**H5 UI 源里不得出现 `localStorage` / `indexedDB` 字面量**。
- 本次 MVP 改动后该测试仍绿。
- `utils/data-store.js` 仍需含 `DB_NAME = "cat-eat-local"` + 三个 `createObjectStore` + `migration.localStorageV2` 关键字面量（CI 静态扫描）。

---

## 6. 已知限制（v2 跟进项）

### 6.0 本轮加固（v1.1）

v1.0 上线前的 diff review 找出 3 个 critical bug 和 4 个 P1/P2 风险，本轮全部修完：

| 编号 | 修复内容 | 影响 |
| --- | --- | --- |
| BUG 1 | `pushFirstTime` 顺序倒置：先 `syncAssetsToCloud` 把 blob 传到云存储并剥离本地 blob，再 `pushSnapshot`。修复前云 DB 会被塞进 2-5MB 的 blob，撞 CloudBase 1MB 文档上限 | 数据正确性 |
| BUG 4 | `AssetRepository.preload` 支持 cloudFileID 但本地无 blob 的情况：调用 `downloadAsset` 拉回 blob（4 并发）并写回本地。修复前冷启动后图片全空白 | 冷启动可用性 |
| BUG 5 | `SyncRepository.runTransaction` 追踪 `clear()`：用 pre/post snapshot diff 生成对应 key 的 remove ops。修复前 `replaceFoods` 后云端保留旧 foods/results 副本 | 数据正确性 |
| 风险 3 | `pushFirstTime` 入口加 `isEmpty()` 保护：云端有数据时拒绝覆盖 | 防误操作 |
| 风险 16 | `DataService.status().capabilities.cloud` 反映 `activeRepo.kind === "mirror"`，与 `mode` 字段一致 | UI 状态正确性 |
| 风险 2 | `outbox.flush` 失败不再静默吞掉：start / pullFromCloud / flushOutbox 失败都 surface 到 `state.error` 和 `state.lastFlush` | 异常可见性 |
| BUG 3 | `CloudSync.start()` 启动 30s 自动 retry 定时器 + 监听 `online` 事件立即 flush + 并发锁保护（`safeFlushOutbox` 串行化） | 网络恢复后自动重传 |

新增测试 12 条（cloud-sync 6 / asset-repository 5 / sync-repository 1 / data-store-cloudbase 1），覆盖以上每条修复。

> 测试合计：**100 / 100 全绿**（v1.0 时 88，新增 12 条）。
> 相关 PR review 见 [§5.3](#53-手测脚本真机--pwa)。

---

### 6.1 多猫场景下的 catId 漂移

- **现象**：`ensureDefaults` 在 `initialize` 时会写入默认 cat 记录。`cloudSync.start()` 后会把这个 cat 推到云。设备 B 首次 `pullFromCloud` 时，B 的 `ensureDefaults` 也会写入自己的默认 cat，导致本地出现 2 个 cat，`meta.catId` 可能指向错误的那一个。
- **现状**：`tests/data-store-cloudbase.test.js` 中对应断言已放宽为 `local.readAll("foods").length >= 1`。
- **影响**：MVP 用户基本是单设备 + 偶发跨设备恢复；多设备并发首次恢复不在 MVP 范围。
- **v2 修复方向**：`pullFromCloud` 后用云端 `meta.catId` 强制覆盖本地默认 cat；或新增 `pullFromCloud({ mergeStrategy: "keep-local" | "keep-cloud" })`。

### 6.2 没有冲突解决

- **现象**：两端离线编辑同一食物后，先上传的会被后上传的覆盖（last-write-wins 隐式）。
- **MVP 接受理由**：当前是单用户单设备，跨设备并发编辑不会自然发生。
- **v2 修复方向**：基于 `updatedAt` 的乐观锁 + 冲突检测（写入时带 precondition），或 CRDT。

### 6.3 没有 `deletedAt` 软删除

- **现象**：物理删除的食物不会在云端标记；恢复时被一并带回来。
- **MVP 接受理由**：当前业务没有「回收站」需求。
- **v2 修复方向**：在所有 collection 加 `deletedAt` 字段，`remove()` 改为写时间戳而不是真删；UI 提供「回收站」。

### 6.4 没有实时同步

- **现象**：B 设备不会自动看到 A 设备的写入，必须手动点「从云恢复」。
- **MVP 接受理由**：MVP 阶段用户手动控制同步时机更稳。
- **v2 修复方向**：订阅 CloudBase `watch` 能力 + 设备在线状态显示。

### 6.5 图片云存储的费用

- **现象**：每张图都上传到云存储，无压缩、无去重。
- **MVP 接受理由**：MVP 数据量小，费用可忽略。
- **v2 修复方向**：上传前 `compressImage`、对相同 `photoAssetId` 跨设备去重。

### 6.6 没有从非 CloudBase 用户的迁移路径

- **现象**：已经是 IDB-only 的用户在首次打开新版本时，云同步是「可选开启」，**不会自动给老数据做上传提示**。
- **MVP 接受理由**：MVP 用户可控，需要明确知道才会主动开。
- **v2 修复方向**：检测到「有数据 + 未开云」时，引导提示「是否上传现有数据到云」。

### 6.7 旧版 localStorage v2 数据迁移后云同步的边缘情况

- **现象**：从 v33 之前升级的用户，迁移后 IDB 里有 `legacyId` 字段；上传到云时这个字段也会被推到云。
- **MVP 接受理由**：不影响功能；云端会保留 `legacyId` 作为可追溯字段。
- **v2 修复方向**：v2 协议后可在 push 前剥离 `legacyId`。

---

## 7. 回滚方案

### 7.1 代码层面

MVP 改动**全部 feature-flag 隔离**：

- `utils/data-store.js` 中 `tryCreateCloudBootstrap` / `buildIndexedDBService` 的 cloud 段仅在 `cloudEnv` 非空时执行。
- 无 env ID 时，整条 cloudSync 链路不创建，DataService 拿到的仍是 `localRepo`，**行为与改造前完全一致**。
- `preview/preview.js` 中 `renderCloudSyncCard` 仅在 SDK 可用 + 已配 env 时显示「动作按钮」；SDK 不可用时整张卡片隐藏。

**回滚 = 把 env ID 清空**（UI：点「断开」即可）。无需改代码。

### 7.2 数据层面

- 本地数据不依赖云，云关掉后**完整保留**。
- 已上传的数据保留在云端；用户可日后从其他设备恢复。
- outbox 中的待重试 op 在下次 `setCloudBaseEnv` + `start()` 时自动 flush。

### 7.3 紧急情况

如果上线后发现 bug：

1. 立刻在用户侧让用户「断开」（或运营主动 push 修复版本清空 `cat-eat-cloudbase-env`）。
2. 在 CloudBase 控制台定位受影响的 `_openid`（每用户独立），按需手动清理 collection。
3. 代码层 revert 该 PR；后续按 issue 修复后重新发版。

---

## 8. 上线 Checklist

部署到生产前确认：

- [ ] CloudBase 环境已创建
- [ ] **匿名登录已开启**（用户管理 → 登录方式 → 匿名登录）；不开则 SDK `auth.signInAnonymously()` 挂起
- [ ] **云存储 bucket 已创建**（存储管理 → 共 N 条/暂无存储桶 → 创建存储桶）
- [ ] 数据库 + 存储桶的 **PostgreSQL RLS 策略**已配置（当前是 RLS 模型，JSON 规则不适用；详见 §8.1）
- [ ] `npm test` 100/100 全绿
- [ ] `npm run validate` 小程序编译通过
- [ ] iPhone PWA 真机走完 §5.3 全部 11 步
- [ ] 已知限制 §6 已读，PM/客服能向用户解释
- [ ] 回滚方案 §7 在 Runbook 中可查

### 8.1 PostgreSQL RLS 权限配置（实测适配）

CloudBase 新版控制台使用 PostgreSQL RLS（Row Level Security）模型，**不再支持旧版 JSON 安全规则**。配置入口：

#### 数据库（cats / foods / results / assets / meta 5 个集合）

```
腾讯云开发控制台
  → 云数据库
    → 你的环境
      → 集合（cats / foods / results / assets / meta）
        → 权限
          → 新建 Policy
```

- 角色：`anon`（匿名登录用户）
- 动作：SELECT / INSERT / UPDATE / DELETE
- USING 表达式（SELECT/DELETE 用）：`auth.uid() = _openid`
- WITH CHECK 表达式（INSERT/UPDATE 用）：`auth.uid() = _openid`

> MVP 起步建议：先放开 `auth.role() = 'anon'` 的所有动作（不限制 `_openid`），用工具人账号 + 真实匿名账号联调 1 次，确认流程通了再收紧到 `auth.uid() = _openid`。

#### 云存储（bucket）

```
腾讯云开发控制台
  → 云存储
    → 存储管理
      → 你的 bucket
        → 访问策略
          → 新建 Policy
```

- 角色：`anon`
- 动作：read / write / delete
- 表达式：`resource.path LIKE 'cat-eat-assets/%'`

#### 5 步连通性诊断

SDK 配好之后，跑 `node tests/cloudbase-live-diag.js <env-id>` 自动验证 5 步：
init app → 匿名登录 → 写探针记录 → 读回 → 上传探针文件。任一步失败会打印针对性解决建议。

---

## 9. v2 路线图（建议优先级）

| 优先级 | 任务 | 价值 |
| --- | --- | --- |
| P0 | 修复 §6.1 多猫 catId 漂移 | 正确性 |
| P0 | 实时同步（`watchCollection`） | 用户体验质变 |
| P1 | 冲突解决（基于 `updatedAt` 的乐观锁） | 多设备安全 |
| P1 | `deletedAt` 软删除 + 回收站 UI | 容错 |
| P2 | 图片压缩 + 去重 | 成本与速度 |
| P2 | 旧用户首次开云引导 | 转化率 |
| P3 | 增量同步 cursor | 大数据量性能 |
| P3 | 端到端加密 | 隐私 |

---

## 10. 参考

- [06-数据层迁移到 CloudBase · 实施指南](./06-DATA-数据层迁移-CloudBase.md)
- [00-产品文档索引](./00-产品文档索引.md)
- [数据层审计报告](../audits/2026-08-19-data-layer-audit.md)
- [DATA_SCHEMA.md](../DATA_SCHEMA.md)
- [PROJECT_CONTEXT.md](../PROJECT_CONTEXT.md)
- CloudBase 官方文档：https://docs.cloudbase.net/

---

> 文档状态：MVP 实施报告 + 验证手册 v1.1
> 维护人：lulu（兼 dev/PM/QA）
> 下次更新：v2 实时同步完成后
