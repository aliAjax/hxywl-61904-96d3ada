import { useRef, useEffect, useState, useCallback } from "react";
import { LevelDef, CANVAS_W, CANVAS_H, levels } from "./levels";
import { Progress, getStars, isTutorialCompleted, setTutorialCompleted } from "./progress";
import Tutorial, { TutorialStep } from "./Tutorial";

interface Props {
  level: LevelDef;
  progress: Progress;
  onBack: () => void;
  onComplete: (levelId: number, stars: number, cleared: boolean) => void;
  onNext: () => void;
}

interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  sx?: number;
  sy?: number;
}

interface CollectedStar {
  x: number;
  y: number;
  collected: boolean;
}

interface TrailPoint {
  x: number;
  y: number;
  age: number;
}

type Phase = "aim" | "fly" | "done";

const BALL_R = 12;
const GOAL_R = 24;
const STAR_R = 16;
const FRICTION = 0.995;
const MIN_SPEED = 0.25;
const MAX_DRAG = 160;
const LAUNCH_POWER = 0.14;
const TRAIL_MAX = 20;
const TRAIL_STEP = 2;
const PREDICT_STEPS = 60;

export default function Game({ level, progress, onBack, onComplete, onNext }: Props) {
  const hasNextLevel = levels.some((l) => l.id === level.id + 1);
  const prevBestStars = getStars(level.id, progress);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef(0);
  const ballRef = useRef<Ball>({
    x: level.ball.x,
    y: level.ball.y,
    vx: 0,
    vy: 0,
    radius: BALL_R,
  });
  const starsRef = useRef<CollectedStar[]>(
    level.stars.map((s) => ({ x: s.x, y: s.y, collected: false }))
  );
  const dragRef = useRef<{ x: number; y: number } | null>(null);
  const phaseRef = useRef<Phase>("aim");
  const shotsRef = useRef(level.maxShots);
  const collectedRef = useRef(0);
  const clearedRef = useRef(false);
  const remainingShotsRef = useRef(level.maxShots);
  const trailRef = useRef<TrailPoint[]>([]);
  const trailCounterRef = useRef(0);

  const [phase, setPhase] = useState<Phase>("aim");
  const [shots, setShots] = useState(level.maxShots);
  const [collected, setCollected] = useState(0);
  const [resultStars, setResultStars] = useState(0);
  const [remainingShots, setRemainingShots] = useState(level.maxShots);
  const [showResult, setShowResult] = useState(false);
  const [isNewRecord, setIsNewRecord] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);

  const resetBall = useCallback(() => {
    ballRef.current = {
      x: level.ball.x,
      y: level.ball.y,
      vx: 0,
      vy: 0,
      radius: BALL_R,
      sx: 1,
      sy: 1,
    };
    trailRef.current = [];
    trailCounterRef.current = 0;
    phaseRef.current = "aim";
    setPhase("aim");
  }, [level]);

  const tutorialSteps: TutorialStep[] = [
    {
      id: "drag",
      title: "拖动小球蓄力",
      description: "按住蓝色小球并向反方向拖动，拉得越远弹射力度越大。",
      position: "center",
    },
    {
      id: "power",
      title: "观察力度与方向",
      description: "绿色虚线表示弹射方向，力度条会随拖动距离变化，注意控制方向和力度。",
      position: "center",
    },
    {
      id: "release",
      title: "松手发射",
      description: "松开手指或鼠标，小球就会朝着反方向弹射出去。",
      position: "bottom",
    },
    {
      id: "stars",
      title: "收集星星",
      description: "让小球经过金色星星来收集它们，收集越多星级评价越高。",
      position: "center",
    },
    {
      id: "goal",
      title: "抵达终点",
      description: "最终目标是让小球到达绿色终点区域，在弹射次数用完前抵达即可过关！",
      position: "top",
    },
  ];

  useEffect(() => {
    if (level.id === 1 && !isTutorialCompleted()) {
      setShowTutorial(true);
    }
  }, [level.id]);

  const handleTutorialClose = useCallback(() => {
    setTutorialCompleted(true);
    setShowTutorial(false);
  }, []);

  const finishLevel = useCallback(
    (cleared: boolean) => {
      phaseRef.current = "done";
      setPhase("done");
      const totalStars = level.stars.length;
      const earnedStars = cleared
        ? collectedRef.current === totalStars
          ? 3
          : collectedRef.current >= totalStars / 2
            ? 2
            : 1
        : 0;
      const remaining = shotsRef.current;
      remainingShotsRef.current = remaining;
      setRemainingShots(remaining);
      setResultStars(earnedStars);
      setIsNewRecord(earnedStars > prevBestStars);
      setShowResult(true);
      onComplete(level.id, earnedStars, cleared);
    },
    [level, onComplete, prevBestStars]
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;

    function predictTrajectory(
      startX: number,
      startY: number,
      vx: number,
      vy: number
    ): { x: number; y: number }[] {
      const pts: { x: number; y: number }[] = [];
      let px = startX;
      let py = startY;
      let pvx = vx;
      let pvy = vy;
      const r = BALL_R;

      for (let i = 0; i < PREDICT_STEPS; i++) {
        pvy += level.gravity;
        pvx *= FRICTION;
        pvy *= FRICTION;
        px += pvx;
        py += pvy;

        if (px - r < 0) {
          px = r;
          pvx = Math.abs(pvx) * level.bounce;
        }
        if (px + r > CANVAS_W) {
          px = CANVAS_W - r;
          pvx = -Math.abs(pvx) * level.bounce;
        }
        if (py - r < 0) {
          py = r;
          pvy = Math.abs(pvy) * level.bounce;
        }
        if (py + r > CANVAS_H) {
          py = CANVAS_H - r;
          pvy = -Math.abs(pvy) * level.bounce;
        }

        let hitObstacle = false;
        for (const ob of level.obstacles) {
          const closestX = Math.max(ob.x, Math.min(px, ob.x + ob.w));
          const closestY = Math.max(ob.y, Math.min(py, ob.y + ob.h));
          const odx = px - closestX;
          const ody = py - closestY;
          const odist = Math.sqrt(odx * odx + ody * ody);
          if (odist < r && odist > 0) {
            const nx = odx / odist;
            const ny = ody / odist;
            px = closestX + nx * (r + 1);
            py = closestY + ny * (r + 1);
            const dot = pvx * nx + pvy * ny;
            pvx = (pvx - 2 * dot * nx) * level.bounce;
            pvy = (pvy - 2 * dot * ny) * level.bounce;
            hitObstacle = true;
            break;
          }
        }

        pts.push({ x: px, y: py });

        const gdx = px - level.goal.x;
        const gdy = py - level.goal.y;
        if (Math.sqrt(gdx * gdx + gdy * gdy) < r + GOAL_R) break;

        const sp = Math.sqrt(pvx * pvx + pvy * pvy);
        if (sp < MIN_SPEED) break;
      }
      return pts;
    }

    function draw() {
      const b = ballRef.current;
      const stars = starsRef.current;
      const drag = dragRef.current;
      const currentPhase = phaseRef.current;
      const trail = trailRef.current;

      ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

      ctx.fillStyle = "#0f172a";
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

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

      level.obstacles.forEach((ob) => {
        const obGrad = ctx.createLinearGradient(ob.x, ob.y, ob.x, ob.y + ob.h);
        obGrad.addColorStop(0, "#475569");
        obGrad.addColorStop(1, "#334155");
        ctx.fillStyle = obGrad;
        ctx.fillRect(ob.x, ob.y, ob.w, ob.h);
        ctx.strokeStyle = "#64748b";
        ctx.lineWidth = 1;
        ctx.strokeRect(ob.x, ob.y, ob.w, ob.h);
      });

      ctx.beginPath();
      ctx.arc(level.goal.x, level.goal.y, GOAL_R, 0, Math.PI * 2);
      const goalGrad = ctx.createRadialGradient(
        level.goal.x,
        level.goal.y,
        0,
        level.goal.x,
        level.goal.y,
        GOAL_R
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
      ctx.fillText("终", level.goal.x, level.goal.y);

      stars.forEach((s) => {
        if (s.collected) return;
        const t = Date.now() / 500;
        const pulse = 1 + Math.sin(t + s.x * 0.01) * 0.08;
        const sr = STAR_R * pulse;
        ctx.beginPath();
        ctx.arc(s.x, s.y, sr, 0, Math.PI * 2);
        const starGrad = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, sr);
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
        ctx.fillText("★", s.x, s.y);
      });

      if (currentPhase === "fly" && trail.length > 1) {
        for (let i = 0; i < trail.length; i++) {
          const p = trail[i];
          const alpha = (1 - p.age / TRAIL_MAX) * 0.5;
          const size = BALL_R * (1 - p.age / TRAIL_MAX) * 0.7 + 2;
          if (alpha <= 0) continue;
          ctx.beginPath();
          ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(96, 165, 250, ${alpha})`;
          ctx.fill();
        }
      }

      const sx = b.sx ?? 1;
      const sy = b.sy ?? 1;

      ctx.save();
      ctx.translate(b.x, b.y);
      const spd = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
      if (spd > 0.5 && currentPhase === "fly") {
        const ang = Math.atan2(b.vy, b.vx);
        ctx.rotate(ang);
      }
      ctx.scale(sx, sy);

      ctx.beginPath();
      ctx.arc(0, 0, b.radius, 0, Math.PI * 2);
      const ballGrad = ctx.createRadialGradient(
        -3,
        -3,
        2,
        0,
        0,
        b.radius
      );
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

      if (currentPhase === "aim" && drag) {
        const dx = drag.x - b.x;
        const dy = drag.y - b.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const clampedDist = Math.min(dist, MAX_DRAG);
        const angle = Math.atan2(dy, dx);
        const pullX = b.x + Math.cos(angle) * clampedDist;
        const pullY = b.y + Math.sin(angle) * clampedDist;
        const pct = clampedDist / MAX_DRAG;

        const segs = 14;
        for (let i = 0; i < segs; i++) {
          const t = i / segs;
          const tt = (i + 1) / segs;
          ctx.beginPath();
          ctx.moveTo(
            b.x + (pullX - b.x) * t,
            b.y + (pullY - b.y) * t
          );
          ctx.lineTo(
            b.x + (pullX - b.x) * tt,
            b.y + (pullY - b.y) * tt
          );
          const a = (1 - t) * 0.7;
          ctx.strokeStyle = `rgba(239,68,68,${a})`;
          ctx.lineWidth = 3 - t * 2;
          ctx.stroke();
        }

        const launchAngle = angle + Math.PI;
        const power = clampedDist * LAUNCH_POWER;
        const pvx = -Math.cos(angle) * power;
        const pvy = -Math.sin(angle) * power;

        if (clampedDist > 8) {
          const predictPts = predictTrajectory(b.x, b.y, pvx, pvy);
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
        roundRect(ctx, barX - 2, barY - 2, barW + 4, barH + 4, 5);
        ctx.fill();
        ctx.stroke();

        const fillColor = pct > 0.7 ? "#ef4444" : pct > 0.4 ? "#eab308" : "#22c55e";
        const grad = ctx.createLinearGradient(barX, 0, barX + barW, 0);
        grad.addColorStop(0, pct > 0.7 ? "#22c55e" : pct > 0.4 ? "#22c55e" : "#22c55e");
        grad.addColorStop(0.5, pct > 0.4 ? "#eab308" : "#eab308");
        grad.addColorStop(1, "#ef4444");
        roundRect(ctx, barX, barY, barW, barH, 3);
        ctx.fillStyle = "rgba(148,163,184,0.15)";
        ctx.fill();
        roundRect(ctx, barX, barY, barW * pct, barH, 3);
        ctx.fillStyle = fillColor;
        ctx.fill();

        ctx.fillStyle = fillColor;
        ctx.font = "bold 13px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";
        ctx.fillText(
          `力度 ${Math.round(pct * 100)}%`,
          b.x,
          barY - 5
        );

        const stretchX = 1 + pct * 0.15;
        const stretchY = 1 - pct * 0.1;
        b.sx = stretchX;
        b.sy = stretchY;
      } else {
        b.sx = 1;
        b.sy = 1;
      }
    }

    function roundRect(
      c: CanvasRenderingContext2D,
      x: number,
      y: number,
      w: number,
      h: number,
      r: number
    ) {
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

    function simulate() {
      const b = ballRef.current;
      if (phaseRef.current !== "fly") return;

      b.vy += level.gravity;
      b.vx *= FRICTION;
      b.vy *= FRICTION;
      b.x += b.vx;
      b.y += b.vy;

      const spd = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
      if (spd > 1) {
        const stretch = Math.min(spd / 10, 0.35);
        b.sx = 1 + stretch;
        b.sy = 1 - stretch * 0.6;
      } else {
        b.sx = 1;
        b.sy = 1;
      }

      trailCounterRef.current++;
      if (trailCounterRef.current >= TRAIL_STEP) {
        trailCounterRef.current = 0;
        trailRef.current.unshift({ x: b.x, y: b.y, age: 0 });
        if (trailRef.current.length > TRAIL_MAX) {
          trailRef.current.pop();
        }
      }
      trailRef.current.forEach((p) => (p.age += 1 / TRAIL_STEP));
      trailRef.current = trailRef.current.filter((p) => p.age < TRAIL_MAX);

      let bounced = false;
      if (b.x - b.radius < 0) {
        b.x = b.radius;
        b.vx = Math.abs(b.vx) * level.bounce;
        bounced = true;
      }
      if (b.x + b.radius > CANVAS_W) {
        b.x = CANVAS_W - b.radius;
        b.vx = -Math.abs(b.vx) * level.bounce;
        bounced = true;
      }
      if (b.y - b.radius < 0) {
        b.y = b.radius;
        b.vy = Math.abs(b.vy) * level.bounce;
        bounced = true;
      }
      if (b.y + b.radius > CANVAS_H) {
        b.y = CANVAS_H - b.radius;
        b.vy = -Math.abs(b.vy) * level.bounce;
        bounced = true;
      }

      level.obstacles.forEach((ob) => {
        const closestX = Math.max(ob.x, Math.min(b.x, ob.x + ob.w));
        const closestY = Math.max(ob.y, Math.min(b.y, ob.y + ob.h));
        const dx = b.x - closestX;
        const dy = b.y - closestY;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < b.radius && dist > 0) {
          const nx = dx / dist;
          const ny = dy / dist;
          b.x = closestX + nx * (b.radius + 1);
          b.y = closestY + ny * (b.radius + 1);
          const dot = b.vx * nx + b.vy * ny;
          b.vx = (b.vx - 2 * dot * nx) * level.bounce;
          b.vy = (b.vy - 2 * dot * ny) * level.bounce;
          bounced = true;
        }
      });

      if (bounced) {
        b.sx = 0.75;
        b.sy = 1.2;
      }

      starsRef.current.forEach((s) => {
        if (s.collected) return;
        const dx = b.x - s.x;
        const dy = b.y - s.y;
        if (Math.sqrt(dx * dx + dy * dy) < b.radius + STAR_R) {
          s.collected = true;
          collectedRef.current++;
          setCollected(collectedRef.current);
        }
      });

      const gdx = b.x - level.goal.x;
      const gdy = b.y - level.goal.y;
      if (Math.sqrt(gdx * gdx + gdy * gdy) < b.radius + GOAL_R) {
        clearedRef.current = true;
        finishLevel(true);
        return;
      }

      const speed = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
      if (speed < MIN_SPEED) {
        b.vx = 0;
        b.vy = 0;
        b.sx = 1;
        b.sy = 1;
        shotsRef.current--;
        setShots(shotsRef.current);

        if (shotsRef.current <= 0) {
          finishLevel(false);
        } else {
          resetBall();
        }
      }
    }

    function loop() {
      simulate();
      draw();
      rafRef.current = requestAnimationFrame(loop);
    }

    loop();

    return () => cancelAnimationFrame(rafRef.current);
  }, [level, resetBall, finishLevel]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const canvasEl: HTMLCanvasElement = canvas;

    const TOUCH_RADIUS = 60;
    const MIN_LAUNCH_DIST = 8;

    function getPos(e: MouseEvent | TouchEvent) {
      const rect = canvasEl.getBoundingClientRect();
      const scaleX = CANVAS_W / rect.width;
      const scaleY = CANVAS_H / rect.height;
      if ("touches" in e) {
        const t = e.touches[0] || e.changedTouches[0];
        return {
          x: (t.clientX - rect.left) * scaleX,
          y: (t.clientY - rect.top) * scaleY,
        };
      }
      return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY,
      };
    }

    function onDown(e: MouseEvent | TouchEvent) {
      if (phaseRef.current !== "aim") return;
      e.preventDefault();
      const pos = getPos(e);
      const b = ballRef.current;
      const dx = pos.x - b.x;
      const dy = pos.y - b.y;
      if (Math.sqrt(dx * dx + dy * dy) < TOUCH_RADIUS) {
        dragRef.current = pos;
        setPhase("aim");
      }
    }

    function onMove(e: MouseEvent | TouchEvent) {
      if (!dragRef.current) return;
      e.preventDefault();
      dragRef.current = getPos(e);
    }

    function onUp(e: MouseEvent | TouchEvent) {
      if (!dragRef.current) return;
      e.preventDefault();
      const b = ballRef.current;
      const dx = dragRef.current.x - b.x;
      const dy = dragRef.current.y - b.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const clamped = Math.min(dist, MAX_DRAG);

      if (clamped > MIN_LAUNCH_DIST) {
        const angle = Math.atan2(dy, dx);
        const power = clamped * LAUNCH_POWER;
        b.vx = -Math.cos(angle) * power;
        b.vy = -Math.sin(angle) * power;
        b.sx = 1.4;
        b.sy = 0.7;
        phaseRef.current = "fly";
        setPhase("fly");
      }
      dragRef.current = null;
    }

    function onLeave(_e: MouseEvent | TouchEvent) {
      if (!dragRef.current) return;
      if (phaseRef.current !== "aim") return;
      onUp(_e);
    }

    canvasEl.addEventListener("mousedown", onDown);
    canvasEl.addEventListener("mousemove", onMove);
    canvasEl.addEventListener("mouseup", onUp);
    canvasEl.addEventListener("mouseleave", onLeave);
    canvasEl.addEventListener("touchstart", onDown, { passive: false });
    canvasEl.addEventListener("touchmove", onMove, { passive: false });
    canvasEl.addEventListener("touchend", onUp, { passive: false });
    canvasEl.addEventListener("touchcancel", onUp, { passive: false });

    return () => {
      canvasEl.removeEventListener("mousedown", onDown);
      canvasEl.removeEventListener("mousemove", onMove);
      canvasEl.removeEventListener("mouseup", onUp);
      canvasEl.removeEventListener("mouseleave", onLeave);
      canvasEl.removeEventListener("touchstart", onDown);
      canvasEl.removeEventListener("touchmove", onMove);
      canvasEl.removeEventListener("touchend", onUp);
      canvasEl.removeEventListener("touchcancel", onUp);
    };
  }, []);

  function handleRetry() {
    starsRef.current = level.stars.map((s) => ({ x: s.x, y: s.y, collected: false }));
    collectedRef.current = 0;
    clearedRef.current = false;
    shotsRef.current = level.maxShots;
    remainingShotsRef.current = level.maxShots;
    setShots(level.maxShots);
    setCollected(0);
    setResultStars(0);
    setRemainingShots(level.maxShots);
    setIsNewRecord(false);
    setShowResult(false);
    resetBall();
  }

  return (
    <div className="game-view">
      <div className="game-hud">
        <button className="btn-back" onClick={onBack}>
          ← 返回
        </button>
        <span className="hud-level">
          第 {level.id} 关 · {level.name}
        </span>
        <span className="hud-shots">
          剩余弹射: {shots}/{level.maxShots}
        </span>
        <span className="hud-stars">
          ★ {collected}/{level.stars.length}
        </span>
        <button className="btn-tutorial" onClick={() => setShowTutorial(true)}>
          ❓ 帮助
        </button>
      </div>
      <div className="canvas-wrap">
        <canvas
          ref={canvasRef}
          width={CANVAS_W}
          height={CANVAS_H}
          className={phase === "aim" ? "aiming" : ""}
        />
        {phase === "aim" && (
          <div className="aim-hint">拖动蓝色小球蓄力，松手弹射</div>
        )}
      </div>
      {showResult && (
        <div className="result-overlay">
          <div className="result-card">
            <h3 className={clearedRef.current ? "result-title success" : "result-title fail"}>
              {clearedRef.current ? "🎉 通关成功" : "💀 弹射耗尽"}
            </h3>
            {isNewRecord && clearedRef.current && (
              <div className="new-record-badge">🏆 新纪录！</div>
            )}
            <div className="result-stars">
              {[1, 2, 3].map((i) => (
                <span
                  key={i}
                  className={
                    "star " + (i <= resultStars ? "filled" : "empty") +
                    (isNewRecord && i <= resultStars ? " animate-star" : "")
                  }
                >
                  ★
                </span>
              ))}
            </div>
            <div className="result-stats">
              <div className="result-stat-item">
                <span className="result-stat-label">收集星星</span>
                <span className="result-stat-value">
                  <span className="star-icon">★</span>
                  {collected} / {level.stars.length}
                </span>
              </div>
              <div className="result-stat-item">
                <span className="result-stat-label">剩余弹射</span>
                <span className="result-stat-value shots-value">
                  {remainingShots} / {level.maxShots}
                </span>
              </div>
              <div className="result-stat-item">
                <span className="result-stat-label">最终星级</span>
                <span className="result-stat-value stars-value">
                  {resultStars} / 3
                </span>
              </div>
              {prevBestStars > 0 && (
                <div className="result-stat-item best-record">
                  <span className="result-stat-label">历史最佳</span>
                  <span className="result-stat-value">
                    <span className="star-icon">★</span>
                    {prevBestStars} / 3
                  </span>
                </div>
              )}
            </div>
            <div className="result-actions">
              <button className="btn-retry" onClick={handleRetry}>
                🔄 重新挑战
              </button>
              {hasNextLevel && (
                <button className="btn-next" onClick={onNext}>
                  下一关 →
                </button>
              )}
              <button className="btn-back-level" onClick={onBack}>
                返回选关
              </button>
            </div>
          </div>
        </div>
      )}
      {showTutorial && (
        <Tutorial
          steps={tutorialSteps}
          onClose={handleTutorialClose}
          onComplete={handleTutorialClose}
        />
      )}
    </div>
  );
}
