const KEY = "hxywl-61904-progress";

export interface LevelProgress {
  stars: number;
  cleared: boolean;
}

export type Progress = Record<number, LevelProgress>;

export function loadProgress(): Progress {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return {};
}

export function saveProgress(p: Progress) {
  localStorage.setItem(KEY, JSON.stringify(p));
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
