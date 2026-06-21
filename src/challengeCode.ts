import {
  LevelDef,
  StarDef,
  ObstacleDef,
  StarRules,
  CANVAS_W,
  CANVAS_H,
  normalizeLevel,
  validateLevel,
} from "./levels";
import { dataStore } from "./dataStore";
import { DEFAULT_CONFIG } from "./physics";

const PREFIX_RAW = "HX1-";
const PREFIX_GZ = "HX1Z-";

const CODE_VERSION = 1;

const OBSTACLE_TYPE_TO_CODE: Record<string, number> = {
  wall: 0,
  oneTime: 1,
  slowZone: 2,
  movingHorizontal: 3,
  movingVertical: 4,
};

const CODE_TO_OBSTACLE_TYPE: Record<number, string> = {
  0: "wall",
  1: "oneTime",
  2: "slowZone",
  3: "movingHorizontal",
  4: "movingVertical",
};

const KNOWN_TYPE_CODES = new Set(Object.keys(CODE_TO_OBSTACLE_TYPE).map(Number));
const KNOWN_TYPE_STRINGS = new Set(Object.keys(OBSTACLE_TYPE_TO_CODE));

type ObstacleTypeName = "wall" | "oneTime" | "slowZone" | "movingHorizontal" | "movingVertical";
const KNOWN_TYPE_NAMES = new Set<ObstacleTypeName>([
  "wall", "oneTime", "slowZone", "movingHorizontal", "movingVertical",
]);

interface CompactLevel {
  _v?: number;
  n: string;
  b: [number, number];
  g: [number, number];
  s: [number, number][];
  o: (number | string)[][];
  m: number;
  v: number;
  k: number;
  r: {
    s: {
      d: string;
      c?: number;
      u?: number;
      e?: number;
    }[];
  };
}

export interface ChallengeCodeWarning {
  type: "obstacleDowngraded" | "obstacleFiltered" | "layoutIssue" | "valueClamped";
  message: string;
  detail?: string;
}

export interface ChallengeCodeResult {
  success: boolean;
  level?: LevelDef;
  error?: string;
  warnings?: ChallengeCodeWarning[];
}

function levelToCompact(level: LevelDef): CompactLevel {
  return {
    _v: CODE_VERSION,
    n: level.name,
    b: [level.ball.x, level.ball.y],
    g: [level.goal.x, level.goal.y],
    s: level.stars.map((s) => [s.x, s.y]),
    o: level.obstacles.map((ob) => {
      const typeCode = ob.type ? (OBSTACLE_TYPE_TO_CODE[ob.type] ?? (KNOWN_TYPE_STRINGS.has(ob.type) ? 0 : ob.type)) : 0;
      const arr: (number | string)[] = [ob.x, ob.y, ob.w, ob.h, typeCode];
      if (
        ob.type === "movingHorizontal" ||
        ob.type === "movingVertical"
      ) {
        arr.push(ob.moveRange ?? 0);
        arr.push(ob.moveSpeed ?? 1.5);
      }
      return arr;
    }),
    m: level.maxShots,
    v: level.gravity,
    k: level.bounce,
    r: {
      s: level.starRules.stars.map((rule) => {
        const compact: CompactLevel["r"]["s"][0] = { d: rule.description };
        if (rule.minCollected !== undefined) compact.c = rule.minCollected;
        if (rule.maxShotsUsed !== undefined) compact.u = rule.maxShotsUsed;
        if (rule.minRemainingShots !== undefined) compact.e = rule.minRemainingShots;
        return compact;
      }),
    },
  };
}

function resolveObstacleType(typeCode: number | string, warnings: ChallengeCodeWarning[], obstacleIndex: number): ObstacleTypeName {
  let resolved: ObstacleTypeName = "wall";
  let unknownName: string | null = null;

  if (typeof typeCode === "number") {
    if (KNOWN_TYPE_CODES.has(typeCode)) {
      resolved = CODE_TO_OBSTACLE_TYPE[typeCode] as ObstacleTypeName;
    } else {
      unknownName = `类型码 ${typeCode}`;
    }
  } else {
    const strType = String(typeCode);
    if (KNOWN_TYPE_NAMES.has(strType as ObstacleTypeName)) {
      resolved = strType as ObstacleTypeName;
    } else {
      unknownName = strType;
    }
  }

  if (unknownName) {
    warnings.push({
      type: "obstacleDowngraded",
      message: `障碍 #${obstacleIndex + 1} 使用了未知的${unknownName}，已降级为普通墙体`,
      detail: "请更新到最新版本的游戏以体验完整功能",
    });
  }

  return resolved;
}

function clampWithWarning(
  value: number,
  min: number,
  max: number,
  warnings: ChallengeCodeWarning[],
  fieldName: string
): number {
  if (value < min) {
    warnings.push({
      type: "valueClamped",
      message: `${fieldName} ${value} 低于最小值 ${min}，已调整为 ${min}`,
    });
    return min;
  }
  if (value > max) {
    warnings.push({
      type: "valueClamped",
      message: `${fieldName} ${value} 超过最大值 ${max}，已调整为 ${max}`,
    });
    return max;
  }
  return value;
}

function compactToLevel(compact: CompactLevel, warnings: ChallengeCodeWarning[]): LevelDef {
  const cfg = DEFAULT_CONFIG;

  const safeBallX = clampWithWarning(
    Math.max(cfg.ballRadius, Math.min(CANVAS_W - cfg.ballRadius, compact.b[0])),
    cfg.ballRadius, CANVAS_W - cfg.ballRadius, warnings, "出生点 X"
  );
  const safeBallY = clampWithWarning(
    Math.max(cfg.ballRadius, Math.min(CANVAS_H - cfg.ballRadius, compact.b[1])),
    cfg.ballRadius, CANVAS_H - cfg.ballRadius, warnings, "出生点 Y"
  );
  const safeGoalX = clampWithWarning(
    Math.max(cfg.goalRadius, Math.min(CANVAS_W - cfg.goalRadius, compact.g[0])),
    cfg.goalRadius, CANVAS_W - cfg.goalRadius, warnings, "终点 X"
  );
  const safeGoalY = clampWithWarning(
    Math.max(cfg.goalRadius, Math.min(CANVAS_H - cfg.goalRadius, compact.g[1])),
    cfg.goalRadius, CANVAS_H - cfg.goalRadius, warnings, "终点 Y"
  );

  const stars: StarDef[] = (compact.s || []).map((s, i): StarDef => {
    const sx = clampWithWarning(
      Math.max(cfg.starRadius, Math.min(CANVAS_W - cfg.starRadius, s[0])),
      cfg.starRadius, CANVAS_W - cfg.starRadius, warnings, `星星 #${i + 1} X`
    );
    const sy = clampWithWarning(
      Math.max(cfg.starRadius, Math.min(CANVAS_H - cfg.starRadius, s[1])),
      cfg.starRadius, CANVAS_H - cfg.starRadius, warnings, `星星 #${i + 1} Y`
    );
    return { x: sx, y: sy };
  });

  const obstacles: ObstacleDef[] = (compact.o || []).map((o, idx) => {
    const typeCode = o[4] ?? 0;
    const type = resolveObstacleType(typeCode, warnings, idx);

    const rawX = o[0] as number;
    const rawY = o[1] as number;
    const rawW = Math.max(10, o[2] as number);
    const rawH = Math.max(10, o[3] as number);

    let safeW = clampWithWarning(rawW, 10, CANVAS_W, warnings, `障碍 #${idx + 1} 宽度`);
    let safeH = clampWithWarning(rawH, 10, CANVAS_H, warnings, `障碍 #${idx + 1} 高度`);
    let safeX = clampWithWarning(rawX, 0, CANVAS_W - safeW, warnings, `障碍 #${idx + 1} X`);
    let safeY = clampWithWarning(rawY, 0, CANVAS_H - safeH, warnings, `障碍 #${idx + 1} Y`);

    const ob: ObstacleDef = {
      x: safeX,
      y: safeY,
      w: safeW,
      h: safeH,
      type,
    };
    if (type === "movingHorizontal" || type === "movingVertical") {
      ob.moveRange = clampWithWarning((o[5] as number) ?? 0, 0, 300, warnings, `障碍 #${idx + 1} 移动范围`);
      ob.moveSpeed = clampWithWarning((o[6] as number) ?? 1.5, 0.1, 5, warnings, `障碍 #${idx + 1} 移动速度`);
    }
    return ob;
  });

  const starRules: StarRules = {
    stars: (compact.r?.s || []).map((rule) => ({
      description: rule.d || "",
      minCollected: rule.c,
      maxShotsUsed: rule.u,
      minRemainingShots: rule.e,
    })),
  };

  const safeMaxShots = clampWithWarning(compact.m, 1, 20, warnings, "弹射次数");
  const safeGravity = clampWithWarning(compact.v, 0.05, 0.5, warnings, "重力");
  const safeBounce = clampWithWarning(compact.k, 0.3, 0.95, warnings, "反弹系数");

  return {
    id: 0,
    name: (compact.n || "").trim().slice(0, 20) || "未命名关卡",
    ball: { x: safeBallX, y: safeBallY },
    goal: { x: safeGoalX, y: safeGoalY },
    stars,
    obstacles,
    maxShots: safeMaxShots,
    gravity: safeGravity,
    bounce: safeBounce,
    starRules,
  };
}

function base64urlEncode(data: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < data.length; i++) {
    binary += String.fromCharCode(data[i]);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64urlDecode(str: string): Uint8Array | null {
  try {
    let base64 = str.replace(/-/g, "+").replace(/_/g, "/");
    while (base64.length % 4) base64 += "=";
    const binary = atob(base64);
    const data = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      data[i] = binary.charCodeAt(i);
    }
    return data;
  } catch {
    return null;
  }
}

async function gzipCompress(data: Uint8Array): Promise<Uint8Array> {
  const cs = new CompressionStream("gzip");
  const writer = cs.writable.getWriter();
  writer.write(data as Uint8Array<ArrayBuffer>);
  writer.close();
  const reader = cs.readable.getReader();
  const chunks: Uint8Array[] = [];
  let totalLength = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    chunks.push(value);
    totalLength += value.length;
  }
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

async function gzipDecompress(data: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream("gzip");
  const writer = ds.writable.getWriter();
  writer.write(data as Uint8Array<ArrayBuffer>);
  writer.close();
  const reader = ds.readable.getReader();
  const chunks: Uint8Array[] = [];
  let totalLength = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    chunks.push(value);
    totalLength += value.length;
  }
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

function isNumber(v: unknown): v is number {
  return typeof v === "number" && !isNaN(v);
}

function isString(v: unknown): v is string {
  return typeof v === "string";
}

function validateCompactLevel(data: unknown): string | null {
  if (!data || typeof data !== "object") return "挑战码数据格式错误";
  const d = data as Record<string, unknown>;

  if (!isString(d.n) || (d.n as string).trim().length === 0)
    return "关卡名称无效";

  if (!Array.isArray(d.b) || d.b.length < 2 || !isNumber(d.b[0]) || !isNumber(d.b[1]))
    return "出生点坐标无效";
  if (!Array.isArray(d.g) || d.g.length < 2 || !isNumber(d.g[0]) || !isNumber(d.g[1]))
    return "终点坐标无效";

  if (!Array.isArray(d.s)) return "星星数据必须是数组";
  for (let i = 0; i < (d.s as unknown[]).length; i++) {
    const s = (d.s as unknown[])[i];
    if (!Array.isArray(s) || s.length < 2 || !isNumber(s[0]) || !isNumber(s[1]))
      return `星星 #${i + 1} 坐标无效`;
  }

  if (!Array.isArray(d.o)) return "障碍数据必须是数组";
  for (let i = 0; i < (d.o as unknown[]).length; i++) {
    const o = (d.o as unknown[])[i];
    if (!Array.isArray(o) || o.length < 4)
      return `障碍 #${i + 1} 数据无效`;
    if (!isNumber(o[0]) || !isNumber(o[1]) || !isNumber(o[2]) || !isNumber(o[3]))
      return `障碍 #${i + 1} 坐标或尺寸无效`;

    if (o.length >= 6 && o[5] !== undefined && !isNumber(o[5]))
      return `障碍 #${i + 1} 移动范围无效`;
    if (o.length >= 7 && o[6] !== undefined && !isNumber(o[6]))
      return `障碍 #${i + 1} 移动速度无效`;
  }

  if (!isNumber(d.m)) return "弹射次数无效";
  if (!isNumber(d.v)) return "重力无效";
  if (!isNumber(d.k)) return "反弹系数无效";

  if (!d.r || typeof d.r !== "object") return "星级规则缺失";
  const r = d.r as Record<string, unknown>;
  if (!Array.isArray(r.s) || (r.s as unknown[]).length === 0)
    return "星级规则必须是非空数组";
  for (let i = 0; i < (r.s as unknown[]).length; i++) {
    const rule = (r.s as unknown[])[i];
    if (!rule || typeof rule !== "object") return `星级规则 #${i + 1} 格式错误`;
    const rr = rule as Record<string, unknown>;
    if (!isString(rr.d) || (rr.d as string).trim() === "")
      return `星级规则 #${i + 1} 缺少描述`;
    if (rr.c !== undefined && !isNumber(rr.c))
      return `星级规则 #${i + 1} minCollected 无效`;
    if (rr.u !== undefined && !isNumber(rr.u))
      return `星级规则 #${i + 1} maxShotsUsed 无效`;
    if (rr.e !== undefined && !isNumber(rr.e))
      return `星级规则 #${i + 1} minRemainingShots 无效`;
  }

  if ((r.s as unknown[]).length > 3) {
    return "星级规则条目不能超过 3 条";
  }

  return null;
}

export async function encodeChallengeCode(level: LevelDef): Promise<string> {
  const compact = levelToCompact(level);
  const json = JSON.stringify(compact);
  const bytes = new TextEncoder().encode(json);

  try {
    const compressed = await gzipCompress(bytes);
    const b64 = base64urlEncode(compressed);
    const rawB64 = base64urlEncode(bytes);

    if (PREFIX_GZ.length + b64.length < PREFIX_RAW.length + rawB64.length) {
      return PREFIX_GZ + b64;
    }
    return PREFIX_RAW + rawB64;
  } catch {
    return PREFIX_RAW + base64urlEncode(bytes);
  }
}

export async function decodeChallengeCode(code: string): Promise<ChallengeCodeResult> {
  const warnings: ChallengeCodeWarning[] = [];

  if (!code || typeof code !== "string") {
    return { success: false, error: "挑战码为空", warnings };
  }

  const trimmed = code.trim();

  let payload: string;
  let isGzipped = false;

  if (trimmed.startsWith(PREFIX_GZ)) {
    payload = trimmed.slice(PREFIX_GZ.length);
    isGzipped = true;
  } else if (trimmed.startsWith(PREFIX_RAW)) {
    payload = trimmed.slice(PREFIX_RAW.length);
  } else {
    return {
      success: false,
      error: "无法识别的挑战码格式（应以 HX1- 或 HX1Z- 开头）",
      warnings,
    };
  }

  if (!payload) {
    return { success: false, error: "挑战码内容为空", warnings };
  }

  const bytes = base64urlDecode(payload);
  if (!bytes) {
    return { success: false, error: "挑战码编码无效，无法解码", warnings };
  }

  let jsonBytes: Uint8Array;
  if (isGzipped) {
    try {
      jsonBytes = await gzipDecompress(bytes);
    } catch {
      return { success: false, error: "挑战码解压失败，数据可能已损坏", warnings };
    }
  } else {
    jsonBytes = bytes;
  }

  let parsed: unknown;
  try {
    const json = new TextDecoder().decode(jsonBytes);
    parsed = JSON.parse(json);
  } catch {
    return { success: false, error: "挑战码数据解析失败，格式可能已损坏", warnings };
  }

  const validationError = validateCompactLevel(parsed);
  if (validationError) {
    return {
      success: false,
      error: `关卡校验失败：${validationError}`,
      warnings,
    };
  }

  const compact = parsed as CompactLevel;
  if (compact._v !== undefined && compact._v > CODE_VERSION) {
    warnings.push({
      type: "layoutIssue",
      message: "该挑战码来自更新的版本，部分功能可能无法正常显示",
      detail: "建议更新游戏到最新版本以获得完整体验",
    });
  }

  const level = compactToLevel(compact, warnings);

  const layoutResult = validateLevel(
    level,
    DEFAULT_CONFIG.ballRadius,
    DEFAULT_CONFIG.goalRadius,
    DEFAULT_CONFIG.starRadius
  );
  if (!layoutResult.valid) {
    for (const issue of layoutResult.issues) {
      if (
        issue.type === "ballOutOfBounds" ||
        issue.type === "goalOutOfBounds" ||
        issue.type === "starOutOfBounds" ||
        issue.type === "obstacleOutOfBounds"
      ) {
        continue;
      }
      warnings.push({
        type: "layoutIssue",
        message: issue.message,
        detail: issue.type,
      });
    }
  }

  const existingLevels = dataStore.getCurrentData().customLevels;
  let finalName = level.name.trim();
  const nameExists = (name: string) =>
    existingLevels.some((l) => l.name.trim() === name);
  if (nameExists(finalName)) {
    let suffix = 2;
    while (nameExists(`${finalName} (${suffix})`)) {
      suffix++;
    }
    finalName = `${finalName} (${suffix})`;
    warnings.push({
      type: "valueClamped",
      message: `已存在同名关卡，已重命名为「${finalName}」`,
    });
  }

  const normalized = normalizeLevel({ ...level, name: finalName });

  return {
    success: true,
    level: normalized,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

export function getLevelShareSummary(level: LevelDef): {
  obstacleCount: number;
  starCount: number;
  obstacleBreakdown: { type: string; count: number }[];
} {
  const breakdown = new Map<string, number>();
  for (const ob of level.obstacles) {
    const t = ob.type || "wall";
    breakdown.set(t, (breakdown.get(t) || 0) + 1);
  }
  return {
    obstacleCount: level.obstacles.length,
    starCount: level.stars.length,
    obstacleBreakdown: Array.from(breakdown.entries()).map(([type, count]) => ({
      type,
      count,
    })),
  };
}

export const OBSTACLE_TYPE_LABELS: Record<string, string> = {
  wall: "墙体",
  oneTime: "易碎",
  slowZone: "减速区",
  movingHorizontal: "水平移动",
  movingVertical: "垂直移动",
};
