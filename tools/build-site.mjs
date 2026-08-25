import {
  cpSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  rmSync
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const client = path.join(dist, "client");
const server = path.join(dist, "server");
const metadata = path.join(dist, ".openai");

rmSync(dist, { recursive: true, force: true });
mkdirSync(client, { recursive: true });
mkdirSync(server, { recursive: true });
mkdirSync(metadata, { recursive: true });

const files = [
  ["preview/index.html", "client/index.html"],
  ["preview/preview.js", "client/preview.js"],
  ["preview/preview.css", "client/preview.css"],
  ["manifest.webmanifest", "client/manifest.webmanifest"],
  ["sw.js", "client/sw.js"],
  ["worker/index.mjs", "server/index.js"],
  [".openai/hosting.json", ".openai/hosting.json"]
];

for (const [source, target] of files) {
  const sourcePath = path.join(root, source);
  if (!existsSync(sourcePath)) {
    throw new Error(`Missing Sites build input: ${source}`);
  }
  copyFileSync(sourcePath, path.join(dist, target));
}

cpSync(path.join(root, "assets"), path.join(client, "assets"), {
  recursive: true
});
cpSync(path.join(root, "utils"), path.join(client, "utils"), {
  recursive: true
});
// v1.1.2：把 @cloudbase/js-sdk 打成 IIFE bundle 放到 dist，
// 让 H5 页面能通过 <script src="./utils/cloudbase-sdk.js"> 挂到 globalThis.cloudbase。
// 之前 SDK 只能在 Node 端 require，H5 实际拿不到，云同步卡片永远不渲染。
const { build: esbuild } = await import("esbuild");
await esbuild({
  entryPoints: [path.join(root, "node_modules/@cloudbase/js-sdk/dist/index.cjs.js")],
  bundle: true,
  format: "iife",
  globalName: "cloudbase",
  target: "es2018",
  minify: true,
  outfile: path.join(client, "utils/cloudbase-sdk.js"),
  logLevel: "silent"
});
// 诊断 / 调试工具页（如 data rescue）跟随 preview 一同 build，不参与主 H5 流程
if (existsSync(path.join(root, "preview/_diag"))) {
  cpSync(path.join(root, "preview/_diag"), path.join(client, "_diag"), {
    recursive: true
  });
}

for (const required of [
  "client/index.html",
  "client/preview.js",
  "client/preview.css",
  "server/index.js",
  ".openai/hosting.json"
]) {
  if (!existsSync(path.join(dist, required))) {
    throw new Error(`Missing Sites build output: ${required}`);
  }
}

console.log("Sites build ready: dist/client, dist/server and dist/.openai");
