import { levels } from "./levels";
import { Progress, isUnlocked, getStars } from "./progress";

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

  return (
    <div className="level-select">
      <div className="level-select-header">
        <h2>选择关卡</h2>
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
    </div>
  );
}
