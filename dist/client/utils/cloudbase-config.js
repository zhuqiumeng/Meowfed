// utils/cloudbase-config.js
//
// CloudBase 环境配置。所有 CloudBase 入口都从这里读取 env ID 与
// storage 路径前缀，feature flag 决定是否真正启用云同步。
//
// 默认状态：未配置。CloudBase MVP 不会改变任何现有数据层行为；只有
// 当 env ID 注入后，cloud-sync.js 才会启动并暴露 sync 接口。
//
// 配置方式（任选其一）：
//
//   1. 构建时注入：构建脚本读取 .env 或环境变量，把 env ID 写到
//      window.__CLOUDBASE_ENV__ 上。
//   2. 运行时调用：用户在 UI「云同步」面板里填入 env ID 并保存。
//      该路径会持久化到 localStorage（key: cat-eat-cloudbase-env）。
//   3. 测试 / 本地：通过 options.cloudbase.env 注入。

(function attachCloudBaseConfig(globalScope, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory;
  }
  if (globalScope) {
    const api = factory(globalScope);
    globalScope.CatEatCloudBaseConfig = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function createCloudBaseConfig(globalScope) {
  const STORAGE_KEY = "cat-eat-cloudbase-env";
  const PERSISTED_FLAG = "cat-eat-cloudbase-persisted";

  // v1.1.2：env ID 内置 fallback，构建脚本可以覆盖（window.__CLOUDBASE_DEFAULT_ENV__）
  // 这样「填 env ID」是 dev 工具而不是 user onboarding 流程。
  // 上线时用 meowfed-d8bc79bfpabac02b3；后续多环境可改成 prod / staging。
  const DEFAULT_ENV = "meowfed-d8bc79bfpabac02b3";

  function readWindowEnv() {
    if (!globalScope) return null;
    return globalScope.__CLOUDBASE_ENV__ || null;
  }

  function readWindowDefault() {
    if (!globalScope) return null;
    // 只在浏览器环境（globalScope.document 存在）启用 default env；
    // Node test 环境无 document，避免 cloudSync 启动后 setInterval 网络重试
    // 让 test runner 不退出。
    if (!globalScope.document) return null;
    return globalScope.__CLOUDBASE_DEFAULT_ENV__ || DEFAULT_ENV;
  }

  function readStorageEnv() {
    try {
      if (globalScope && globalScope.localStorage) {
        return globalScope.localStorage.getItem(STORAGE_KEY) || null;
      }
    } catch (error) {
      // ignore
    }
    return null;
  }

  function writeStorageEnv(env) {
    try {
      if (globalScope && globalScope.localStorage) {
        if (env) {
          globalScope.localStorage.setItem(STORAGE_KEY, env);
          globalScope.localStorage.setItem(PERSISTED_FLAG, "1");
        } else {
          globalScope.localStorage.removeItem(STORAGE_KEY);
          globalScope.localStorage.removeItem(PERSISTED_FLAG);
        }
      }
    } catch (error) {
      // ignore
    }
  }

  function clearStorageEnv() {
    writeStorageEnv(null);
  }

  return {
    STORAGE_KEY,
    DEFAULT_ENV,
    isConfigured(env) {
      if (env) return true;
      return Boolean(readWindowEnv() || readStorageEnv() || readWindowDefault());
    },
    getEnv() {
      // 优先级：user 主动设置 > window override > hardcoded default
      return readStorageEnv() || readWindowEnv() || readWindowDefault();
    },
    setEnv(env) {
      writeStorageEnv(env);
    },
    clearEnv() {
      clearStorageEnv();
    },
    // user 是否在 UI 里改过 env（区分「默认」和「user 主动设置」）
    isPersistedByUser() {
      try {
        if (globalScope && globalScope.localStorage) {
          return globalScope.localStorage.getItem(PERSISTED_FLAG) === "1";
        }
      } catch (error) {
        // ignore
      }
      return false;
    },
    // 当前实际生效的 env 是否来自 user 主动设置（不是 default）
    isEnvFromUser() {
      return Boolean(readStorageEnv());
    }
  };
});
