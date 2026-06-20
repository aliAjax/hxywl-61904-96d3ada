import { useRef, useEffect, useState, useCallback } from "react";
import { LevelDef, CANVAS_W, CANVAS_H, levels } from "./levels";
import { Progress, getStars } from "./progress";

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
}

interface CollectedStar {
  x: number;
  y: number;
  collected: boolean;
}

type Phase = "aim" | "fly" | "done";

const BALL_R = 12;
const GOAL_R = 24;
const STAR_R = 16;
const FRICTION = 0.998;
const MIN_SPEED = 0.3;
const MAX_DRAG = 140;
const LAUNCH_POWER = 0.12;

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

  const [phase, setPhase] = useState<Phase>("aim");
  const [shots, setShots] = useState(level.maxShots);
  const [collected, setCollected] = useState(0);
  const [resultStars, setResultStars] = useState(0);
  const [remainingShots, setRemainingShots] = useState(level.maxShots);
  const [showResult, setShowResult] = useState(false);
  const [isNewRecord, setIsNewRecord] = useState(false);

  const resetBall = useCallback(() => {
    ballRef.current = {
      x: level.ball.x,
      y: level.ball.y,
      vx: 0,
      vy: 0,
      radius: BALL_R,
    };
    phaseRef.current = "aim";
    setPhase("aim");
  }, [level]);

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

    function draw() {
      const b = ballRef.current;
      const stars = starsRef.current;
      const drag = dragRef.current;
      const currentPhase = phaseRef.current;

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
        ctx.fillStyle = "#475569";
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
        ctx.beginPath();
        ctx.arc(s.x, s.y, STAR_R, 0, Math.PI * 2);
        const starGrad = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, STAR_R);
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

      ctx.beginPath();
      ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
      const ballGrad = ctx.createRadialGradient(
        b.x - 3,
        b.y - 3,
        2,
        b.x,
        b.y,
        b.radius
      );
      ballGrad.addColorStop(0, "#60a5fa");
      ballGrad.addColorStop(1, "#2563eb");
      ctx.fillStyle = ballGrad;
      ctx.fill();
      ctx.strokeStyle = "#93c5fd";
      ctx.lineWidth = 2;
      ctx.stroke();

      if (currentPhase === "aim" && drag) {
        const dx = drag.x - b.x;
        const dy = drag.y - b.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const clampedDist = Math.min(dist, MAX_DRAG);
        const angle = Math.atan2(dy, dx);
        const pullX = b.x + Math.cos(angle) * clampedDist;
        const pullY = b.y + Math.sin(angle) * clampedDist;

        ctx.beginPath();
        ctx.moveTo(b.x, b.y);
        ctx.lineTo(pullX, pullY);
        ctx.strokeStyle = "rgba(239,68,68,0.6)";
        ctx.lineWidth = 3;
        ctx.stroke();

        const launchAngle = angle + Math.PI;
        const power = clampedDist * LAUNCH_POWER;
        const tipLen = Math.min(clampedDist * 0.8, 60);
        const tipX = b.x + Math.cos(launchAngle) * tipLen;
        const tipY = b.y + Math.sin(launchAngle) * tipLen;
        ctx.beginPath();
        ctx.moveTo(b.x, b.y);
        ctx.lineTo(tipX, tipY);
        ctx.strokeStyle = "rgba(34,197,94,0.7)";
        ctx.lineWidth = 2.5;
        ctx.setLineDash([6, 4]);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.beginPath();
        ctx.arc(tipX, tipY, 5, 0, Math.PI * 2);
        ctx.fillStyle = "#22c55e";
        ctx.fill();

        const pct = clampedDist / MAX_DRAG;
        ctx.fillStyle = pct > 0.7 ? "#ef4444" : pct > 0.4 ? "#eab308" : "#22c55e";
        ctx.font = "bold 13px sans-serif";
        ctx.textAlign = "left";
        ctx.textBaseline = "bottom";
        ctx.fillText(
          `力度 ${Math.round(pct * 100)}%`,
          b.x + 20,
          b.y - 20
        );
      }
    }

    function simulate() {
      const b = ballRef.current;
      if (phaseRef.current !== "fly") return;

      b.vy += level.gravity;
      b.vx *= FRICTION;
      b.vy *= FRICTION;
      b.x += b.vx;
      b.y += b.vy;

      if (b.x - b.radius < 0) {
        b.x = b.radius;
        b.vx = Math.abs(b.vx) * level.bounce;
      }
      if (b.x + b.radius > CANVAS_W) {
        b.x = CANVAS_W - b.radius;
        b.vx = -Math.abs(b.vx) * level.bounce;
      }
      if (b.y - b.radius < 0) {
        b.y = b.radius;
        b.vy = Math.abs(b.vy) * level.bounce;
      }
      if (b.y + b.radius > CANVAS_H) {
        b.y = CANVAS_H - b.radius;
        b.vy = -Math.abs(b.vy) * level.bounce;
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
        }
      });

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

    function getPos(e: MouseEvent | TouchEvent) {
      const rect = canvas.getBoundingClientRect();
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
      if (Math.sqrt(dx * dx + dy * dy) < 40) {
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
      const b = ballRef.current;
      const dx = dragRef.current.x - b.x;
      const dy = dragRef.current.y - b.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const clamped = Math.min(dist, MAX_DRAG);

      if (clamped > 10) {
        const angle = Math.atan2(dy, dx);
        const power = clamped * LAUNCH_POWER;
        b.vx = -Math.cos(angle) * power;
        b.vy = -Math.sin(angle) * power;
        phaseRef.current = "fly";
        setPhase("fly");
      }
      dragRef.current = null;
    }

    canvas.addEventListener("mousedown", onDown);
    canvas.addEventListener("mousemove", onMove);
    canvas.addEventListener("mouseup", onUp);
    canvas.addEventListener("touchstart", onDown, { passive: false });
    canvas.addEventListener("touchmove", onMove, { passive: false });
    canvas.addEventListener("touchend", onUp, { passive: false });

    return () => {
      canvas.removeEventListener("mousedown", onDown);
      canvas.removeEventListener("mousemove", onMove);
      canvas.removeEventListener("mouseup", onUp);
      canvas.removeEventListener("touchstart", onDown);
      canvas.removeEventListener("touchmove", onMove);
      canvas.removeEventListener("touchend", onUp);
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
    </div>
  );
}
