const { summarizeFood, groupForShopping } = require("./rules");

const STORAGE_KEY = "CAT_EAT_FOODS_V1";
const INITIALIZED_KEY = "CAT_EAT_INITIALIZED_V1";

const now = Date.now();
const day = 24 * 60 * 60 * 1000;

const DEMO_FOODS = [
  {
    id: "demo-catz-chicken",
    name: "鸡肉火鸡主食罐",
    brand: "Catz Finefood",
    flavor: "鸡肉 · 火鸡",
    texture: "肉泥",
    country: "德国",
    color: "#FFD86A",
    photoPath: "",
    quantityBought: 3,
    createdAt: now - 24 * day,
    results: [
      { id: "r1", outcome: "eager", createdAt: now - 23 * day },
      { id: "r2", outcome: "okay", createdAt: now - 18 * day },
      { id: "r3", outcome: "eager", createdAt: now - 11 * day }
    ]
  },
  {
    id: "demo-oasy-tuna",
    name: "吞拿鱼慕斯",
    brand: "Oasy",
    flavor: "吞拿鱼",
    texture: "慕斯",
    country: "意大利",
    color: "#85D5C0",
    photoPath: "",
    quantityBought: 2,
    createdAt: now - 14 * day,
    results: [
      { id: "r4", outcome: "okay", createdAt: now - 13 * day },
      { id: "r5", outcome: "eager", createdAt: now - 6 * day }
    ]
  },
  {
    id: "demo-venandi-turkey",
    name: "火鸡单一蛋白罐",
    brand: "Venandi",
    flavor: "火鸡",
    texture: "细肉泥",
    country: "德国",
    color: "#FF9A8F",
    photoPath: "",
    quantityBought: 6,
    createdAt: now - 60 * day,
    results: [
      { id: "r6", outcome: "eager", createdAt: now - 58 * day },
      { id: "r7", outcome: "okay", createdAt: now - 52 * day },
      { id: "r8", outcome: "eager", createdAt: now - 45 * day },
      { id: "r9", outcome: "reluctant", createdAt: now - 2 * day }
    ]
  },
  {
    id: "demo-macs-duck",
    name: "鸭肉鸡心罐",
    brand: "MAC's",
    flavor: "鸭肉 · 鸡心",
    texture: "肉块",
    country: "德国",
    color: "#C9C1E9",
    photoPath: "",
    quantityBought: 2,
    createdAt: now - 9 * day,
    results: [{ id: "r10", outcome: "reluctant", createdAt: now - 8 * day }]
  },
  {
    id: "demo-mjamjam-beef",
    name: "多汁牛肉罐",
    brand: "Mjamjam",
    flavor: "牛肉",
    texture: "粗肉泥",
    country: "德国",
    color: "#B9A8C3",
    photoPath: "",
    quantityBought: 1,
    createdAt: now - 5 * day,
    results: [{ id: "r11", outcome: "bury", createdAt: now - 4 * day }]
  }
];

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function readFoods() {
  try {
    return wx.getStorageSync(STORAGE_KEY) || [];
  } catch (error) {
    return [];
  }
}

function writeFoods(foods) {
  wx.setStorageSync(STORAGE_KEY, foods);
  return foods;
}

function ensureInitialized() {
  if (!wx.getStorageSync(INITIALIZED_KEY)) {
    writeFoods([]);
    wx.setStorageSync(INITIALIZED_KEY, true);
  }
}

function listFoods() {
  return readFoods()
    .map(summarizeFood)
    .sort((a, b) => {
      const aTime = a.latestResult ? a.latestResult.createdAt : a.createdAt;
      const bTime = b.latestResult ? b.latestResult.createdAt : b.createdAt;
      return bTime - aTime;
    });
}

function getFood(id) {
  const food = readFoods().find((item) => item.id === id);
  return food ? summarizeFood(food) : null;
}

function createId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function addFood(input) {
  const foods = readFoods();
  const palette = ["#FFD86A", "#85D5C0", "#FF9A8F", "#C9C1E9", "#A8CDED"];
  const food = {
    id: createId("food"),
    name: input.name || "未命名新品",
    brand: input.brand || "待补充品牌",
    flavor: input.flavor || "口味待确认",
    texture: input.texture || "质地待确认",
    country: input.country || "",
    photoPath: input.photoPath || "",
    quantityBought: Number(input.quantityBought) || 1,
    color: palette[foods.length % palette.length],
    createdAt: Date.now(),
    results: []
  };

  foods.unshift(food);
  writeFoods(foods);
  return summarizeFood(food);
}

function updateFood(foodId, input) {
  const foods = readFoods();
  const index = foods.findIndex((item) => item.id === foodId);

  if (index < 0) {
    throw new Error("找不到这款罐头");
  }

  foods[index] = {
    ...foods[index],
    photoPath: input.photoPath || foods[index].photoPath || "",
    brand: input.brand || "待补充品牌",
    name: input.name || "未命名新品",
    flavor: input.flavor || "口味待确认",
    texture: input.texture || "质地待确认",
    country: input.country || "",
    quantityBought: Number(input.quantityBought) || foods[index].quantityBought || 1
  };

  writeFoods(foods);
  return summarizeFood(foods[index]);
}

function addResult(foodId, outcome, extras = {}) {
  const foods = readFoods();
  const index = foods.findIndex((item) => item.id === foodId);

  if (index < 0) {
    throw new Error("找不到这款罐头");
  }

  foods[index].manualStatus = null;
  foods[index].results = foods[index].results || [];
  foods[index].results.push({
    id: createId("result"),
    outcome,
    assistedBy: extras.assistedBy || "",
    note: extras.note || "",
    createdAt: Date.now()
  });

  writeFoods(foods);
  return summarizeFood(foods[index]);
}

function setManualStatus(foodId, status) {
  const foods = readFoods();
  const index = foods.findIndex((item) => item.id === foodId);

  if (index < 0) {
    throw new Error("找不到这款罐头");
  }

  foods[index].manualStatus = status || null;
  writeFoods(foods);
  return summarizeFood(foods[index]);
}

function removeFood(foodId) {
  const foods = readFoods().filter((item) => item.id !== foodId);
  writeFoods(foods);
}

function shoppingGroups() {
  return groupForShopping(readFoods());
}

function resetDemo() {
  writeFoods(clone(DEMO_FOODS));
}

function clearAll() {
  writeFoods([]);
}

function persistPhoto(tempFilePath) {
  return new Promise((resolve) => {
    if (!tempFilePath) {
      resolve("");
      return;
    }

    wx.getFileSystemManager().saveFile({
      tempFilePath,
      success: ({ savedFilePath }) => resolve(savedFilePath),
      fail: () => resolve(tempFilePath)
    });
  });
}

module.exports = {
  ensureInitialized,
  listFoods,
  getFood,
  addFood,
  updateFood,
  addResult,
  setManualStatus,
  removeFood,
  shoppingGroups,
  resetDemo,
  clearAll,
  persistPhoto
};
