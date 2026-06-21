import { LevelDef, normalizeLevel } from "./levels";

export const DATA_STORE_VERSION = 2;

export const MAIN_STORAGE_KEY = "hxywl-61904-game-data";
export const BACKUP_STORAGE_KEY = "hxywl-61904-game-data-backup";

export const OLD_PROGRESS_KEY = "hxywl-61904-progress";
export const OLD_CUSTOM_LEVELS_KEY = "hxywl-61904-custom-levels";
export const OLD_TUTORIAL_KEY = "hxywl-61904-tutorial-completed";

export interface LevelProgress {
  stars: number;
  cleared: boolean;
}

export interface Progress {
  [levelId: number]: LevelProgress;
}

export interface GameData {
  version: number;
  meta: {
    createdAt: number;
    updatedAt: number;
  };
  progress: Progress;
  customLevels: LevelDef[];
  tutorialCompleted: boolean;
}

export type RecoveryAction =
  | { type: "none" }
  | { type: "migration"; source: "old-keys" }
  | { type: "recovery"; source: "backup" }
  | { type: "firstVisit" }
  | { type: "fallback"; reason: "corrupted" | "storageUnavailable" }
  | { type: "corrupted"; details: string };

export interface LoadResult {
  data: GameData;
  recovery: RecoveryAction;
}

export type DataStoreEventType =
  | "dataLoaded"
  | "dataSaved"
  | "dataReset"
  | "recoveryPerformed"
  | "migrationPerformed";

export interface DataStoreEvent {
  type: DataStoreEventType;
  data?: GameData;
  recovery?: RecoveryAction;
  timestamp: number;
}

type EventListener = (event: DataStoreEvent) => void;

function defaultProgress(): Progress {
  return {};
}

function defaultCustomLevels(): LevelDef[] {
  return [];
}

function createDefaultData(): GameData {
  return {
    version: DATA_STORE_VERSION,
    meta: {
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
    progress: defaultProgress(),
    customLevels: defaultCustomLevels(),
    tutorialCompleted: false,
  };
}

let _storageAvailable: boolean | null = null;

function isStorageAvailable(): boolean {
  if (_storageAvailable !== null) return _storageAvailable;
  try {
    const testKey = "__hxywl_storage_test__";
    localStorage.setItem(testKey, "1");
    localStorage.removeItem(testKey);
    _storageAvailable = true;
    return true;
  } catch {
    _storageAvailable = false;
    return false;
  }
}

function storageGet(key: string): string | null {
  if (!isStorageAvailable()) return null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function storageSet(key: string, value: string): boolean {
  if (!isStorageAvailable()) return false;
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    _storageAvailable = false;
    return false;
  }
}

function storageRemove(key: string): void {
  if (!isStorageAvailable()) return;
  try {
    localStorage.removeItem(key);
  } catch {
  }
}

function safeJsonParse(raw: string | null): unknown | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function isRecord(obj: unknown): obj is Record<string, unknown> {
  return typeof obj === "object" && obj !== null && !Array.isArray(obj);
}

function isValidLevelProgress(obj: unknown): obj is LevelProgress {
  if (!isRecord(obj)) return false;
  return (
    typeof obj.stars === "number" &&
    !isNaN(obj.stars) &&
    obj.stars >= 0 &&
    obj.stars <= 3 &&
    typeof obj.cleared === "boolean"
  );
}

function isValidProgress(obj: unknown): obj is Progress {
  if (!isRecord(obj)) return false;
  for (const key of Object.keys(obj)) {
    const id = parseInt(key, 10);
    if (isNaN(id)) return false;
    if (!isValidLevelProgress(obj[key])) return false;
  }
  return true;
}

function isValidLevelDef(obj: unknown): obj is LevelDef {
  if (!isRecord(obj)) return false;
  const hasRequiredFields =
    typeof obj.id === "number" &&
    !isNaN(obj.id) &&
    typeof obj.name === "string" &&
    obj.name.trim().length > 0 &&
    isRecord(obj.ball) &&
    isRecord(obj.goal) &&
    Array.isArray(obj.stars) &&
    Array.isArray(obj.obstacles) &&
    typeof obj.maxShots === "number" &&
    typeof obj.gravity === "number" &&
    typeof obj.bounce === "number" &&
    isRecord(obj.starRules);

  if (!hasRequiredFields) return false;

  const ball = obj.ball as Record<string, unknown>;
  const goal = obj.goal as Record<string, unknown>;
  if (typeof ball.x !== "number" || typeof ball.y !== "number") return false;
  if (typeof goal.x !== "number" || typeof goal.y !== "number") return false;

  return true;
}

function isValidCustomLevels(obj: unknown): obj is LevelDef[] {
  if (!Array.isArray(obj)) return false;
  for (const item of obj) {
    if (!isValidLevelDef(item)) return false;
  }
  return true;
}

function validateGameData(obj: unknown): obj is GameData {
  if (!isRecord(obj)) return false;

  if (typeof obj.version !== "number" || isNaN(obj.version)) return false;

  if (!isRecord(obj.meta)) return false;
  const meta = obj.meta as Record<string, unknown>;
  if (typeof meta.createdAt !== "number" || typeof meta.updatedAt !== "number") {
    return false;
  }

  if (!isValidProgress(obj.progress)) return false;
  if (!isValidCustomLevels(obj.customLevels)) return false;
  if (typeof obj.tutorialCompleted !== "boolean") return false;

  return true;
}

function normalizeCustomLevels(levels: LevelDef[]): LevelDef[] {
  return levels.map((l) => normalizeLevel(l));
}

function normalizeProgress(progress: Progress): Progress {
  const result: Progress = {};
  for (const key of Object.keys(progress)) {
    const id = parseInt(key, 10);
    const p = progress[id];
    if (p && !isNaN(id)) {
      result[id] = {
        stars: Math.max(0, Math.min(3, p.stars)),
        cleared: p.cleared,
      };
    }
  }
  return result;
}

function normalizeGameData(data: GameData): GameData {
  return {
    ...data,
    progress: normalizeProgress(data.progress),
    customLevels: normalizeCustomLevels(data.customLevels),
  };
}

function tryLoadFromKey(key: string): GameData | null {
  const raw = storageGet(key);
  const parsed = safeJsonParse(raw);
  if (validateGameData(parsed)) {
    return normalizeGameData(parsed);
  }
  return null;
}

function tryLoadOldProgress(): Progress | null {
  const raw = storageGet(OLD_PROGRESS_KEY);
  const parsed = safeJsonParse(raw);
  if (isValidProgress(parsed)) {
    return normalizeProgress(parsed);
  }
  return null;
}

function tryLoadOldCustomLevels(): LevelDef[] | null {
  const raw = storageGet(OLD_CUSTOM_LEVELS_KEY);
  const parsed = safeJsonParse(raw);
  if (Array.isArray(parsed)) {
    const validLevels: LevelDef[] = [];
    for (const item of parsed) {
      if (isValidLevelDef(item)) {
        validLevels.push(normalizeLevel(item));
      }
    }
    if (validLevels.length > 0 || parsed.length === 0) {
      return validLevels;
    }
  }
  return null;
}

function tryLoadOldTutorial(): boolean | null {
  const raw = storageGet(OLD_TUTORIAL_KEY);
  if (raw === "true") return true;
  if (raw === "false") return false;
  return null;
}

function migrateFromOldKeys(): GameData | null {
  const progress = tryLoadOldProgress();
  const customLevels = tryLoadOldCustomLevels();
  const tutorial = tryLoadOldTutorial();

  if (progress === null && customLevels === null && tutorial === null) {
    return null;
  }

  return {
    version: DATA_STORE_VERSION,
    meta: {
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
    progress: progress ?? defaultProgress(),
    customLevels: customLevels ?? defaultCustomLevels(),
    tutorialCompleted: tutorial ?? false,
  };
}

function anyKeyExistsInStorage(): boolean {
  return (
    storageGet(MAIN_STORAGE_KEY) !== null ||
    storageGet(BACKUP_STORAGE_KEY) !== null ||
    storageGet(OLD_PROGRESS_KEY) !== null ||
    storageGet(OLD_CUSTOM_LEVELS_KEY) !== null ||
    storageGet(OLD_TUTORIAL_KEY) !== null
  );
}

function deleteOldKeys(): void {
  storageRemove(OLD_PROGRESS_KEY);
  storageRemove(OLD_CUSTOM_LEVELS_KEY);
  storageRemove(OLD_TUTORIAL_KEY);
}

class DataStore {
  private listeners: Set<EventListener> = new Set();
  private currentData: GameData | null = null;
  private lastRecovery: RecoveryAction = { type: "none" };
  private loaded = false;

  addListener(listener: EventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(event: DataStoreEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
      }
    }
  }

  load(): LoadResult {
    if (this.loaded && this.currentData) {
      return { data: this.currentData, recovery: this.lastRecovery };
    }

    let data: GameData | null = null;
    let recovery: RecoveryAction = { type: "none" };

    data = tryLoadFromKey(MAIN_STORAGE_KEY);
    if (data) {
      recovery = { type: "none" };
      this.commit(data, recovery);
      return { data, recovery };
    }

    data = tryLoadFromKey(BACKUP_STORAGE_KEY);
    if (data) {
      recovery = { type: "recovery", source: "backup" };
      this.trySave(data);
      this.commit(data, recovery);
      this.emit({ type: "recoveryPerformed", data, recovery, timestamp: Date.now() });
      return { data, recovery };
    }

    data = migrateFromOldKeys();
    if (data) {
      recovery = { type: "migration", source: "old-keys" };
      this.trySave(data);
      deleteOldKeys();
      this.commit(data, recovery);
      this.emit({ type: "migrationPerformed", data, recovery, timestamp: Date.now() });
      return { data, recovery };
    }

    if (!isStorageAvailable()) {
      data = createDefaultData();
      recovery = { type: "fallback", reason: "storageUnavailable" };
      this.commit(data, recovery);
      return { data, recovery };
    }

    if (!anyKeyExistsInStorage()) {
      data = createDefaultData();
      recovery = { type: "firstVisit" };
      this.trySave(data);
      this.commit(data, recovery);
      return { data, recovery };
    }

    data = createDefaultData();
    recovery = { type: "fallback", reason: "corrupted" };
    this.trySave(data);
    this.commit(data, recovery);
    return { data, recovery };
  }

  private commit(data: GameData, recovery: RecoveryAction): void {
    this.currentData = data;
    this.lastRecovery = recovery;
    this.loaded = true;
    this.emit({ type: "dataLoaded", data, recovery, timestamp: Date.now() });
  }

  private trySave(data: GameData): boolean {
    const updated: GameData = {
      ...data,
      version: DATA_STORE_VERSION,
      meta: {
        ...data.meta,
        updatedAt: Date.now(),
      },
    };

    const normalized = normalizeGameData(updated);
    const json = JSON.stringify(normalized);

    const mainOk = storageSet(MAIN_STORAGE_KEY, json);
    if (mainOk) {
      storageSet(BACKUP_STORAGE_KEY, json);
    }

    this.currentData = normalized;
    return mainOk;
  }

  save(data: GameData): GameData {
    this.trySave(data);
    this.emit({ type: "dataSaved", data: this.currentData!, timestamp: Date.now() });
    return this.currentData!;
  }

  getCurrentData(): GameData {
    if (!this.currentData) {
      const result = this.load();
      return result.data;
    }
    return this.currentData;
  }

  reset(): GameData {
    const data = createDefaultData();
    this.trySave(data);
    this.lastRecovery = { type: "firstVisit" };
    this.emit({ type: "dataReset", data, timestamp: Date.now() });
    return data;
  }

  updateProgress(updater: (progress: Progress) => Progress): GameData {
    const current = this.getCurrentData();
    const updatedProgress = updater(current.progress);
    const updated: GameData = {
      ...current,
      progress: normalizeProgress(updatedProgress),
    };
    return this.save(updated);
  }

  updateCustomLevels(updater: (levels: LevelDef[]) => LevelDef[]): GameData {
    const current = this.getCurrentData();
    const updatedLevels = updater(current.customLevels);
    const updated: GameData = {
      ...current,
      customLevels: normalizeCustomLevels(updatedLevels),
    };
    return this.save(updated);
  }

  setTutorialCompleted(completed: boolean): GameData {
    const current = this.getCurrentData();
    const updated: GameData = {
      ...current,
      tutorialCompleted: completed,
    };
    return this.save(updated);
  }

  getRecoveryMessage(recovery: RecoveryAction): string {
    switch (recovery.type) {
      case "none":
      case "firstVisit":
        return "";
      case "migration":
        return "已将您的游戏数据从旧版本迁移到新版本。您的通关记录、自定义关卡和教程进度已全部保留。";
      case "recovery":
        return "检测到数据异常，已从最近的备份中恢复了您的游戏数据。";
      case "fallback":
        if (recovery.reason === "storageUnavailable") {
          return "浏览器本地存储不可用，游戏进度将无法保存。请检查浏览器设置或尝试关闭隐私模式。";
        }
        return "存储的数据已损坏，已恢复到初始状态。这不会影响游戏功能。";
      case "corrupted":
        return `数据错误：${recovery.details}。已使用默认数据继续游戏。`;
      default:
        return "";
    }
  }

  forceReload(): LoadResult {
    this.loaded = false;
    this.currentData = null;
    this.lastRecovery = { type: "none" };
    return this.load();
  }
}

export const dataStore = new DataStore();

export function loadProgress(): Progress {
  return dataStore.getCurrentData().progress;
}

export function saveProgress(p: Progress): void {
  dataStore.updateProgress(() => p);
}

export function isUnlocked(levelId: number, progress: Progress): boolean {
  if (levelId === 1) return true;
  return !!progress[levelId - 1]?.cleared;
}

export function getStars(levelId: number, progress: Progress): number {
  return progress[levelId]?.stars ?? 0;
}

export function updateLevelResult(
  progress: Progress,
  levelId: number,
  stars: number,
  cleared: boolean
): Progress {
  const prev = progress[levelId];
  const next: Progress = { ...progress };
  next[levelId] = {
    stars: prev ? Math.max(prev.stars, stars) : stars,
    cleared: prev ? prev.cleared || cleared : cleared,
  };
  saveProgress(next);
  return next;
}

export function isTutorialCompleted(): boolean {
  return dataStore.getCurrentData().tutorialCompleted;
}

export function setTutorialCompleted(completed: boolean): void {
  dataStore.setTutorialCompleted(completed);
}
