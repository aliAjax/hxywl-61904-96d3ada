import "./polyfills";

import {
  suite,
  test,
  assertEqual,
  assertTrue,
  assertFalse,
  runTests,
} from "./runner";

import {
  levels,
  calculateEarnedStars,
  checkStarRuleAchieved,
  normalizeLevel,
  normalizeObstacleDef,
  validateLevel,
  LevelDef,
  ObstacleDef,
  CANVAS_W,
  CANVAS_H,
} from "../src/levels";

import {
  updateLevelResult,
  isUnlocked,
  getStars,
  Progress,
  loadProgress,
  dataStore,
} from "../src/dataStore";

import {
  encodeChallengeCode,
  decodeChallengeCode,
  ChallengeCodeResult,
} from "../src/challengeCode";

import {
  DEFAULT_CONFIG,
  createPhysicsState,
  resetBall,
  resetAll,
  tickPhysics,
  computeLaunchVelocity,
  applyLaunch,
  predictTrajectory,
  PhysicsState,
} from "../src/physics";

const sampleLevel: LevelDef = levels[0];

suite("星级计算 - checkStarRuleAchieved", () => {
  test("未通关时任何规则都不达成", () => {
    const rule = { description: "测试", minCollected: 0 };
    assertFalse(checkStarRuleAchieved(rule, 5, 1, 2, false));
  });

  test("minCollected 满足时达成", () => {
    const rule = { description: "测试", minCollected: 2 };
    assertTrue(checkStarRuleAchieved(rule, 2, 3, 0, true));
    assertTrue(checkStarRuleAchieved(rule, 3, 3, 0, true));
  });

  test("minCollected 不满足时不达成", () => {
    const rule = { description: "测试", minCollected: 3 };
    assertFalse(checkStarRuleAchieved(rule, 2, 3, 0, true));
  });

  test("maxShotsUsed 满足时达成", () => {
    const rule = { description: "测试", maxShotsUsed: 3 };
    assertTrue(checkStarRuleAchieved(rule, 0, 3, 0, true));
    assertTrue(checkStarRuleAchieved(rule, 0, 2, 1, true));
  });

  test("maxShotsUsed 不满足时不达成", () => {
    const rule = { description: "测试", maxShotsUsed: 2 };
    assertFalse(checkStarRuleAchieved(rule, 0, 3, 0, true));
  });

  test("minRemainingShots 满足时达成", () => {
    const rule = { description: "测试", minRemainingShots: 2 };
    assertTrue(checkStarRuleAchieved(rule, 0, 1, 2, true));
    assertTrue(checkStarRuleAchieved(rule, 0, 1, 3, true));
  });

  test("minRemainingShots 不满足时不达成", () => {
    const rule = { description: "测试", minRemainingShots: 2 };
    assertFalse(checkStarRuleAchieved(rule, 0, 3, 1, true));
  });

  test("多条件同时满足时达成", () => {
    const rule = { description: "测试", minCollected: 2, maxShotsUsed: 3 };
    assertTrue(checkStarRuleAchieved(rule, 2, 3, 0, true));
  });

  test("多条件有一个不满足时不达成", () => {
    const rule = { description: "测试", minCollected: 2, maxShotsUsed: 3 };
    assertFalse(checkStarRuleAchieved(rule, 1, 3, 0, true));
    assertFalse(checkStarRuleAchieved(rule, 2, 4, 0, true));
  });
});

suite("星级计算 - calculateEarnedStars", () => {
  test("未通关时获得 0 星", () => {
    assertEqual(calculateEarnedStars(sampleLevel, 3, 1, 2, false), 0);
  });

  test("第 1 关：只通关不收集星星，获得 1 星", () => {
    assertEqual(calculateEarnedStars(sampleLevel, 0, 3, 0, true), 1);
  });

  test("第 1 关：收集 2 颗星，获得 2 星", () => {
    assertEqual(calculateEarnedStars(sampleLevel, 2, 3, 0, true), 2);
  });

  test("第 1 关：收集全部 3 颗星，获得 3 星", () => {
    assertEqual(calculateEarnedStars(sampleLevel, 3, 3, 0, true), 3);
  });

  test("星级上限为 3，不会超出", () => {
    const levelWithManyRules: LevelDef = {
      ...sampleLevel,
      starRules: {
        stars: [
          { description: "1", minCollected: 0 },
          { description: "2", minCollected: 0 },
          { description: "3", minCollected: 0 },
          { description: "4", minCollected: 0 },
        ],
      },
    };
    assertEqual(calculateEarnedStars(levelWithManyRules, 0, 1, 0, true), 3);
  });

  test("中间规则不满足时停止计算（不满足第 2 条，只能得 1 星）", () => {
    const level: LevelDef = {
      ...sampleLevel,
      starRules: {
        stars: [
          { description: "抵达终点", minCollected: 0 },
          { description: "收集 2 颗星星", minCollected: 2 },
          { description: "收集 3 颗星星", minCollected: 3 },
        ],
      },
    };
    assertEqual(calculateEarnedStars(level, 1, 3, 0, true), 1);
  });

  test("正常通关（第 3 关）：3 次内收集全部星星，获得 3 星", () => {
    const level3 = levels[2];
    assertEqual(calculateEarnedStars(level3, 3, 3, 1, true), 3);
  });

  test("正常通关（第 3 关）：4 次收集全部星星，只能得 2 星（不满足 maxShotsUsed:3）", () => {
    const level3 = levels[2];
    assertEqual(calculateEarnedStars(level3, 3, 4, 0, true), 2);
  });

  test("失败结算：用尽次数未通关，获得 0 星", () => {
    assertEqual(calculateEarnedStars(sampleLevel, 2, 3, 0, false), 0);
  });
});

suite("关卡数据规范化 - normalizeObstacleDef", () => {
  test("普通墙体规范化，尺寸不小于 10", () => {
    const ob: ObstacleDef = { x: 10, y: 20, w: 5, h: 8, type: "wall" };
    const result = normalizeObstacleDef(ob);
    assertEqual(result.w, 10);
    assertEqual(result.h, 10);
    assertEqual(result.type, "wall");
  });

  test("未知类型降级为 wall", () => {
    const ob: ObstacleDef = {
      x: 10,
      y: 20,
      w: 50,
      h: 50,
      type: "unknownType" as any,
    };
    const result = normalizeObstacleDef(ob);
    assertEqual(result.type, "wall");
  });

  test("未指定类型默认为 wall", () => {
    const ob: ObstacleDef = { x: 10, y: 20, w: 50, h: 50 };
    const result = normalizeObstacleDef(ob);
    assertEqual(result.type, "wall");
  });

  test("移动障碍规范化：moveRange 在 0-300 之间", () => {
    const ob: ObstacleDef = {
      x: 10,
      y: 20,
      w: 50,
      h: 50,
      type: "movingHorizontal",
      moveRange: 500,
      moveSpeed: 1.5,
    };
    const result = normalizeObstacleDef(ob);
    assertEqual(result.moveRange, 300);
    assertEqual(result.type, "movingHorizontal");
  });

  test("移动障碍规范化：moveSpeed 在 0.1-5 之间", () => {
    const ob: ObstacleDef = {
      x: 10,
      y: 20,
      w: 50,
      h: 50,
      type: "movingVertical",
      moveSpeed: 10,
    };
    const result = normalizeObstacleDef(ob);
    assertEqual(result.moveSpeed, 5);
  });

  test("移动障碍规范化：moveSpeed 为 NaN 时使用默认值 1.5", () => {
    const ob: ObstacleDef = {
      x: 10,
      y: 20,
      w:  50,
      h: 50,
      type: "movingHorizontal",
      moveSpeed: NaN,
    };
    const result = normalizeObstacleDef(ob);
    assertEqual(result.moveSpeed, 1.5);
  });

  test("非移动障碍不包含 moveRange 和 moveSpeed", () => {
    const ob: ObstacleDef = {
      x: 10,
      y: 20,
      w: 50,
      h: 50,
      type: "wall",
      moveRange: 100,
      moveSpeed: 2,
    };
    const result = normalizeObstacleDef(ob);
    assertTrue(result.moveRange === undefined);
    assertTrue(result.moveSpeed === undefined);
  });
});

suite("关卡数据规范化 - normalizeLevel", () => {
  test("整个关卡规范化后障碍数组被处理", () => {
    const level: LevelDef = {
      id: 999,
      name: "测试关卡",
      ball: { x: 100, y: 100 },
      goal: { x: 700, y: 400 },
      stars: [{ x: 200, y: 200 }],
      obstacles: [
        { x: 10, y: 20, w: 5, h: 8 },
        { x: 100, y: 200, w: 100, h: 100, type: "badType" as any },
      ],
      maxShots: 3,
      gravity: 0.15,
      bounce: 0.7,
      starRules: { stars: [{ description: "测试", minCollected: 0 }] },
    };
    const result = normalizeLevel(level);
    assertEqual(result.obstacles[0].w, 10);
    assertEqual(result.obstacles[0].h, 10);
    assertEqual(result.obstacles[1].type, "wall");
  });

  test("规范化后关卡其他属性保持不变", () => {
    const result = normalizeLevel(sampleLevel);
    assertEqual(result.id, sampleLevel.id);
    assertEqual(result.name, sampleLevel.name);
    assertEqual(result.maxShots, sampleLevel.maxShots);
  });
});

suite("关卡数据校验 - validateLevel", () => {
  test("标准关卡校验通过", () => {
    const result = validateLevel(
      sampleLevel,
      DEFAULT_CONFIG.ballRadius,
      DEFAULT_CONFIG.goalRadius,
      DEFAULT_CONFIG.starRadius
    );
    assertTrue(result.valid);
    assertEqual(result.issues.length, 0);
  });

  test("出生点越界时校验失败", () => {
    const level: LevelDef = {
      ...sampleLevel,
      ball: { x: -10, y: 400 },
    };
    const result = validateLevel(
      level,
      DEFAULT_CONFIG.ballRadius,
      DEFAULT_CONFIG.goalRadius,
      DEFAULT_CONFIG.starRadius
    );
    assertFalse(result.valid);
    assertTrue(result.issues.some((i) => i.type === "ballOutOfBounds"));
  });

  test("终点越界时校验失败", () => {
    const level: LevelDef = {
      ...sampleLevel,
      goal: { x: CANVAS_W + 100, y: 400 },
    };
    const result = validateLevel(
      level,
      DEFAULT_CONFIG.ballRadius,
      DEFAULT_CONFIG.goalRadius,
      DEFAULT_CONFIG.starRadius
    );
    assertFalse(result.valid);
    assertTrue(result.issues.some((i) => i.type === "goalOutOfBounds"));
  });

  test("星星越界时校验失败", () => {
    const level: LevelDef = {
      ...sampleLevel,
      stars: [{ x: -50, y: -50 }],
    };
    const result = validateLevel(
      level,
      DEFAULT_CONFIG.ballRadius,
      DEFAULT_CONFIG.goalRadius,
      DEFAULT_CONFIG.starRadius
    );
    assertFalse(result.valid);
    assertTrue(result.issues.some((i) => i.type === "starOutOfBounds"));
  });

  test("障碍越界时校验失败", () => {
    const level: LevelDef = {
      ...sampleLevel,
      obstacles: [{ x: CANVAS_W - 10, y: 200, w: 100, h: 100, type: "wall" }],
    };
    const result = validateLevel(
      level,
      DEFAULT_CONFIG.ballRadius,
      DEFAULT_CONFIG.goalRadius,
      DEFAULT_CONFIG.starRadius
    );
    assertFalse(result.valid);
    assertTrue(result.issues.some((i) => i.type === "obstacleOutOfBounds"));
  });

  test("障碍挡住出生点时校验失败", () => {
    const level: LevelDef = {
      ...sampleLevel,
      ball: { x: 100, y: 400 },
      obstacles: [{ x: 80, y: 380, w: 50, h: 50, type: "wall" }],
    };
    const result = validateLevel(
      level,
      DEFAULT_CONFIG.ballRadius,
      DEFAULT_CONFIG.goalRadius,
      DEFAULT_CONFIG.starRadius
    );
    assertFalse(result.valid);
    assertTrue(result.issues.some((i) => i.type === "obstacleBlocksBall"));
  });
});

suite("进度更新", () => {
  test("初始进度为空，第 1 关默认解锁", () => {
    dataStore.reset();
    const progress: Progress = {};
    assertTrue(isUnlocked(1, progress));
  });

  test("第 2 关在第 1 关未通关前锁定", () => {
    const progress: Progress = {};
    assertFalse(isUnlocked(2, progress));
  });

  test("第 2 关在第 1 关通关后解锁", () => {
    const progress: Progress = { 1: { stars: 1, cleared: true } };
    assertTrue(isUnlocked(2, progress));
  });

  test("未通关关卡获得星星数为 0", () => {
    const progress: Progress = {};
    assertEqual(getStars(1, progress), 0);
  });

  test("已通关关卡正确返回星星数", () => {
    const progress: Progress = { 1: { stars: 2, cleared: true } };
    assertEqual(getStars(1, progress), 2);
  });

  test("首次通关记录关卡进度", () => {
    dataStore.reset();
    const progress = loadProgress();
    const next = updateLevelResult(progress, 1, 2, true);
    assertEqual(next[1].stars, 2);
    assertTrue(next[1].cleared);
  });

  test("重复通关时星星数取最大值（提高）", () => {
    dataStore.reset();
    let progress: Progress = { 1: { stars: 1, cleared: true } };
    progress = updateLevelResult(progress, 1, 3, true);
    assertEqual(progress[1].stars, 3);
  });

  test("重复通关时星星数取最大值（降低时不变化）", () => {
    dataStore.reset();
    let progress: Progress = { 1: { stars: 3, cleared: true } };
    progress = updateLevelResult(progress, 1, 1, true);
    assertEqual(progress[1].stars, 3);
  });

  test("通关状态一旦为 true，不会变回 false", () => {
    dataStore.reset();
    let progress: Progress = { 1: { stars: 2, cleared: true } };
    progress = updateLevelResult(progress, 1, 0, false);
    assertTrue(progress[1].cleared);
  });

  test("首次失败不标记为已通关", () => {
    dataStore.reset();
    const progress = loadProgress();
    const next = updateLevelResult(progress, 5, 0, false);
    assertTrue(next[5] !== undefined);
    assertFalse(next[5].cleared);
    assertEqual(next[5].stars, 0);
  });
});

suite("挑战码导入校验 - 基础格式", () => {
  test("空挑战码返回失败", async () => {
    const result = await decodeChallengeCode("");
    assertFalse(result.success);
    assertTrue(result.error?.includes("为空"));
  });

  test("空白挑战码返回失败", async () => {
    const result = await decodeChallengeCode("   ");
    assertFalse(result.success);
  });

  test("无正确前缀的挑战码返回失败", async () => {
    const result = await decodeChallengeCode("INVALID-123456");
    assertFalse(result.success);
    assertTrue(result.error?.includes("HX1-"));
  });

  test("前缀正确但无内容返回失败", async () => {
    const result = await decodeChallengeCode("HX1-");
    assertFalse(result.success);
    assertTrue(result.error?.includes("内容为空"));
  });

  test("无效 base64 编码返回失败", async () => {
    const result = await decodeChallengeCode("HX1-!!!invalid!!!");
    assertFalse(result.success);
    assertTrue(result.error?.includes("编码无效") || result.error?.includes("解析失败"));
  });

  test("损坏的 JSON 返回失败", async () => {
    const bytes = new TextEncoder().encode("{not valid json");
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const badJson = btoa(binary)
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    const result = await decodeChallengeCode(`HX1-${badJson}`);
    assertFalse(result.success);
    assertTrue(result.error?.includes("解析失败") || result.error?.includes("损坏"));
  });
});

suite("挑战码导入校验 - 字段完整性", () => {
  function encodeRaw(obj: unknown): string {
    const json = JSON.stringify(obj);
    const bytes = new TextEncoder().encode(json);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const b64 = btoa(binary)
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    return `HX1-${b64}`;
  }

  test("缺少关卡名称返回失败", async () => {
    const code = encodeRaw({
      b: [100, 400],
      g: [700, 400],
      s: [],
      o: [],
      m: 3,
      v: 0.15,
      k: 0.7,
      r: { s: [{ d: "测试", minCollected: 0 }] },
    });
    const result = await decodeChallengeCode(code);
    assertFalse(result.success);
    assertTrue(result.error?.includes("名称"));
  });

  test("缺少出生点坐标返回失败", async () => {
    const code = encodeRaw({
      n: "测试",
      g: [700, 400],
      s: [],
      o: [],
      m: 3,
      v: 0.15,
      k: 0.7,
      r: { s: [{ d: "测试" }] },
    });
    const result = await decodeChallengeCode(code);
    assertFalse(result.success);
    assertTrue(result.error?.includes("出生点"));
  });

  test("缺少终点坐标返回失败", async () => {
    const code = encodeRaw({
      n: "测试",
      b: [100, 400],
      s: [],
      o: [],
      m: 3,
      v: 0.15,
      k: 0.7,
      r: { s: [{ d: "测试" }] },
    });
    const result = await decodeChallengeCode(code);
    assertFalse(result.success);
    assertTrue(result.error?.includes("终点"));
  });

  test("星星坐标无效返回失败", async () => {
    const code = encodeRaw({
      n: "测试",
      b: [100, 400],
      g: [700, 400],
      s: [["bad", "data"]],
      o: [],
      m: 3,
      v: 0.15,
      k: 0.7,
      r: { s: [{ d: "测试" }] },
    });
    const result = await decodeChallengeCode(code);
    assertFalse(result.success);
    assertTrue(result.error?.includes("星星"));
  });

  test("星级规则为空数组返回失败", async () => {
    const code = encodeRaw({
      n: "测试",
      b: [100, 400],
      g: [700, 400],
      s: [],
      o: [],
      m: 3,
      v: 0.15,
      k: 0.7,
      r: { s: [] },
    });
    const result = await decodeChallengeCode(code);
    assertFalse(result.success);
    assertTrue(result.error?.includes("星级规则"));
  });

  test("星级规则超过 3 条返回失败", async () => {
    const code = encodeRaw({
      n: "测试",
      b: [100, 400],
      g: [700, 400],
      s: [],
      o: [],
      m: 3,
      v: 0.15,
      k: 0.7,
      r: {
        s: [
          { d: "规则1" },
          { d: "规则2" },
          { d: "规则3" },
          { d: "规则4" },
        ],
      },
    });
    const result = await decodeChallengeCode(code);
    assertFalse(result.success);
    assertTrue(result.error?.includes("3 条"));
  });
});

suite("挑战码导入校验 - 越界数据（带警告）", () => {
  function buildCode(overrides: Partial<any> = {}): string {
    const base: any = {
      n: "越界测试关卡",
      b: [100, 400],
      g: [680, 400],
      s: [
        [300, 380],
        [480, 380],
      ],
      o: [[350, 300, 100, 20, 0]],
      m: 3,
      v: 0.15,
      k: 0.7,
      r: {
        s: [
          { d: "抵达终点" },
          { d: "收集 1 颗星", c: 1 },
          { d: "收集全部 2 颗星", c: 2 },
        ],
      },
    };
    const merged = { ...base, ...overrides };
    const json = JSON.stringify(merged);
    const bytes = new TextEncoder().encode(json);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const b64 = btoa(binary)
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    return `HX1-${b64}`;
  }

  test("出生点 X 越界时被 clamp 到边界", async () => {
    const code = buildCode({ b: [-100, 400] });
    const result: ChallengeCodeResult = await decodeChallengeCode(code);
    assertTrue(result.success);
    assertTrue(result.level!.ball.x >= DEFAULT_CONFIG.ballRadius);
  });

  test("障碍宽度超过画布上限时被 clamp 并产生警告", async () => {
    const code = buildCode({
      o: [[10, 10, 9999, 50, 0]],
    });
    const result = await decodeChallengeCode(code);
    assertTrue(result.success);
    assertTrue(result.level!.obstacles[0].w <= CANVAS_W);
    assertTrue(
      (result.warnings || []).some(
        (w) => w.type === "valueClamped" && w.message.includes("宽度")
      )
    );
  });

  test("出生点 Y 越界时被 clamp 到边界", async () => {
    const code = buildCode({ b: [100, 99999] });
    const result = await decodeChallengeCode(code);
    assertTrue(result.success);
    assertTrue(result.level!.ball.y <= CANVAS_H - DEFAULT_CONFIG.ballRadius);
  });

  test("弹射次数超过上限被 clamp 到 20", async () => {
    const code = buildCode({ m: 100 });
    const result = await decodeChallengeCode(code);
    assertTrue(result.success);
    assertEqual(result.level!.maxShots, 20);
  });

  test("弹射次数低于下限被 clamp 到 1", async () => {
    const code = buildCode({ m: 0 });
    const result = await decodeChallengeCode(code);
    assertTrue(result.success);
    assertEqual(result.level!.maxShots, 1);
  });

  test("重力值越界被 clamp", async () => {
    const code = buildCode({ v: 10 });
    const result = await decodeChallengeCode(code);
    assertTrue(result.success);
    assertTrue(result.level!.gravity <= 0.5);
  });

  test("反弹系数越界被 clamp", async () => {
    const code = buildCode({ k: 0.01 });
    const result = await decodeChallengeCode(code);
    assertTrue(result.success);
    assertTrue(result.level!.bounce >= 0.3);
  });

  test("星星数量超过上限被拒绝", async () => {
    const manyStars = Array.from({ length: 25 }, (_, i) => [100 + i * 20, 200]);
    const code = buildCode({ s: manyStars });
    const result = await decodeChallengeCode(code);
    assertFalse(result.success);
    assertTrue(result.error?.includes("星星数量"));
  });

  test("障碍数量超过上限被拒绝", async () => {
    const manyObs = Array.from({ length: 60 }, (_, i) => [10 + i, 100, 20, 20, 0]);
    const code = buildCode({ o: manyObs });
    const result = await decodeChallengeCode(code);
    assertFalse(result.success);
    assertTrue(result.error?.includes("障碍数量"));
  });

  test("未知障碍类型被降级为普通墙并产生警告", async () => {
    const code = buildCode({
      o: [[350, 300, 100, 20, 99]],
    });
    const result = await decodeChallengeCode(code);
    assertTrue(result.success);
    assertEqual(result.level!.obstacles[0].type, "wall");
    assertTrue(
      (result.warnings || []).some((w) => w.type === "obstacleDowngraded")
    );
  });

  test("障碍尺寸过小时被自动放大到最小值", async () => {
    const code = buildCode({
      o: [[350, 300, 5, 5, 0]],
    });
    const result = await decodeChallengeCode(code);
    assertTrue(result.success);
    assertTrue(result.level!.obstacles[0].w >= 10);
    assertTrue(result.level!.obstacles[0].h >= 10);
  });
});

suite("挑战码 - 编解码往返", () => {
  test("编码后解码得到等价关卡", async () => {
    dataStore.reset();
    const original: LevelDef = {
      id: 0,
      name: "往返测试关卡",
      ball: { x: 100, y: 400 },
      goal: { x: 680, y: 400 },
      stars: [
        { x: 300, y: 380 },
        { x: 480, y: 380 },
      ],
      obstacles: [
        { x: 350, y: 300, w: 100, h: 20, type: "wall" },
        { x: 200, y: 200, w: 50, h: 50, type: "movingHorizontal", moveRange: 100, moveSpeed: 2 },
      ],
      maxShots: 4,
      gravity: 0.18,
      bounce: 0.72,
      starRules: {
        stars: [
          { description: "抵达终点" },
          { description: "收集 1 颗星", minCollected: 1 },
          { description: "2 次内通关", maxShotsUsed: 2 },
        ],
      },
    };

    const code = await encodeChallengeCode(original);
    assertTrue(code.startsWith("HX1-") || code.startsWith("HX1Z-"));

    const decoded = await decodeChallengeCode(code);
    assertTrue(decoded.success);
    assertEqual(decoded.level!.name, "往返测试关卡");
    assertEqual(decoded.level!.stars.length, 2);
    assertEqual(decoded.level!.obstacles.length, 2);
    assertEqual(decoded.level!.obstacles[1].type, "movingHorizontal");
    assertEqual(decoded.level!.maxShots, 4);
    assertEqual(decoded.level!.starRules.stars.length, 3);
  });
});

suite("物理引擎 - 状态初始化", () => {
  test("createPhysicsState 正确初始化物理状态", () => {
    dataStore.reset();
    const state = createPhysicsState(sampleLevel, DEFAULT_CONFIG);
    assertEqual(state.ball.x, sampleLevel.ball.x);
    assertEqual(state.ball.y, sampleLevel.ball.y);
    assertEqual(state.ball.vx, 0);
    assertEqual(state.ball.vy, 0);
    assertEqual(state.phase, "aim");
    assertEqual(state.shotsRemaining, sampleLevel.maxShots);
    assertEqual(state.shotsUsed, 0);
    assertEqual(state.collected, 0);
    assertFalse(state.cleared);
    assertEqual(state.stars.length, sampleLevel.stars.length);
    assertEqual(state.obstacles.length, sampleLevel.obstacles.length);
  });

  test("createPhysicsState 星星初始化为未收集状态", () => {
    dataStore.reset();
    const state = createPhysicsState(sampleLevel, DEFAULT_CONFIG);
    for (const star of state.stars) {
      assertFalse(star.collected);
    }
  });

  test("resetBall 重置小球位置和速度", () => {
    dataStore.reset();
    const state = createPhysicsState(sampleLevel, DEFAULT_CONFIG);
    state.ball.x = 999;
    state.ball.y = 999;
    state.ball.vx = 10;
    state.ball.vy = 10;
    state.phase = "fly";

    resetBall(state, sampleLevel);

    assertEqual(state.ball.x, sampleLevel.ball.x);
    assertEqual(state.ball.y, sampleLevel.ball.y);
    assertEqual(state.ball.vx, 0);
    assertEqual(state.ball.vy, 0);
    assertEqual(state.phase, "aim");
  });

  test("resetAll 完全重置所有状态", () => {
    dataStore.reset();
    const state = createPhysicsState(sampleLevel, DEFAULT_CONFIG);
    state.ball.x = 999;
    state.collected = 3;
    state.cleared = true;
    state.stars[0].collected = true;

    resetAll(state, sampleLevel, DEFAULT_CONFIG);

    assertEqual(state.ball.x, sampleLevel.ball.x);
    assertEqual(state.collected, 0);
    assertFalse(state.cleared);
    assertFalse(state.stars[0].collected);
    assertEqual(state.phase, "aim");
  });
});

suite("物理引擎 - 发射计算", () => {
  test("computeLaunchVelocity 距离太近时返回 null", () => {
    dataStore.reset();
    const result = computeLaunchVelocity(100, 400, 105, 400, DEFAULT_CONFIG);
    assertTrue(result === null);
  });

  test("computeLaunchVelocity 正常距离返回有效速度", () => {
    dataStore.reset();
    const result = computeLaunchVelocity(100, 400, 200, 400, DEFAULT_CONFIG);
    assertTrue(result !== null);
    assertTrue(result!.vx < 0);
    assertEqual(result!.vy, 0);
    assertTrue(result!.power > 0);
  });

  test("computeLaunchVelocity 发射方向与拖拽方向相反", () => {
    dataStore.reset();
    const result = computeLaunchVelocity(100, 400, 50, 350, DEFAULT_CONFIG);
    assertTrue(result !== null);
    assertTrue(result!.vx > 0);
    assertTrue(result!.vy > 0);
  });

  test("computeLaunchVelocity 距离超过 maxDrag 时被限制", () => {
    dataStore.reset();
    const farResult = computeLaunchVelocity(100, 400, 500, 400, DEFAULT_CONFIG);
    const nearResult = computeLaunchVelocity(100, 400, 200, 400, DEFAULT_CONFIG);
    assertTrue(farResult !== null && nearResult !== null);
    assertTrue(farResult!.clampedDist >= nearResult!.clampedDist);
    assertTrue(farResult!.clampedDist <= DEFAULT_CONFIG.maxDrag);
  });

  test("applyLaunch 成功应用发射并切换到飞行状态", () => {
    dataStore.reset();
    const state = createPhysicsState(sampleLevel, DEFAULT_CONFIG);
    const applied = applyLaunch(state, 200, 400, DEFAULT_CONFIG);
    assertTrue(applied);
    assertEqual(state.phase, "fly");
    assertTrue(state.ball.vx !== 0 || state.ball.vy !== 0);
  });

  test("applyLaunch 距离太近时不发射", () => {
    dataStore.reset();
    const state = createPhysicsState(sampleLevel, DEFAULT_CONFIG);
    const applied = applyLaunch(state, 101, 400, DEFAULT_CONFIG);
    assertFalse(applied);
    assertEqual(state.phase, "aim");
  });
});

suite("物理引擎 - 物理更新", () => {
  test("tickPhysics 在 aim 阶段不产生位置变化", () => {
    dataStore.reset();
    const state = createPhysicsState(sampleLevel, DEFAULT_CONFIG);
    const startX = state.ball.x;
    const startY = state.ball.y;

    tickPhysics(state, sampleLevel, DEFAULT_CONFIG, 16);

    assertEqual(state.ball.x, startX);
    assertEqual(state.ball.y, startY);
  });

  test("tickPhysics 在 fly 阶段受重力影响", () => {
    dataStore.reset();
    const state = createPhysicsState(sampleLevel, DEFAULT_CONFIG);
    state.ball.vx = 5;
    state.ball.vy = 0;
    state.phase = "fly";
    const startVy = state.ball.vy;

    const startY = state.ball.y;
    for (let i = 0; i < 20; i++) {
      tickPhysics(state, sampleLevel, DEFAULT_CONFIG, 16);
      if (state.phase !== "fly") break;
    }

    assertTrue(state.ball.y > startY, "小球 y 坐标应该因重力而增加");
  });

  test("tickPhysics 小球速度受摩擦衰减", () => {
    dataStore.reset();
    const level: LevelDef = {
      ...sampleLevel,
      gravity: 0,
    };
    const state = createPhysicsState(level, DEFAULT_CONFIG);
    state.ball.vx = 10;
    state.ball.vy = 0;
    state.phase = "fly";

    const startSpeed = Math.abs(state.ball.vx);
    for (let i = 0; i < 10; i++) {
      tickPhysics(state, level, DEFAULT_CONFIG, 16);
    }

    assertTrue(Math.abs(state.ball.vx) < startSpeed);
  });

  test("tickPhysics 小球碰到边界会反弹", () => {
    dataStore.reset();
    const state = createPhysicsState(sampleLevel, DEFAULT_CONFIG);
    state.ball.x = 20;
    state.ball.vx = -10;
    state.ball.y = 250;
    state.ball.vy = 0;
    state.phase = "fly";

    let allEvents: any[] = [];
    for (let i = 0; i < 10; i++) {
      const events = tickPhysics(state, sampleLevel, DEFAULT_CONFIG, 16);
      allEvents = allEvents.concat(events);
      if (allEvents.some((e) => e.type === "boundaryBounce")) break;
    }

    assertTrue(allEvents.some((e) => e.type === "boundaryBounce"));
    assertTrue(state.ball.vx > 0);
  });

  test("tickPhysics 收集星星增加 collected 计数", () => {
    dataStore.reset();
    const level: LevelDef = {
      ...sampleLevel,
      stars: [{ x: 150, y: 400 }],
    };
    const state = createPhysicsState(level, DEFAULT_CONFIG);
    state.ball.x = 100;
    state.ball.vx = 10;
    state.ball.y = 400;
    state.ball.vy = 0;
    state.phase = "fly";

    assertEqual(state.collected, 0);

    for (let i = 0; i < 20; i++) {
      tickPhysics(state, level, DEFAULT_CONFIG, 16);
      if (state.collected > 0) break;
    }

    assertEqual(state.collected, 1);
    assertTrue(state.stars[0].collected);
  });

  test("tickPhysics 小球到达终点通关", () => {
    dataStore.reset();
    const level: LevelDef = {
      ...sampleLevel,
      goal: { x: 200, y: 400 },
    };
    const state = createPhysicsState(level, DEFAULT_CONFIG);
    state.ball.x = 100;
    state.ball.vx = 15;
    state.ball.y = 400;
    state.ball.vy = 0;
    state.phase = "fly";

    let events = [];
    for (let i = 0; i < 30; i++) {
      events = tickPhysics(state, level, DEFAULT_CONFIG, 16);
      if (state.cleared) break;
    }

    assertTrue(state.cleared);
    assertEqual(state.phase, "done");
  });

  test("tickPhysics 弹药用尽且未通关时失败", () => {
    dataStore.reset();
    const level: LevelDef = {
      ...sampleLevel,
      maxShots: 1,
      goal: { x: 900, y: 900 },
    };
    const state = createPhysicsState(level, DEFAULT_CONFIG);
    state.ball.x = 100;
    state.ball.vx = 2;
    state.ball.y = 400;
    state.ball.vy = 0;
    state.phase = "fly";

    let allEvents: any[] = [];
    let hasLevelFail = false;
    for (let i = 0; i < 500; i++) {
      const events = tickPhysics(state, level, DEFAULT_CONFIG, 16);
      allEvents = allEvents.concat(events);
      if (events.some((e) => e.type === "levelFail")) {
        hasLevelFail = true;
        break;
      }
      if (state.phase === "aim") {
        state.phase = "fly";
        state.ball.vx = 2;
      }
    }

    assertTrue(hasLevelFail, "应该触发 levelFail 事件");
    assertTrue(state.shotsUsed >= 1);
  });
});

suite("物理引擎 - 轨迹预测", () => {
  test("predictTrajectory 返回预测点数组", () => {
    dataStore.reset();
    const state = createPhysicsState(sampleLevel, DEFAULT_CONFIG);
    const points = predictTrajectory(state, sampleLevel, DEFAULT_CONFIG, -5, -2);
    assertTrue(Array.isArray(points));
    assertTrue(points.length > 0);
    assertEqual(typeof points[0].x, "number");
    assertEqual(typeof points[0].y, "number");
  });

  test("predictTrajectory 点的数量不超过 predictSteps", () => {
    dataStore.reset();
    const state = createPhysicsState(sampleLevel, DEFAULT_CONFIG);
    const points = predictTrajectory(state, sampleLevel, DEFAULT_CONFIG, -5, -2);
    assertTrue(points.length <= DEFAULT_CONFIG.predictSteps);
  });

  test("predictTrajectory 水平发射时 y 坐标递增（受重力）", () => {
    dataStore.reset();
    const state = createPhysicsState(sampleLevel, DEFAULT_CONFIG);
    const points = predictTrajectory(state, sampleLevel, DEFAULT_CONFIG, 5, 0);
    assertTrue(points.length > 2);
    assertTrue(points[points.length - 1].y > points[0].y);
  });
});

suite("数据存储 - 数据有效性验证", () => {
  test("dataStore reset 后返回有效默认数据", () => {
    dataStore.reset();
    const data = dataStore.getCurrentData();
    assertEqual(data.version, 2);
    assertTrue(data.meta.createdAt > 0);
    assertTrue(data.meta.updatedAt > 0);
    assertTrue(typeof data.progress === "object");
    assertTrue(Array.isArray(data.customLevels));
    assertFalse(data.tutorialCompleted);
  });

  test("dataStore load 返回有效数据和恢复状态", () => {
    dataStore.reset();
    const result = dataStore.load();
    assertTrue(result.data !== undefined);
    assertTrue(result.recovery !== undefined);
    assertTrue(result.recovery.type !== undefined);
  });

  test("dataStore save 后 updatedAt 更新", () => {
    dataStore.reset();
    const before = dataStore.getCurrentData();
    const beforeTime = before.meta.updatedAt;

    const updated = {
      ...before,
      tutorialCompleted: true,
    };
    dataStore.save(updated);

    const after = dataStore.getCurrentData();
    assertTrue(after.meta.updatedAt >= beforeTime);
    assertTrue(after.tutorialCompleted);
  });
});

suite("关卡数据 - 全部关卡有效性校验", () => {
  test("所有内置关卡通过 validateLevel 校验", () => {
    for (let i = 0; i < levels.length; i++) {
      const level = levels[i];
      const result = validateLevel(
        level,
        DEFAULT_CONFIG.ballRadius,
        DEFAULT_CONFIG.goalRadius,
        DEFAULT_CONFIG.starRadius
      );
      assertTrue(
        result.valid,
        `第 ${level.id} 关「${level.name}」校验失败: ${result.issues.map((i) => i.message).join(", ")}`
      );
    }
  });

  test("所有内置关卡的星级规则条目不超过 3 条", () => {
    for (const level of levels) {
      assertTrue(
        level.starRules.stars.length <= 3,
        `第 ${level.id} 关「${level.name}」星级规则超过 3 条`
      );
    }
  });

  test("所有内置关卡的 maxShots 在 1-20 范围内", () => {
    for (const level of levels) {
      assertTrue(
        level.maxShots >= 1 && level.maxShots <= 20,
        `第 ${level.id} 关「${level.name}」maxShots 超出范围`
      );
    }
  });

  test("所有内置关卡的 gravity 在合理范围内", () => {
    for (const level of levels) {
      assertTrue(
        level.gravity > 0 && level.gravity <= 0.5,
        `第 ${level.id} 关「${level.name}」gravity 超出范围`
      );
    }
  });

  test("所有内置关卡的 bounce 在 0.3-0.95 范围内", () => {
    for (const level of levels) {
      assertTrue(
        level.bounce >= 0.3 && level.bounce <= 0.95,
        `第 ${level.id} 关「${level.name}」bounce 超出范围`
      );
    }
  });
});

runTests().then(({ failed }) => {
  process.exit(failed > 0 ? 1 : 0);
});
