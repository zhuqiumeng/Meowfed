const fs = require("node:fs");
const path = require("node:path");
const { parse } = require("@wxml/parser");
const { TmplGroup } = require("glass-easel-template-compiler");
const { StyleSheetTransformer } = require("glass-easel-stylesheet-compiler");

const root = path.join(__dirname, "..");

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);

    if (
      ["node_modules", ".playwright-cli", "dist", ".git", "audits"].includes(
        entry.name
      )
    ) {
      return [];
    }

    return entry.isDirectory() ? walk(fullPath) : [fullPath];
  });
}

const files = walk(root);
const jsonFiles = files.filter((file) => file.endsWith(".json"));
const wxmlFiles = files.filter((file) => file.endsWith(".wxml"));
const wxssFiles = files.filter((file) => file.endsWith(".wxss"));
const jsFiles = files.filter(
  (file) =>
    file.endsWith(".js") &&
    !file.endsWith("validate-miniapp.js") &&
    !file.includes(`${path.sep}preview${path.sep}`)
);

jsonFiles.forEach((file) => {
  JSON.parse(fs.readFileSync(file, "utf8"));
});

wxmlFiles.forEach((file) => {
  parse(fs.readFileSync(file, "utf8"));
});

const appConfig = JSON.parse(fs.readFileSync(path.join(root, "app.json"), "utf8"));
const projectConfig = JSON.parse(
  fs.readFileSync(path.join(root, "project.config.json"), "utf8")
);

if (projectConfig.projectname !== "猫吃了吗") {
  throw new Error("project.config.json 中的小程序名称不正确");
}

appConfig.pages.forEach((page) => {
  [".js", ".json", ".wxml", ".wxss"].forEach((extension) => {
    const file = path.join(root, `${page}${extension}`);
    if (!fs.existsSync(file)) {
      throw new Error(`页面文件缺失：${file}`);
    }
  });
});

for (const wxmlFile of wxmlFiles) {
  const jsFile = wxmlFile.replace(/\.wxml$/, ".js");
  if (!fs.existsSync(jsFile)) continue;

  const wxml = fs.readFileSync(wxmlFile, "utf8");
  const js = fs.readFileSync(jsFile, "utf8");
  const handlers = [
    ...wxml.matchAll(/bind(?:tap|input|change)=\"([A-Za-z0-9_]+)\"/g)
  ].map((match) => match[1]);

  new Set(handlers).forEach((handler) => {
    if (!new RegExp(`\\b${handler}\\s*\\(`).test(js)) {
      throw new Error(`${path.relative(root, wxmlFile)} 缺少事件处理器 ${handler}`);
    }
  });
}

jsFiles.forEach((file) => {
  new Function(fs.readFileSync(file, "utf8"));
});

const templateGroup = TmplGroup.newDev();
let compiledWxmlLength = 0;
wxmlFiles.forEach((file) => {
  const relativePath = path.relative(root, file);
  const errors = templateGroup.addTmpl(relativePath, fs.readFileSync(file, "utf8"));

  if (errors.length) {
    throw new Error(`${relativePath} 编译失败：${JSON.stringify(errors)}`);
  }

  compiledWxmlLength += templateGroup.getTmplGenObject(relativePath).length;
});
templateGroup.free();

let compiledWxssLength = 0;
wxssFiles.forEach((file) => {
  const relativePath = path.relative(root, file);
  const transformer = new StyleSheetTransformer(
    relativePath,
    fs.readFileSync(file, "utf8"),
    undefined,
    750,
    false
  );
  const warnings = transformer.extractWarnings();

  if (warnings.length) {
    throw new Error(`${relativePath} 编译警告：${JSON.stringify(warnings)}`);
  }

  compiledWxssLength += transformer.getContent().length;
  transformer.free();
});

console.log(
  [
    `Mini Program validation OK`,
    `${appConfig.pages.length} pages`,
    `${wxmlFiles.length} WXML`,
    `${wxssFiles.length} WXSS`,
    `${jsonFiles.length} JSON`,
    `compiled WXML ${compiledWxmlLength} bytes`,
    `compiled WXSS ${compiledWxssLength} bytes`
  ].join(" · ")
);
