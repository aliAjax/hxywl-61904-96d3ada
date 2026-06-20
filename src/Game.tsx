import { useRef, useEffect, useState, useCallback } from "react";
import { LevelDef, CANVAS_W, CANVAS_H, levels, calculateEarnedStars } from "./levels";
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
  collectAnim?: number;
}

interface TrailPoint {
  x: number;
  y: number;
  age: number;
}

interface ObstacleState {
  destroyed: boolean;
  destroyAnim?: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  type: "collision" | "star" | "goal" | "destroy" | "slow";
}

interface ScreenShake {
  x: number;
  y: number;
  intensity: number;
  duration: number;
}

type Phase = "aim" | "fly" | "done";

const BALL_R = 12;
const GOAL_R = 24;
const STAR_R = 16;
const FRICTION = 0.995;
const SLOW_ZONE_FRICTION = 0.96;
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
  const shotsUsedRef = useRef(0);
  const collectedRef = useRef(0);
  const clearedRef = useRef(false);
  const remainingShotsRef = useRef(level.maxShots);
  const trailRef = useRef<TrailPoint[]>([]);
  const trailCounterRef = useRef(0);
  const obstacleStatesRef = useRef<ObstacleState[]>(
    level.obstacles.map(() => ({ destroyed: false }))
  );
  const particlesRef = useRef<Particle[]>([]);
  const screenShakeRef = useRef<ScreenShake>({ x: 0, y: 0, intensity: 0, duration: 0 });
  const goalAnimRef = useRef(0);

  const [phase, setPhase] = useState<Phase>("aim");
  const [shots, setShots] = useState(level.maxShots);
  const [collected, setCollected] = useState(0);
  const [resultStars, setResultStars] = useState(0);
  const [remainingShots, setRemainingShots] = useState(level.maxShots);
  const [showResult, setShowResult] = useState(false);
  const [isNewRecord, setIsNewRecord] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);
  const [showStarRules, setShowStarRules] = useState(false);

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
    particlesRef.current = particlesRef.current.filter(
      (p) => p.type === "star" || p.type === "destroy"
    );
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
      id: "walls",
      title: "认识障碍物",
      description: "灰色墙体：普通反弹；橙色方块：碰撞后消失；紫色区域：会让小球减速。",
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
    obstacleStatesRef.current = level.obstacles.map(() => ({ destroyed: false }));
    particlesRef.current = [];
    screenShakeRef.current = { x: 0, y: 0, intensity: 0, duration: 0 };
    goalAnimRef.current = 0;
  }, [level.id]);

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
      const remaining = shotsRef.current;
      remainingShotsRef.current = remaining;
      setRemainingShots(remaining);
      const earnedStars = calculateEarnedStars(
        level,
        collectedRef.current,
        shotsUsedRef.current,
        remaining,
        cleared
      );
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

    function spawnParticles(
      x: number,
      y: number,
      count: number,
      type: Particle["type"],
      baseColor?: string
    ) {
      const colorMap: Record<Particle["type"], string> = {
        collision: baseColor || "#94a3b8",
        star: "#fbbf24",
        goal: "#22c55e",
        destroy: "#f97316",
        slow: "#a78bfa",
      };
      const color = colorMap[type];
      const sizeMap: Record<Particle["type"], [number, number]> = {
        collision: [2, 5],
        star: [3, 7],
        goal: [4, 8],
        destroy: [3, 6],
        slow: [2, 4],
      };
      const [minSize, maxSize] = sizeMap[type];
      const lifeMap: Record<Particle["type"], [number, number]> = {
        collision: [15, 30],
        star: [25, 45],
        goal: [40, 70],
        destroy: [20, 40],
        slow: [10, 20],
      };
      const [minLife, maxLife] = lifeMap[type];
      const speedMap: Record<Particle["type"], number> = {
        collision: 3,
        star: 5,
        goal: 6,
        destroy: 4,
        slow: 1.5,
      };
      const speed = speedMap[type];

      for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const spd = Math.random() * speed + speed * 0.3;
        particlesRef.current.push({
          x,
          y,
          vx: Math.cos(angle) * spd,
          vy: Math.sin(angle) * spd - (type === "star" || type === "goal" ? 1 : 0),
          life: Math.floor(Math.random() * (maxLife - minLife) + minLife),
          maxLife: maxLife,
          size: Math.random() * (maxSize - minSize) + minSize,
          color,
          type,
        });
      }
    }

    function triggerShake(intensity: number, duration: number) {
      screenShakeRef.current.intensity = intensity;
      screenShakeRef.current.duration = duration;
    }

    function updateShake() {
      const s = screenShakeRef.current;
      if (s.duration > 0) {
        s.x = (Math.random() - 0.5) * s.intensity * 2;
        s.y = (Math.random() - 0.5) * s.intensity * 2;
        s.duration--;
        s.intensity *= 0.92;
      } else {
        s.x = 0;
        s.y = 0;
        s.intensity = 0;
      }
    }

    function updateParticles() {
      const particles = particlesRef.current;
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vy += p.type === "goal" || p.type === "star" ? -0.05 : 0.1;
        p.vx *= 0.98;
        p.vy *= 0.98;
        p.life--;
        if (p.life <= 0) {
          particles.splice(i, 1);
        }
      }
    }

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

        let inSlowZone = false;
        level.obstacles.forEach((ob, idx) => {
          const obState = obstacleStatesRef.current[idx];
          if (obState?.destroyed) return;
          if (ob.type === "slowZone") {
            if (
              px + r > ob.x &&
              px - r < ob.x + ob.w &&
              py + r > ob.y &&
              py - r < ob.y + ob.h
            ) {
              inSlowZone = true;
            }
          }
        });

        const friction = inSlowZone ? SLOW_ZONE_FRICTION : FRICTION;
        pvx *= friction;
        pvy *= friction;
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
        level.obstacles.forEach((ob, idx) => {
          if (hitObstacle) return;
          const obState = obstacleStatesRef.current[idx];
          if (obState?.destroyed) return;
          if (ob.type === "slowZone") return;

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
          }
        });

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
      const shake = screenShakeRef.current;

      ctx.save();
      ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

      ctx.fillStyle = "#0f172a";
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

      ctx.translate(shake.x, shake.y);

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

      level.obstacles.forEach((ob, idx) => {
        const obState = obstacleStatesRef.current[idx];
        if (obState?.destroyed) {
          if (obState.destroyAnim !== undefined && obState.destroyAnim > 0) {
            const alpha = obState.destroyAnim / 30;
            const expand = (30 - obState.destroyAnim) * 2;
            ctx.globalAlpha = alpha;
            ctx.strokeStyle = "#f97316";
            ctx.lineWidth = 2;
            ctx.strokeRect(
              ob.x - expand,
              ob.y - expand,
              ob.w + expand * 2,
              ob.h + expand * 2
            );
            ctx.globalAlpha = 1;
          }
          return;
        }

        const type = ob.type || "wall";
        if (type === "wall") {
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
        } else if (type === "oneTime") {
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
          roundRect(ctx, ox, oy, ow, oh, 3);
          ctx.fill();
          ctx.strokeStyle = "#fdba74";
          ctx.lineWidth = 1.5;
          roundRect(ctx, ox, oy, ow, oh, 3);
          ctx.stroke();

          ctx.fillStyle = "rgba(255,255,255,0.6)";
          ctx.font = "bold 10px sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText("⚠", ob.x + ob.w / 2, ob.y + ob.h / 2);
        } else if (type === "slowZone") {
          const t = Date.now() / 600;
          ctx.save();
          ctx.globalAlpha = 0.35 + Math.sin(t + idx * 0.5) * 0.1;
          const obGrad = ctx.createRadialGradient(
            ob.x + ob.w / 2,
            ob.y + ob.h / 2,
            0,
            ob.x + ob.w / 2,
            ob.y + ob.h / 2,
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
          ctx.fillText("❄", ob.x + ob.w / 2, ob.y + ob.h / 2);
        }
      });

      const goalAnim = goalAnimRef.current;
      const goalPulse = 1 + Math.sin(Date.now() / 400) * 0.08 + goalAnim * 0.02;
      const goalR = GOAL_R * goalPulse;

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
        level.goal.x,
        level.goal.y,
        0,
        level.goal.x,
        level.goal.y,
        goalR
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
        if (s.collected) {
          if (s.collectAnim !== undefined && s.collectAnim > 0) {
            const animPct = s.collectAnim / 30;
            const expandR = STAR_R + (30 - s.collectAnim) * 1.5;
            ctx.save();
            ctx.globalAlpha = animPct;
            ctx.beginPath();
            ctx.arc(s.x, s.y, expandR, 0, Math.PI * 2);
            ctx.strokeStyle = "#fbbf24";
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.restore();
            ctx.save();
            ctx.globalAlpha = animPct * 0.8;
            ctx.fillStyle = "#fbbf24";
            ctx.font = `bold ${16 + (30 - s.collectAnim) * 0.5}px sans-serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText("+1", s.x, s.y - (30 - s.collectAnim) * 1.2);
            ctx.restore();
          }
          return;
        }
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

      particlesRef.current.forEach((p) => {
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

      ctx.restore();
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

      obstacleStatesRef.current.forEach((os) => {
        if (os.destroyAnim !== undefined && os.destroyAnim > 0) {
          os.destroyAnim--;
        }
      });
      starsRef.current.forEach((s) => {
        if (s.collectAnim !== undefined && s.collectAnim > 0) {
          s.collectAnim--;
        }
      });
      if (goalAnimRef.current > 0) {
        goalAnimRef.current--;
      }

      updateParticles();
      updateShake();

      if (phaseRef.current !== "fly") return;

      let inSlowZone = false;
      level.obstacles.forEach((ob, idx) => {
        const obState = obstacleStatesRef.current[idx];
        if (obState?.destroyed) return;
        if (ob.type === "slowZone") {
          if (
            b.x + b.radius > ob.x &&
            b.x - b.radius < ob.x + ob.w &&
            b.y + b.radius > ob.y &&
            b.y - b.radius < ob.y + ob.h
          ) {
            inSlowZone = true;
            if (Math.random() < 0.3) {
              spawnParticles(b.x, b.y, 1, "slow");
            }
          }
        }
      });

      const currentFriction = inSlowZone ? SLOW_ZONE_FRICTION : FRICTION;

      b.vy += level.gravity;
      b.vx *= currentFriction;
      b.vy *= currentFriction;
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
      let bounceSpeed = 0;
      if (b.x - b.radius < 0) {
        b.x = b.radius;
        bounceSpeed = Math.max(bounceSpeed, Math.abs(b.vx));
        b.vx = Math.abs(b.vx) * level.bounce;
        bounced = true;
      }
      if (b.x + b.radius > CANVAS_W) {
        b.x = CANVAS_W - b.radius;
        bounceSpeed = Math.max(bounceSpeed, Math.abs(b.vx));
        b.vx = -Math.abs(b.vx) * level.bounce;
        bounced = true;
      }
      if (b.y - b.radius < 0) {
        b.y = b.radius;
        bounceSpeed = Math.max(bounceSpeed, Math.abs(b.vy));
        b.vy = Math.abs(b.vy) * level.bounce;
        bounced = true;
      }
      if (b.y + b.radius > CANVAS_H) {
        b.y = CANVAS_H - b.radius;
        bounceSpeed = Math.max(bounceSpeed, Math.abs(b.vy));
        b.vy = -Math.abs(b.vy) * level.bounce;
        bounced = true;
      }
      if (bounced && bounceSpeed > 1) {
        spawnParticles(b.x, b.y, Math.min(Math.floor(bounceSpeed * 2), 8), "collision", "#64748b");
        triggerShake(Math.min(bounceSpeed * 0.3, 4), Math.min(Math.floor(bounceSpeed * 3), 12));
      }

      level.obstacles.forEach((ob, idx) => {
        const obState = obstacleStatesRef.current[idx];
        if (obState?.destroyed) return;
        if (ob.type === "slowZone") return;

        const closestX = Math.max(ob.x, Math.min(b.x, ob.x + ob.w));
        const closestY = Math.max(ob.y, Math.min(b.y, ob.y + ob.h));
        const dx = b.x - closestX;
        const dy = b.y - closestY;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < b.radius && dist > 0) {
          const nx = dx / dist;
          const ny = dy / dist;
          const impactSpeed = Math.sqrt(b.vx * b.vx + b.vy * b.vy);

          if (ob.type === "oneTime") {
            obstacleStatesRef.current[idx] = { destroyed: true, destroyAnim: 30 };
            spawnParticles(ob.x + ob.w / 2, ob.y + ob.h / 2, 18, "destroy");
            spawnParticles(closestX, closestY, 10, "collision", "#fb923c");
            triggerShake(Math.min(impactSpeed * 0.5, 6), 18);
            b.x = closestX + nx * (b.radius + 1);
            b.y = closestY + ny * (b.radius + 1);
            const dot = b.vx * nx + b.vy * ny;
            b.vx = (b.vx - 2 * dot * nx) * level.bounce * 0.85;
            b.vy = (b.vy - 2 * dot * ny) * level.bounce * 0.85;
          } else {
            b.x = closestX + nx * (b.radius + 1);
            b.y = closestY + ny * (b.radius + 1);
            const dot = b.vx * nx + b.vy * ny;
            b.vx = (b.vx - 2 * dot * nx) * level.bounce;
            b.vy = (b.vy - 2 * dot * ny) * level.bounce;
            if (impactSpeed > 0.8) {
              spawnParticles(closestX, closestY, Math.min(Math.floor(impactSpeed * 1.5), 6), "collision", "#94a3b8");
              triggerShake(Math.min(impactSpeed * 0.2, 3), Math.min(Math.floor(impactSpeed * 2), 8));
            }
          }
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
          s.collectAnim = 30;
          collectedRef.current++;
          setCollected(collectedRef.current);
          spawnParticles(s.x, s.y, 16, "star");
          triggerShake(2, 8);
        }
      });

      const gdx = b.x - level.goal.x;
      const gdy = b.y - level.goal.y;
      if (Math.sqrt(gdx * gdx + gdy * gdy) < b.radius + GOAL_R) {
        shotsUsedRef.current++;
        clearedRef.current = true;
        goalAnimRef.current = 60;
        spawnParticles(level.goal.x, level.goal.y, 35, "goal");
        triggerShake(5, 25);
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
        shotsUsedRef.current++;
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
    shotsUsedRef.current = 0;
    remainingShotsRef.current = level.maxShots;
    dragRef.current = null;
    obstacleStatesRef.current = level.obstacles.map(() => ({ destroyed: false }));
    particlesRef.current = [];
    screenShakeRef.current = { x: 0, y: 0, intensity: 0, duration: 0 };
    goalAnimRef.current = 0;
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
        <button
          className="btn-star-rules"
          onClick={() => setShowStarRules(true)}
          onMouseEnter={() => setShowStarRules(true)}
          onMouseLeave={() => setShowStarRules(false)}
        >
          ⭐ 星级规则
        </button>
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
      {showStarRules && (
        <div
          className="star-rules-popup"
          onMouseEnter={() => setShowStarRules(true)}
          onMouseLeave={() => setShowStarRules(false)}
        >
          <div className="star-rules-title">⭐ 本关星级规则</div>
          {level.starRules.stars.map((rule, i) => (
            <div key={i} className="star-rule-item">
              <span className={"star-rule-star " + (i < resultStars ? "filled" : "empty")}>★</span>
              <span className="star-rule-desc">{rule.description}</span>
              {i < resultStars && <span className="star-rule-check">✓</span>}
            </div>
          ))}
          <div className="star-rules-hint">收集星星并在限定次数内抵达终点</div>
        </div>
      )}
    </div>
  );
}
