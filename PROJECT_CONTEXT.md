# Project Context

## 产品目标

“猫吃了吗”帮助挑食猫主人快速记住试吃表现，并在补货时减少重复试错。核心不是持续记录克数，而是用少量行为反馈形成动态口味档案。

## 当前交付形态

- 主验证载体：H5/PWA
- 保留形态：原生微信小程序原型
- H5 技术：原生 HTML、CSS、JavaScript
- 托管：静态资源和页面回退 Worker
- 数据：IndexedDB 本地优先，无后端

## H5 数据流

```text
UI 事件
  → window.CatEatData
  → IndexedDB 事务
  → 内存读取缓存
  → 现有规则计算
  → 现有页面渲染
```

页面可以同步读取数据层缓存；所有持久化操作为异步操作，并在完成后更新缓存。业务状态仍由 `utils/rules.js` 计算，不写入额外派生表。

## 数据边界

- 结构化记录：IndexedDB 的 `cats`、`foods`、`results`。
- 照片：IndexedDB 的 `assets` Blob。
- 元信息：IndexedDB 的 `meta`。
- UI 临时状态：`preview/preview.js` 内存对象。
- Service Worker Cache：只缓存程序文件，不保存用户记录。

## 当前非目标

- 不开发登录。
- 不接入云数据库。
- 不做多设备同步。
- 不引入 `deletedAt` 或同步冲突处理。
- 不改变现有 UI、交互路径和业务判断规则。

## 兼容与迁移

旧 H5 数据会在第一次启动时从 localStorage 自动迁移。只有 IndexedDB 写入并验证成功后才清理旧键；失败时保留旧数据并以兼容模式继续运行。

Safari 浏览器和添加到主屏幕的 Web App 仍可能拥有相互隔离的本地存储。解决这一问题的下一阶段是显式导出/导入，而不是本阶段的账号或云同步。

## 验证命令

```sh
npm test
npm run validate
node --check preview/preview.js
node --check utils/data-store.js
```

