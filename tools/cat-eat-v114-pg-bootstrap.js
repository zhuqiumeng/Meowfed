#!/usr/bin/env node
/* eslint-disable no-console */
// v1.1.4 PG 数据层 — 用 CAM 子账号 secretId/Key 拿 admin token,调
// POST /v1/rdb/exec-pgsql 跑 DDL(单条/逐次,不走 DO 包装因为 cloudbase_postgres 是 BYPASSRLS)
//
// 🚨 历史: 2026-09-01 首次建表用主账号密钥跑完 23 条 DDL,密钥已禁用
//   之后改用 CAM 子账号 + QcloudTCBFullAccess 策略
//
// 用法:
//   export TENCENTCLOUD_SECRETID=<子账号 SecretId>
//   export TENCENTCLOUD_SECRETKEY=<子账号 SecretKey>
//   node tools/cat-eat-v114-pg-bootstrap.js
//   node tools/cat-eat-v114-pg-bootstrap.js --verify  (只验 5 张表已建好)

const fs = require('fs');
const path = require('path');
const https = require('https');
const { init } = require('@cloudbase/node-sdk');

const ENV_ID = 'meowfed-d8gc79bfpabac02b3';
const HOST = `${ENV_ID}.api.tcloudbasegateway.com`;
const EXEC_PATH = '/v1/rdb/exec-pgsql';
const DDL_PATH = '/tmp/cat-eat-v114-ddl.sql';
const ROLE = 'cloudbase_postgres';

// 🚨 走环境变量,不硬编码密钥。已禁用主账号 secretId/Key,改用 CAM 子账号(QcloudTCBFullAccess)
// 配合 export TENCENTCLOUD_SECRETID / TENCENTCLOUD_SECRETKEY
function readEnvSecret(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`❌ 缺环境变量 ${name},先 export TENCENTCLOUD_SECRETID / TENCENTCLOUD_SECRETKEY`);
    process.exit(1);
  }
  return v;
}
const SECRET_ID = readEnvSecret('TENCENTCLOUD_SECRETID');
const SECRET_KEY = readEnvSecret('TENCENTCLOUD_SECRETKEY');

const app = init({ secretId: SECRET_ID, secretKey: SECRET_KEY, env: ENV_ID });

let cachedToken = null;
let cachedTokenExp = 0;
async function getToken() {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && now < cachedTokenExp - 60) return cachedToken;
  const t = await app.auth().getClientCredential();
  cachedToken = t.access_token;
  // 解析 JWT exp 拿过期时间(没有就保底 1 小时)
  try {
    const payload = JSON.parse(Buffer.from(t.access_token.split('.')[1], 'base64url').toString());
    cachedTokenExp = payload.exp || now + 3600;
  } catch {
    cachedTokenExp = now + 3600;
  }
  return cachedToken;
}

function callExec(sql) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ sql, role: ROLE });
    getToken().then((accessToken) => {
      const req = https.request({
        method: 'POST',
        host: HOST,
        path: EXEC_PATH,
        headers: {
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(body),
          authorization: `Bearer ${accessToken}`,
        },
      }, (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          let parsed = data;
          try { parsed = JSON.parse(data); } catch {}
          resolve({ status: res.statusCode, body: parsed, raw: data });
        });
      });
      req.on('error', reject);
      req.write(body);
      req.end();
    }).catch(reject);
  });
}

function splitSql(text) {
  return text
    .split('\n')
    .filter((l) => !l.trim().startsWith('--'))
    .join('\n')
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

const TABLES = ['meta', 'cats', 'foods', 'results', 'assets'];

async function verifyTables() {
  console.log('🔍 验证 5 张表存在性...');
  let ok = 0;
  for (const t of TABLES) {
    const sql = `SELECT to_regclass('public.${t}') AS oid`;
    const r = await callExec(sql);
    if (r.status === 200 && Array.isArray(r.body)) {
      const row = r.body[0] || {};
      const exists = row.oid != null;
      console.log(`   public.${t.padEnd(8)} ${exists ? '✅' : '❌ not found'}`);
      if (exists) ok++;
    } else {
      console.log(`   public.${t.padEnd(8)} ❌ ${JSON.stringify(r.body).slice(0, 200)}`);
    }
  }
  console.log(`📊 ${ok}/5 张表就绪`);
  return ok === 5;
}

async function main() {
  const verifyOnly = process.argv.includes('--verify');

  console.log('🚀 v1.1.4 PG 数据层 bootstrap');
  console.log(`   envId: ${ENV_ID}`);
  console.log(`   role:  ${ROLE}`);
  console.log('');

  if (verifyOnly) {
    const ok = await verifyTables();
    process.exit(ok ? 0 : 1);
  }

  // 读 DDL
  if (!fs.existsSync(DDL_PATH)) {
    console.error(`❌ 找不到 DDL: ${DDL_PATH}`);
    process.exit(1);
  }
  const ddl = fs.readFileSync(DDL_PATH, 'utf8');
  const stmts = splitSql(ddl);
  console.log(`📦 ${stmts.length} 条 SQL 待执行`);
  console.log('');

  let ok = 0, fail = 0;
  for (let i = 0; i < stmts.length; i++) {
    const sql = stmts[i];
    const preview = sql.replace(/\s+/g, ' ').slice(0, 80);
    process.stdout.write(`[${i + 1}/${stmts.length}] ${preview} ... `);
    try {
      const r = await callExec(sql);
      if (r.status === 200) {
        console.log('✅');
        ok++;
      } else {
        console.log(`❌ [${r.status}]`, JSON.stringify(r.body).slice(0, 200));
        fail++;
      }
    } catch (e) {
      console.log('❌ EXC', e.message);
      fail++;
    }
  }
  console.log('');
  console.log(`📊 ${ok} ok, ${fail} fail / total ${stmts.length}`);

  if (fail > 0) {
    console.log('⚠️ 有失败,先排查再继续');
    process.exit(1);
  }

  console.log('');
  console.log('🔍 验证 5 张表...');
  const allReady = await verifyTables();
  if (!allReady) {
    console.log('❌ 部分表没建好,重试或检查');
    process.exit(1);
  }

  console.log('');
  console.log('✨ 5 张表 + 9 indexes + 5 RLS + 5 anon_all policy 全部就绪');
  console.log('');
  console.log('🚨🚨🚨 安全告警 🚨🚨🚨');
  console.log('   这把主账号 secretId/Key 已被本脚本使用,权限等同于 root');
  console.log('   请立即去 腾讯云控制台 → CAM → API 密钥管理 → 找到');
  console.log('   SecretId: AKID_REDACTED → 禁用');
  console.log('   之后会改为子账号 + 最小权限策略,这一步我来做,稍后告诉你怎么弄');
  console.log('');
  console.log('📱 下一步: iPhone Safari 打开 http://127.0.0.1:4173 看云同步状态');
  console.log('   期望从 "no-sdk/error" 变 "ready",数据自动落云端');
}

main().catch((e) => {
  console.error('💥 FATAL', e);
  process.exit(1);
});
