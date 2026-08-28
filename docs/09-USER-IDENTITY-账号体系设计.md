# 09 · 账号体系设计（v1.2 邮箱验证码）

> 目标：让 user 用「邮箱 + 6 位验证码」绑定真账号，换设备登录同一邮箱就能拉回云端数据。
> 配套阅读：[07 CloudBase MVP](./07-DATA-数据层迁移-CloudBase-MVP.md) · [08 真机验收 Runbook](./08-LAUNCH-真机验收-Runbook.md)

---

## 0. 背景

v1.1.2 防丢方案是**匿名 CloudBase `_openid`** —— 浏览器/PWA 装上 SDK 后自动拿一个 anon uid，写每条记录都注入 `_openid` 字段做隔离。

**问题**：`_openid` 跟浏览器实例绑，**换设备 = 新 uid = 看不到老数据**。iPhone Safari PWA + 隐身窗口 + 换机，三种场景数据都拉不回。

v1.2 要做**真账号体系**：用户主动填邮箱 → 后台发 6 位验证码 → 校验通过 → `email → _openid` 映射存到 CloudBase 公共 collection。新设备用同一邮箱登录，就能用 `email` 找到老 `_openid`，把数据拉回来。

---

## 1. 选型回顾（why 邮箱）

| 方案 | 取舍 | 选定？ |
| --- | --- | --- |
| A. 手机号 + 短信 | CloudBase 短信要 ① 签名备案 ② 配额 ③ 域名白名单；流程 3-5 天 | 否 |
| B. 邮箱 + 验证码 | DirectMail 走阿里云，¥0.1/封；PWA 输入邮箱体验可接受 | ✅ 选 C |
| C. 微信 / Apple / 6 位同步码 + 云函数 | PWA 调不到 wx.login / Apple sign-in；6 位码 + 云函数方案 bypass 限制但要写云函数 | 否（v1.2 不做） |

---

## 2. 阿里云 DirectMail 集成

| 项 | 值 |
| --- | --- |
| 服务 | 阿里云邮件推送 DirectMail |
| 价格 | ¥0.1 / 封（按量后付） |
| 必做 | ① 发件人域名备案（猫吃了邮箱域） ② DKIM / SPF 配置 ③ 阿里云 accessKey |
| 触发条件 | 验证码邮件 + 异常通知（密码找回、迁移确认） |
| 模板 | `vcode-login` 单一模板，6 位数字 + 有效期文案 |
| 频率限制 | 同一邮箱 1 分钟 1 封，1 小时 5 封，1 天 15 封（防刷） |

### 2.1 阿里云后端准备清单

1. 控制台 → 邮件推送 → 发件域名 → 验证 `meowfed.app`（或自有域）所有权
2. 配置 SPF / DKIM 记录（3 条 DNS）
3. 创建发件地址 `noreply@meowfed.app`，记下 accessKey
4. 创建短信/邮件模板：
   - 模板 ID: `vcode-login`
   - 变量: `${code}`（6 位数字）、${validMinutes}（默认 10）
   - 审批通过（~1 天）

### 2.2 CloudBase 安全：accessKey 放云函数环境变量

> 千万不要把 accessKey 写前端代码或 commit 进去。

- CloudBase 控制台 → 云函数 → `sendEmailCode` → 配置 → 环境变量：
  - `ALIYUN_ACCESS_KEY_ID`
  - `ALIYUN_ACCESS_KEY_SECRET`
  - `ALIYUN_DM_ACCOUNT_NAME` (发件地址)
- 云函数用 `@alicloud/dm` SDK 调 DirectMail 发送 API
- accessKey 用 CloudBase 提供的「子账号 + RAM 策略」限制只允许 DirectMail 发送

---

## 3. CloudBase 云函数设计

放在 `cloudfunctions/` 目录，CloudBase 控制台 → 云函数 → 上传部署。

### 3.1 `sendEmailCode` — 发验证码

**入参**：`{ email: "user@example.com" }`（POST JSON）

**流程**：
1. 校验邮箱格式（regex）
2. 频率限制（Redis 计数 key: `rl:email:${email}`，5min 1 封）
3. 生成 6 位随机码
4. 存到 `verification_codes` collection（TTL 10 min）：
   ```
   { _id: "<auto>", email, code, createdAt, expiresAt: now+600s, used: false }
   ```
5. 调 DirectMail 发送邮件（accessKey 走环境变量）
6. 返回 `{ ok: true }`（不返回 code 本身）

**错误**：
- `429 RATE_LIMITED`：1 分钟内重复
- `400 INVALID_EMAIL`：格式错
- `500 MAIL_FAILED`：DirectMail 拒发（账户欠费 / 模板未批 / 域名未验证）

### 3.2 `verifyEmailCode` — 验证并 link

**入参**：`{ email, code, openid }`（POST JSON，openid 来自 SDK auth.getCurrentUser）

**流程**：
1. 查 `verification_codes` 找 `(email, code, used: false)` 最新一条
2. 校验 `expiresAt > now`，否则返回 `400 CODE_EXPIRED`
3. 校验通过 → 标记 `used: true`（防重放）
4. **link 逻辑**：
   - 查 `user_identities` collection 找 `{ email }`
   - **情况 A**（首次绑定）：没有记录 → 写 `{ email, primaryOpenid: openid, createdAt, lastLoginAt }`
   - **情况 B**（同设备再次 verify）：记录存在且 `primaryOpenid === openid` → 只更新 `lastLoginAt`
   - **情况 C**（新设备 link 到老账号）：记录存在但 `primaryOpenid !== openid` → 触发**数据迁移**（见 3.4）
5. 返回 `{ ok: true, primaryOpenid, isNewDevice: <情况 C> }`

**错误**：
- `400 CODE_INVALID`：码错 / 已用
- `400 CODE_EXPIRED`：超时

### 3.3 `resolveEmailToOpenid` — 已绑定的邮箱快捷登录

**入参**：`{ email, openid }`（POST JSON）

**流程**：
1. 查 `user_identities` 找 `{ email }`
2. 找到 → 返回 `{ primaryOpenid, isNewDevice: primaryOpenid !== openid }`
3. 找不到 → 返回 `404 NOT_LINKED`（让前端跳到 sendEmailCode 流程）

**用途**：调试抽屉的「输入邮箱」按钮可以调这个，让用户只填邮箱 + 一个确认（不发验证码）就 link。但 v1.2 暂不暴露，v1.2 强制走验证码（防账号劫持）。

### 3.4 `mergeOpenidData` — 跨设备数据迁移

**入参**：`{ fromOpenid, toOpenid }`（仅 verifyEmailCode 情况 C 内部调）

**流程**（用云函数事务）：
```
1. 读 fromOpenid 的 4 collection（cats/foods/results/assets）全部记录
2. 把 fromOpenid 的记录全部改 _openid = toOpenid 后写到 toOpenid 名下
3. 删除 fromOpenid 的旧记录
4. 同步 user_identities.primaryOpenid = toOpenid（不变，因为就是 toOpenid）
5. 返回 { ok: true, counts: { cats, foods, results, assets } }
```

**风险与降级**：
- 写入冲突（两端同时改）→ MVP 不解决，最后写赢；v1.3 加 lastWriteTime
- 资产 blob（图片）大 → 用 CloudBase storage 内部 copy，不走外网
- 部分失败 → 云函数事务回滚；前端看到 `500 MIGRATION_FAILED` 让用户重试

---

## 4. 前端 onboarding UI

### 4.1 启动流程（替换 v1.1.2 的"无感启动"）

```
data-store init
  ↓
检查 user 是否已 bind 邮箱（localStorage key: cat-eat-user-email）
  ↓
case A: 没 bind → 显示 onboarding 三屏
  屏 1: 欢迎 + "登录" / "跳过" 二选一
  屏 2: 输入邮箱 → sendEmailCode → 邮件 6 位码 → verifyEmailCode
  屏 3: link 成功 → 写 localStorage 标识 → 自动 cloudSync.start()
case B: 已 bind → 静默启动 cloudSync.start()，不弹任何 UI
```

### 4.2 localStorage schema

```js
// user 身份持久化（仅 anon，敏感信息都在云端）
cat-eat-user-email: "user@example.com"  // 已 bind 的邮箱；没 bind 时不存在
cat-eat-user-linked-at: 1787900000000   // 时间戳，方便 v2 加 refresh
```

### 4.3 "跳过" 的语义

v1.2 跳过 ≠ v1.1.2 完全无感。**跳过** = 当前设备继续用匿名 uid，本地有数据，但**没云端保护**。下次清缓存 / 换设备 = 数据丢。

UI 上要明确：
- onboarding 屏 1：「跳过」用次要按钮样式（虚线 / 灰底）
- 屏 1 文案：「跳过 = 仅本地保存。换设备 / 清缓存会丢。登录可同步到云端。」
- 任何时候在「云同步」卡片可点「立即登录」重新触发 onboarding

### 4.4 iPhone 真机 UX 细节

- 邮箱输入键盘：`type="email" inputmode="email" autocapitalize="none" autocomplete="email"`
- 验证码输入：6 位数字框，分别聚焦，输完自动 verify
- 「重发验证码」按钮：60s 倒计时（前端实现）
- 「没收到邮件」：显示发件邮箱 + 提示查垃圾箱
- 网络失败：toast「网络断了，重试」+ 重试按钮

---

## 5. 数据 schema 增量

### 5.1 `user_identities` collection

```json
{
  "_id": "<auto>",
  "email": "user@example.com",        // 唯一索引
  "primaryOpenid": "abc123...",        // 此邮箱绑定的 anon uid
  "createdAt": 1787900000000,
  "lastLoginAt": 1787900000000,
  "deviceCount": 2,                    // 已知登录过的设备数
  "lastDeviceOS": "iOS"
}
```

索引：`(email 唯一, primaryOpenid, lastLoginAt)`

### 5.2 `verification_codes` collection

```json
{
  "_id": "<auto>",
  "email": "user@example.com",
  "code": "123456",                    // 明文存，10 min 后失效
  "createdAt": 1787900000000,
  "expiresAt": 1787900600000,          // 索引
  "used": false,
  "ip": "1.2.3.4",                     // 审计用
  "userAgent": "..."
}
```

索引：`(email, expiresAt)` 复合，TTL 自动清理（CloudBase 支持字段 TTL）

### 5.3 RLS 策略（每个 collection 加 4 条）

```sql
-- user_identities: 只能读自己的；anon 不能写（云函数走 admin key）
"user_self_read"   SELECT WHERE _openid = ${openid} OR auth.role = 'admin'
"admin_write"      INSERT/UPDATE/DELETE WHERE auth.role = 'admin'

-- verification_codes: anon 完全不能读（云函数管）
"admin_only"       ALL WHERE auth.role = 'admin'
```

---

## 6. 风险与 v2 路线图

### 6.1 v1.2 不解决的风险

- **同设备换浏览器不会触发 link**：用同一 anon uid，但 `cat-eat-user-email` localStorage 跟着浏览器走
- **邮箱被冒用**：user 用别人邮箱能 link 到别人 _openid → 需用户自己负责（v1.2 不强校验，但 console 会输出 warning log）
- **没冲突解决**：两端同时改 → last-write-wins
- **没软删除**：删除是 hard delete（v1.1.2 也这样）

### 6.2 v2 候选

- 微信 / Apple sign-in（小程序端）
- 设备管理：列出登录过的设备 + 远程踢出
- 双向同步：增量字段（`updatedAt`）+ 冲突解决（CRDT 或 last-write-wins + 通知）
- 微信小程序 / H5 账号打通：unionId 关联

### 6.3 v1.2 实施清单

| # | 任务 | 估时 | 文件 |
| --- | --- | --- | --- |
| 1 | 阿里云 DirectMail 开通 + 域名备案 + 模板审批 | 1-3 天（外部） | — |
| 2 | 写 4 个云函数（sendEmailCode / verifyEmailCode / resolveEmailToOpenid / mergeOpenidData） | 0.5 天 | `cloudfunctions/*/index.js` |
| 3 | 部署云函数到 CloudBase + 配置 accessKey 环境变量 | 0.5h | CloudBase console |
| 4 | 配置 user_identities / verification_codes collection + RLS | 1h | CloudBase console |
| 5 | 前端 onboarding UI（三屏 + 邮箱输入 + 验证码输入） | 1 天 | `preview/onboarding/*` |
| 6 | 改造 CloudBaseAdapter：邮箱已 link 时用 primaryOpenid 写记录 | 0.5 天 | `utils/adapters/cloudbase-adapter.js` |
| 7 | 真机验收：iPhone 注册 → 重装 → 数据回得来 | 0.5 天 | manual |
| 8 | 文档：USER_GUIDE / FAQ 解释「跳过 = 仅本地」 | 2h | `docs/10-USER-GUIDE.md` |

总估时：~3-4 天开发 + 1-3 天外部审批（DirectMail 域名备案）。可以并行。

---

## 7. 调试 / 回滚

### 7.1 如何强制 unlink（忘记密码等价）

调试抽屉加按钮：「解除邮箱绑定」→ 调云函数 `unlinkEmail({ email })`（v1.2 加）→ 删 `user_identities` 记录 → user 重新走 onboarding。

### 7.2 如何回滚到 v1.1.2 无感模式

- 删 `cat-eat-user-email` localStorage
- 删 `user_identities` collection（清干净）
- 不调 `verifyEmailCode` → 等同匿名登录

不需要改代码，UI 入口（云同步卡片「立即登录」按钮）只对没 bind 的 user 可见。

### 7.3 邮件发不出去怎么办

看 `cloudfunctions/sendEmailCode` 的 logs → DirectMail 控制台 → 失败原因：
- `InvalidReceiver.Name` → 邮箱无效或被反垃圾拦
- `TemplateNotFound` → 模板 ID 错了或未批
- `QuotaExceeded` → 余额不足
- `DomainNotVerified` → SPF/DKIM 配错

调试抽屉按钮（v1.2 加）：「测试邮件发送」→ 输入邮箱 → sendEmailCode → 实时看结果。

---

## 8. 改动文件清单

新增：
- `cloudfunctions/sendEmailCode/index.js` + `package.json`
- `cloudfunctions/verifyEmailCode/index.js` + `package.json`
- `cloudfunctions/resolveEmailToOpenid/index.js` + `package.json`
- `cloudfunctions/mergeOpenidData/index.js` + `package.json`
- `cloudfunctions/unlinkEmail/index.js` + `package.json` (v1.2 调试用)
- `preview/onboarding/onboarding.js` + `onboarding.css`
- `utils/identity.js` — 本地身份持久化（邮箱 / linkedAt）
- `docs/10-USER-GUIDE.md` — 用户文档

修改：
- `utils/adapters/cloudbase-adapter.js` — `_openid` 决策：link 后用 primaryOpenid，未 link 用 anon
- `utils/cloud-sync.js` — 启动时检查 identity，触发 onboarding 入口
- `preview/preview.js` — `renderHome()` 加 onboarding 入口
- `utils/diag.js` — 加「测试邮件发送」「解除邮箱绑定」调试按钮
- `docs/07-DATA-数据层迁移-CloudBase-MVP.md` — 加 v1.2 章节
- `docs/08-LAUNCH-真机验收-Runbook.md` — 加 onboarding 验收步骤
