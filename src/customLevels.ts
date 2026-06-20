import { LevelDef } from "./levels";

const CUSTOM_LEVELS_KEY = "hxywl-61904-custom-levels";
const CUSTOM_LEVEL_ID_START = 1000;

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
