import { LevelDef, CANVAS_W, CANVAS_H } from "./levels";
import {
  PhysicsState,
  PhysicsConfig,
  PhysicsEvent,
  DEFAULT_CONFIG,
  createPhysicsState,
  resetBall as physResetBall,
  resetAll as physResetAll,
  tickPhysics,
  spawnParticles,
  triggerShake,
  computeLaunchVelocity,
  applyLaunch,
} from "./physics";
import { ShotRecord } from "./replayRoutes";

export type GamePhase = "aim" | "fly" | "done";

export interface GameEngineCallbacks {
  onPhaseChange?: (phase: GamePhase) => void;
  onShotsChange?: (remaining: number, used: number) => void;
  onCollectedChange?: (collected: number) => void;
  onGoalReach?: () => void;
  onLevelFail?: () => void;
  onBallStop?: () => void;
  onShotRecorded?: (record: ShotRecord, allRecords: ShotRecord[]) => void;
}

export class GameEngine {
  private state: PhysicsState;
  private config: PhysicsConfig;
  private level: LevelDef;
  private callbacks: GameEngineCallbacks;
  private rafId: number = 0;
  private lastTime: number = 0;
  private isPaused: boolean = false;
  private isRunning: boolean = false;
  private shotRecords: ShotRecord[] = [];
  private lastBallPos: { x: number; y: number };
  private cleared: boolean = false;

  constructor(level: LevelDef, callbacks: GameEngineCallbacks = {}) {
    this.level = level;
    this.config = DEFAULT_CONFIG;
    this.state = createPhysicsState(level, this.config);
    this.callbacks = callbacks;
    this.lastBallPos = { x: level.ball.x, y: level.ball.y };
  }

  getState(): PhysicsState {
    return this.state;
  }

  getConfig(): PhysicsConfig {
    return this.config;
  }

  getLevel(): LevelDef {
    return this.level;
  }

  getPhase(): GamePhase {
    return this.state.phase;
  }

  getShotsRemaining(): number {
    return this.state.shotsRemaining;
  }

  getShotsUsed(): number {
    return this.state.shotsUsed;
  }

  getCollected(): number {
    return this.state.collected;
  }

  getShotRecords(): ShotRecord[] {
    return [...this.shotRecords];
  }

  isCleared(): boolean {
    return this.cleared;
  }

  setLevel(level: LevelDef): void {
    this.level = level;
    this.reset();
  }

  setCallbacks(callbacks: GameEngineCallbacks): void {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  reset(): void {
    physResetAll(this.state, this.level, this.config);
    this.shotRecords = [];
    this.lastBallPos = { x: this.level.ball.x, y: this.level.ball.y };
    this.cleared = false;
    this.isPaused = false;
    this.lastTime = 0;
    this.callbacks.onPhaseChange?.(this.state.phase);
    this.callbacks.onShotsChange?.(this.state.shotsRemaining, this.state.shotsUsed);
    this.callbacks.onCollectedChange?.(this.state.collected);
  }

  pause(): void {
    if (this.state.phase === "done") return;
    this.isPaused = true;
  }

  resume(): void {
    if (this.state.phase === "done") return;
    this.isPaused = false;
    this.lastTime = 0;
  }

  getIsPaused(): boolean {
    return this.isPaused;
  }

  launch(dragX: number, dragY: number): boolean {
    if (this.state.phase !== "aim") return false;
    if (this.isPaused) return false;

    const launched = applyLaunch(this.state, dragX, dragY, this.config);
    if (launched) {
      const record: ShotRecord = {
        ballX: this.lastBallPos.x,
        ballY: this.lastBallPos.y,
        dragX,
        dragY,
      };
      this.shotRecords = [...this.shotRecords, record];
      this.callbacks.onPhaseChange?.("fly");
      this.callbacks.onShotRecorded?.(record, this.shotRecords);
    }
    return launched;
  }

  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.lastTime = 0;
    this.loop(performance.now());
  }

  stop(): void {
    this.isRunning = false;
    if (this.rafId !== 0) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
  }

  private loop = (now: number): void => {
    if (!this.isRunning) return;

    if (this.lastTime === 0) {
      this.lastTime = now;
    }

    if (!this.isPaused && this.state.phase !== "done") {
      const dt = now - this.lastTime;
      const events = tickPhysics(this.state, this.level, this.config, dt);
      this.processEvents(events);
    }

    this.lastTime = now;
    this.rafId = requestAnimationFrame(this.loop);
  };

  private processEvents(events: PhysicsEvent[]): void {
    for (const e of events) {
      this.handleEvent(e);
    }
  }

  private handleEvent(e: PhysicsEvent): void {
    const s = this.state;
    switch (e.type) {
      case "boundaryBounce":
        if (e.speed > 1) {
          spawnParticles(s, e.x, e.y, Math.min(Math.floor(e.speed * 2), 8), "collision", "#64748b");
          triggerShake(s, Math.min(e.speed * 0.3, 4), Math.min(Math.floor(e.speed * 3), 12));
        }
        break;
      case "obstacleBounce":
        if (e.speed > 0.8) {
          spawnParticles(s, e.x, e.y, Math.min(Math.floor(e.speed * 1.5), 6), "collision", "#94a3b8");
          triggerShake(s, Math.min(e.speed * 0.2, 3), Math.min(Math.floor(e.speed * 2), 8));
        }
        break;
      case "obstacleDestroy":
        spawnParticles(s, e.cx, e.cy, 18, "destroy");
        spawnParticles(s, s.ball.x, s.ball.y, 10, "collision", "#fb923c");
        triggerShake(s, Math.min(e.impactSpeed * 0.5, 6), 18);
        break;
      case "slowZoneParticle":
        spawnParticles(s, e.x, e.y, 1, "slow");
        break;
      case "starCollect":
        spawnParticles(s, e.x, e.y, 16, "star");
        triggerShake(s, 2, 8);
        this.callbacks.onCollectedChange?.(s.collected);
        break;
      case "goalReach":
        spawnParticles(s, e.x, e.y, 35, "goal");
        triggerShake(s, 5, 25);
        this.cleared = true;
        s.phase = "done";
        this.callbacks.onPhaseChange?.("done");
        this.callbacks.onGoalReach?.();
        break;
      case "ballStop":
        this.lastBallPos = { x: s.ball.x, y: s.ball.y };
        this.callbacks.onShotsChange?.(s.shotsRemaining, s.shotsUsed);
        if (s.shotsRemaining > 0) {
          s.phase = "aim";
          this.callbacks.onPhaseChange?.("aim");
        }
        this.callbacks.onBallStop?.();
        break;
      case "levelFail":
        this.callbacks.onShotsChange?.(s.shotsRemaining, s.shotsUsed);
        s.phase = "done";
        this.callbacks.onPhaseChange?.("done");
        this.callbacks.onLevelFail?.();
        break;
    }
  }

  computeLaunchVelocity(
    ballX: number,
    ballY: number,
    dragX: number,
    dragY: number
  ): { vx: number; vy: number; power: number; clampedDist: number } | null {
    return computeLaunchVelocity(ballX, ballY, dragX, dragY, this.config);
  }

  getBallPosition(): { x: number; y: number } {
    return { x: this.state.ball.x, y: this.state.ball.y };
  }
}
