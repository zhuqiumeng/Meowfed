# 猫吃了吗 · 本地数据结构

## 当前版本

- 数据库：IndexedDB `cat-eat-local`
- 数据库版本：`1`
- 业务结构版本：`schemaVersion: 1`
- 数据访问入口：`utils/data-store.js`
- 当前范围：单设备、单猫、本地优先；不包含登录、云数据库和多设备同步

UI 不直接访问 IndexedDB 或 localStorage。页面通过 `window.CatEatData` 读取缓存并执行保存操作。

## Object Stores

### `meta`

以 `key` 为主键，保存数据库级元信息：

| key | value |
| --- | --- |
| `schemaVersion` | 当前业务结构版本 |
| `catId` | 当前猫咪的稳定 UUID |
| `participantId` | 本地参与者标识或邀请标识 |
| `migration.localStorageV2` | localStorage 迁移状态、数量和完成时间 |

### `cats`

```js
{
  schemaVersion: 1,
  id: "uuid",             // 当前阶段同时作为 catId
  ownerId: null,           // 仅预留，不代表已有账号
  nickname: "噜噜",
  ageYears: null,
  photoAssetId: "uuid|null",
  createdAt: 0,
  updatedAt: 0
}
```

### `foods`

```js
{
  schemaVersion: 1,
  id: "uuid",
  legacyId: "string|null", // 只用于一次性迁移和排障
  catId: "uuid",
  ownerId: null,
  brand: "",
  name: "",
  specification: "",
  foodType: "staple_can",
  flavor: "",
  texture: "",
  photoAssetId: "uuid|null",
  manualStatus: null,
  manualRetryAfter: null,
  everQualified: false,
  createdAt: 0,
  updatedAt: 0
}
```

`foods` 不再嵌套照片或反馈数组。UI 读取时，数据层会把相关反馈和照片预览地址组合成兼容现有规则函数的对象。

### `results`

```js
{
  schemaVersion: 1,
  id: "uuid",
  legacyId: "string|null",
  foodId: "uuid",
  catId: "uuid",
  ownerId: null,
  outcome: "eager|okay|reluctant|bury|unknown",
  assistedBy: "",
  note: "",
  createdAt: 0,
  updatedAt: 0
}
```

### `assets`

```js
{
  schemaVersion: 1,
  id: "uuid",
  catId: "uuid",
  ownerId: null,
  kind: "food-photo|cat-avatar",
  mimeType: "image/jpeg",
  size: 0,
  blob: Blob,
  createdAt: 0,
  updatedAt: 0
}
```

照片以 Blob 独立保存。结构化记录只保留 `photoAssetId`，不再保存 Base64 Data URL。

## localStorage 自动迁移

首次打开新版时，数据层会检查以下旧键：

- `CAT_EAT_H5_FOODS_V2`
- `CAT_EAT_H5_INITIALIZED_V2`
- `CAT_EAT_H5_PARTICIPANT_V1`
- `CAT_EAT_H5_CAT_PROFILE_V1`

迁移顺序：

1. 读取并解析旧数据。
2. 为旧食物、反馈、猫咪和照片生成稳定 UUID。
3. 将结构化记录和 Blob 写入一个 IndexedDB 事务。
4. 逐条验证已写入的数据。
5. 写入迁移完成标记。
6. 只有验证成功后才清理旧 localStorage 键。

如果 IndexedDB 打开、迁移或验证失败，旧键不会被删除。应用会进入 `legacy-fallback` 兼容模式，并在之后重新尝试迁移。

## 暂不包含

- `deletedAt`
- 用户登录和账号合并
- 云数据库
- 多设备同步
- 冲突解决策略
- 数据导出/导入实现

