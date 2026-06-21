import { LevelDef, CANVAS_W, CANVAS_H } from "./levels";
import {
  PhysicsState,
  PhysicsConfig,
  createPhysicsState,
  computeLaunchVelocity,
  applyLaunch,
  tickPhysics,
} from "./physics";

const OFFICIAL_KEY = "hxywl-61904-best-routes-official";
const CUSTOM_KEY = "hxywl-61904-best-routes-custom";
const CUSTOM_LEVEL_ID_START = 1000;

export interface ShotRecord {
  ballX: number;
  ballY: number;
  dragX: number;
  dragY: number;
}

export interface BestRoute {
  levelId: number;
  shots: ShotRecord[];
  stars: number;
  shotsUsed: number;
  timestamp: number;
}

export type RoutesMap = Record<number, BestRoute>;

export function isCustomLevel(levelId: number): boolean {
  return levelId >= CUSTOM_LEVEL_ID_START;
}

function getStorageKey(levelId: number): string {
  return isCustomLevel(levelId) ? CUSTOM_KEY : OFFICIAL_KEY;
}

function loadRoutes(levelId: number): RoutesMap {
  const key = getStorageKey(levelId);
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw);
  } catch {}
  return {};
}

function saveRoutes(levelId: number, routes: RoutesMap): void {
  const key = getStorageKey(levelId);
  try {
    localStorage.setItem(key, JSON.stringify(routes));
  } catch {}
}

export function getBestRoute(levelId: number): BestRoute | null {
  const routes = loadRoutes(levelId);
  return routes[levelId] || null;
}

export function isBetterRoute(
  existing: BestRoute | null,
  newStars: number,
  newShotsUsed: number
): boolean {
  if (!existing) return newStars > 0;
  if (newStars > existing.stars) return true;
  if (newStars === existing.stars && newShotsUsed < existing.shotsUsed) return true;
  return false;
}

export function saveBestRoute(
  levelId: number,
  shots: ShotRecord[],
  stars: number,
  shotsUsed: number
): boolean {
  const existing = getBestRoute(levelId);
  if (!isBetterRoute(existing, stars, shotsUsed)) return false;

  const routes = loadRoutes(levelId);
  routes[levelId] = {
    levelId,
    shots: [...shots],
    stars,
    shotsUsed,
    timestamp: Date.now(),
  };
  saveRoutes(levelId, routes);
  return true;
}

export interface ReplayTrajectoryPoint {
  x: number;
  y: number;
}

export interface ReplayShotTrajectory {
  startX: number;
  startY: number;
  points: ReplayTrajectoryPoint[];
  endX: number;
  endY: number;
}

export function simulateRoute(
  level: LevelDef,
  config: PhysicsConfig,
  route: BestRoute
): ReplayShotTrajectory[] {
  const trajectories: ReplayShotTrajectory[] = [];
  const state: PhysicsState = createPhysicsState(level, config);

  for (const shot of route.shots) {
    const launch = computeLaunchVelocity(
      shot.ballX,
      shot.ballY,
      shot.dragX,
      shot.dragY,
      config
    );
    if (!launch) continue;

    const points: ReplayTrajectoryPoint[] = [];
    const startX = state.ball.x;
    const startY = state.ball.y;

    applyLaunch(state, shot.dragX, shot.dragY, config);

    let safety = 0;
    const maxTicks = 2000;
    const sampleInterval = 2;
    let tickCount = 0;

    while (state.phase === "fly" && safety < maxTicks) {
      const events = tickPhysics(state, level, config, config.fixedDt);

      tickCount++;
      if (tickCount % sampleInterval === 0) {
        points.push({ x: state.ball.x, y: state.ball.y });
      }

      let shouldBreak = false;
      for (const e of events) {
        if (e.type === "goalReach" || e.type === "levelFail" || e.type === "ballStop") {
          shouldBreak = true;
          break;
        }
      }
      if (shouldBreak) break;

      safety++;
    }

    if (points.length === 0 || points[points.length - 1].x !== state.ball.x || points[points.length - 1].y !== state.ball.y) {
      points.push({ x: state.ball.x, y: state.ball.y });
    }

    trajectories.push({
      startX,
      startY,
      points,
      endX: state.ball.x,
      endY: state.ball.y,
    });

    if (state.phase === "done") break;
  }

  return trajectories;
}

export function deleteBestRoute(levelId: number): void {
  const routes = loadRoutes(levelId);
  if (routes[levelId]) {
    delete routes[levelId];
    saveRoutes(levelId, routes);
  }
}
