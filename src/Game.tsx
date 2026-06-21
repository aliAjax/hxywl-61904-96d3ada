import { useRef, useEffect, useState, useCallback, useMemo } from "react";
import { LevelDef, CANVAS_W, CANVAS_H, levels, calculateEarnedStars, checkStarRuleAchieved } from "./levels";
import { Progress, getStars, isTutorialCompleted, setTutorialCompleted } from "./progress";
import Tutorial, { TutorialStep } from "./Tutorial";
import { useGameViewport, screenToWorld, ViewportInfo } from "./useGameViewport";
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
  predictTrajectory,
} from "./physics";
import {
  ShotRecord,
  BestRoute,
  ReplayShotTrajectory,
  getBestRoute,
  saveBestRoute,
  simulateRoute,
  isCustomLevel,
} from "./replayRoutes";

interface Props {
  level: LevelDef;
  progress: Progress;
  onBack: () => void;
  onComplete: (levelId: number, stars: number, cleared: boolean) => void;
  onNext: () => void;
}

const config: PhysicsConfig = DEFAULT_CONFIG;

export default function Game({ level, progress, onBack, onComplete, onNext }: Props) {
  const hasNextLevel = levels.some((l) => l.id === level.id + 1);
  const prevBestStars = getStars(level.id, progress);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewport = useGameViewport();
  const viewportRef = useRef<ViewportInfo>(viewport);
  viewportRef.current = viewport;
  const rafRef = useRef(0);
  const stateRef = useRef<PhysicsState>(createPhysicsState(level, config));
  const dragRef = useRef<{ x: number; y: number } | null>(null);
  const lastTimeRef = useRef(0);

  const [phase, setPhase] = useState<"aim" | "fly" | "done">("aim");
  const [shots, setShots] = useState(level.maxShots);
  const [collected, setCollected] = useState(0);
  const [resultStars, setResultStars] = useState(0);
  const [remainingShots, setRemainingShots] = useState(level.maxShots);
  const [shotsUsed, setShotsUsed] = useState(0);
  const [distanceToGoal, setDistanceToGoal] = useState(0);
  const [showResult, setShowResult] = useState(false);
  const [isNewRecord, setIsNewRecord] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);
  const [showStarRules, setShowStarRules] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const isPausedRef = useRef(false);

  const [shotRecords, setShotRecords] = useState<ShotRecord[]>([]);
  const shotRecordsRef = useRef<ShotRecord[]>([]);
  const lastBallPosRef = useRef<{ x: number; y: number }>({
    x: level.ball.x,
    y: level.ball.y,
  });
  const [bestRoute, setBestRoute] = useState<BestRoute | null>(null);
  const [showReplay, setShowReplay] = useState(false);
  const [savedThisRun, setSavedThisRun] = useState(false);

  const finishLevel = useCallback(
    (cleared: boolean) => {
      const s = stateRef.current;
      s.phase = "done";
      setPhase("done");
      const remaining = s.shotsRemaining;
      const used = s.shotsUsed;
      setRemainingShots(remaining);
      setShotsUsed(used);
      if (!cleared) {
        const dx = s.ball.x - level.goal.x;
        const dy = s.ball.y - level.goal.y;
        setDistanceToGoal(Math.round(Math.sqrt(dx * dx + dy * dy)));
      }
      const earnedStars = calculateEarnedStars(
        level,
        s.collected,
        s.shotsUsed,
        remaining,
        cleared
      );

      if (cleared && !savedThisRun) {
        const finalShots = shotRecordsRef.current;
        const isBetter = saveBestRoute(level.id, finalShots, earnedStars, used);
        if (isBetter) {
          setBestRoute({
            levelId: level.id,
            shots: [...finalShots],
            stars: earnedStars,
            shotsUsed: used,
            timestamp: Date.now(),
          });
        }
        setSavedThisRun(true);
      }

      setResultStars(earnedStars);
      setIsNewRecord(earnedStars > prevBestStars);
      setShowResult(true);
      onComplete(level.id, earnedStars, cleared);
    },
    [level, onComplete, prevBestStars, savedThisRun]
  );

  useEffect(() => {
    stateRef.current = createPhysicsState(level, config);
    lastTimeRef.current = 0;
    shotRecordsRef.current = [];
    setShotRecords([]);
    lastBallPosRef.current = { x: level.ball.x, y: level.ball.y };
    setSavedThisRun(false);
    setBestRoute(getBestRoute(level.id));
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

  const handleRetry = useCallback(() => {
    physResetAll(stateRef.current, level, config);
    dragRef.current = null;
    lastTimeRef.current = 0;
    isPausedRef.current = false;
    setShots(level.maxShots);
    setCollected(0);
    setResultStars(0);
    setRemainingShots(level.maxShots);
    setShotsUsed(0);
    setDistanceToGoal(0);
    setIsNewRecord(false);
    setShowResult(false);
    setPhase("aim");
    setIsPaused(false);
    shotRecordsRef.current = [];
    setShotRecords([]);
    lastBallPosRef.current = { x: level.ball.x, y: level.ball.y };
    setSavedThisRun(false);
  }, [level]);

  const handlePause = useCallback(() => {
    if (showResult) return;
    isPausedRef.current = true;
    setIsPaused(true);
    dragRef.current = null;
  }, [showResult]);

  const handleResume = useCallback(() => {
    isPausedRef.current = false;
    setIsPaused(false);
    lastTimeRef.current = 0;
  }, []);

  const handlePauseRetry = useCallback(() => {
    isPausedRef.current = false;
    setIsPaused(false);
    handleRetry();
  }, [handleRetry]);

  const handlePauseBack = useCallback(() => {
    isPausedRef.current = false;
    setIsPaused(false);
    onBack();
  }, [onBack]);

  function getFailSuggestions(): string[] {
    const suggestions: string[] = [];
    const maxDist = Math.sqrt(CANVAS_W * CANVAS_W + CANVAS_H * CANVAS_H);
    const distPct = distanceToGoal / maxDist;
    if (distPct < 0.15) {
      suggestions.push("你离终点已经很近了，尝试微调弹射角度");
    } else if (distPct < 0.35) {
      suggestions.push("尝试利用墙体反弹到达终点");
    } else {
      suggestions.push("规划一条更直接的路线前往终点");
    }
    if (collected === 0 && level.stars.length > 0) {
      suggestions.push("尝试规划路径收集沿途星星");
    } else if (collected < level.stars.length) {
      suggestions.push("还有未收集的星星，试试不同的弹射路径");
    }
    if (shotsUsed > level.maxShots * 0.7) {
      suggestions.push("减少弹射次数可以获得更高星级");
    }
    return suggestions;
  }

  const replayTrajectories: ReplayShotTrajectory[] = useMemo(() => {
    if (!bestRoute || !showReplay) return [];
    return simulateRoute(level, config, bestRoute);
  }, [bestRoute, showReplay, level.id]);

  const replayTrajectoriesRef = useRef<ReplayShotTrajectory[]>([]);
  replayTrajectoriesRef.current = replayTrajectories;

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
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;

    function processEvent(e: PhysicsEvent) {
      const s = stateRef.current;
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
          spawnParticles(s, stateRef.current.ball.x, stateRef.current.ball.y, 10, "collision", "#fb923c");
          triggerShake(s, Math.min(e.impactSpeed * 0.5, 6), 18);
          break;
        case "slowZoneParticle":
          spawnParticles(s, e.x, e.y, 1, "slow");
          break;
        case "starCollect":
          spawnParticles(s, e.x, e.y, 16, "star");
          triggerShake(s, 2, 8);
          setCollected(stateRef.current.collected);
          break;
        case "goalReach":
          spawnParticles(s, e.x, e.y, 35, "goal");
          triggerShake(s, 5, 25);
          break;
        case "ballStop":
          setShots(stateRef.current.shotsRemaining);
          lastBallPosRef.current = {
            x: stateRef.current.ball.x,
            y: stateRef.current.ball.y,
          };
          if (stateRef.current.shotsRemaining > 0) {
            setPhase("aim");
          }
          break;
        case "levelFail":
          setShots(stateRef.current.shotsRemaining);
          finishLevel(false);
          break;
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

    function draw() {
      const s = stateRef.current;
      const b = s.ball;
      const drag = dragRef.current;
      const trail = s.trail;
      const shake = s.shake;
      const vp = viewportRef.current;
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

      s.obstacles.forEach((ob, idx) => {
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
        } else if (ob.type === "oneTime") {
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
          ctx.fillText("\u26A0", ob.x + ob.w / 2, ob.y + ob.h / 2);
        } else if (ob.type === "slowZone") {
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
        } else if (ob.type === "movingHorizontal" || ob.type === "movingVertical") {
          const t = Date.now() / 500;
          const dirArrow = ob.type === "movingHorizontal" ? "\u2194" : "\u2195";
          const range = ob.moveRange || 0;

          ctx.save();
          ctx.globalAlpha = 0.25;
          ctx.strokeStyle = "#22d3ee";
          ctx.lineWidth = 1;
          ctx.setLineDash([4, 4]);
          if (ob.type === "movingHorizontal") {
            ctx.strokeRect(ob.baseX - range, ob.y, ob.w + range * 2, ob.h);
          } else {
            ctx.strokeRect(ob.x, ob.baseY - range, ob.w, ob.h + range * 2);
          }
          ctx.setLineDash([]);
          ctx.restore();

          const obGrad = ctx.createLinearGradient(ob.x, ob.y, ob.x, ob.y + ob.h);
          obGrad.addColorStop(0, "#0891b2");
          obGrad.addColorStop(1, "#0e7490");
          ctx.fillStyle = obGrad;
          roundRect(ctx, ob.x, ob.y, ob.w, ob.h, 3);
          ctx.fill();
          ctx.strokeStyle = "#22d3ee";
          ctx.lineWidth = 2;
          roundRect(ctx, ob.x, ob.y, ob.w, ob.h, 3);
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
      });

      const goalAnim = s.goalAnim;
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

      s.stars.forEach((star) => {
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

      if (s.phase === "fly" && trail.length > 1) {
        for (let i = 0; i < trail.length; i++) {
          const p = trail[i];
          const alpha = (1 - p.age / config.trailMax) * 0.5;
          const size = b.radius * (1 - p.age / config.trailMax) * 0.7 + 2;
          if (alpha <= 0) continue;
          ctx.beginPath();
          ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(96, 165, 250, ${alpha})`;
          ctx.fill();
        }
      }

      const reTraj = replayTrajectoriesRef.current;
      if (reTraj.length > 0) {
        for (let sIdx = 0; sIdx < reTraj.length; sIdx++) {
          const traj = reTraj[sIdx];
          const pts = traj.points;
          const isFutureShot = sIdx >= shotRecordsRef.current.length;

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
            ctx.arc(traj.startX, traj.startY, b.radius * 0.8, 0, Math.PI * 2);
            ctx.strokeStyle = "rgba(250, 204, 21, 0.45)";
            ctx.lineWidth = 2;
            ctx.setLineDash([4, 3]);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.restore();
          }
        }

        const currentShotIdx = shotRecordsRef.current.length;
        if (currentShotIdx < reTraj.length) {
          const nextTraj = reTraj[currentShotIdx];
          ctx.save();
          ctx.beginPath();
          ctx.arc(nextTraj.startX, nextTraj.startY, b.radius + 4, 0, Math.PI * 2);
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

      ctx.save();
      ctx.translate(b.x, b.y);
      const spd = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
      if (spd > 0.5 && s.phase === "fly") {
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

      if (s.phase === "aim" && drag) {
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
        const launchResult = computeLaunchVelocity(b.x, b.y, drag.x, drag.y, config);

        if (launchResult && clampedDist > 8) {
          const predictPts = predictTrajectory(s, level, config, launchResult.vx, launchResult.vy);
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
        ctx.fillText(`\u529B\u5EA6 ${Math.round(pct * 100)}%`, b.x, barY - 5);

        b.sx = 1 + pct * 0.15;
        b.sy = 1 - pct * 0.1;
      } else if (s.phase === "aim") {
        b.sx = 1;
        b.sy = 1;
      }

      s.particles.forEach((p) => {
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
      ctx.restore();
      ctx.restore();
    }

    function loop(now: number) {
      if (lastTimeRef.current === 0) {
        lastTimeRef.current = now;
      }

      if (!isPausedRef.current && stateRef.current.phase !== "done") {
        const dt = now - lastTimeRef.current;
        const events = tickPhysics(stateRef.current, level, config, dt);
        for (const e of events) {
          processEvent(e);
          if (e.type === "goalReach") {
            finishLevel(true);
          }
        }
      }

      lastTimeRef.current = now;
      draw();
      rafRef.current = requestAnimationFrame(loop);
    }

    rafRef.current = requestAnimationFrame(loop);

    const handleVisibility = () => {
      if (document.hidden) {
        dragRef.current = null;
      } else {
        lastTimeRef.current = 0;
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      cancelAnimationFrame(rafRef.current);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [level, finishLevel]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const canvasEl: HTMLCanvasElement = canvas;

    function getPos(e: MouseEvent | TouchEvent) {
      const rect = canvasEl.getBoundingClientRect();
      let clientX: number;
      let clientY: number;
      if ("touches" in e) {
        const t = e.touches[0] || e.changedTouches[0];
        clientX = t.clientX;
        clientY = t.clientY;
      } else {
        clientX = e.clientX;
        clientY = e.clientY;
      }
      const screenX = clientX - rect.left;
      const screenY = clientY - rect.top;
      return screenToWorld(screenX, screenY, viewportRef.current);
    }

    function onDown(e: MouseEvent | TouchEvent) {
      const s = stateRef.current;
      if (s.phase !== "aim") return;
      if (isPausedRef.current) return;
      e.preventDefault();
      const pos = getPos(e);
      const b = s.ball;
      const dx = pos.x - b.x;
      const dy = pos.y - b.y;
      if (Math.sqrt(dx * dx + dy * dy) < config.touchRadius) {
        dragRef.current = pos;
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
      const s = stateRef.current;
      const launchPos = { ...dragRef.current };
      const launched = applyLaunch(s, launchPos.x, launchPos.y, config);
      if (launched) {
        const record: ShotRecord = {
          ballX: lastBallPosRef.current.x,
          ballY: lastBallPosRef.current.y,
          dragX: launchPos.x,
          dragY: launchPos.y,
        };
        shotRecordsRef.current = [...shotRecordsRef.current, record];
        setShotRecords(shotRecordsRef.current);
        setPhase("fly");
      }
      dragRef.current = null;
    }

    function onLeave(e: MouseEvent | TouchEvent) {
      if (!dragRef.current) return;
      if (stateRef.current.phase !== "aim") return;
      onUp(e);
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

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(viewport.canvasWidth * dpr);
    canvas.height = Math.floor(viewport.canvasHeight * dpr);
  }, [viewport.canvasWidth, viewport.canvasHeight]);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (showTutorial || showStarRules) return;
        if (showResult) return;
        if (isPaused) {
          handleResume();
        } else {
          handlePause();
        }
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isPaused, showResult, showTutorial, showStarRules, handlePause, handleResume]);

  return (
    <div className={`game-view ${viewport.isLandscape ? "landscape" : "portrait"}`}>
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
        {bestRoute && !showResult && (
          <button
            className={showReplay ? "btn-replay active" : "btn-replay"}
            onClick={() => setShowReplay((v) => !v)}
            title={
              isCustomLevel(level.id)
                ? `自定义关卡最佳路线（${bestRoute.stars}★，${bestRoute.shotsUsed}次）`
                : `最佳路线（${bestRoute.stars}★，${bestRoute.shotsUsed}次）`
            }
          >
            {showReplay ? "👁 隐藏路线" : "👁 显示路线"}
          </button>
        )}
        {!showResult && (
          <button className="btn-pause" onClick={isPaused ? handleResume : handlePause}>
            {isPaused ? "▶️ 继续" : "⏸ 暂停"}
          </button>
        )}
      </div>
      <div ref={viewport.containerRef} className="canvas-wrap">
        <canvas
          ref={canvasRef}
          className={phase === "aim" ? "aiming" : ""}
        />
        {phase === "aim" && (
          <div className="aim-hint">拖动蓝色小球蓄力，松手弹射</div>
        )}
      </div>
      {showResult && (
        <div className="result-overlay">
          <div className="result-card">
            {stateRef.current.cleared ? (
              <>
                <h3 className="result-title success">🎉 通关成功</h3>
                {isNewRecord && (
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
                    <span className="result-stat-label">弹射次数</span>
                    <span className="result-stat-value">
                      {shotsUsed} / {level.maxShots}
                    </span>
                  </div>
                  <div className="result-stat-item">
                    <span className="result-stat-label">收集星星</span>
                    <span className="result-stat-value">
                      <span className="star-icon">★</span>
                      {collected} / {level.stars.length}
                    </span>
                  </div>
                  <div className="result-stat-item">
                    <span className="result-stat-label">获得星级</span>
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
                <div className="result-rule-breakdown">
                  <div className="rule-breakdown-title">星级规则达成状态</div>
                  {level.starRules.stars.map((rule, i) => {
                    const achieved = checkStarRuleAchieved(
                      rule, collected, shotsUsed, remainingShots, true
                    );
                    return (
                      <div
                        key={i}
                        className={"rule-breakdown-item" + (achieved ? " achieved" : " missed")}
                      >
                        <span className={"rule-breakdown-star " + (achieved ? "filled" : "empty")}>★</span>
                        <span className="rule-breakdown-desc">{rule.description}</span>
                        <span className={"rule-breakdown-status " + (achieved ? "pass" : "fail")}>
                          {achieved ? "✓" : "✗"}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <>
                <h3 className="result-title fail">💀 弹射耗尽</h3>
                <div className="result-stats fail-stats">
                  <div className="result-stat-item">
                    <span className="result-stat-label">距离终点</span>
                    <span className="result-stat-value distance-value">
                      {distanceToGoal}
                    </span>
                  </div>
                  <div className="result-stat-item">
                    <span className="result-stat-label">已收集星星</span>
                    <span className="result-stat-value">
                      <span className="star-icon">★</span>
                      {collected} / {level.stars.length}
                    </span>
                  </div>
                  <div className="result-stat-item">
                    <span className="result-stat-label">弹射次数</span>
                    <span className="result-stat-value">
                      {shotsUsed} / {level.maxShots}
                    </span>
                  </div>
                </div>
                <div className="fail-suggestions">
                  <div className="fail-suggestions-title">💡 推荐操作</div>
                  {getFailSuggestions().map((s, i) => (
                    <div key={i} className="fail-suggestion-item">
                      <span className="suggestion-bullet">›</span>
                      <span>{s}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
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
      {isPaused && !showResult && (
        <div className="pause-overlay">
          <div className="pause-card">
            <h3 className="pause-title">⏸ 游戏暂停</h3>
            <div className="pause-stats">
              <div className="pause-stat-item">
                <span className="pause-stat-label">当前关卡</span>
                <span className="pause-stat-value">
                  第 {level.id} 关</span>
              </div>
              <div className="pause-stat-item">
                <span className="pause-stat-label">收集星星</span>
                <span className="pause-stat-value">
                  <span className="star-icon">★</span>
                  {collected} / {level.stars.length}
                </span>
              </div>
              <div className="pause-stat-item">
                <span className="pause-stat-label">剩余弹射</span>
                <span className="pause-stat-value shots-value">
                  {shots} / {level.maxShots}
                </span>
              </div>
            </div>
            <div className="pause-actions">
              <button className="btn-pause-resume" onClick={handleResume}>
                ▶️ 继续游戏
              </button>
              <button className="btn-pause-retry" onClick={handlePauseRetry}>
                🔄 重新挑战
              </button>
              <button className="btn-pause-back" onClick={handlePauseBack}>
                🏠 返回选关
              </button>
            </div>
            <div className="pause-hint">按 ESC 键可快速暂停/继续</div>
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
