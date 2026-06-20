import { useState } from "react";
import { levels } from "./levels";
import { Progress, isUnlocked, getStars } from "./progress";
import Tutorial, { TutorialStep } from "./Tutorial";

interface Props {
  progress: Progress;
  onSelect: (levelId: number) => void;
}

function StarRow(count: number, size: "sm" | "md" = "md") {
  return (
    <span className={"star-row " + (size === "sm" ? "star-row-sm" : "")}>
      {[1, 2, 3].map((i) => (
        <span key={i} className={i <= count ? "star filled" : "star empty"}>
          ★
        </span>
      ))}
    </span>
  );
}

export default function LevelSelect({ progress, onSelect }: Props) {
  const totalLevels = levels.length;
  const [showTutorial, setShowTutorial] = useState(false);
  let clearedCount = 0;
  let totalStars = 0;
  let maxPossibleStars = 0;
  levels.forEach((lv) => {
    const stars = getStars(lv.id, progress);
    const cleared = progress[lv.id]?.cleared;
    if (cleared) clearedCount++;
    totalStars += stars;
    maxPossibleStars += 3;
  });
  const progressPct = Math.round((clearedCount / totalLevels) * 100);
  const starsPct = Math.round((totalStars / maxPossibleStars) * 100);

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

  return (
    <div className="level-select">
      <div className="level-select-header">
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <h2>选择关卡</h2>
          <button className="btn-tutorial" onClick={() => setShowTutorial(true)}>
            ❓ 游戏说明
          </button>
        </div>
        <div className="progress-summary">
          <div className="progress-item">
            <span className="progress-label">通关进度</span>
            <span className="progress-value">
              {clearedCount}/{totalLevels} ({progressPct}%)
            </span>
            <div className="progress-bar">
              <div
                className="progress-bar-fill cleared"
                style={{ width: progressPct + "%" }}
              />
            </div>
          </div>
          <div className="progress-item">
            <span className="progress-label">星星收集</span>
            <span className="progress-value stars">
              ★ {totalStars}/{maxPossibleStars} ({starsPct}%)
            </span>
            <div className="progress-bar">
              <div
                className="progress-bar-fill stars"
                style={{ width: starsPct + "%" }}
              />
            </div>
          </div>
        </div>
      </div>
      <div className="level-grid">
        {levels.map((lv) => {
          const unlocked = isUnlocked(lv.id, progress);
          const stars = getStars(lv.id, progress);
          const cleared = progress[lv.id]?.cleared;
          return (
            <button
              key={lv.id}
              className={
                "level-card" +
                (unlocked ? " unlocked" : " locked") +
                (cleared ? " cleared" : "")
              }
              disabled={!unlocked}
              onClick={() => unlocked && onSelect(lv.id)}
            >
              <span className="level-num">{lv.id}</span>
              <span className="level-name">{unlocked ? lv.name : "🔒"}</span>
              {StarRow(stars)}
              {cleared && <span className="badge-cleared">已通关</span>}
            </button>
          );
        })}
      </div>
      {showTutorial && (
        <Tutorial
          steps={tutorialSteps}
          onClose={() => setShowTutorial(false)}
        />
      )}
    </div>
  );
}
