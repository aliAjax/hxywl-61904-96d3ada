import { useState, useRef, useEffect, useCallback } from "react";
import {
  LevelDef,
  StarDef,
  ObstacleDef,
  CANVAS_W,
  CANVAS_H,
  validateLevel,
  ValidationIssue,
  ValidationResult,
  normalizeLevel,
} from "./levels";
import { useGameViewport, screenToWorld, ViewportInfo } from "./useGameViewport";
import { DEFAULT_CONFIG, PhysicsConfig } from "./physics";
import Game from "./Game";
import {
  saveCustomLevel,
  updateStarRulesForLevel,
} from "./customLevels";
import { encodeChallengeCode } from "./challengeCode";

type Tool = "select" | "ball" | "goal" | "star" | "wall" | "oneTime" | "slowZone" | "movingHorizontal" | "movingVertical" | "delete";

type SelectedItem =
  | { type: "ball" }
  | { type: "goal" }
  | { type: "star"; index: number }
  | { type: "obstacle"; index: number }
  | null;

interface EditorProps {
  level: LevelDef;
  onBack: () => void;
  onSave: (level: LevelDef) => void;
  isNew: boolean;
}

const config: PhysicsConfig = DEFAULT_CONFIG;

export default function LevelEditor({ level: initialLevel, onBack, onSave, isNew }: EditorProps) {
  const [level, setLevel] = useState<LevelDef>(normalizeLevel(initialLevel));
  const [tool, setTool] = useState<Tool>("select");
  const [selected, setSelected] = useState<SelectedItem>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playLevel, setPlayLevel] = useState<LevelDef | null>(null);
  const [levelName, setLevelName] = useState(initialLevel.name);
  const [showSaveSuccess, setShowSaveSuccess] = useState(false);
  const [dirty, setDirty] = useState(isNew);
  const [errors, setErrors] = useState<{
    name?: string;
    maxShots?: string;
    gravity?: string;
    bounce?: string;
  }>({});
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [showPlayWarning, setShowPlayWarning] = useState(false);
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [shareCode, setShareCode] = useState("");
  const [shareCodeLoading, setShareCodeLoading] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewport = useGameViewport();
  const viewportRef = useRef<ViewportInfo>(viewport);
  viewportRef.current = viewport;
  const rafRef = useRef(0);
  const dragRef = useRef<{
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    origW?: number;
    origH?: number;
    resizing?: boolean;
    resizeHandle?: string;
  } | null>(null);

  useEffect(() => {
    setLevelName(level.name);
  }, [level.name]);

  useEffect(() => {
    const result = validateLevel(
      level,
      config.ballRadius,
      config.goalRadius,
      config.starRadius
    );
    setValidationResult(result);
  }, [level]);

  const validateName = (val: string): string | undefined => {
    const trimmed = val.trim();
    if (!trimmed) return "关卡名称不能为空";
    if (trimmed.length > 20) return "关卡名称不能超过 20 个字符";
    return undefined;
  };

  const validateMaxShots = (val: number): string | undefined => {
    if (isNaN(val)) return "请输入有效数字";
    if (val < 1 || val > 20) return "弹射次数需在 1-20 之间";
    if (!Number.isInteger(val)) return "弹射次数必须是整数";
    return undefined;
  };

  const validateGravity = (val: number): string | undefined => {
    if (isNaN(val)) return "请输入有效数字";
    if (val < 0.05 || val > 0.5) return "重力需在 0.05-0.5 之间";
    return undefined;
  };

  const validateBounce = (val: number): string | undefined => {
    if (isNaN(val)) return "请输入有效数字";
    if (val < 0.3 || val > 0.95) return "反弹系数需在 0.3-0.95 之间";
    return undefined;
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;

    function draw() {
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
        const isSelected = selected?.type === "obstacle" && selected.index === idx;
        const hasIssue = hasObstacleIssue(idx);
        const issuePulse = hasIssue ? 1 + Math.sin(Date.now() / 200) * 0.15 : 1;

        if (ob.type === "wall") {
          ctx.fillStyle = isSelected ? "#60a5fa" : "#475569";
          ctx.fillRect(ob.x, ob.y, ob.w, ob.h);
          ctx.strokeStyle = isSelected ? "#93c5fd" : "#64748b";
          ctx.lineWidth = 2;
          ctx.strokeRect(ob.x, ob.y, ob.w, ob.h);
        } else if (ob.type === "oneTime") {
          ctx.fillStyle = isSelected ? "#fb923c" : "#f97316";
          ctx.fillRect(ob.x, ob.y, ob.w, ob.h);
          ctx.strokeStyle = isSelected ? "#fdba74" : "#ea580c";
          ctx.lineWidth = 2;
          ctx.strokeRect(ob.x, ob.y, ob.w, ob.h);
          ctx.fillStyle = "rgba(255,255,255,0.8)";
          ctx.font = "bold 12px sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText("1", ob.x + ob.w / 2, ob.y + ob.h / 2);
        } else if (ob.type === "slowZone") {
          ctx.globalAlpha = 0.5;
          ctx.fillStyle = isSelected ? "#a78bfa" : "#8b5cf6";
          ctx.fillRect(ob.x, ob.y, ob.w, ob.h);
          ctx.globalAlpha = 1;
          ctx.strokeStyle = isSelected ? "#c4b5fd" : "#a78bfa";
          ctx.lineWidth = 2;
          ctx.setLineDash([6, 4]);
          ctx.strokeRect(ob.x, ob.y, ob.w, ob.h);
          ctx.setLineDash([]);
          ctx.fillStyle = "rgba(255,255,255,0.8)";
          ctx.font = "bold 14px sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText("❄", ob.x + ob.w / 2, ob.y + ob.h / 2);
        } else if (ob.type === "movingHorizontal" || ob.type === "movingVertical") {
          const dirArrow = ob.type === "movingHorizontal" ? "↔" : "↕";
          const range = ob.moveRange || 0;

          ctx.save();
          ctx.globalAlpha = 0.3;
          ctx.strokeStyle = isSelected ? "#22d3ee" : "#0e7490";
          ctx.lineWidth = 1;
          ctx.setLineDash([4, 4]);
          if (ob.type === "movingHorizontal") {
            ctx.strokeRect(ob.x, ob.y, ob.w + range, ob.h);
          } else {
            ctx.strokeRect(ob.x, ob.y, ob.w, ob.h + range);
          }
          ctx.setLineDash([]);
          ctx.restore();

          ctx.fillStyle = isSelected ? "#06b6d4" : "#0891b2";
          ctx.fillRect(ob.x, ob.y, ob.w, ob.h);
          ctx.strokeStyle = isSelected ? "#67e8f9" : "#22d3ee";
          ctx.lineWidth = 2;
          ctx.strokeRect(ob.x, ob.y, ob.w, ob.h);

          ctx.fillStyle = "rgba(255,255,255,0.9)";
          ctx.font = "bold 14px sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(dirArrow, ob.x + ob.w / 2, ob.y + ob.h / 2);
        } else {
          ctx.fillStyle = isSelected ? "#60a5fa" : "#475569";
          ctx.fillRect(ob.x, ob.y, ob.w, ob.h);
          ctx.strokeStyle = "#94a3b8";
          ctx.lineWidth = 1;
          ctx.setLineDash([4, 4]);
          ctx.strokeRect(ob.x, ob.y, ob.w, ob.h);
          ctx.setLineDash([]);
          ctx.fillStyle = "rgba(148,163,184,0.7)";
          ctx.font = "bold 12px sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText("?", ob.x + ob.w / 2, ob.y + ob.h / 2);
        }

        if (hasIssue) {
          ctx.save();
          ctx.strokeStyle = "#ef4444";
          ctx.lineWidth = 3 * issuePulse;
          ctx.shadowColor = "#ef4444";
          ctx.shadowBlur = 8;
          ctx.strokeRect(ob.x - 2, ob.y - 2, ob.w + 4, ob.h + 4);
          ctx.restore();
        }

        if (isSelected) {
          drawResizeHandles(ctx, ob.x, ob.y, ob.w, ob.h);
        }
      });

      const goalPulse = 1 + Math.sin(Date.now() / 400) * 0.05;
      const goalR = config.goalRadius * goalPulse;
      const goalSelected = selected?.type === "goal";
      const goalHasIssue = hasGoalIssue();

      if (goalHasIssue) {
        ctx.save();
        ctx.strokeStyle = "#ef4444";
        ctx.lineWidth = 4;
        ctx.shadowColor = "#ef4444";
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.arc(level.goal.x, level.goal.y, goalR + 6, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      ctx.beginPath();
      ctx.arc(level.goal.x, level.goal.y, goalR, 0, Math.PI * 2);
      const goalGrad = ctx.createRadialGradient(
        level.goal.x, level.goal.y, 0,
        level.goal.x, level.goal.y, goalR
      );
      goalGrad.addColorStop(0, goalSelected ? "#4ade80" : "#22c55e");
      goalGrad.addColorStop(1, "rgba(34,197,94,0.2)");
      ctx.fillStyle = goalGrad;
      ctx.fill();
      ctx.strokeStyle = goalSelected ? "#86efac" : "#22c55e";
      ctx.lineWidth = goalSelected ? 3 : 2;
      ctx.stroke();
      ctx.fillStyle = "#fff";
      ctx.font = "bold 14px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("终", level.goal.x, level.goal.y);

      level.stars.forEach((star, idx) => {
        const isSelected = selected?.type === "star" && selected.index === idx;
        const hasIssue = hasStarIssue(idx);
        const t = Date.now() / 500;
        const pulse = 1 + Math.sin(t + star.x * 0.01) * 0.05;
        const sr = config.starRadius * pulse;

        if (hasIssue) {
          ctx.save();
          ctx.strokeStyle = "#ef4444";
          ctx.lineWidth = 3;
          ctx.shadowColor = "#ef4444";
          ctx.shadowBlur = 10;
          ctx.beginPath();
          ctx.arc(star.x, star.y, sr + 5, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }

        ctx.beginPath();
        ctx.arc(star.x, star.y, sr, 0, Math.PI * 2);
        const starGrad = ctx.createRadialGradient(star.x, star.y, 0, star.x, star.y, sr);
        starGrad.addColorStop(0, isSelected ? "#fde047" : "#fbbf24");
        starGrad.addColorStop(1, "rgba(251,191,36,0.15)");
        ctx.fillStyle = starGrad;
        ctx.fill();
        ctx.strokeStyle = isSelected ? "#fef08a" : "#eab308";
        ctx.lineWidth = isSelected ? 2.5 : 1.5;
        ctx.stroke();
        ctx.fillStyle = "#78350f";
        ctx.font = "bold 16px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("★", star.x, star.y);
      });

      const ballSelected = selected?.type === "ball";
      const ballHasIssue = hasBallIssue();

      if (ballHasIssue) {
        ctx.save();
        ctx.strokeStyle = "#ef4444";
        ctx.lineWidth = 3;
        ctx.shadowColor = "#ef4444";
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(level.ball.x, level.ball.y, config.ballRadius + 5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      ctx.beginPath();
      ctx.arc(level.ball.x, level.ball.y, config.ballRadius, 0, Math.PI * 2);
      const ballGrad = ctx.createRadialGradient(-3, -3, 2, 0, 0, config.ballRadius);
      ballGrad.addColorStop(0, ballSelected ? "#93c5fd" : "#60a5fa");
      ballGrad.addColorStop(1, ballSelected ? "#3b82f6" : "#2563eb");
      ctx.fillStyle = ballGrad;
      ctx.fill();
      ctx.strokeStyle = ballSelected ? "#bfdbfe" : "#93c5fd";
      ctx.lineWidth = ballSelected ? 3 : 2;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(-config.ballRadius * 0.35, -config.ballRadius * 0.35, config.ballRadius * 0.28, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,255,255,0.55)";
      ctx.fill();

      ctx.restore();
      ctx.restore();
    }

    function loop() {
      draw();
      rafRef.current = requestAnimationFrame(loop);
    }

    rafRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafRef.current);
    };
  }, [level, selected]);

  function drawResizeHandles(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
    const size = 8;
    const handles = [
      { x: x, y: y, cursor: "nw" },
      { x: x + w, y: y, cursor: "ne" },
      { x: x, y: y + h, cursor: "sw" },
      { x: x + w, y: y + h, cursor: "se" },
    ];
    handles.forEach((h) => {
      ctx.fillStyle = "#fff";
      ctx.fillRect(h.x - size / 2, h.y - size / 2, size, size);
      ctx.strokeStyle = "#2563eb";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(h.x - size / 2, h.y - size / 2, size, size);
    });
  }

  function hasObstacleIssue(index: number): boolean {
    if (!validationResult) return false;
    return validationResult.issues.some(
      (issue) =>
        issue.target.kind === "obstacle" && issue.target.index === index
    );
  }

  function hasStarIssue(index: number): boolean {
    if (!validationResult) return false;
    return validationResult.issues.some(
      (issue) => issue.target.kind === "star" && issue.target.index === index
    );
  }

  function hasBallIssue(): boolean {
    if (!validationResult) return false;
    return validationResult.issues.some(
      (issue) => issue.target.kind === "ball"
    );
  }

  function hasGoalIssue(): boolean {
    if (!validationResult) return false;
    return validationResult.issues.some(
      (issue) => issue.target.kind === "goal"
    );
  }

  function getResizeHandle(x: number, y: number, ob: ObstacleDef): string | null {
    const size = 10;
    const handles: { x: number; y: number; name: string }[] = [
      { x: ob.x, y: ob.y, name: "nw" },
      { x: ob.x + ob.w, y: ob.y, name: "ne" },
      { x: ob.x, y: ob.y + ob.h, name: "sw" },
      { x: ob.x + ob.w, y: ob.y + ob.h, name: "se" },
    ];
    for (const h of handles) {
      if (Math.abs(x - h.x) < size && Math.abs(y - h.y) < size) {
        return h.name;
      }
    }
    return null;
  }

  function hitTest(x: number, y: number): SelectedItem {
    const b = config.ballRadius;
    if (Math.sqrt((x - level.ball.x) ** 2 + (y - level.ball.y) ** 2) < b + 5) {
      return { type: "ball" };
    }

    if (Math.sqrt((x - level.goal.x) ** 2 + (y - level.goal.y) ** 2) < config.goalRadius + 5) {
      return { type: "goal" };
    }

    for (let i = level.stars.length - 1; i >= 0; i--) {
      const s = level.stars[i];
      if (Math.sqrt((x - s.x) ** 2 + (y - s.y) ** 2) < config.starRadius + 3) {
        return { type: "star", index: i };
      }
    }

    for (let i = level.obstacles.length - 1; i >= 0; i--) {
      const ob = level.obstacles[i];
      if (x >= ob.x - 3 && x <= ob.x + ob.w + 3 && y >= ob.y - 3 && y <= ob.y + ob.h + 3) {
        return { type: "obstacle", index: i };
      }
    }

    return null;
  }

  const getPos = useCallback((e: MouseEvent | TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    let clientX: number, clientY: number;
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
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const canvasEl = canvas;

    function onDown(e: MouseEvent | TouchEvent) {
      e.preventDefault();
      const pos = getPos(e);
      const clampedX = Math.max(0, Math.min(CANVAS_W, pos.x));
      const clampedY = Math.max(0, Math.min(CANVAS_H, pos.y));

      if (tool === "select") {
        const hit = hitTest(pos.x, pos.y);
        setSelected(hit);

        if (hit) {
          if (hit.type === "obstacle") {
            const ob = level.obstacles[hit.index];
            const handle = getResizeHandle(pos.x, pos.y, ob);
            if (handle) {
              dragRef.current = {
                startX: pos.x,
                startY: pos.y,
                origX: ob.x,
                origY: ob.y,
                origW: ob.w,
                origH: ob.h,
                resizing: true,
                resizeHandle: handle,
              };
              return;
            }
          }

          let origX = 0, origY = 0;
          if (hit.type === "ball") {
            origX = level.ball.x;
            origY = level.ball.y;
          } else if (hit.type === "goal") {
            origX = level.goal.x;
            origY = level.goal.y;
          } else if (hit.type === "star") {
            origX = level.stars[hit.index].x;
            origY = level.stars[hit.index].y;
          } else if (hit.type === "obstacle") {
            origX = level.obstacles[hit.index].x;
            origY = level.obstacles[hit.index].y;
          }
          dragRef.current = {
            startX: pos.x,
            startY: pos.y,
            origX,
            origY,
          };
        }
      } else if (tool === "delete") {
        const hit = hitTest(pos.x, pos.y);
        if (hit && hit.type !== "ball" && hit.type !== "goal") {
          if (hit.type === "star") {
            const newStars = level.stars.filter((_, i) => i !== hit.index);
            const updated = updateStarRulesForLevel({ ...level, stars: newStars });
            setLevel(updated);
            setDirty(true);
          } else if (hit.type === "obstacle") {
            setLevel({
              ...level,
              obstacles: level.obstacles.filter((_, i) => i !== hit.index),
            });
            setDirty(true);
          }
          setSelected(null);
        }
      } else {
        if (tool === "ball") {
          setLevel({ ...level, ball: { x: clampedX, y: clampedY } });
          setSelected({ type: "ball" });
          setDirty(true);
        } else if (tool === "goal") {
          setLevel({ ...level, goal: { x: clampedX, y: clampedY } });
          setSelected({ type: "goal" });
          setDirty(true);
        } else if (tool === "star") {
          const newStar: StarDef = { x: clampedX, y: clampedY };
          const newStars = [...level.stars, newStar];
          const updated = updateStarRulesForLevel({ ...level, stars: newStars });
          setLevel(updated);
          setSelected({ type: "star", index: newStars.length - 1 });
          setDirty(true);
        } else if (tool === "wall" || tool === "oneTime" || tool === "slowZone" || tool === "movingHorizontal" || tool === "movingVertical") {
          const defaultW = tool === "slowZone" ? 80 : 60;
          const defaultH = tool === "slowZone" ? 60 : 16;
          const defaultRange = tool === "movingHorizontal" || tool === "movingVertical" ? 80 : 0;
          const defaultSpeed = tool === "movingHorizontal" || tool === "movingVertical" ? 1.5 : undefined;
          const newOb: ObstacleDef = {
            x: clampedX - defaultW / 2,
            y: clampedY - defaultH / 2,
            w: defaultW,
            h: defaultH,
            type: tool,
            moveRange: defaultRange,
            moveSpeed: defaultSpeed,
          };
          setLevel({
            ...level,
            obstacles: [...level.obstacles, newOb],
          });
          setSelected({ type: "obstacle", index: level.obstacles.length });
          setDirty(true);
        }
      }
    }

    function onMove(e: MouseEvent | TouchEvent) {
      if (!dragRef.current || !selected) return;
      e.preventDefault();
      const pos = getPos(e);
      const drag = dragRef.current;
      const dx = pos.x - drag.startX;
      const dy = pos.y - drag.startY;

      if (drag.resizing && selected.type === "obstacle" && drag.origW !== undefined && drag.origH !== undefined) {
        const idx = selected.index;
        const ob = level.obstacles[idx];
        let newX = ob.x;
        let newY = ob.y;
        let newW = ob.w;
        let newH = ob.h;

        if (drag.resizeHandle?.includes("e")) {
          newW = Math.max(20, drag.origW + dx);
        }
        if (drag.resizeHandle?.includes("w")) {
          newW = Math.max(20, drag.origW - dx);
          newX = drag.origX + (drag.origW - newW);
        }
        if (drag.resizeHandle?.includes("s")) {
          newH = Math.max(14, drag.origH + dy);
        }
        if (drag.resizeHandle?.includes("n")) {
          newH = Math.max(14, drag.origH - dy);
          newY = drag.origY + (drag.origH - newH);
        }

        const newObstacles = [...level.obstacles];
        newObstacles[idx] = { ...ob, x: newX, y: newY, w: newW, h: newH };
        setLevel({ ...level, obstacles: newObstacles });
        setDirty(true);
      } else if (selected.type === "ball") {
        const newX = Math.max(config.ballRadius, Math.min(CANVAS_W - config.ballRadius, drag.origX + dx));
        const newY = Math.max(config.ballRadius, Math.min(CANVAS_H - config.ballRadius, drag.origY + dy));
        setLevel({ ...level, ball: { x: newX, y: newY } });
        setDirty(true);
      } else if (selected.type === "goal") {
        const newX = Math.max(config.goalRadius, Math.min(CANVAS_W - config.goalRadius, drag.origX + dx));
        const newY = Math.max(config.goalRadius, Math.min(CANVAS_H - config.goalRadius, drag.origY + dy));
        setLevel({ ...level, goal: { x: newX, y: newY } });
        setDirty(true);
      } else if (selected.type === "star") {
        const idx = selected.index;
        const newX = Math.max(config.starRadius, Math.min(CANVAS_W - config.starRadius, drag.origX + dx));
        const newY = Math.max(config.starRadius, Math.min(CANVAS_H - config.starRadius, drag.origY + dy));
        const newStars = [...level.stars];
        newStars[idx] = { ...newStars[idx], x: newX, y: newY };
        setLevel({ ...level, stars: newStars });
        setDirty(true);
      } else if (selected.type === "obstacle") {
        const idx = selected.index;
        const ob = level.obstacles[idx];
        const newX = Math.max(0, Math.min(CANVAS_W - ob.w, drag.origX + dx));
        const newY = Math.max(0, Math.min(CANVAS_H - ob.h, drag.origY + dy));
        const newObstacles = [...level.obstacles];
        newObstacles[idx] = { ...ob, x: newX, y: newY };
        setLevel({ ...level, obstacles: newObstacles });
        setDirty(true);
      }
    }

    function onUp() {
      dragRef.current = null;
    }

    canvasEl.addEventListener("mousedown", onDown);
    canvasEl.addEventListener("mousemove", onMove);
    canvasEl.addEventListener("mouseup", onUp);
    canvasEl.addEventListener("mouseleave", onUp);
    canvasEl.addEventListener("touchstart", onDown, { passive: false });
    canvasEl.addEventListener("touchmove", onMove, { passive: false });
    canvasEl.addEventListener("touchend", onUp);
    canvasEl.addEventListener("touchcancel", onUp);

    return () => {
      canvasEl.removeEventListener("mousedown", onDown);
      canvasEl.removeEventListener("mousemove", onMove);
      canvasEl.removeEventListener("mouseup", onUp);
      canvasEl.removeEventListener("mouseleave", onUp);
      canvasEl.removeEventListener("touchstart", onDown);
      canvasEl.removeEventListener("touchmove", onMove);
      canvasEl.removeEventListener("touchend", onUp);
      canvasEl.removeEventListener("touchcancel", onUp);
    };
  }, [level, tool, selected, getPos]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(viewport.canvasWidth * dpr);
    canvas.height = Math.floor(viewport.canvasHeight * dpr);
  }, [viewport.canvasWidth, viewport.canvasHeight]);

  const handleSave = useCallback(() => {
    const trimmedName = levelName.trim();
    const nameError = validateName(levelName);
    const maxShotsError = validateMaxShots(level.maxShots);
    const gravityError = validateGravity(level.gravity);
    const bounceError = validateBounce(level.bounce);

    const newErrors: typeof errors = {};
    if (nameError) newErrors.name = nameError;
    if (maxShotsError) newErrors.maxShots = maxShotsError;
    if (gravityError) newErrors.gravity = gravityError;
    if (bounceError) newErrors.bounce = bounceError;
    setErrors(newErrors);

    if (Object.keys(newErrors).length > 0) return;

    if (validationResult && !validationResult.valid) {
      return;
    }

    const levelToSave = normalizeLevel(updateStarRulesForLevel({
      ...level,
      name: trimmedName || "自定义关卡",
    }));
    const saved = saveCustomLevel(levelToSave);
    setLevel(saved);
    setDirty(false);
    setShowSaveSuccess(true);
    setTimeout(() => setShowSaveSuccess(false), 2000);
    onSave(saved);
  }, [level, levelName, onSave, validationResult]);

  const handlePlay = useCallback(() => {
    if (validationResult && !validationResult.valid) {
      setShowPlayWarning(true);
      return;
    }
    const trimmedName = levelName.trim();
    const levelToPlay = normalizeLevel(updateStarRulesForLevel({
      ...level,
      name: trimmedName || "自定义关卡",
    }));
    setPlayLevel(JSON.parse(JSON.stringify(levelToPlay)));
    setIsPlaying(true);
  }, [level, levelName, validationResult]);

  const handleConfirmPlay = useCallback(() => {
    setShowPlayWarning(false);
    const trimmedName = levelName.trim();
    const levelToPlay = normalizeLevel(updateStarRulesForLevel({
      ...level,
      name: trimmedName || "自定义关卡",
    }));
    setPlayLevel(JSON.parse(JSON.stringify(levelToPlay)));
    setIsPlaying(true);
  }, [level, levelName]);

  const handleCancelPlay = useCallback(() => {
    setShowPlayWarning(false);
  }, []);

  const handleShareCode = useCallback(async () => {
    setShowShareDialog(true);
    setShareCode("");
    setShareCodeLoading(true);
    setShareCopied(false);
    try {
      const trimmedName = levelName.trim();
      const levelToShare = normalizeLevel(updateStarRulesForLevel({
        ...level,
        name: trimmedName || "自定义关卡",
      }));
      const code = await encodeChallengeCode(levelToShare);
      setShareCode(code);
    } catch {
      setShareCode("生成失败，请重试");
    } finally {
      setShareCodeLoading(false);
    }
  }, [level, levelName]);

  const handleCopyShareCode = useCallback(async () => {
    if (!shareCode) return;
    try {
      await navigator.clipboard.writeText(shareCode);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2000);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = shareCode;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2000);
    }
  }, [shareCode]);

  const handleBackFromPlay = useCallback(() => {
    setIsPlaying(false);
    setPlayLevel(null);
  }, []);

  const handlePlayComplete = useCallback(() => {
  }, []);

  const handlePlayNext = useCallback(() => {
  }, []);

  const handleDeleteSelected = useCallback(() => {
    if (!selected) return;
    if (selected.type === "star") {
      const newStars = level.stars.filter((_, i) => i !== selected.index);
      const updated = updateStarRulesForLevel({ ...level, stars: newStars });
      setLevel(updated);
      setDirty(true);
    } else if (selected.type === "obstacle") {
      setLevel({
        ...level,
        obstacles: level.obstacles.filter((_, i) => i !== selected.index),
      });
      setDirty(true);
    }
    setSelected(null);
  }, [selected, level]);

  const handleNameChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setLevelName(val);
    setDirty(true);
    const err = validateName(val);
    setErrors((prev) => ({ ...prev, name: err }));
  }, []);

  const handleMaxShotsSlider = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value) || 1;
    const clamped = Math.max(1, Math.min(20, val));
    setLevel({ ...level, maxShots: clamped });
    setDirty(true);
    setErrors((prev) => ({ ...prev, maxShots: undefined }));
  }, [level]);

  const handleMaxShotsInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    const val = parseInt(raw);
    const err = validateMaxShots(val);
    setErrors((prev) => ({ ...prev, maxShots: err }));
    if (!err) {
      setLevel({ ...level, maxShots: val });
      setDirty(true);
    }
  }, [level]);

  const handleGravitySlider = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value) || 0.1;
    const clamped = Math.max(0.05, Math.min(0.5, val));
    setLevel({ ...level, gravity: parseFloat(clamped.toFixed(3)) });
    setDirty(true);
    setErrors((prev) => ({ ...prev, gravity: undefined }));
  }, [level]);

  const handleGravityInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    const val = parseFloat(raw);
    const err = validateGravity(val);
    setErrors((prev) => ({ ...prev, gravity: err }));
    if (!err) {
      setLevel({ ...level, gravity: parseFloat(val.toFixed(3)) });
      setDirty(true);
    }
  }, [level]);

  const handleBounceSlider = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value) || 0.5;
    const clamped = Math.max(0.3, Math.min(0.95, val));
    setLevel({ ...level, bounce: parseFloat(clamped.toFixed(2)) });
    setDirty(true);
    setErrors((prev) => ({ ...prev, bounce: undefined }));
  }, [level]);

  const handleBounceInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    const val = parseFloat(raw);
    const err = validateBounce(val);
    setErrors((prev) => ({ ...prev, bounce: err }));
    if (!err) {
      setLevel({ ...level, bounce: parseFloat(val.toFixed(2)) });
      setDirty(true);
    }
  }, [level]);

  if (isPlaying && playLevel) {
    return (
      <div className="editor-play-wrap">
        <Game
          key={`play-${playLevel.id}-${Date.now()}`}
          level={playLevel}
          progress={{}}
          onBack={handleBackFromPlay}
          onComplete={handlePlayComplete}
          onNext={handlePlayNext}
        />
        <button className="btn-exit-play" onClick={handleBackFromPlay}>
          ← 返回编辑
        </button>
      </div>
    );
  }

  return (
    <div className="level-editor">
      <div className="editor-header">
        <div className="editor-header-left">
          <button className="btn-back" onClick={onBack}>
            ← 返回
          </button>
          <h2>关卡编辑器</h2>
          {dirty && <span className="dirty-badge">未保存</span>}
        </div>
        <div className="editor-header-right">
          <button className="btn-share-code" onClick={handleShareCode}>
            🔗 分享码
          </button>
          <button className="btn-play" onClick={handlePlay}>
            ▶ 试玩
          </button>
          <button
            className="btn-save"
            onClick={handleSave}
            disabled={validationResult ? !validationResult.valid : false}
          >
            💾 保存
          </button>
        </div>
      </div>

      <div className="editor-body">
        <div className="editor-toolbar">
          <div className="tool-section">
            <div className="tool-section-title">工具</div>
            <button
              className={"tool-btn" + (tool === "select" ? " active" : "")}
              onClick={() => setTool("select")}
            >
              🖱 选择
            </button>
            <button
              className={"tool-btn" + (tool === "delete" ? " active" : "")}
              onClick={() => setTool("delete")}
            >
              🗑 删除
            </button>
          </div>

          <div className="tool-section">
            <div className="tool-section-title">放置</div>
            <button
              className={"tool-btn tool-ball" + (tool === "ball" ? " active" : "")}
              onClick={() => setTool("ball")}
            >
              🔵 出生点
            </button>
            <button
              className={"tool-btn tool-goal" + (tool === "goal" ? " active" : "")}
              onClick={() => setTool("goal")}
            >
              🟢 终点
            </button>
            <button
              className={"tool-btn tool-star" + (tool === "star" ? " active" : "")}
              onClick={() => setTool("star")}
            >
              ⭐ 星星
            </button>
            <button
              className={"tool-btn tool-wall" + (tool === "wall" ? " active" : "")}
              onClick={() => setTool("wall")}
            >
              🧱 墙体
            </button>
            <button
              className={"tool-btn tool-onetime" + (tool === "oneTime" ? " active" : "")}
              onClick={() => setTool("oneTime")}
            >
              💥 易碎
            </button>
            <button
              className={"tool-btn tool-slow" + (tool === "slowZone" ? " active" : "")}
              onClick={() => setTool("slowZone")}
            >
              ❄ 减速区
            </button>
            <button
              className={"tool-btn tool-moveh" + (tool === "movingHorizontal" ? " active" : "")}
              onClick={() => setTool("movingHorizontal")}
            >
              ↔ 水平移动
            </button>
            <button
              className={"tool-btn tool-movev" + (tool === "movingVertical" ? " active" : "")}
              onClick={() => setTool("movingVertical")}
            >
              ↕ 垂直移动
            </button>
          </div>
        </div>

        <div className="editor-canvas-wrap">
          <div ref={viewport.containerRef} className="canvas-wrap editor-canvas">
            <canvas ref={canvasRef} />
          </div>
          {showSaveSuccess && (
            <div className="save-success-toast">✓ 保存成功</div>
          )}
        </div>

        <div className="editor-properties">
          <div className="prop-section">
            <div className="prop-section-title">关卡设置</div>
            <div className={"prop-item" + (errors.name ? " has-error" : "")}>
              <label>关卡名称</label>
              <input
                type="text"
                value={levelName}
                onChange={handleNameChange}
                placeholder="输入关卡名称"
                maxLength={30}
              />
              {errors.name && <span className="prop-error">{errors.name}</span>}
            </div>
            <div className={"prop-item" + (errors.maxShots ? " has-error" : "")}>
              <div className="prop-label-row">
                <label>弹射次数</label>
                <input
                  type="number"
                  className="prop-number-input"
                  min="1"
                  max="20"
                  value={level.maxShots}
                  onChange={handleMaxShotsInput}
                />
              </div>
              <input
                type="range"
                min="1"
                max="20"
                value={level.maxShots}
                onChange={handleMaxShotsSlider}
              />
              {errors.maxShots && <span className="prop-error">{errors.maxShots}</span>}
            </div>
            <div className={"prop-item" + (errors.gravity ? " has-error" : "")}>
              <div className="prop-label-row">
                <label>重力</label>
                <input
                  type="number"
                  className="prop-number-input"
                  min="0.05"
                  max="0.5"
                  step="0.01"
                  value={level.gravity}
                  onChange={handleGravityInput}
                />
              </div>
              <input
                type="range"
                min="0.05"
                max="0.5"
                step="0.01"
                value={level.gravity}
                onChange={handleGravitySlider}
              />
              {errors.gravity && <span className="prop-error">{errors.gravity}</span>}
            </div>
            <div className={"prop-item" + (errors.bounce ? " has-error" : "")}>
              <div className="prop-label-row">
                <label>反弹系数</label>
                <input
                  type="number"
                  className="prop-number-input"
                  min="0.3"
                  max="0.95"
                  step="0.05"
                  value={level.bounce}
                  onChange={handleBounceInput}
                />
              </div>
              <input
                type="range"
                min="0.3"
                max="0.95"
                step="0.05"
                value={level.bounce}
                onChange={handleBounceSlider}
              />
              {errors.bounce && <span className="prop-error">{errors.bounce}</span>}
            </div>
          </div>

          {validationResult && !validationResult.valid && (
            <div className="prop-section validation-section">
              <div className="prop-section-title validation-title">
                ⚠️ 布局问题 ({validationResult.issues.length})
              </div>
              <div className="validation-issues">
                {validationResult.issues.map((issue, idx) => (
                  <div
                    key={idx}
                    className="validation-issue-item"
                    onClick={() => {
                      if (issue.target.kind === "ball") {
                        setSelected({ type: "ball" });
                      } else if (issue.target.kind === "goal") {
                        setSelected({ type: "goal" });
                      } else if (issue.target.kind === "star") {
                        setSelected({ type: "star", index: issue.target.index });
                      } else if (issue.target.kind === "obstacle") {
                        setSelected({ type: "obstacle", index: issue.target.index });
                      }
                    }}
                  >
                    <span className="issue-icon">⚠</span>
                    <span className="issue-text">{issue.message}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="prop-section">
            <div className="prop-section-title">元素统计</div>
            <div className="stat-row">
              <span>星星数量</span>
              <span className="stat-value">{level.stars.length}</span>
            </div>
            <div className="stat-row">
              <span>墙体障碍</span>
              <span className="stat-value">
                {level.obstacles.filter((o) => o.type === "wall").length}
              </span>
            </div>
            <div className="stat-row">
              <span>易碎障碍</span>
              <span className="stat-value">
                {level.obstacles.filter((o) => o.type === "oneTime").length}
              </span>
            </div>
            <div className="stat-row">
              <span>减速区域</span>
              <span className="stat-value">
                {level.obstacles.filter((o) => o.type === "slowZone").length}
              </span>
            </div>
            <div className="stat-row">
              <span>水平移动</span>
              <span className="stat-value">
                {level.obstacles.filter((o) => o.type === "movingHorizontal").length}
              </span>
            </div>
            <div className="stat-row">
              <span>垂直移动</span>
              <span className="stat-value">
                {level.obstacles.filter((o) => o.type === "movingVertical").length}
              </span>
            </div>
          </div>

          {selected && (
            <div className="prop-section">
              <div className="prop-section-title">选中元素</div>
              <div className="selected-info">
                {selected.type === "ball" && <span>🔵 出生点</span>}
                {selected.type === "goal" && <span>🟢 终点</span>}
                {selected.type === "star" && <span>⭐ 星星 #{selected.index + 1}</span>}
                {selected.type === "obstacle" && (
                  <span>
                    {level.obstacles[selected.index].type === "wall" && "🧱"}
                    {level.obstacles[selected.index].type === "oneTime" && "💥"}
                    {level.obstacles[selected.index].type === "slowZone" && "❄"}
                    {level.obstacles[selected.index].type === "movingHorizontal" && "↔"}
                    {level.obstacles[selected.index].type === "movingVertical" && "↕"}
                    {" 障碍 #"}{(selected.index + 1)}
                  </span>
                )}
              </div>
              {selected.type === "obstacle" &&
                (level.obstacles[selected.index].type === "movingHorizontal" ||
                  level.obstacles[selected.index].type === "movingVertical") && (
                  <>
                    <div className="prop-item">
                      <div className="prop-label-row">
                        <label>移动范围</label>
                        <input
                          type="number"
                          className="prop-number-input"
                          min="0"
                          max="300"
                          step="5"
                          value={level.obstacles[selected.index].moveRange || 0}
                          onChange={(e) => {
                            const idx = selected.index;
                            const val = parseInt(e.target.value) || 0;
                            const clamped = Math.max(0, Math.min(300, val));
                            const newObstacles = [...level.obstacles];
                            newObstacles[idx] = { ...newObstacles[idx], moveRange: clamped };
                            setLevel({ ...level, obstacles: newObstacles });
                            setDirty(true);
                          }}
                        />
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="300"
                        step="5"
                        value={level.obstacles[selected.index].moveRange || 0}
                        onChange={(e) => {
                          const idx = selected.index;
                          const val = parseInt(e.target.value) || 0;
                          const newObstacles = [...level.obstacles];
                          newObstacles[idx] = { ...newObstacles[idx], moveRange: val };
                          setLevel({ ...level, obstacles: newObstacles });
                          setDirty(true);
                        }}
                      />
                    </div>
                    <div className="prop-item">
                      <div className="prop-label-row">
                        <label>移动速度</label>
                        <input
                          type="number"
                          className="prop-number-input"
                          min="0.1"
                          max="5"
                          step="0.1"
                          value={level.obstacles[selected.index].moveSpeed || 1.5}
                          onChange={(e) => {
                            const idx = selected.index;
                            const val = parseFloat(e.target.value);
                            if (isNaN(val)) return;
                            const clamped = Math.max(0.1, Math.min(5, val));
                            const newObstacles = [...level.obstacles];
                            newObstacles[idx] = {
                              ...newObstacles[idx],
                              moveSpeed: parseFloat(clamped.toFixed(2)),
                            };
                            setLevel({ ...level, obstacles: newObstacles });
                            setDirty(true);
                          }}
                        />
                      </div>
                      <input
                        type="range"
                        min="0.1"
                        max="5"
                        step="0.1"
                        value={level.obstacles[selected.index].moveSpeed || 1.5}
                        onChange={(e) => {
                          const idx = selected.index;
                          const val = parseFloat(e.target.value) || 0.1;
                          const newObstacles = [...level.obstacles];
                          newObstacles[idx] = {
                            ...newObstacles[idx],
                            moveSpeed: parseFloat(val.toFixed(2)),
                          };
                          setLevel({ ...level, obstacles: newObstacles });
                          setDirty(true);
                        }}
                      />
                    </div>
                  </>
                )}
              {(selected.type === "star" || selected.type === "obstacle") && (
                <button className="btn-delete-selected" onClick={handleDeleteSelected}>
                  🗑 删除此元素
                </button>
              )}
            </div>
          )}

          <div className="prop-section">
            <div className="prop-section-title">操作提示</div>
            <div className="tips">
              <p>• 选择工具后点击画布放置元素</p>
              <p>• 使用选择工具拖动移动元素</p>
              <p>• 拖动障碍四角调整大小</p>
              <p>• 点击试玩按钮测试关卡</p>
            </div>
          </div>
        </div>
      </div>

      {showPlayWarning && (
        <div className="play-warning-overlay">
          <div className="play-warning-card">
            <div className="play-warning-icon">⚠️</div>
            <h3 className="play-warning-title">布局存在风险</h3>
            <p className="play-warning-desc">
              当前关卡布局存在以下问题，试玩可能无法正常进行：
            </p>
            <div className="play-warning-issues">
              {validationResult?.issues.map((issue, idx) => (
                <div key={idx} className="play-warning-issue">
                  <span className="warning-bullet">•</span>
                  <span>{issue.message}</span>
                </div>
              ))}
            </div>
            <div className="play-warning-actions">
              <button className="btn-cancel-play" onClick={handleCancelPlay}>
                返回编辑
              </button>
              <button className="btn-confirm-play" onClick={handleConfirmPlay}>
                继续试玩
              </button>
            </div>
          </div>
        </div>
      )}

      {showShareDialog && (
        <div className="challenge-overlay" onClick={() => setShowShareDialog(false)}>
          <div className="challenge-dialog" onClick={(e) => e.stopPropagation()}>
            <button className="challenge-dialog-close" onClick={() => setShowShareDialog(false)}>✕</button>
            <h3 className="challenge-dialog-title">🔗 分享挑战码</h3>
            <p className="challenge-dialog-desc">将下方挑战码复制发送给好友，对方粘贴后即可试玩你的关卡</p>
            <div className="share-code-wrap">
              {shareCodeLoading ? (
                <div className="share-code-loading">生成中...</div>
              ) : (
                <textarea
                  className="share-code-textarea"
                  value={shareCode}
                  readOnly
                  onClick={(e) => (e.target as HTMLTextAreaElement).select()}
                />
              )}
            </div>
            <button
              className="btn-copy-code"
              onClick={handleCopyShareCode}
              disabled={shareCodeLoading || !shareCode}
            >
              {shareCopied ? "✓ 已复制" : "📋 复制挑战码"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
