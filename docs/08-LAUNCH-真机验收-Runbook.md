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

## 2. iPhone 真机验收（11 步）

> 准备：iPhone Safari 打开 https://zhuqiumeng.github.io/Meowfed/，先添加 2-3 条食物再走云同步测试。

| # | 操作 | 预期 |
| --- | --- | --- |
| 1 | 添加 2-3 条食物（含 1 张照片） | 数据进 IndexedDB；首页「最近记录」显示卡片 |
| 2 | 滚到首页底部，看到「云同步」卡片 | 显示「未启用」+ 输入框 |
| 3 | 输入 env ID → 保存 | Toast「已保存，刷新页面后启用云同步」→ 自动刷新 |
| 4 | 刷新后看到云同步卡片 | 显示「已就绪」+ 3 个动作按钮（首次上传 / 从云恢复 / 断开） |
| 5 | 点「首次上传到云」 | Toast「已上传 N 条食物」；卡片显示最近同步时间 |
| 6 | 进 CloudBase 控制台 → 数据库 → `foods` collection | 能看到对应记录（无 blob 字段，photoAssetId 是云文件 ID） |
| 7 | 在另一台设备 / Safari 隐身窗口打开同一 H5，输入相同 env ID | 自动 sync 启动 |
| 8 | 在 B 设备点「从云恢复」 | Toast「已从云端恢复」；B 设备看到与 A 相同的食物列表 + 缩略图 |
| 9 | 关闭网络（飞行模式） | UI 不受影响，所有读写继续走本地 |
| 10 | 恢复网络后下一次写 | 自动 push（无需手动操作） |
| 11 | 点「断开」确认 | 卡片回到「未启用」状态；数据保留在本地 |

**已知限制（v1.1.1）**：见 [07 §6](./07-DATA-数据层迁移-CloudBase-MVP.md#6-已知限制v2-跟进项)。

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

> 文档版本：v1.1.1 / 2026-08-24
> 维护人：lulu
