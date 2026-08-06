# Architecture Decisions

## ADR-001：UI 只依赖统一数据访问层

- 状态：已采用
- 日期：2026-08-06

H5 页面不得直接调用 localStorage 或 IndexedDB。`window.CatEatData` 是唯一持久化入口，负责初始化、查询、保存、迁移和兼容模式。

这样可以保持现有 UI 不变，并让未来导出/导入或云端适配不侵入页面组件。

## ADR-002：结构化记录使用 IndexedDB

- 状态：已采用
- 日期：2026-08-06

食物、反馈和猫咪资料需要独立记录、事务、较大的容量空间和后续迁移能力，因此不再把完整数组作为一段 localStorage JSON 重写。

## ADR-003：照片作为 Blob 独立保存

- 状态：已采用
- 日期：2026-08-06

照片存入 `assets` Object Store，业务记录只保留 `photoAssetId`。这避免 Base64 膨胀和每次反馈都重复序列化全部照片。

## ADR-004：第一阶段只建立本地云兼容字段

- 状态：已采用
- 日期：2026-08-06

主要记录包含 `schemaVersion`、稳定 UUID、`catId`、`createdAt`、`updatedAt`。`ownerId` 预留为 `null`。

本阶段明确不增加 `deletedAt`、登录、云数据库、多设备同步和冲突解决逻辑。

## ADR-005：旧数据迁移必须非破坏

- 状态：已采用
- 日期：2026-08-06

localStorage 迁移必须先写入 IndexedDB，再逐条验证，最后写入完成标记并清理旧键。任何失败都不能删除旧数据；IndexedDB 不可用时进入 `legacy-fallback`。

## ADR-006：导出/导入独立成下一阶段

- 状态：已采用
- 日期：2026-08-06

Safari 浏览器与主屏幕 Web App 的存储隔离通过显式备份迁移解决。该功能独立设计、测试和提交，不与 IndexedDB 基础改造混在同一阶段。

