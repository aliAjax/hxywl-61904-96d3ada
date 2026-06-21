import { useRef, useEffect, useState, useCallback, useMemo } from "react";
import { LevelDef, levels, calculateEarnedStars, checkStarRuleAchieved } from "./levels";
import { Progress, getStars, isTutorialCompleted, setTutorialCompleted } from "./progress";
import Tutorial, { TutorialStep } from "./Tutorial";
import { useGameViewport, ViewportInfo } from "./useGameViewport";
import { DEFAULT_CONFIG } from "./physics";
import {
  ShotRecord,
  BestRoute,
  ReplayShotTrajectory,
  getBestRoute,
  saveBestRoute,
  simulateRoute,
  isCustomLevel,
} from "./replayRoutes";
import { GameEngine, GamePhase } from "./gameEngine";
import { CanvasRenderer } from "./canvasRenderer";
import { InputController } from "./inputController";

interface Props {
  level: LevelDef;
  progress: Progress;
  onBack: () => void;
  onComplete: (levelId: number, stars: number, cleared: boolean) => void;
  onNext: () => void;
}

const config = DEFAULT_CONFIG;

export default function Game({ level, progress, onBack, onComplete, onNext }: Props) {
  const hasNextLevel = levels.some((l) => l.id === level.id + 1);
  const prevBestStars = getStars(level.id, progress);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewport = useGameViewport();
  const viewportRef = useRef<ViewportInfo>(viewport);
  viewportRef.current = viewport;

  const engineRef = useRef<GameEngine | null>(null);
  const rendererRef = useRef<CanvasRenderer | null>(null);
  const inputRef = useRef<InputController | null>(null);
  const rafRef = useRef<number>(0);
  const dragRef = useRef<{ x: number; y: number } | null>(null);

  const [phase, setPhase] = useState<GamePhase>("aim");
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
  const [bestRoute, setBestRoute] = useState<BestRoute | null>(null);
  const [showReplay, setShowReplay] = useState(false);
  const [savedThisRun, setSavedThisRun] = useState(false);
  const [resultCleared, setResultCleared] = useState(false);

  const levelRef = useRef(level);
  levelRef.current = level;
  const prevBestStarsRef = useRef(prevBestStars);
  prevBestStarsRef.current = prevBestStars;
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const savedThisRunRef = useRef(savedThisRun);
  savedThisRunRef.current = savedThisRun;

  const replayTrajectories: ReplayShotTrajectory[] = useMemo(() => {
    if (!bestRoute || !showReplay) return [];
    return simulateRoute(level, config, bestRoute);
  }, [bestRoute, showReplay, level.id]);

  const replayTrajectoriesRef = useRef<ReplayShotTrajectory[]>([]);
  replayTrajectoriesRef.current = replayTrajectories;

  const showTutorialRef = useRef(false);
  showTutorialRef.current = showTutorial;
  const showStarRulesRef = useRef(false);
  showStarRulesRef.current = showStarRules;
  const showResultRef = useRef(false);
  showResultRef.current = showResult;

  const handlePauseRef = useRef<() => void>(() => {});
  const handleResumeRef = useRef<() => void>(() => {});

  const finishLevel = useCallback(
    (cleared: boolean) => {
      const engine = engineRef.current;
      if (!engine) return;

      const currentLevel = levelRef.current;
      const s = engine.getState();
      const remaining = s.shotsRemaining;
      const used = s.shotsUsed;
      setRemainingShots(remaining);
      setShotsUsed(used);
      if (!cleared) {
        const dx = s.ball.x - currentLevel.goal.x;
        const dy = s.ball.y - currentLevel.goal.y;
        setDistanceToGoal(Math.round(Math.sqrt(dx * dx + dy * dy)));
      }
      const earnedStars = calculateEarnedStars(
        currentLevel,
        s.collected,
        s.shotsUsed,
        remaining,
        cleared
      );

      setResultCleared(cleared);

      if (cleared && !savedThisRunRef.current) {
        const finalShots = engine.getShotRecords();
        const isBetter = saveBestRoute(currentLevel.id, finalShots, earnedStars, used);
        if (isBetter) {
          setBestRoute({
            levelId: currentLevel.id,
            shots: [...finalShots],
            stars: earnedStars,
            shotsUsed: used,
            timestamp: Date.now(),
          });
        }
        savedThisRunRef.current = true;
        setSavedThisRun(true);
      }

      setResultStars(earnedStars);
      setIsNewRecord(earnedStars > prevBestStarsRef.current);
      setShowResult(true);
      onCompleteRef.current(currentLevel.id, earnedStars, cleared);
    },
    []
  );

  const initEngine = useCallback(() => {
    const engine = new GameEngine(levelRef.current, {
      onPhaseChange: (p) => setPhase(p),
      onShotsChange: (remaining) => setShots(remaining),
      onCollectedChange: (c) => setCollected(c),
      onGoalReach: () => finishLevel(true),
      onLevelFail: () => finishLevel(false),
      onShotRecorded: (_, all) => setShotRecords([...all]),
    });
    engineRef.current = engine;
    engine.start();
  }, [finishLevel]);

  const handleRetry = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;

    engine.reset();
    dragRef.current = null;
    isPausedRef.current = false;
    setShots(level.maxShots);
    setCollected(0);
    setResultStars(0);
    setRemainingShots(level.maxShots);
    setShotsUsed(0);
    setDistanceToGoal(0);
    setIsNewRecord(false);
    setResultCleared(false);
    setShowResult(false);
    setPhase("aim");
    setIsPaused(false);
    setShotRecords([]);
    savedThisRunRef.current = false;
    setSavedThisRun(false);
  }, [level]);

  const handlePause = useCallback(() => {
    if (showResult) return;
    engineRef.current?.pause();
    isPausedRef.current = true;
    setIsPaused(true);
    dragRef.current = null;
  }, [showResult]);

  const handleResume = useCallback(() => {
    engineRef.current?.resume();
    isPausedRef.current = false;
    setIsPaused(false);
  }, []);

  handlePauseRef.current = handlePause;
  handleResumeRef.current = handleResume;

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
    const maxDist = Math.sqrt(config.canvasW * config.canvasW + config.canvasH * config.canvasH);
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

    initEngine();

    const renderer = new CanvasRenderer(ctx, viewportRef.current);
    rendererRef.current = renderer;

    const engine = engineRef.current!;

    const input = new InputController(canvas, viewportRef.current, {
      onDragStart: (x, y) => {
        if (engine.getPhase() !== "aim") return;
        if (isPausedRef.current) return;
        dragRef.current = { x, y };
      },
      onDragMove: (x, y) => {
        if (!dragRef.current) return;
        dragRef.current = { x, y };
      },
      onDragEnd: (x, y) => {
        if (!dragRef.current) return;
        engine.launch(x, y);
        dragRef.current = null;
      },
      onKeyDown: (key) => {
        if (key === "Escape") {
          if (showTutorialRef.current || showStarRulesRef.current) return;
          if (showResultRef.current) return;
          if (isPausedRef.current) {
            handleResumeRef.current();
          } else {
            handlePauseRef.current();
          }
        }
      },
      onVisibilityChange: (hidden) => {
        if (hidden) {
          dragRef.current = null;
        }
      },
    }, {
      touchRadius: config.touchRadius,
      getBallPosition: () => engine.getBallPosition(),
      checkCanStartDrag: () => engine.getPhase() === "aim" && !isPausedRef.current,
    });
    inputRef.current = input;

    function renderLoop() {
      const eng = engineRef.current;
      const rend = rendererRef.current;
      if (!eng || !rend) {
        rafRef.current = requestAnimationFrame(renderLoop);
        return;
      }

      rend.render(eng.getState(), eng.getLevel(), eng.getConfig(), {
        dragState: dragRef.current,
        replayTrajectories: replayTrajectoriesRef.current,
        shotRecordsCount: eng.getShotRecords().length,
      });

      rafRef.current = requestAnimationFrame(renderLoop);
    }

    rafRef.current = requestAnimationFrame(renderLoop);

    return () => {
      cancelAnimationFrame(rafRef.current);
      engine.stop();
      input.destroy();
      engineRef.current = null;
      rendererRef.current = null;
      inputRef.current = null;
    };
  }, [level.id, initEngine]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(viewport.canvasWidth * dpr);
    canvas.height = Math.floor(viewport.canvasHeight * dpr);

    if (rendererRef.current) {
      rendererRef.current.setViewport(viewport);
    }
    if (inputRef.current) {
      inputRef.current.setViewport(viewport);
    }
  }, [viewport.canvasWidth, viewport.canvasHeight, viewport.scale, viewport.offsetX, viewport.offsetY]);

  useEffect(() => {
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
            {resultCleared ? (
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
