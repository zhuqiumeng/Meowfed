// tests/cloudbase-cleanup-probe.js
//
// 清理 cloudbase-live-diag.js 留下的 probe 探针记录。
// 用法：node tests/cloudbase-cleanup-probe.js <env-id>

const cloudbase = require("@cloudbase/js-sdk");

const envId = process.argv[2];
if (!envId) {
  console.error("用法: node tests/cloudbase-cleanup-probe.js <env-id>");
  process.exit(1);
}

(async () => {
  const app = cloudbase.init({ env: envId });
  const db = app.database();
  try {
    const auth = await app.auth().signInAnonymously();
    const openid = auth?.user?.uid || auth?.user?.id || auth?.openId;
    console.log(`signed in as ${openid}`);
    const res = await db.collection("foods").where({ brand: "DIAG", name: "probe" }).get();
    const data = Array.isArray(res?.data) ? res.data : (Array.isArray(res) ? res : []);
    console.log(`found ${data.length} probe record(s)`);
    for (const rec of data) {
      await db.collection("foods").doc(rec._id).remove();
      console.log(`  ✓ removed _id=${rec._id}`);
    }
    console.log("cleanup done");
  } catch (e) {
    console.log("error:", e.message || e);
  }
})();
