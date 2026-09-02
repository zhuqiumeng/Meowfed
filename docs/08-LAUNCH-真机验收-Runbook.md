# 08 · 真机验收 Runbook

> 适用于 v1.1.1 部署后的 iPhone Safari PWA 真机验收。
> 配套阅读：[07 §5.3 手测脚本](./07-DATA-数据层迁移-CloudBase-MVP.md#53-手测脚本真机--pwa)

---

## 0. 当前可用 URL

| 用途 | URL | 状态 |
| --- | --- | --- |
| GH Pages（公网） | https://zhuqiumeng.github.io/Meowfed/ | ✅ v1.1.1 已部署 |
| 本地预览 | http://127.0.0.1:4173/ | ✅ 跑 `npm run preview` 即可；同 wifi 局域网用 `http://<Mac-IP>:4173/` |
| GitHub Actions | `.github/workflows/deploy.yml` 监听 `agent/import-h5-app` | push 即自动 build + deploy |

> ⚠️ **iPhone 真机**：iPhone Safari 直接打开 GH Pages 那个 URL 即可。HTTPS 必需（PWA / ServiceWorker / IndexedDB 都要求 secure context）。PWA 第一次访问后点分享按钮 → 「添加到主屏幕」→ 离线可开。

---

## 1. 上线前自检（5 分钟）

```bash
cd /Users/zhuqiumeng/Documents/cat-eat-miniapp
npm test              # 期望：100/100 pass
npm run build:site    # 期望：Sites build ready
```

打开浏览器访问 https://zhuqiumeng.github.io/Meowfed/，期望：
- 12 个 interactive elements 出现（不是空白）
- 标题 "Hi 噜噜 这次吃的怎么样？"
- 底部导航 "首页 / 添加 / 清单"
- 页面背景渐变正常

---

## 2. iPhone 真机验收（v1.1.3 急用版 · 5 步）

> **背景**：真 CloudBase env (`meowfed-d8gc79bfpabac02b3`) 是 PostgreSQL 实例，
> **没有 mongodb collection**。SDK 写库会静默失败（之前的 5 步 diag 报告"全过"
> 实际是 4 步 + 1 步静默报错），user 看着本地有数据但云端没有 = 数据丢失。
>
> **v1.1.3 急用版策略**：默认关闭云同步，主页面新增「导出 / 导入 JSON 备份」
> 作为「数据不丢」的实操方案（v1.2 邮箱同步迁到 PG schema 后再恢复云同步）。

准备：iPhone Safari / PWA 打开 https://zhuqiumeng.github.io/Meowfed/。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 添加 2-3 条食物（含 1 张照片） | 数据进 IndexedDB；首页「最近记录」显示卡片 |
| 2 | 滚到首页底部，看「云同步」卡片 | 状态显示「本地模式」+ 4 个按钮：「导出 JSON 备份 / 导入 JSON 恢复 / 开启云同步 / 调试工具」 |
| 3 | 点「导出 JSON 备份」 | iOS 弹「下载 / 保存到文件」→ 选「存储到文件」→ 存到 iCloud Drive 或「下载」目录（文件名形如 `cat-eat-rescue-1788xxx.json`） |
| 4 | 长按这个文件 → 分享给「微信文件传输助手」或发邮件给自己 | 备份文件已离开手机，到达 icloud / 微信 / 邮箱 |
| 5 | （重装 / 换机 / 微信找回）从微信/iCloud 把 JSON 文件下载回 iPhone → 在 PWA 内点「导入 JSON 恢复」选这个文件 → 确认覆盖 → 看到食物列表全部回来 | 5 个 collection（meta/cats/foods/results/assets，含 blob 资产）全量恢复 |

**为什么是这 5 步**：iOS PWA 7-day eviction 风险 + iPhone 存储空间满清 web 存储，
> 都会让本地 IndexedDB 静默丢。手动 JSON 备份是 v1.1.3 阶段唯一能跨设备/跨
> 重装/跨 time 复活的方案。v1.2 邮箱同步上线后，导入/导出退化为「跨设备兜底」。

## 2.5 iPhone 真机验收（v1.2 云同步 · 11 步 · TODO）

> v1.2 邮箱账号体系 + PostgreSQL 数据层迁移上线后，才回到这条验收。
> v1.1.3 阶段以 §2 5 步为准。

**已知限制（v1.1.3）**：见 [07 §6](./07-DATA-数据层迁移-CloudBase-MVP.md#6-已知限制v2-跟进项)。
新增：

- v1.1.3 云同步默认关闭；user 需在主页面主动点「开启云同步」（opt-in）才会真连 CloudBase
- 即使开启，当前 PostgreSQL env 仍无 mongodb collection，云端 foods/results/assets 写入会静默失败（v1.2 修）
- 资产（照片）走 CloudBase 云存储目前可用（v1.1.3 commit 57eeb51 修了 SDK `storage.from()` 路径，bucket = `cat-eat-assets-001`）

---

## 3. 5 步连通性诊断（任一步失败时跑）

```bash
node tests/cloudbase-live-diag.js meowfed-d8gc79bfpabac02b3
```

按提示输出针对每步失败的解决建议。覆盖：
1. init app
2. 匿名登录
3. 写探针记录
4. 读回
5. 上传探针文件

> ⚠️ Node SDK 走 `meowfed-...tcb-qcloud.la` 端点；本机网络若被防火墙拦，会卡在 step 1。**这种情况直接用浏览器走 §2 的 11 步即可（SDK 自动探测 endpoint 走 CDN）。**

---

## 4. 失败诊断速查

### 4.1 页面空白 / 提示「请开启 JavaScript」

- 检查 `https://zhuqiumeng.github.io/Meowfed/utils/data-store.js` 内容，应该看到：
  ```js
  Object.defineProperty(globalScope, "CatEatData", {
    configurable: true,
    get() {
      return services;
    }
  });
  ```
- 如果看到 `globalScope.CatEatData = services.indexeddb || services.legacy;`（无 getter），说明 GH Pages 还没 deploy 新版。检查 GitHub Actions 是否成功。

### 4.2 「已就绪」卡片出现，但点「首次上传到云」报 RLS / permission 错误

去 CloudBase 控制台按 §5 配置 5 collection RLS。

### 4.3 Toast「已上传 N 条食物」但 CloudBase 控制台看不到

- 确认 RLS 配置（§5）已生效（控制台要刷新）
- 确认 env ID 没填错（在「云同步」卡片上能改）
- 跑 §3 的 5 步诊断脚本

### 4.4 从云恢复后图片是空白

这是 BUG 4 的场景，v1.1 已修：`AssetRepository.preload` 在冷启动时会通过 `downloadAsset` 把云端 blob 拉回。如仍出现，看浏览器 console 有没有 download 失败。

---

## 5. CloudBase RLS 配置（部署后必做）

> CloudBase 新版控制台用 PostgreSQL RLS（不再支持旧版 JSON 安全规则）。
> 配置入口：腾讯云开发控制台 → 云数据库 → 你的环境 → 集合 → 权限 → 新建 Policy。

### 5.1 数据库 5 集合

对 `cats` / `foods` / `results` / `assets` / `meta` 各创建一个 Policy：

- **角色**：`anon`
- **动作**：SELECT / INSERT / UPDATE / DELETE
- **USING 表达式**（SELECT/DELETE）：`auth.uid() = _openid`
- **WITH CHECK 表达式**（INSERT/UPDATE）：`auth.uid() = _openid`

> 🚀 **MVP 起步建议**：先把 USING/WITH CHECK 改成 `auth.role() = 'anon'`（**不限制 _openid**），用工具人账号 + 真实匿名账号联调一次。流程通了再收紧到 `auth.uid() = _openid`。

### 5.2 云存储 bucket

对你创建的 `cat-eat-assets-001`（或类似）bucket：

- **角色**：`anon`
- **动作**：read / write / delete
- **表达式**：`resource.path LIKE 'cat-eat-assets/%'`

> 你之前已经在 storage.objects 配过 `anon_own_files_all` + storage.buckets 配过 `anon_own_bucket`，**bucket 侧**已经 OK；**数据库侧**还要再配一次。

### 5.3 配置完后

回到 H5 → 「云同步」卡片 → 点「首次上传到云」应该成功；再跑 §3 的 5 步诊断应该全绿。

---

## 6. 紧急回滚

GH Pages 回滚到上一个版本：
```bash
git checkout agent/import-h5-app
git revert HEAD  # 或 git reset --hard 7d13489
git push origin agent/import-h5-app
```

回滚后等 1-2 分钟 GH Actions 重新 deploy。期间用户访问会拿到旧版本（force_orphan: true 不会留旧 release）。

---

## 7. 联系 / 反馈

- 数据层 bug：直接看 [07 §6 已知限制](./07-DATA-数据层迁移-CloudBase-MVP.md#6-已知限制v2-跟进项) 是不是已记录
- 新 bug：先看 DevTools console 截图 + 复现路径，发到 Meowfed repo issues
- 紧急：直接找 Mavis（Mavis session log 在本机 .minimax）

> 文档版本：v1.1.4-hotfix-2 / 2026-09-02
> 维护人：lulu

---

## 8. v1.1.4 公测版真机验收（云同步默认开 + PG 数据层）

> **背景**：v1.1.3 默认关云同步（PG schema 还没建），v1.1.4 把 CloudBase 切到
> **PostgreSQL（PostgREST 协议）**，5 张表（meta/cats/foods/results/assets）已建好
> + 9 indexes + 5 RLS `anon_all` policy，云同步默认开启。
>
> **链路核心**：浏览器 → app.rdb() PostgREST → CloudBase gateway → PostgreSQL `pgdb-ioy12otz`
>
> **不要再走 JSON 导出/导入当主路径**（那是 v1.1.3 临时方案）。v1.1.4 是"上云不丢"主路径。

准备：iPhone Safari / PWA 打开 `https://zhuqiumeng.github.io/Meowfed/`，或 Mac Chrome 打开
`http://127.0.0.1:4173/`。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 首次打开（fresh IDB） | 「云同步」卡片显示「已同步」（不是"准备中…"也不是"连接出错"），副标题"数据自动备份到云端。换设备登录同一账号可同步"。**首页 < 1s 看到 IDB 数据**（v36 fix：cloudSync.start fire-and-forget，service.initialize 完就 render，不再等 22 条 outbox 串行 flush） |
| 2 | 加 1 猫 + 1 食物 | 卡片显示 1 条食物；云同步卡片无变化（写本地不需联网） |
| 3 | 点「立即上传到云」 | Toast「已上传 N 条食物到云」+ 卡片下方副标题"最近一次同步：<时间>" |
| 4 | （iPhone 端用 4G/不同网络，Mac Chrome 也行）打开 gitpage URL | 自动从云拉回 5 张表（meta/cats/foods/results/assets），首页 < 1s 显示同样的 1 猫 1 食物（这是"换设备不丢"的核心场景） |
| 5 | 在第 2 步的设备上再点「立即上传到云」 | Toast「云端已有数据，请先在另一台设备执行『从云恢复』」（保护机制，避免覆盖） |
| 6 | （可选）到 https://console.cloud.tencent.com/tcb 看 PG | `pgdb-ioy12otz` 的 5 张表应该看到刚才上传的 1 cat + 1 food |

**v1.1.4-hotfix-2 修的"刷新丢数据"假 bug**（commit `4c4499e` / 2026-09-02）：

之前 user 反馈"加食物成功，刷新页面内容被清除了"——实际**数据没丢**，但
`tryInitialize` 还在 `await cloudSync.start()`，fresh IDB 22 条 outbox
串行 flush 把 bootstrap 拉慢到 5+ 秒。user 在这 5 秒看到的是
"Hi 噜噜 还没有最近记录"骨架，误以为数据被清了。

v1.1.4-hotfix-2 修法：
- `tryInitialize` 把 `cloudSync.start()` 改成 fire-and-forget
  （catch error 走 console.warn），`service.initialize` 完就 resolve
- CACHE_NAME v35-skeleton → v36-data-immediate 强制 SW 刷掉老 data-store.js
- preview/index.html cache busting `v=35` → `v=36`

效果：刷新后 < 1s 看到 5 条 demo 数据（之前 5+ 秒空白），云端 state 通过
`cloudSync.subscribe` 异步更新到 UI。

**已知小毛病（v1.1.4 已知）**：
- 全新 IDB 启动时 30s outbox retry 会偶发「N 条 outbox 推送失败」Toast；
  30s 后自动重试通常就好。原因是 ensureDefaults 写 meta 表跟 outbox flush
  时序有竞态；**不阻塞主流程**（v36 fix 后首页 < 1s 出数据，云端 push 失败
  不影响本地 UI）。
- iOS PWA IndexedDB 在低存储空间 / Safari 7-day eviction 仍可能丢；**JSON 备份/导入保留**
  作为"极端情况兜底"（卡片底部"高级"折叠区里）。

**对比 v1.1.3 的关键变化**：
- ✅ 云同步**默认开**，不再需要手动点"开启云同步"
- ✅ 5 张 PG 表持久化数据，**换设备自动同步**（满足"上云不丢"）
- ✅ 资产（照片 blob）走 `app.storage()` → CloudBase 云存储，pullFromCloud 时自动拉回
- ✅ 出网错时 UI 显示真实错误（不是硬编码"云端连接初始化失败"）

**回滚**：见 §6 流程，`main` 改成 `git revert <bad-commit>` 后 push 即可。


