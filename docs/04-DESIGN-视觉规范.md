# 「猫吃了吗」视觉规范

> 版本：v0.1
> 日期：2026-08-07
> 范围：微信小程序 wxss 当前实现
> 对应 Token 文件：`styles/tokens.wxss`

本文档描述「猫吃了吗」小程序的视觉规范。所有 UI 生成必须遵守本文档定义的 token 值；token 文件 `styles/tokens.wxss` 是单一事实来源（Single Source of Truth）。

---

## 0. 阅读须知

- 本规范**基于当前代码现状**反推，未做设计变更。
- 与 `docs/03-交互架构.md` 第 9-12 条视觉原则存在差异，详见第 9 节，**后续需要决定对齐方向**。
- 所有具体数值以 `rpx` 为单位（小程序 750rpx ≈ 375px 逻辑宽度）。

---

## 1. 设计原则

猫吃了吗的视觉语言是 **"奶萌、超圆润、暖色、低对比"**，体现在：

1. **超圆润圆角是产品核心特征**，区别于一般工具类 App。不要向商务风（4-16px）看齐。
2. **暖色基调**：米黄背景（`#FFF8EF` / `#F4F5F1`）+ 亮绿/亮黄强调色，不使用冷色调。
3. **低对比阴影**：所有阴影用 `rgba(17, 23, 19, ...)` 基底，透明度控制在 5%-22% 之间，不重投影。
4. **粗体字重**：所有 UI 文字 800-950 字重，强化"奶萌"质感；不要因为"易读性"擅自降字重。
5. **token 化**：颜色 / 圆角 / 间距 / 字号 / 字重 / 阴影 全部走 token，不允许硬编码（基础库 < 2.6.0 时用 var() 的 fallback）。

---

## 2. 颜色系统

### 2.1 三层结构

```
文字 ink（10 种）  ──→  表达"是什么"
背景 bg（5 种）    ──→  表达"在哪"
品牌 brand（6 种） ──→  表达"是不是"
描边 line（4 种）  ──→  表达"边界"
状态 status（5 种）──→  表达"反馈结果"
```

### 2.2 文字 Ink

| Token | 值 | 用途 |
|---|---|---|
| `--c-ink-primary` | `#111713` | 主文字 / 深色按钮底色 / 黑色徽标 |
| `--c-ink-secondary` | `#4b514c` | 次级文字（latest hint） |
| `--c-ink-tertiary` | `#7a817b` | 辅助文字（描述、meta、品牌副名） |
| `--c-ink-quaternary` | `#919892` | 极弱文字（日期、低优先删除链接） |
| `--c-ink-placeholder` | `#a7aea8` | 输入框占位符 |
| `--c-ink-disabled` | `#8b928c` | 禁用态文字 |
| `--c-ink-on-dark` | `#ffffff` | 深底（如黑胶囊）上的文字 |
| `--c-ink-on-dark-soft` | `#d9ded9` | 深底次级文字 |
| `--c-ink-on-yellow` | `#52611f` | 亮黄底上的标题文字 |
| `--c-ink-on-yellow-soft` | `#59605a` | 浅黄底上的提示文字 |
| `--c-ink-error` | `#d55a58` | 错误/危险（如埋屎避雷标记） |

**主文字统一用 `--c-ink-primary`，禁止用纯黑 `#000000`。**

### 2.3 背景 Background

| Token | 值 | 用途 |
|---|---|---|
| `--c-bg-page` | `#fff8ef` | 页面米黄底（`app.json` window） |
| `--c-bg-page-2` | `#f4f5f1` | 页面备用米灰底（`app.wxss` page 元素） |
| `--c-bg-card` | `#ffffff` | 卡片/容器背景 |
| `--c-bg-disabled` | `#d5d9d3` | 禁用态背景 |
| `--c-bg-progress` | `#e8ebe5` | 进度条底色（未填充段） |

**两个页面背景差异**：app.json 的 `#FFF8EF` 是更暖的米黄，app.wxss 的 `#F4F5F1` 是更冷的米灰。当前两者并存，**保留这个差异**，不要试图"统一"成同一个值。

### 2.4 品牌 Brand

| Token | 值 | 用途 |
|---|---|---|
| `--c-brand-mint` | `#b6ff2c` | 主品牌：亮绿（hero、徽标、进度条、激活态） |
| `--c-brand-mint-soft` | `#e9ffc6` | 主品牌浅色：选中态/激活态背景 |
| `--c-brand-yellow` | `#f7ff58` | 辅品牌：亮黄（hero、提示徽标） |
| `--c-brand-yellow-soft` | `#fff6bd` | 辅品牌浅色：警告/提示条背景 |
| `--c-brand-neutral` | `#eef0ec` | 中性浅灰（无法判断、未激活标签） |
| `--c-brand-neutral-2` | `rgba(255,255,255,0.68)` | 半透明白（detail 评分 dot） |

**主品牌色只有 2 个：mint（绿）+ yellow（黄）**。禁止新增其他品牌色（紫/粉/蓝等）。

### 2.5 描边 Line

| Token | 值 | 用途 |
|---|---|---|
| `--c-line-soft` | `rgba(17,23,19,0.06)` | 极弱描边（bottom-nav 底） |
| `--c-line` | `rgba(17,23,19,0.08)` | 标准描边（卡片、表单行、search） |
| `--c-line-strong` | `#eef0ec` | 浅灰描边/标签背景 |
| `--c-line-selected` | `#111713` | 选中态粗描边（3rpx 黑色） |

**描边粗细阶梯**：1rpx（普通）→ 3rpx（选中态）。中间不要出现 2rpx。

### 2.6 状态徽标 Status

四种反馈 + 中性：

| Token | 值 | 对应 |
|---|---|---|
| `--c-status-eager` | `#b6ff2c` | 主动吃 = mint |
| `--c-status-okay` | `#b6ff2c` | 正常接受 = mint |
| `--c-status-reluctant` | `#f7ff58` | 勉强吃 = yellow |
| `--c-status-bury` | `#111713` | 埋屎避雷 = 黑底白字 |
| `--c-status-neutral` | `#eef0ec` | 没法判断 = 浅灰 |

**核心约束**：`eager` 和 `okay` 视觉上不可区分（都吃完了，分级属于后续需求）。

---

## 3. 字体系统

### 3.1 字体族

```css
--font-family-base: -apple-system, BlinkMacSystemFont,
                    "PingFang SC", "Microsoft YaHei", sans-serif;
```

iOS 走 PingFang SC，Android 走系统默认中文字体。

### 3.2 字号体系（沿用 DDMC 的"用场景选字号"思路）

| Token | 值 | DDMC 对应 | 用途 |
|---|---|---|---|
| `--fs-root` | `28rpx` | — | page 根字号（app.wxss） |
| `--fs-xs` | `17rpx` | 10/12 Standard | 极小：meta、status、empty-card |
| `--fs-sm` | `19rpx` | 11/14 Standard | 小：标签、字段、kicker |
| `--fs-base` | `22rpx` | 12/14 Standard | 基础：描述、备注 |
| `--fs-md` | `26rpx` | 14/16 Standard | 中：商卡标题、字段值 |
| `--fs-lg` | `30rpx` | 16/18 Standard | 中大：empty-state、step heading |
| `--fs-xl` | `40rpx` | 20/24 Standard | 大：section title、品牌名 |
| `--fs-2xl` | `47rpx` | 24/28 Header | 大页面标题（library、step heading） |
| `--fs-3xl` | `62rpx` | 32/36 Header | hero 标题（home） |

**字号阶梯**：17 → 19 → 22 → 26 → 30 → 40 → 47 → 62。不连续跳跃（22→26、30→40 跨度过大），但符合产品节奏。

### 3.3 字重体系

| Token | 值 | 用途 |
|---|---|---|
| `--fw-regular` | `400` | 标准（极少用） |
| `--fw-medium` | `700` | 字段值、辅文字 |
| `--fw-bold` | `800` | 标签、meta |
| `--fw-extra` | `850` | 强调、bottom-nav item |
| `--fw-black` | `900` | 主要按钮、徽标、商卡标题 |
| `--fw-heavy` | `950` | 标题、品牌 |

**整体偏重**：所有 UI 文字 800+ 字重，标题 950。**不要为了"易读性"擅自降到 600 以下**，那是其他产品的做法。

---

## 4. 圆角系统

### 4.1 阶梯

```
14rpx  ←  小图标容器（bottom-nav icon）
18rpx  ←  中图标容器（bottom-nav camera）
22rpx  ←  大图标容器（outcome icon）
24rpx  ←  status-banner 缩略图
26rpx  ←  recent-item swatch
30rpx  ←  recognition-note 小条
34rpx  ←  输入框、save-button、assist-box
42rpx  ←  ★ 标准卡片（出现 10+ 次）
50rpx  ←  大卡片（bottom-nav 容器）
58rpx  ←  超大卡片（hero、detail-visual）
66rpx  ←  ★ 顶级圆角（hero__cat、detail-visual__can）
999rpx ←  ★ 胶囊（出现 20+ 次）
```

### 4.2 使用规则

- **42rpx** 是卡片默认圆角，所有新加的容器类元素优先用这个。
- **66rpx** 是产品记忆点（hero 角、罐头容器），不要轻易用。
- **999rpx** 是胶囊专用，不要用在容器上。
- **30/34rpx** 是表单/输入专用，不要用在卡片上。

---

## 5. 间距系统

| Token | 值 | 典型场景 |
|---|---|---|
| `--sp-2` | `6rpx` | 极小间距 |
| `--sp-3` | `9rpx` | 紧凑间距（kicker padding） |
| `--sp-4` | `12rpx` | 元素间 |
| `--sp-5` | `16rpx` | 字段间 |
| `--sp-6` | `18rpx` | 卡片内元素（多列 gap） |
| `--sp-7` | `22rpx` | 卡片内边距（容器 padding） |
| `--sp-8` | `28rpx` | 区块内边距（restock-feature） |
| `--sp-9` | `30rpx` | 页面水平内边距 |
| `--sp-10` | `36rpx` | 大区块间 |
| `--sp-11` | `42rpx` | hero padding、大区块内边距 |

**说明**：本产品的间距节奏不是严格的 3 倍数基准（DDMC 用 9/12/18/24/36/72），而是更密的阶梯。**不要强行按 3 倍数硬凑**。

---

## 6. 阴影系统

| Token | 值 | 用途 |
|---|---|---|
| `--shadow-card-sm` | `0 16rpx 42rpx rgba(17,23,19,0.05)` | quick-card |
| `--shadow-card` | `0 18rpx 48rpx rgba(17,23,19,0.06)` | food-card、form-card |
| `--shadow-card-lg` | `0 20rpx 54rpx rgba(17,23,19,0.08)` | card、photo-card.has-photo |
| `--shadow-button` | `0 18rpx 34rpx rgba(17,23,19,0.17)` | primary-button |
| `--shadow-orb` | `0 20rpx 38rpx rgba(17,23,19,0.22)` | bottom-nav 中央 add 球 |
| `--shadow-nav` | `0 28rpx 70rpx rgba(17,23,19,0.18)` | 底部导航 |
| `--shadow-topbar` | `0 9rpx 28rpx rgba(17,23,19,0.08)` | topbar 按钮 |

**7 个层级，按浮起深度递增**：
- 卡片（轻浮起）→ 按钮（点击态）→ Orb（最重 CTA）→ Nav（最重固定层）

**禁止**：
- 不要用 `box-shadow: 0 0 10px ...` 这种"光晕"阴影
- 不要用 `inset` 内阴影
- 不要叠加两层以上阴影

---

## 7. 组件结构

按现有 wxss 整理的组件分类（**沿用 DDMC 的分类思路，但只保留猫吃了吗有的**）：

### 7.1 基础容器

| 组件 | 类名 | 来源 |
|---|---|---|
| 页面外壳 | `.page-shell` | app.wxss |
| 卡片 | `.card` | app.wxss |
| 胶囊 | `.pill` | app.wxss |

### 7.2 交互控件

| 组件 | 类名 | 来源 |
|---|---|---|
| 主要按钮 | `.primary-button` | app.wxss |
| 次要按钮 | `.secondary-button` | app.wxss |
| 危险按钮 | `.danger-button` | app.wxss |
| 顶部返回按钮 | `.topbar__back` / `.icon-button` | app.wxss |

### 7.3 反馈与提示

| 组件 | 类名 | 来源 |
|---|---|---|
| 状态徽标 | `.status--mint/--yellow/--purple/--gray` | home/food-card/detail |
| 状态条 banner | `.status-banner--mint/--yellow/--gray/--dark` | detail.wxss |
| 空状态 | `.empty-state` | app.wxss |

### 7.4 标签类

| 组件 | 类名 | 来源 |
|---|---|---|
| 章节 kicker | `.step-heading__kicker` / `.prompt__kicker` | add/feedback |
| 章节标题 | `.section__title` / `.step-heading__title` | app/add |
| 计数器 chip | `.food-identity__count` / `.library-count` | feedback/library |

### 7.5 商品展示

| 组件 | 类名 | 来源 |
|---|---|---|
| 食物卡片 | `<food-card>` | components/food-card |
| 食物身份卡 | `.food-identity` | feedback.wxss |
| 反馈结果卡 | `.outcome` | feedback.wxss |
| 拍照卡 | `.photo-card` | add.wxss |

### 7.6 导航与布局

| 组件 | 类名 | 来源 |
|---|---|---|
| 顶部栏 | `.topbar` | app.wxss |
| 章节 | `.section` | app.wxss |
| 底部导航 | `<bottom-nav>` | components/bottom-nav |
| 搜索框 | `.search-box` | library.wxss |

### 7.7 表单

| 组件 | 类名 | 来源 |
|---|---|---|
| 表单容器 | `.form-card` | add.wxss |
| 字段 | `.field` | add.wxss |
| 备注框 | `.note-field` | feedback.wxss |

### 7.8 历史与列表

| 组件 | 类名 | 来源 |
|---|---|---|
| 最近项 | `.recent-item` | home.wxss |
| 历史项 | `.history-item` | detail.wxss |
| 进度条 | `.progress` / `.progress__fill` | food-card.wxss |

---

## 8. Token 使用规范

### 8.1 强制规则

- **所有新代码必须用 var()**，禁止直接写 hex/rpx/字重值。
- **必须有 fallback**：写 `var(--xxx, #fallback)`，基础库 < 2.6.0 时回退。
- **先查 token，再考虑新建**：同色不同透明度优先复用 ink / brand 系列。

### 8.2 命名约定

```
前缀：
  --c-  颜色 (color)
  --r-  圆角 (radius)
  --sp- 间距 (spacing)
  --fs- 字号 (font-size)
  --fw- 字重 (font-weight)
  --shadow- 阴影
  --font- 字体族

角色命名（颜色）：
  -primary / -secondary / -tertiary / -quaternary
  -on-dark / -on-yellow  (深底/黄底文字)
  -mint / -yellow / -neutral  (品牌色族)
  -status-*  (状态徽标专用)
```

### 8.3 迁移策略

不在本次范围内，但**未来迁移时**建议：
1. 从 `app.wxss` 公共类开始（`.card`、`.pill`、按钮等）
2. 再迁组件（food-card、bottom-nav）
3. 最后迁页面级样式
4. 每改一处，跑一遍 `npm run validate` 验证不破坏小程序

---

## 9. 与 docs/03-交互架构.md 的差异

> **这部分需要决策**——本文档跟 `03-交互架构.md` 第 9-12 条视觉原则存在多处差异：

| 维度 | 03-交互架构.md 写的 | 当前代码实现 | 建议 |
|---|---|---|---|
| 全局画布 | `#FAFAFA`（白灰） | `#FFF8EF` / `#F4F5F1`（米黄） | 保留实现，米黄更贴合"奶萌"调性 |
| 品牌绿 | `#34C759`（iOS 系统绿） | `#B6FF2C`（亮绿） | 保留实现 |
| 圆角 | 中小圆角（文档没说具体值，但说"不厚重强色块"） | 42-66rpx 超大圆角 | 保留实现 |
| 阴影 | "投影只保留给猫咪头像、模态弹层和系统提示" | 几乎所有卡片都有阴影 | **需要决定**：所有卡片阴影是否符合"奶萌"调？或只给特定层级？ |
| 颜色装饰 | "低饱和蓝紫粉薄荷弥散" | 没有弥散背景 | **需要决定**：要不要加弥散？ |
| 底部导航 | 文字色 + 线描图标 + 浅绿底，无悬浮按钮 | 黑色实心 add 球悬浮在导航条上 | **需要决定**：add 球是不是该改？ |
| 图标 | 24px 1.5px 线描（DDMC 体系） | 实心 14-18rpx 圆角图标 | 保留实现，小圆角更可爱 |

**我的建议**：
- 颜色、圆角、字重、阴影**当前实现已自洽**，建议保留并在本文档落档。
- 把 `03-交互架构.md` 第 9-12 条更新为本文档的现状（**这是产品文档维护的常规工作**）。
- 弥散背景、悬浮按钮等**未来想加再单独讨论**，不要现在动。

---

## 10. 后续工作（不在本次范围）

按工作量从轻到重排：

1. 把 `03-交互架构.md` 第 9-12 条更新为本文档
2. 把 `app.wxss` 现有公共类（`.card`/`.pill`/按钮）迁移到用 var()
3. 把组件（food-card、bottom-nav）样式迁移到用 var()
4. 把页面（home/add/library/feedback/detail）样式迁移到用 var()
5. 写 CLAUDE.md（组件索引 + AI 使用指南）
6. 写各组件的 `rules.md`（"什么时候用、什么时候不用"决策规则）

本次只完成了 step 0（建 token 文件 + 写本文档）。1-6 视需要再说。
