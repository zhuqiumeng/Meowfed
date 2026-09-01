const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const port = Number(process.env.PREVIEW_PORT || 4173);
const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml; charset=utf-8"
};

const server = http.createServer((request, response) => {
  const requestPath = request.url.split("?")[0];
  const previewFiles = {
    "/": "preview/index.html",
    "/preview.css": "preview/preview.css",
    "/preview.js": "preview/preview.js"
  };
  const relativePath = previewFiles[requestPath] || requestPath.replace(/^\/+/, "");

  // v1.1.2：dist 路径（build 出的 IIFE bundle + SDK）优先；source 作为 fallback。
  // 这样 build 后能立即用本地 server 验证，不用先 git commit。
  const distRoot = path.join(root, "dist", "client");
  const distFilePath = path.join(distRoot, relativePath);
  const filePath = path.join(root, relativePath);

  if (!filePath.startsWith(root) && !distFilePath.startsWith(distRoot)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  // 先查 dist（build 产物）；找不到再查 source
  if (distFilePath.startsWith(distRoot) && fs.existsSync(distFilePath)) {
    fs.readFile(distFilePath, (error, content) => {
      if (error) {
        response.writeHead(404);
        response.end("Not found");
        return;
      }
      response.writeHead(200, {
        "Content-Type": contentTypes[path.extname(distFilePath)] || "application/octet-stream",
        "Cache-Control": "no-store"
      });
      response.end(content);
    });
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }
    response.writeHead(200, {
      "Content-Type": contentTypes[path.extname(filePath)] || "application/octet-stream",
      "Cache-Control": "no-store"
    });
    response.end(content);
  });
});

// v1.1.4：绑 0.0.0.0 让 iPhone 等局域网设备能访问。打印局域网 IP 方便对照。
server.listen(port, "0.0.0.0", () => {
  const { networkInterfaces } = require("node:os");
  const ips = [];
  for (const list of Object.values(networkInterfaces())) {
    for (const i of list || []) {
      if (i.family === "IPv4" && !i.internal) ips.push(i.address);
    }
  }
  console.log(`Preview ready at http://127.0.0.1:${port}`);
  if (ips.length) {
    console.log(`LAN (iPhone): http://${ips[0]}:${port}`);
  } else {
    console.log("(no LAN IPv4 found — iPhone may not reach this server)");
  }
});
