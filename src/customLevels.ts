import { LevelDef, StarDef, ObstacleDef, StarRules, CANVAS_W, CANVAS_H } from "./levels";

const CUSTOM_LEVELS_KEY = "hxywl-61904-custom-levels";
const CUSTOM_LEVEL_ID_START = 1000;
const EXPORT_VERSION = 1;
const EXPORT_PREFIX = "HXYWL_LEVEL";

export interface ExportData {
  version: number;
  type: string;
  level: LevelDef;
}

export interface ImportResult {
  success: boolean;
  level?: LevelDef;
  error?: string;
}

function isNumber(v: unknown): v is number {
  return typeof v === "number" && !isNaN(v);
}

function isString(v: unknown): v is string {
  return typeof v === "string";
}

function validatePosition(obj: unknown, fieldName: string): string | null {
  if (!obj || typeof obj !== "object") return `${fieldName} 缺失或格式错误`;
  const o = obj as Record<string, unknown>;
  if (!isNumber(o.x) || !isNumber(o.y)) return `${fieldName}.x 或 .y 无效`;
  return null;
}

function validateStarDef(s: unknown, idx: number): string | null {
  if (!s || typeof s !== "object") return `星星 #${idx + 1} 格式错误`;
  return validatePosition(s, `星星 #${idx + 1}`);
}

function validateObstacleDef(ob: unknown, idx: number): string | null {
  if (!ob || typeof ob !== "object") return `障碍 #${idx + 1} 格式错误`;
  const o = ob as Record<string, unknown>;
  if (!isNumber(o.x) || !isNumber(o.y) || !isNumber(o.w) || !isNumber(o.h))
    return `障碍 #${idx + 1} 坐标或尺寸无效`;
  if ((o.w as number) < 10 || (o.h as number) < 10)
    return `障碍 #${idx + 1} 尺寸过小`;
  if (o.type !== undefined && o.type !== "wall" && o.type !== "oneTime" && o.type !== "slowZone")
    return `障碍 #${idx + 1} 类型无效`;
  return null;
}

function validateStarRule(rule: unknown, idx: number): string | null {
  if (!rule || typeof rule !== "object") return `星级规则 #${idx + 1} 格式错误`;
  const r = rule as Record<string, unknown>;
  if (!isString(r.description) || (r.description as string).trim() === "")
    return `星级规则 #${idx + 1} 缺少描述`;
  return null;
}

function validateStarRules(sr: unknown): string | null {
  if (!sr || typeof sr !== "object") return "starRules 缺失或格式错误";
  const obj = sr as Record<string, unknown>;
  if (!Array.isArray(obj.stars) || (obj.stars as unknown[]).length === 0)
    return "starRules.stars 必须是非空数组";
  for (let i = 0; i < (obj.stars as unknown[]).length; i++) {
    const err = validateStarRule((obj.stars as unknown[])[i], i);
    if (err) return err;
  }
  return null;
}

function validateLevelDef(data: unknown): string | null {
  if (!data || typeof data !== "object") return "关卡数据格式错误";
  const d = data as Record<string, unknown>;

  if (!isString(d.name) || (d.name as string).trim() === "")
    return "关卡名称无效";
  if ((d.name as string).trim().length > 20)
    return "关卡名称不能超过 20 个字符";

  const ballErr = validatePosition(d.ball, "ball");
  if (ballErr) return ballErr;
  const goalErr = validatePosition(d.goal, "goal");
  if (goalErr) return goalErr;

  const b = d.ball as { x: number; y: number };
  const g = d.goal as { x: number; y: number };
  if (b.x < 0 || b.x > CANVAS_W || b.y < 0 || b.y > CANVAS_H)
    return "出生点坐标超出画布范围";
  if (g.x < 0 || g.x > CANVAS_W || g.y < 0 || g.y > CANVAS_H)
    return "终点坐标超出画布范围";

  if (!Array.isArray(d.stars)) return "stars 必须是数组";
  for (let i = 0; i < (d.stars as unknown[]).length; i++) {
    const err = validateStarDef((d.stars as unknown[])[i], i);
    if (err) return err;
  }

  if (!Array.isArray(d.obstacles)) return "obstacles 必须是数组";
  for (let i = 0; i < (d.obstacles as unknown[]).length; i++) {
    const err = validateObstacleDef((d.obstacles as unknown[])[i], i);
    if (err) return err;
  }

  if (!isNumber(d.maxShots) || (d.maxShots as number) < 1 || (d.maxShots as number) > 20)
    return "弹射次数需在 1-20 之间";
  if (!isNumber(d.gravity) || (d.gravity as number) < 0.05 || (d.gravity as number) > 0.5)
    return "重力需在 0.05-0.5 之间";
  if (!isNumber(d.bounce) || (d.bounce as number) < 0.3 || (d.bounce as number) > 0.95)
    return "反弹系数需在 0.3-0.95 之间";

  const srErr = validateStarRules(d.starRules);
  if (srErr) return srErr;

  return null;
}

export function exportLevel(level: LevelDef): void {
  const exportData: ExportData = {
    version: EXPORT_VERSION,
    type: EXPORT_PREFIX,
    level: { ...level },
  };
  const json = JSON.stringify(exportData, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${level.name.trim().replace(/[^a-zA-Z0-9\u4e00-\u9fff_-]/g, "_")}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function importLevel(fileContent: string): ImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(fileContent);
  } catch {
    return { success: false, error: "文件内容不是有效的 JSON 格式" };
  }

  if (!parsed || typeof parsed !== "object") {
    return { success: false, error: "文件数据格式错误" };
  }

  const data = parsed as Record<string, unknown>;

  let levelData: unknown;
  if (data.type === EXPORT_PREFIX && data.level) {
    levelData = data.level;
  } else if (data.id !== undefined && data.name !== undefined) {
    levelData = data;
  } else {
    return { success: false, error: "无法识别的关卡文件格式" };
  }

  const validationError = validateLevelDef(levelData);
  if (validationError) {
    return { success: false, error: `关卡数据校验失败：${validationError}` };
  }

  const level = levelData as LevelDef;
  const existingLevels = loadCustomLevels();

  let finalName = level.name.trim();
  const nameExists = (name: string) =>
    existingLevels.some((l) => l.name.trim() === name);
  if (nameExists(finalName)) {
    let suffix = 2;
    while (nameExists(`${finalName} (${suffix})`)) {
      suffix++;
    }
    finalName = `${finalName} (${suffix})`;
  }

  const newId = getNextCustomId();
  const importedLevel: LevelDef = {
    ...level,
    id: newId,
    name: finalName,
  };

  existingLevels.push(importedLevel);
  saveCustomLevels(existingLevels);

  return { success: true, level: importedLevel };
}

export function loadCustomLevels(): LevelDef[] {
  try {
    const raw = localStorage.getItem(CUSTOM_LEVELS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    }
  } catch {}
  return [];
}

export function saveCustomLevels(levels: LevelDef[]): void {
  try {
    localStorage.setItem(CUSTOM_LEVELS_KEY, JSON.stringify(levels));
  } catch {}
}

export function getNextCustomId(): number {
  const levels = loadCustomLevels();
  if (levels.length === 0) return CUSTOM_LEVEL_ID_START;
  const maxId = levels.reduce((max, l) => Math.max(max, l.id), CUSTOM_LEVEL_ID_START - 1);
  return maxId + 1;
}

export function saveCustomLevel(level: LevelDef): LevelDef {
  const levels = loadCustomLevels();
  const existingIndex = levels.findIndex((l) => l.id === level.id);
  if (existingIndex >= 0) {
    levels[existingIndex] = level;
  } else {
    levels.push(level);
  }
  saveCustomLevels(levels);
  return level;
}

export function deleteCustomLevel(levelId: number): void {
  const levels = loadCustomLevels();
  const filtered = levels.filter((l) => l.id !== levelId);
  saveCustomLevels(filtered);
}

export function createEmptyLevel(id: number): LevelDef {
  return {
    id,
    name: "自定义关卡",
    ball: { x: 100, y: 400 },
    goal: { x: 700, y: 400 },
    stars: [],
    obstacles: [],
    maxShots: 3,
    gravity: 0.15,
    bounce: 0.7,
    starRules: {
      stars: [
        { description: "抵达终点", minCollected: 0 },
        { description: "收集所有星星", minCollected: 0 },
        { description: "1次内通关", maxShotsUsed: 1 },
      ],
    },
  };
}

export function updateStarRulesForLevel(level: LevelDef): LevelDef {
  const starCount = level.stars.length;
  const rules = [...level.starRules.stars];

  if (starCount > 0 && rules[1]) {
    rules[1].minCollected = Math.max(1, Math.floor(starCount * 0.5));
  }
  if (starCount > 0 && rules[2]) {
    rules[2].minCollected = starCount;
  }

  return {
    ...level,
    starRules: { stars: rules },
  };
}
