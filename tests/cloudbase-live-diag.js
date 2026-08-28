// tests/cloudbase-live-diag.js
//
// 对一个真实的 CloudBase 环境做 5 步连通性诊断。
// 用法：node tests/cloudbase-live-diag.js <env-id>
//
// 报告每一步 pass / fail + 错误信息；全部通过 = MVP 可以开测。

const cloudbase = require("@cloudbase/js-sdk");

const envId = process.argv[2];
if (!envId) {
  console.error("用法: node tests/cloudbase-live-diag.js <env-id>");
  process.exit(1);
}

function step(num, total, label) {
  console.log(`\n[${num}/${total}] ${label}`);
}

function ok(msg) {
  console.log(`  ✓ ${msg}`);
}

function fail(msg) {
  console.log(`  ✗ ${msg}`);
}

(async () => {
  const TOTAL = 5;
  let stepNum = 0;
  let failedAt = null;
  let openid = null;

  try {
    step(++stepNum, TOTAL, `init app with env "${envId}"`);
    const app = cloudbase.init({ env: envId });
    ok("app initialized");

    step(++stepNum, TOTAL, "anonymous sign-in");
    let auth;
    try {
      auth = await app.auth().signInAnonymously();
      // v1.1.2：SDK 3.8 返回结构是 { user: { id, ... } }，老版本是 { openId }
      // 兼容两种 + 从 .data.user.id 取
      openid =
        auth?.user?.id ||
        auth?.openId ||
        auth?.data?.user?.id ||
        (auth?.user && auth.user.openId);
      if (!openid) {
        fail("sign-in returned but no openid found in result");
        console.log("    result top-level keys =", Object.keys(auth || {}));
        if (auth && auth.user) console.log("    auth.user keys =", Object.keys(auth.user));
        return;
      }
      ok(`signed in, openid = ${openid}`);
    } catch (e) {
      fail(`signInAnonymously error: ${e.message || e}`);
      console.log("    → 解决: 腾讯云开发控制台 → 你的环境 → 用户管理 → 登录方式 → 打开「匿名登录」");
      return;
    }

    step(++stepNum, TOTAL, "write a probe record to 'foods' collection");
    const db = app.database();
    const probeId = `probe-${Date.now()}`;
    try {
      await db.collection("foods").doc(probeId).set({
        brand: "DIAG",
        name: "probe",
        createdAt: Date.now()
      });
      ok(`probe write OK, id = ${probeId}`);
    } catch (e) {
      fail(`foods write error: ${e.message || e}`);
      console.log("    → 解决: 腾讯云开发控制台 → 云数据库 → 权限设置");
      console.log("       当前是 RLS 模型，需要给 anon 角色加 SELECT/INSERT/UPDATE/DELETE 策略");
      console.log("       简单方案: USAGE / ALL on anon (RULE: auth.uid() = _openid)");
      return;
    }

    step(++stepNum, TOTAL, "read it back");
    try {
      const res = await db.collection("foods").where({ brand: "DIAG" }).get();
      const data = (res && res.data) || [];
      if (data.length === 0) {
        fail("write reported success but read returned 0 records (可能权限问题：read 拒绝 anon)");
        return;
      }
      ok(`read OK, count = ${data.length}, first = ${JSON.stringify(data[0])}`);
    } catch (e) {
      fail(`foods read error: ${e.message || e}`);
      return;
    }

    step(++stepNum, TOTAL, "upload a probe file to cloud storage");
    try {
      const result = await app.uploadFile({
        cloudPath: `cat-eat-assets/${openid}/probe-${Date.now()}.txt`,
        fileContent: Buffer.from("hello world from diag")
      });
      if (!result || !result.fileID) {
        fail("upload returned but no fileID in result");
        console.log("    result =", JSON.stringify(result));
        return;
      }
      ok(`upload OK, fileID = ${result.fileID}`);

      // cleanup: 立即删除探针文件，避免污染云存储
      try {
        await app.deleteFile({ fileList: [result.fileID] });
        ok("probe file cleaned up");
      } catch (cleanupErr) {
        console.log(`    (cleanup skipped: ${cleanupErr.message || cleanupErr})`);
      }
    } catch (e) {
      fail(`upload error: ${e.message || e}`);
      console.log("    → 解决: 腾讯云开发控制台 → 云存储 → 存储管理");
      console.log("       1) 如果「共 0 条 / 暂无存储桶」→ 先点「创建存储桶」");
      console.log("       2) 创建后进桶 → 访问策略 → 给 anon 角色加 read/write/delete 策略");
      return;
    }

    console.log("\n✅ All 5 steps passed. CloudBase is ready for MVP testing.");
    console.log(`   env = ${envId}`);
    console.log(`   openid = ${openid}`);
  } catch (e) {
    console.log(`\n💥 Unexpected error: ${e.message || e}`);
    console.log(e.stack);
  }
})();
