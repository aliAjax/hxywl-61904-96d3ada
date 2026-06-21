import { LevelDef, CANVAS_W, CANVAS_H } from "./levels";
import {
  PhysicsState,
  PhysicsConfig,
  BallState,
  ObstacleState,
  StarState,
  Particle,
  predictTrajectory,
} from "./physics";
import { ReplayShotTrajectory } from "./replayRoutes";
import { ViewportInfo } from "./useGameViewport";

export interface RendererOptions {
  showTrajectory?: boolean;
  replayTrajectories?: ReplayShotTrajectory[];
  shotRecordsCount?: number;
  dragState?: { x: number; y: number } | null;
}

export class CanvasRenderer {
  private ctx: CanvasRenderingContext2D;
  private viewport: ViewportInfo;

  constructor(ctx: CanvasRenderingContext2D, viewport: ViewportInfo) {
    this.ctx = ctx;
    this.viewport = viewport;
  }

  setViewport(viewport: ViewportInfo): void {
    this.viewport = viewport;
  }

  render(
    state: PhysicsState,
    level: LevelDef,
    config: PhysicsConfig,
    options: RendererOptions = {}
  ): void {
    const ctx = this.ctx;
    const vp = this.viewport;
    const dpr = window.devicePixelRatio || 1;

    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, vp.canvasWidth, vp.canvasHeight);

    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, vp.canvasWidth, vp.canvasHeight);

    ctx.save();
    ctx.translate(vp.offsetX, vp.offsetY);
    ctx.scale(vp.scale, vp.scale);

    ctx.save();
    ctx.translate(state.shake.x, state.shake.y);

    this.drawGrid(ctx);
    this.drawObstacles(ctx, state.obstacles);
    this.drawGoal(ctx, level, config, state.goalAnim);
    this.drawStars(ctx, state.stars, config);
    this.drawTrail(ctx, state, config);
    this.drawReplayTrajectories(ctx, options.replayTrajectories || [], options.shotRecordsCount || 0, state.ball);
    this.drawBall(ctx, state.ball, state.phase);
    this.drawAiming(ctx, state, level, config, options.dragState);
    this.drawParticles(ctx, state.particles);

    ctx.restore();
    ctx.restore();
    ctx.restore();
  }

  private drawGrid(ctx: CanvasRenderingContext2D): void {
    ctx.strokeStyle = "rgba(148,163,184,0.12)";
    ctx.lineWidth = 1;
    for (let gx = 0; gx < CANVAS_W; gx += 40) {
      ctx.beginPath();
      ctx.moveTo(gx, 0);
      ctx.lineTo(gx, CANVAS_H);
      ctx.stroke();
    }
    for (let gy = 0; gy < CANVAS_H; gy += 40) {
      ctx.beginPath();
      ctx.moveTo(0, gy);
      ctx.lineTo(CANVAS_W, gy);
      ctx.stroke();
    }
  }

  private roundRect(
    c: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number
  ): void {
    c.beginPath();
    c.moveTo(x + r, y);
    c.lineTo(x + w - r, y);
    c.quadraticCurveTo(x + w, y, x + w, y + r);
    c.lineTo(x + w, y + h - r);
    c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    c.lineTo(x + r, y + h);
    c.quadraticCurveTo(x, y + h, x, y + h - r);
    c.lineTo(x, y + r);
    c.quadraticCurveTo(x, y, x + r, y);
    c.closePath();
  }

  private drawObstacles(ctx: CanvasRenderingContext2D, obstacles: ObstacleState[]): void {
    obstacles.forEach((ob, idx) => {
      if (ob.destroyed) {
        if (ob.destroyAnim > 0) {
          const alpha = ob.destroyAnim / 30;
          const expand = (30 - ob.destroyAnim) * 2;
          ctx.globalAlpha = alpha;
          ctx.strokeStyle = "#f97316";
          ctx.lineWidth = 2;
          ctx.strokeRect(ob.x - expand, ob.y - expand, ob.w + expand * 2, ob.h + expand * 2);
          ctx.globalAlpha = 1;
        }
        return;
      }

      if (ob.type === "wall") {
        this.drawWallObstacle(ctx, ob);
      } else if (ob.type === "oneTime") {
        this.drawOneTimeObstacle(ctx, ob, idx);
      } else if (ob.type === "slowZone") {
        this.drawSlowZone(ctx, ob, idx);
      } else if (ob.type === "movingHorizontal" || ob.type === "movingVertical") {
        this.drawMovingObstacle(ctx, ob, idx);
      } else {
        this.drawUnknownObstacle(ctx, ob);
      }
    });
  }

  private drawWallObstacle(ctx: CanvasRenderingContext2D, ob: ObstacleState): void {
    const obGrad = ctx.createLinearGradient(ob.x, ob.y, ob.x, ob.y + ob.h);
    obGrad.addColorStop(0, "#475569");
    obGrad.addColorStop(1, "#334155");
    ctx.fillStyle = obGrad;
    ctx.fillRect(ob.x, ob.y, ob.w, ob.h);
    ctx.strokeStyle = "#64748b";
    ctx.lineWidth = 1;
    ctx.strokeRect(ob.x, ob.y, ob.w, ob.h);
    ctx.strokeStyle = "rgba(148,163,184,0.15)";
    ctx.lineWidth = 1;
    const stripeDir = ob.w > ob.h ? "h" : "v";
    if (stripeDir === "h") {
      for (let sy = ob.y + 4; sy < ob.y + ob.h; sy += 6) {
        ctx.beginPath();
        ctx.moveTo(ob.x + 2, sy);
        ctx.lineTo(ob.x + ob.w - 2, sy);
        ctx.stroke();
      }
    } else {
      for (let sx = ob.x + 4; sx < ob.x + ob.w; sx += 6) {
        ctx.beginPath();
        ctx.moveTo(sx, ob.y + 2);
        ctx.lineTo(sx, ob.y + ob.h - 2);
        ctx.stroke();
      }
    }
  }

  private drawOneTimeObstacle(ctx: CanvasRenderingContext2D, ob: ObstacleState, idx: number): void {
    const t = Date.now() / 300;
    const pulse = 1 + Math.sin(t + idx) * 0.04;
    const ow = ob.w * pulse;
    const oh = ob.h * pulse;
    const ox = ob.x + (ob.w - ow) / 2;
    const oy = ob.y + (ob.h - oh) / 2;

    const obGrad = ctx.createLinearGradient(ox, oy, ox, oy + oh);
    obGrad.addColorStop(0, "#fb923c");
    obGrad.addColorStop(0.5, "#f97316");
    obGrad.addColorStop(1, "#ea580c");
    ctx.fillStyle = obGrad;
    this.roundRect(ctx, ox, oy, ow, oh, 3);
    ctx.fill();
    ctx.strokeStyle = "#fdba74";
    ctx.lineWidth = 1.5;
    this.roundRect(ctx, ox, oy, ow, oh, 3);
    ctx.stroke();

    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.font = "bold 10px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("\u26A0", ob.x + ob.w / 2, ob.y + ob.h / 2);
  }

  private drawSlowZone(ctx: CanvasRenderingContext2D, ob: ObstacleState, idx: number): void {
    const t = Date.now() / 600;
    ctx.save();
    ctx.globalAlpha = 0.35 + Math.sin(t + idx * 0.5) * 0.1;
    const obGrad = ctx.createRadialGradient(
      ob.x + ob.w / 2, ob.y + ob.h / 2, 0,
      ob.x + ob.w / 2, ob.y + ob.h / 2,
      Math.max(ob.w, ob.h) / 1.5
    );
    obGrad.addColorStop(0, "#a78bfa");
    obGrad.addColorStop(0.6, "#8b5cf6");
    obGrad.addColorStop(1, "rgba(139,92,246,0)");
    ctx.fillStyle = obGrad;
    ctx.fillRect(ob.x, ob.y, ob.w, ob.h);
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = "rgba(167,139,250,0.5)";
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(ob.x, ob.y, ob.w, ob.h);
    ctx.setLineDash([]);
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = 0.4 + Math.sin(t * 2 + idx) * 0.2;
    for (let pi = 0; pi < 5; pi++) {
      const px = ob.x + ((pi * 37 + Date.now() / 20) % ob.w);
      const py = ob.y + ((pi * 53 + Date.now() / 25) % ob.h);
      ctx.beginPath();
      ctx.arc(px, py, 2, 0, Math.PI * 2);
      ctx.fillStyle = "#c4b5fd";
      ctx.fill();
    }
    ctx.restore();

    ctx.fillStyle = "rgba(196,181,253,0.7)";
    ctx.font = "bold 12px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("\u2744", ob.x + ob.w / 2, ob.y + ob.h / 2);
  }

  private drawMovingObstacle(ctx: CanvasRenderingContext2D, ob: ObstacleState, idx: number): void {
    const t = Date.now() / 500;
    const dirArrow = ob.type === "movingHorizontal" ? "\u2194" : "\u2195";
    const range = ob.moveRange || 0;

    ctx.save();
    ctx.globalAlpha = 0.25;
    ctx.strokeStyle = "#22d3ee";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    if (ob.type === "movingHorizontal") {
      ctx.strokeRect(ob.baseX, ob.y, ob.w + range, ob.h);
    } else {
      ctx.strokeRect(ob.x, ob.baseY, ob.w, ob.h + range);
    }
    ctx.setLineDash([]);
    ctx.restore();

    const obGrad = ctx.createLinearGradient(ob.x, ob.y, ob.x, ob.y + ob.h);
    obGrad.addColorStop(0, "#0891b2");
    obGrad.addColorStop(1, "#0e7490");
    ctx.fillStyle = obGrad;
    this.roundRect(ctx, ob.x, ob.y, ob.w, ob.h, 3);
    ctx.fill();
    ctx.strokeStyle = "#22d3ee";
    ctx.lineWidth = 2;
    this.roundRect(ctx, ob.x, ob.y, ob.w, ob.h, 3);
    ctx.stroke();

    ctx.save();
    ctx.globalAlpha = 0.7 + Math.sin(t + idx) * 0.3;
    ctx.fillStyle = "#a5f3fc";
    ctx.font = "bold 14px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(dirArrow, ob.x + ob.w / 2, ob.y + ob.h / 2);
    ctx.restore();
  }

  private drawUnknownObstacle(ctx: CanvasRenderingContext2D, ob: ObstacleState): void {
    ctx.fillStyle = "#475569";
    ctx.fillRect(ob.x, ob.y, ob.w, ob.h);
    ctx.strokeStyle = "#94a3b8";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(ob.x, ob.y, ob.w, ob.h);
    ctx.setLineDash([]);
    ctx.fillStyle = "rgba(148,163,184,0.6)";
    ctx.font = "bold 10px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("?", ob.x + ob.w / 2, ob.y + ob.h / 2);
  }

  private drawGoal(ctx: CanvasRenderingContext2D, level: LevelDef, config: PhysicsConfig, goalAnim: number): void {
    const goalPulse = 1 + Math.sin(Date.now() / 400) * 0.08 + goalAnim * 0.02;
    const goalR = config.goalRadius * goalPulse;

    if (goalAnim > 0) {
      ctx.save();
      ctx.globalAlpha = goalAnim / 60;
      ctx.beginPath();
      ctx.arc(level.goal.x, level.goal.y, goalR + (60 - goalAnim) * 2, 0, Math.PI * 2);
      ctx.strokeStyle = "#22c55e";
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.restore();
    }

    ctx.beginPath();
    ctx.arc(level.goal.x, level.goal.y, goalR, 0, Math.PI * 2);
    const goalGrad = ctx.createRadialGradient(
      level.goal.x, level.goal.y, 0,
      level.goal.x, level.goal.y, goalR
    );
    goalGrad.addColorStop(0, "#22c55e");
    goalGrad.addColorStop(1, "rgba(34,197,94,0.2)");
    ctx.fillStyle = goalGrad;
    ctx.fill();
    ctx.strokeStyle = "#22c55e";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = "#fff";
    ctx.font = "bold 14px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("\u7EC8", level.goal.x, level.goal.y);
  }

  private drawStars(ctx: CanvasRenderingContext2D, stars: StarState[], config: PhysicsConfig): void {
    stars.forEach((star) => {
      if (star.collected) {
        if (star.collectAnim > 0) {
          const animPct = star.collectAnim / 30;
          const expandR = config.starRadius + (30 - star.collectAnim) * 1.5;
          ctx.save();
          ctx.globalAlpha = animPct;
          ctx.beginPath();
          ctx.arc(star.x, star.y, expandR, 0, Math.PI * 2);
          ctx.strokeStyle = "#fbbf24";
          ctx.lineWidth = 2;
          ctx.stroke();
          ctx.restore();
          ctx.save();
          ctx.globalAlpha = animPct * 0.8;
          ctx.fillStyle = "#fbbf24";
          ctx.font = `bold ${16 + (30 - star.collectAnim) * 0.5}px sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText("+1", star.x, star.y - (30 - star.collectAnim) * 1.2);
          ctx.restore();
        }
        return;
      }
      const t = Date.now() / 500;
      const pulse = 1 + Math.sin(t + star.x * 0.01) * 0.08;
      const sr = config.starRadius * pulse;
      ctx.beginPath();
      ctx.arc(star.x, star.y, sr, 0, Math.PI * 2);
      const starGrad = ctx.createRadialGradient(star.x, star.y, 0, star.x, star.y, sr);
      starGrad.addColorStop(0, "#fbbf24");
      starGrad.addColorStop(1, "rgba(251,191,36,0.15)");
      ctx.fillStyle = starGrad;
      ctx.fill();
      ctx.strokeStyle = "#eab308";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = "#78350f";
      ctx.font = "bold 16px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("\u2605", star.x, star.y);
    });
  }

  private drawTrail(ctx: CanvasRenderingContext2D, state: PhysicsState, config: PhysicsConfig): void {
    if (state.phase !== "fly" || state.trail.length <= 1) return;

    const b = state.ball;
    for (let i = 0; i < state.trail.length; i++) {
      const p = state.trail[i];
      const alpha = (1 - p.age / config.trailMax) * 0.5;
      const size = b.radius * (1 - p.age / config.trailMax) * 0.7 + 2;
      if (alpha <= 0) continue;
      ctx.beginPath();
      ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(96, 165, 250, ${alpha})`;
      ctx.fill();
    }
  }

  private drawReplayTrajectories(
    ctx: CanvasRenderingContext2D,
    trajectories: ReplayShotTrajectory[],
    shotRecordsCount: number,
    ball: BallState
  ): void {
    if (trajectories.length === 0) return;

    for (let sIdx = 0; sIdx < trajectories.length; sIdx++) {
      const traj = trajectories[sIdx];
      const pts = traj.points;
      const isFutureShot = sIdx >= shotRecordsCount;

      if (pts.length > 1) {
        ctx.save();
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        for (let i = 0; i < pts.length - 1; i++) {
          const t = i / (pts.length - 1);
          const lineAlpha = isFutureShot
            ? 0.35 * (1 - t * 0.5)
            : 0.2 * (1 - t * 0.5);
          const lineWidth = isFutureShot ? 2.5 : 1.5;

          ctx.beginPath();
          ctx.moveTo(pts[i].x, pts[i].y);
          ctx.lineTo(pts[i + 1].x, pts[i + 1].y);
          ctx.strokeStyle = isFutureShot
            ? `rgba(250, 204, 21, ${lineAlpha})`
            : `rgba(148, 163, 184, ${lineAlpha})`;
          ctx.lineWidth = lineWidth;
          ctx.stroke();
        }
        ctx.restore();
      }

      if (isFutureShot && pts.length > 0) {
        const markerSpacing = Math.max(1, Math.floor(pts.length / 8));
        for (let i = 0; i < pts.length; i += markerSpacing) {
          const p = pts[i];
          const t = i / (pts.length - 1 || 1);
          ctx.beginPath();
          ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(250, 204, 21, ${0.3 * (1 - t * 0.4)})`;
          ctx.fill();
        }

        ctx.save();
        ctx.beginPath();
        ctx.arc(traj.startX, traj.startY, ball.radius * 0.8, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(250, 204, 21, 0.45)";
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 3]);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      }
    }

    const currentShotIdx = shotRecordsCount;
    if (currentShotIdx < trajectories.length) {
      const nextTraj = trajectories[currentShotIdx];
      ctx.save();
      ctx.beginPath();
      ctx.arc(nextTraj.startX, nextTraj.startY, ball.radius + 4, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(250, 204, 21, 0.6)";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = "rgba(250, 204, 21, 0.15)";
      ctx.fill();
      ctx.restore();

      const dx = nextTraj.points[0] ? nextTraj.points[0].x - nextTraj.startX : 0;
      const dy = nextTraj.points[0] ? nextTraj.points[0].y - nextTraj.startY : 0;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 0.5) {
        const ang = Math.atan2(dy, dx);
        const arrowLen = 18;
        const tipX = nextTraj.startX + Math.cos(ang) * arrowLen;
        const tipY = nextTraj.startY + Math.sin(ang) * arrowLen;
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(nextTraj.startX, nextTraj.startY);
        ctx.lineTo(tipX, tipY);
        ctx.strokeStyle = "rgba(250, 204, 21, 0.7)";
        ctx.lineWidth = 2;
        ctx.setLineDash([3, 3]);
        ctx.stroke();
        ctx.setLineDash([]);

        const ah = 6;
        const aw = 4;
        ctx.beginPath();
        ctx.moveTo(tipX, tipY);
        ctx.lineTo(
          tipX - Math.cos(ang) * ah + Math.sin(ang) * aw,
          tipY - Math.sin(ang) * ah - Math.cos(ang) * aw
        );
        ctx.lineTo(
          tipX - Math.cos(ang) * ah - Math.sin(ang) * aw,
          tipY - Math.sin(ang) * ah + Math.cos(ang) * aw
        );
        ctx.closePath();
        ctx.fillStyle = "rgba(250, 204, 21, 0.8)";
        ctx.fill();
        ctx.restore();
      }
    }
  }

  private drawBall(ctx: CanvasRenderingContext2D, b: BallState, phase: string): void {
    ctx.save();
    ctx.translate(b.x, b.y);
    const spd = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
    if (spd > 0.5 && phase === "fly") {
      const ang = Math.atan2(b.vy, b.vx);
      ctx.rotate(ang);
    }
    ctx.scale(b.sx, b.sy);

    ctx.beginPath();
    ctx.arc(0, 0, b.radius, 0, Math.PI * 2);
    const ballGrad = ctx.createRadialGradient(-3, -3, 2, 0, 0, b.radius);
    ballGrad.addColorStop(0, "#60a5fa");
    ballGrad.addColorStop(1, "#2563eb");
    ctx.fillStyle = ballGrad;
    ctx.fill();
    ctx.strokeStyle = "#93c5fd";
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(-b.radius * 0.35, -b.radius * 0.35, b.radius * 0.28, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.fill();

    ctx.restore();
  }

  private drawAiming(
    ctx: CanvasRenderingContext2D,
    state: PhysicsState,
    level: LevelDef,
    config: PhysicsConfig,
    dragState: { x: number; y: number } | null | undefined
  ): void {
    const b = state.ball;
    if (state.phase !== "aim" || !dragState) {
      if (state.phase === "aim") {
        b.sx = 1;
        b.sy = 1;
      }
      return;
    }

    const drag = dragState;
    const dx = drag.x - b.x;
    const dy = drag.y - b.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const clampedDist = Math.min(dist, config.maxDrag);
    const angle = Math.atan2(dy, dx);
    const pullX = b.x + Math.cos(angle) * clampedDist;
    const pullY = b.y + Math.sin(angle) * clampedDist;
    const pct = clampedDist / config.maxDrag;

    const segs = 14;
    for (let i = 0; i < segs; i++) {
      const t = i / segs;
      const tt = (i + 1) / segs;
      ctx.beginPath();
      ctx.moveTo(b.x + (pullX - b.x) * t, b.y + (pullY - b.y) * t);
      ctx.lineTo(b.x + (pullX - b.x) * tt, b.y + (pullY - b.y) * tt);
      const a = (1 - t) * 0.7;
      ctx.strokeStyle = `rgba(239,68,68,${a})`;
      ctx.lineWidth = 3 - t * 2;
      ctx.stroke();
    }

    const launchAngle = angle + Math.PI;
    const launchResult = this.computeLaunchVelocity(b.x, b.y, drag.x, drag.y, config);

    if (launchResult && clampedDist > 8) {
      const predictPts = predictTrajectory(state, level, config, launchResult.vx, launchResult.vy);
      for (let i = 0; i < predictPts.length; i += 2) {
        const p = predictPts[i];
        const alpha = 1 - i / predictPts.length;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2 + alpha * 2, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(34,197,94,${alpha * 0.65})`;
        ctx.fill();
      }
    }

    const tipLen = Math.min(clampedDist * 0.8, 80);
    const tipX = b.x + Math.cos(launchAngle) * tipLen;
    const tipY = b.y + Math.sin(launchAngle) * tipLen;
    ctx.beginPath();
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(tipX, tipY);
    ctx.strokeStyle = "rgba(34,197,94,0.8)";
    ctx.lineWidth = 2.5;
    ctx.setLineDash([6, 4]);
    ctx.stroke();
    ctx.setLineDash([]);

    const ah = 8;
    const aw = 5;
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(
      tipX - Math.cos(launchAngle) * ah + Math.sin(launchAngle) * aw,
      tipY - Math.sin(launchAngle) * ah - Math.cos(launchAngle) * aw
    );
    ctx.lineTo(
      tipX - Math.cos(launchAngle) * ah - Math.sin(launchAngle) * aw,
      tipY - Math.sin(launchAngle) * ah + Math.cos(launchAngle) * aw
    );
    ctx.closePath();
    ctx.fillStyle = "#22c55e";
    ctx.fill();

    const barW = 80;
    const barH = 8;
    const barX = b.x - barW / 2;
    const barY = b.y - 42;

    ctx.fillStyle = "rgba(15,23,42,0.75)";
    ctx.strokeStyle = "rgba(148,163,184,0.3)";
    ctx.lineWidth = 1;
    this.roundRect(ctx, barX - 2, barY - 2, barW + 4, barH + 4, 5);
    ctx.fill();
    ctx.stroke();

    const fillColor = pct > 0.7 ? "#ef4444" : pct > 0.4 ? "#eab308" : "#22c55e";
    this.roundRect(ctx, barX, barY, barW, barH, 3);
    ctx.fillStyle = "rgba(148,163,184,0.15)";
    ctx.fill();
    this.roundRect(ctx, barX, barY, barW * pct, barH, 3);
    ctx.fillStyle = fillColor;
    ctx.fill();

    ctx.fillStyle = fillColor;
    ctx.font = "bold 13px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillText(`\u529B\u5EA6 ${Math.round(pct * 100)}%`, b.x, barY - 5);

    b.sx = 1 + pct * 0.15;
    b.sy = 1 - pct * 0.1;
  }

  private computeLaunchVelocity(
    ballX: number,
    ballY: number,
    dragX: number,
    dragY: number,
    config: PhysicsConfig
  ): { vx: number; vy: number; power: number; clampedDist: number } | null {
    const dx = dragX - ballX;
    const dy = dragY - ballY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const clampedDist = Math.min(dist, config.maxDrag);

    if (clampedDist < config.minLaunchDist) return null;

    const angle = Math.atan2(dy, dx);
    const power = clampedDist * config.launchPower;

    return {
      vx: -Math.cos(angle) * power,
      vy: -Math.sin(angle) * power,
      power,
      clampedDist,
    };
  }

  private drawParticles(ctx: CanvasRenderingContext2D, particles: Particle[]): void {
    particles.forEach((p) => {
      const alpha = p.life / p.maxLife;
      ctx.save();
      ctx.globalAlpha = Math.max(0, alpha);
      if (p.type === "goal" || p.type === "star") {
        const glowGrad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 2);
        glowGrad.addColorStop(0, p.color);
        glowGrad.addColorStop(1, "transparent");
        ctx.fillStyle = glowGrad;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * 2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
  }
}
