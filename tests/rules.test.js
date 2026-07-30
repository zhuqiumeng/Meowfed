const test = require("node:test");
const assert = require("node:assert/strict");
const {
  DAY_MS,
  countPositive,
  deriveStatus,
  summarizeFood,
  groupForShopping
} = require("../utils/rules");

const NOW = Date.UTC(2026, 6, 28);
const ago = (days) => NOW - days * DAY_MS;
const result = (outcome, createdAt) => ({ outcome, createdAt });
const food = (results, extras = {}) => ({ id: "food", results, ...extras });

test("新品在 90 天内三次正向反馈后进入长期回购", () => {
  const item = food([
    result("okay", ago(20)),
    result("eager", ago(10)),
    result("okay", ago(2))
  ]);

  assert.equal(countPositive(item, NOW), 3);
  assert.equal(deriveStatus(item, NOW).key, "repurchase");
});

test("90 天以前的正向反馈不继续支配当前判断", () => {
  const item = food([
    result("okay", ago(150)),
    result("eager", ago(140)),
    result("okay", ago(130))
  ]);

  assert.equal(countPositive(item, NOW), 0);
  assert.equal(deriveStatus(item, NOW).key, "stale");
});

test("勉强吃的新品只清库存", () => {
  assert.equal(deriveStatus(food([result("reluctant", ago(1))]), NOW).key, "consume");
});

test("埋屎拒绝的新品进入避雷", () => {
  assert.equal(deriveStatus(food([result("bury", ago(1))]), NOW).key, "avoid");
});

test("埋屎后可以手动再给一次机会", () => {
  const buryAt = ago(2);
  const item = food([result("bury", buryAt)], { manualRetryAfter: ago(1) });

  assert.equal(deriveStatus(item, NOW).key, "trial");
});

test("手动再试后再次埋屎会重新进入避雷", () => {
  const item = food(
    [result("bury", ago(3)), result("bury", ago(1))],
    { manualRetryAfter: ago(2) }
  );

  assert.equal(deriveStatus(item, NOW).key, "avoid");
});

test("无法判断的结果不改变试吃状态", () => {
  assert.equal(deriveStatus(food([result("unknown", ago(1))]), NOW).key, "trial");
});

test("长期回购款最近拒绝会进入观察且保留历史", () => {
  const item = summarizeFood(
    food([
      result("eager", ago(20)),
      result("okay", ago(15)),
      result("eager", ago(10)),
      result("bury", ago(1))
    ]),
    NOW
  );

  assert.equal(item.status.key, "observe");
  assert.equal(item.positiveCount, 3);
  assert.equal(item.recentNegativeCount, 1);
});

test("观察款再次接受且仍满足三次正向后恢复长期回购", () => {
  const item = food([
    result("eager", ago(20)),
    result("okay", ago(15)),
    result("eager", ago(10)),
    result("bury", ago(2)),
    result("okay", ago(1))
  ]);

  assert.equal(deriveStatus(item, NOW).key, "repurchase");
});

test("连续三次近期负反馈后建议暂停但不自动暂停", () => {
  const item = summarizeFood(
    food([
      result("eager", ago(20)),
      result("okay", ago(18)),
      result("eager", ago(16)),
      result("reluctant", ago(3)),
      result("bury", ago(2)),
      result("reluctant", ago(1))
    ]),
    NOW
  );

  assert.equal(item.status.key, "observe");
  assert.equal(item.shouldSuggestPause, true);
});

test("手动暂停优先于自动状态", () => {
  const item = food(
    [
      result("eager", ago(20)),
      result("okay", ago(10)),
      result("eager", ago(1))
    ],
    { manualStatus: "paused" }
  );

  assert.equal(deriveStatus(item, NOW).key, "paused");
});

test("补货分组包含放心买、待复验和避雷", () => {
  const groups = groupForShopping(
    [
      food(
        [
          result("eager", ago(20)),
          result("okay", ago(10)),
          result("eager", ago(1))
        ],
        { id: "buy" }
      ),
      food(
        [
          result("eager", ago(150)),
          result("okay", ago(140)),
          result("eager", ago(130))
        ],
        { id: "stale" }
      ),
      food([result("bury", ago(1))], { id: "avoid" })
    ],
    NOW
  );

  assert.deepEqual(groups.buy.map((item) => item.id), ["buy"]);
  assert.deepEqual(groups.stale.map((item) => item.id), ["stale"]);
  assert.deepEqual(groups.avoid.map((item) => item.id), ["avoid"]);
});
