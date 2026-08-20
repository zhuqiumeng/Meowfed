const DAY_MS = 24 * 60 * 60 * 1000;
const PREFERENCE_WINDOW_MS = 90 * DAY_MS;

const OUTCOMES = {
  eager: {
    key: "eager",
    label: "主动吃",
    shortLabel: "主动吃",
    description: "闻到就吃，明显有兴趣",
    tone: "coral",
    score: 2
  },
  okay: {
    key: "okay",
    label: "正常接受",
    shortLabel: "能接受",
    description: "会自己吃，没有特别兴奋",
    tone: "mint",
    score: 1
  },
  reluctant: {
    key: "reluctant",
    label: "勉强吃",
    shortLabel: "勉强吃",
    description: "饿了才吃，或需要加料",
    tone: "yellow",
    score: -1
  },
  bury: {
    key: "bury",
    label: "埋屎拒绝",
    shortLabel: "埋屎",
    description: "闻完就走，还做埋屎动作",
    tone: "purple",
    score: -2
  },
  unknown: {
    key: "unknown",
    label: "没法判断",
    shortLabel: "跳过",
    description: "当天整体食欲或状态特殊",
    tone: "gray",
    score: 0
  }
};

const STATUSES = {
  trial: {
    key: "trial",
    label: "试吃中",
    shortLabel: "少量再试",
    tone: "yellow",
    shoppingGroup: "trial"
  },
  repurchase: {
    key: "repurchase",
    label: "长期回购",
    shortLabel: "放心买",
    tone: "mint",
    shoppingGroup: "buy"
  },
  stale: {
    key: "stale",
    label: "待复验",
    shortLabel: "待复验",
    tone: "yellow",
    shoppingGroup: "stale"
  },
  observe: {
    key: "observe",
    label: "近期观察",
    shortLabel: "观察中",
    tone: "yellow",
    shoppingGroup: "observe"
  },
  consume: {
    key: "consume",
    label: "只清库存",
    shortLabel: "不补货",
    tone: "gray",
    shoppingGroup: "skip"
  },
  avoid: {
    key: "avoid",
    label: "埋屎避雷",
    shortLabel: "先避雷",
    tone: "purple",
    shoppingGroup: "avoid"
  },
  paused: {
    key: "paused",
    label: "暂停回购",
    shortLabel: "已暂停",
    tone: "gray",
    shoppingGroup: "skip"
  }
};

function orderedMeaningfulResults(food) {
  return (food.results || [])
    .filter((result) => result.outcome !== "unknown")
    .slice()
    .sort((a, b) => a.createdAt - b.createdAt);
}

function resultsInWindow(food, now = Date.now()) {
  const threshold = now - PREFERENCE_WINDOW_MS;
  return orderedMeaningfulResults(food).filter(
    (result) => result.createdAt >= threshold && result.createdAt <= now
  );
}

function isPositive(result) {
  return result.outcome === "eager" || result.outcome === "okay";
}

function countAllPositive(food) {
  return orderedMeaningfulResults(food).filter(isPositive).length;
}

function countPositive(food, now = Date.now()) {
  return resultsInWindow(food, now).filter(isPositive).length;
}

function countRecentNegative(food, now = Date.now()) {
  const ordered = resultsInWindow(food, now).slice().sort((a, b) => b.createdAt - a.createdAt);
  let count = 0;

  for (const result of ordered) {
    if (result.outcome === "reluctant" || result.outcome === "bury") {
      count += 1;
    } else {
      break;
    }
  }

  return count;
}

function qualifiedAtAnyPoint(food) {
  const positives = orderedMeaningfulResults(food).filter(isPositive);
  let start = 0;

  for (let end = 0; end < positives.length; end += 1) {
    while (
      positives[end].createdAt - positives[start].createdAt > PREFERENCE_WINDOW_MS
    ) {
      start += 1;
    }

    if (end - start + 1 >= 3) {
      return true;
    }
  }

  return false;
}

function deriveStatus(food, now = Date.now()) {
  if (food.manualStatus === "paused") {
    return STATUSES.paused;
  }

  const results = resultsInWindow(food, now);
  const latest = results[results.length - 1] || null;
  const positiveCount = countPositive(food, now);
  const recentNegativeCount = countRecentNegative(food, now);
  const everQualified = Boolean(food.everQualified) || qualifiedAtAnyPoint(food);
  const retryAfter = Number(food.manualRetryAfter) || 0;

  if (retryAfter && (!latest || latest.createdAt <= retryAfter)) {
    return STATUSES.trial;
  }

  if (!latest) {
    return everQualified ? STATUSES.stale : STATUSES.trial;
  }

  if (everQualified) {
    if (recentNegativeCount > 0) {
      return STATUSES.observe;
    }

    return positiveCount >= 3 ? STATUSES.repurchase : STATUSES.stale;
  }

  if (latest.outcome === "bury") {
    return STATUSES.avoid;
  }

  if (latest.outcome === "reluctant") {
    return STATUSES.consume;
  }

  return STATUSES.trial;
}

function summarizeFood(food, now = Date.now()) {
  const positiveCount = countPositive(food, now);
  const lifetimePositiveCount = countAllPositive(food);
  const recentNegativeCount = countRecentNegative(food, now);
  const status = deriveStatus(food, now);
  const currentResults = resultsInWindow(food, now);
  const latestResult = currentResults[currentResults.length - 1] || null;

  return {
    ...food,
    positiveCount,
    positiveCount90d: positiveCount,
    lifetimePositiveCount,
    recentNegativeCount,
    status,
    latestResult,
    latestOutcome: latestResult ? OUTCOMES[latestResult.outcome] : null,
    progress: Math.min(positiveCount, 3),
    isStale: status.key === "stale",
    everQualified: Boolean(food.everQualified) || qualifiedAtAnyPoint(food),
    shouldSuggestPause: status.key === "observe" && recentNegativeCount >= 3
  };
}

function groupForShopping(foods, now = Date.now()) {
  const groups = {
    buy: [],
    trial: [],
    stale: [],
    observe: [],
    skip: [],
    avoid: []
  };

  foods.map((food) => summarizeFood(food, now)).forEach((food) => {
    groups[food.status.shoppingGroup].push(food);
  });

  return groups;
}

const api = {
  DAY_MS,
  PREFERENCE_WINDOW_MS,
  OUTCOMES,
  STATUSES,
  countAllPositive,
  countPositive,
  countRecentNegative,
  deriveStatus,
  summarizeFood,
  groupForShopping
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = api;
}

if (typeof window !== "undefined") {
  window.CatEatRules = api;
}
