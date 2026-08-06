# Changelog

## Unreleased

### Added

- 新增统一 H5 数据访问层 `utils/data-store.js`。
- 新增 IndexedDB 数据库 `cat-eat-local`，分离保存猫咪、食物、反馈、照片和元信息。
- 新增稳定 UUID、`catId`、`schemaVersion`、`createdAt` 和 `updatedAt`。
- 为未来账号体系预留可选 `ownerId`，当前统一为 `null`。
- 新增 localStorage V2 到 IndexedDB V1 的一次性自动迁移。
- 新增迁移失败兼容模式，失败时不删除旧数据。
- 新增 IndexedDB、Blob、迁移和重启持久化测试。

### Changed

- H5 UI 不再直接读写 localStorage 或 IndexedDB。
- 食物反馈从食物 JSON 中拆分为独立 `results` 记录。
- 食物照片和猫咪头像从 Base64 JSON 改为 IndexedDB Blob。
- PWA 缓存版本升级到 `cat-eat-h5-v10`，并缓存数据访问层脚本。

### Not included

- 登录、云数据库、多设备同步和软删除。
- 本地备份导出/导入将在后续独立阶段设计和实现。

