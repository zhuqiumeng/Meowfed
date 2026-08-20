// utils/repos/asset-repository.js
//
// AssetRepository：把图片资源的创建、读取 URL、删除集中处理。
// 上层（DataService）只调 putFoodPhoto / putCatAvatar / remove /
// getUrl / preload / releaseAll，不需要知道资源是 Blob（H5）还是
// 文件路径（小程序）。
//
// 资源记录有三种形态：
//   - H5（IndexedDB，本地）：{ id, kind, blob: Blob, mimeType, size, ... }
//   - 小程序（wx storage）：{ id, kind, path: "wxfs://...", mimeType, size, ... }
//   - H5（云同步后）：{ id, kind, cloudFileID, cloudPath, blob: null, ... }
//     本地无 blob 时，preload 会通过 downloadAsset 把 blob 拉回来
//
// getUrl 返回一个「UI 可直接用于 src」的字符串：
//   - H5（本地 blob）：URL.createObjectURL(blob) 的 ObjectURL
//   - H5（云端拉回）：同上；拉回后会写回本地
//   - 小程序：file path（wxfs://...）
//
// 这一层是「业务无关」的资源管理层：它不知道哪些 asset 关联了
// 哪个 food / cat，只负责 asset 自身的生命周期与 URL 缓存。

(function attachAssetRepository(globalScope) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { createAssetRepository };
  }
  if (globalScope) {
    globalScope.CatEatAssetRepository = { createAssetRepository };
  }
})(typeof globalThis !== "undefined" ? globalThis : this);

const DOWNLOAD_CONCURRENCY = 4;

function createAssetRepository({ repo, urlApi, createUuid, now, SCHEMA_VERSION, downloadAsset }) {
  if (!repo) throw new Error("AssetRepository requires a LocalRepository");
  if (typeof createUuid !== "function") {
    throw new Error("AssetRepository requires a createUuid function");
  }
  const time = typeof now === "function" ? now : () => Date.now();

  // assetId → { url, kind: "blob" | "path" }
  const urlMap = new Map();
  let allBlobUrls = [];

  function buildAssetRecord(media, kind, catId) {
    if (!media) throw new Error(`Asset media is required for ${kind}`);
    const isBlob = typeof Blob !== "undefined" && media instanceof Blob;
    const isPathMedia =
      media && typeof media === "object" && typeof media.path === "string";
    const id = createUuid();
    const base = {
      schemaVersion: SCHEMA_VERSION,
      id,
      catId,
      ownerId: null,
      kind,
      mimeType: media.type || media.mimeType || "application/octet-stream",
      size: Number(media.size) || 0,
      createdAt: time(),
      updatedAt: time()
    };
    if (isBlob) {
      return { ...base, blob: media };
    }
    if (isPathMedia) {
      return { ...base, path: media.path };
    }
    // 兜底：当成路径处理
    return { ...base, path: typeof media === "string" ? media : "" };
  }

  async function persistAsset(asset, replaceAssetId) {
    await repo.runTransaction(({ foods, cats, assets }) => {
      assets.put(asset);
      if (replaceAssetId && replaceAssetId !== asset.id) {
        assets.delete(replaceAssetId);
      }
    });
    if (replaceAssetId) {
      const cached = urlMap.get(replaceAssetId);
      if (cached && cached.kind === "blob" && urlApi && typeof urlApi.revokeObjectURL === "function") {
        urlApi.revokeObjectURL(cached.url);
      }
      urlMap.delete(replaceAssetId);
    }
    return asset.id;
  }

  async function downloadAndCache(asset) {
    if (typeof downloadAsset !== "function") return;
    try {
      const blob = await downloadAsset(asset.cloudFileID);
      if (blob && urlApi && typeof urlApi.createObjectURL === "function") {
        const url = urlApi.createObjectURL(blob);
        urlMap.set(asset.id, { url, kind: "blob" });
        allBlobUrls.push(url);
        // 写回本地，让下次 preload 直接命中本地 blob
        try {
          await repo.write("assets", { ...asset, blob });
        } catch (writeError) {
          // ignore：写回失败只影响下次冷启动需要重新下载
        }
      }
    } catch (error) {
      // 单条失败不阻断
    }
  }

  return {
    kind: repo.kind,

    async putFoodPhoto(catId, media, replaceAssetId) {
      const asset = buildAssetRecord(media, "food-photo", catId);
      return persistAsset(asset, replaceAssetId || null);
    },

    async putCatAvatar(catId, media, replaceAssetId) {
      const asset = buildAssetRecord(media, "cat-avatar", catId);
      return persistAsset(asset, replaceAssetId || null);
    },

    async remove(assetId) {
      if (!assetId) return;
      await repo.remove("assets", assetId);
      const cached = urlMap.get(assetId);
      if (cached && cached.kind === "blob" && urlApi && typeof urlApi.revokeObjectURL === "function") {
        urlApi.revokeObjectURL(cached.url);
      }
      urlMap.delete(assetId);
    },

    // 同步取 URL：H5 下已 preload 过则返回 ObjectURL；小程序下
    // 立即返回 file path（不需要 preload）。
    getUrl(assetId) {
      if (!assetId) return "";
      const cached = urlMap.get(assetId);
      if (cached) return cached.url;
      return "";
    },

    // 预热：H5 下把 blob 读出来缓存 ObjectURL；小程序下 noop
    // （path 已经在 getUrl 里直接返回）。
    //
    // 云同步后：asset 可能没有 blob 但有 cloudFileID；此时会调用
    // downloadAsset（由 data-store.js 注入的 cloud adapter 提供）拉
    // 回 blob，并写回本地。
    async preload(assetIds) {
      const ids = Array.isArray(assetIds)
        ? assetIds.filter((id) => id && !urlMap.has(id))
        : [];
      if (ids.length === 0) return;

      if (urlApi && typeof urlApi.createObjectURL === "function") {
        // H5 路径
        const assets = await Promise.all(ids.map((id) => repo.find("assets", id)));
        const toDownload = [];
        for (const asset of assets) {
          if (!asset) continue;
          if (asset.blob && !urlMap.has(asset.id)) {
            const url = urlApi.createObjectURL(asset.blob);
            urlMap.set(asset.id, { url, kind: "blob" });
            allBlobUrls.push(url);
          } else if (asset.path && !urlMap.has(asset.id)) {
            urlMap.set(asset.id, { url: asset.path, kind: "path" });
          } else if (asset.cloudFileID && !asset.blob && !urlMap.has(asset.id)) {
            toDownload.push(asset);
          }
        }
        // 并发下载（4 并发），拉回后写本地
        for (let i = 0; i < toDownload.length; i += DOWNLOAD_CONCURRENCY) {
          const batch = toDownload.slice(i, i + DOWNLOAD_CONCURRENCY);
          await Promise.allSettled(batch.map(downloadAndCache));
        }
      } else {
        // 小程序路径：直接缓存 path
        const assets = await Promise.all(ids.map((id) => repo.find("assets", id)));
        for (const asset of assets) {
          if (asset && asset.path && !urlMap.has(asset.id)) {
            urlMap.set(asset.id, { url: asset.path, kind: "path" });
          }
        }
      }
    },

    // 同步预热（小程序用：path 不需要异步读取）
    loadSyncPaths(assetIds) {
      if (!Array.isArray(assetIds)) return;
      for (const id of assetIds) {
        if (id && !urlMap.has(id)) {
          // 注意：小程序里我们没有同步读取能力，调用方应保证
          // 先调 preload；这里仅做兜底
        }
      }
    },

    releaseAll() {
      if (urlApi && typeof urlApi.revokeObjectURL === "function") {
        allBlobUrls.forEach((url) => urlApi.revokeObjectURL(url));
      }
      urlMap.clear();
      allBlobUrls = [];
    }
  };
}
