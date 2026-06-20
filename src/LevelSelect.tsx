import { useState, useMemo } from "react";
import { levels, LevelDef } from "./levels";
import { Progress, isUnlocked, getStars } from "./progress";
import Tutorial, { TutorialStep } from "./Tutorial";

type FilterType = "all" | "notCleared" | "cleared" | "notFullStars" | "custom";
type SortType = "id" | "stars";

interface Props {
  progress: Progress;
  onSelect: (levelId: number) => void;
  onCreateLevel: () => void;
  onEditLevel: (levelId: number) => void;
  onDeleteLevel: (levelId: number) => void;
  customLevels: LevelDef[];
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

export default function LevelSelect({ progress, onSelect, onCreateLevel, onEditLevel, onDeleteLevel, customLevels }: Props) {
  const totalLevels = levels.length + customLevels.length;
  const [showTutorial, setShowTutorial] = useState(false);
  const [hoveredLevel, setHoveredLevel] = useState<LevelDef | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<number | null>(null);
  const [filter, setFilter] = useState<FilterType>("all");
  const [sort, setSort] = useState<SortType>("id");

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
  const progressPct = Math.round((clearedCount / levels.length) * 100);
  const starsPct = Math.round((totalStars / (levels.length * 3)) * 100);

  const allLevels = useMemo(() => {
    return [
      ...levels.map((lv) => ({ ...lv, isCustom: false as const })),
      ...customLevels.map((lv) => ({ ...lv, isCustom: true as const })),
    ];
  }, [customLevels]);

  const filteredLevels = useMemo(() => {
    let result = [...allLevels];

    switch (filter) {
      case "notCleared":
        result = result.filter((lv) => !progress[lv.id]?.cleared);
        break;
      case "cleared":
        result = result.filter((lv) => progress[lv.id]?.cleared);
        break;
      case "notFullStars":
        result = result.filter((lv) => {
          const stars = getStars(lv.id, progress);
          const cleared = progress[lv.id]?.cleared;
          return !cleared || stars < 3;
        });
        break;
      case "custom":
        result = result.filter((lv) => lv.isCustom);
        break;
      case "all":
      default:
        break;
    }

    result.sort((a, b) => {
      if (sort === "id") {
        return a.id - b.id;
      } else {
        const starsA = getStars(a.id, progress);
        const starsB = getStars(b.id, progress);
        if (starsB !== starsA) return starsB - starsA;
        return a.id - b.id;
      }
    });

    return result;
  }, [allLevels, filter, sort, progress]);

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

  return (
    <div className="level-select">
      <div className="level-select-header">
        <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
          <h2>选择关卡</h2>
          <button className="btn-tutorial" onClick={() => setShowTutorial(true)}>
            ❓ 游戏说明
          </button>
          <button className="btn-create-level" onClick={onCreateLevel}>
            ➕ 新建关卡
          </button>
        </div>
        <div className="progress-summary">
          <div className="progress-item">
            <span className="progress-label">通关进度</span>
            <span className="progress-value">
              {clearedCount}/{levels.length} ({progressPct}%)
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
              ★ {totalStars}/{levels.length * 3} ({starsPct}%)
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

      <div className="filter-sort-bar">
        <div className="filter-group">
          <span className="filter-label">筛选：</span>
          <div className="filter-chips">
            {[
              { key: "all", label: "全部" },
              { key: "notCleared", label: "未通关" },
              { key: "cleared", label: "已通关" },
              { key: "notFullStars", label: "未满星" },
              { key: "custom", label: "自定义" },
            ].map((item) => (
              <button
                key={item.key}
                className={"filter-chip" + (filter === item.key ? " active" : "")}
                onClick={() => setFilter(item.key as FilterType)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
        <div className="sort-group">
          <span className="filter-label">排序：</span>
          <div className="filter-chips">
            {[
              { key: "id", label: "关卡编号" },
              { key: "stars", label: "获得星级" },
            ].map((item) => (
              <button
                key={item.key}
                className={"filter-chip" + (sort === item.key ? " active" : "")}
                onClick={() => setSort(item.key as SortType)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="level-section">
        {filteredLevels.length === 0 ? (
          <div className="empty-filter-result">
            <p>没有符合条件的关卡</p>
            <button className="btn-create-level-large" onClick={() => setFilter("all")}>
              🔄 查看全部关卡
            </button>
          </div>
        ) : (
          <div className="level-grid">
            {filteredLevels.map((lv) => {
              if (lv.isCustom) {
                const stars = getStars(lv.id, progress);
                const cleared = progress[lv.id]?.cleared;
                return (
                  <div
                    key={lv.id}
                    className={
                      "level-card custom unlocked" +
                      (cleared ? " cleared" : "")
                    }
                  >
                    <span className="custom-badge">自定义</span>
                    <span className="level-num">C{lv.id - 1000 + 1}</span>
                    <span className="level-name">{lv.name}</span>
                    {StarRow(stars)}
                    {cleared && <span className="badge-cleared">已通关</span>}
                    <div className="custom-level-actions">
                      <button
                        className="btn-play-small"
                        onClick={() => onSelect(lv.id)}
                      >
                        ▶ 试玩
                      </button>
                      <button
                        className="btn-edit-small"
                        onClick={() => onEditLevel(lv.id)}
                      >
                        ✏ 编辑
                      </button>
                      <button
                        className="btn-delete-small"
                        onClick={() => setShowDeleteConfirm(lv.id)}
                      >
                        🗑
                      </button>
                    </div>
                  </div>
                );
              } else {
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
                    onMouseEnter={() => unlocked && setHoveredLevel(lv)}
                    onMouseLeave={() => setHoveredLevel(null)}
                  >
                    <span className="level-num">{lv.id}</span>
                    <span className="level-name">{unlocked ? lv.name : "🔒"}</span>
                    {StarRow(stars)}
                    {cleared && <span className="badge-cleared">已通关</span>}
                    {unlocked && hoveredLevel?.id === lv.id && (
                      <div className="level-rules-tooltip">
                        <div className="tooltip-title">星级规则</div>
                        {lv.starRules.stars.map((rule, i) => (
                          <div key={i} className="tooltip-rule">
                            <span className={"tooltip-star " + (i < stars ? "filled" : "empty")}>★</span>
                            <span className="tooltip-desc">{rule.description}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </button>
                );
              }
            })}
            {filter !== "custom" && (
              <button
                className="level-card add-card"
                onClick={onCreateLevel}
              >
                <span className="add-icon">➕</span>
                <span className="add-text">新建关卡</span>
              </button>
            )}
          </div>
        )}
      </div>

      {showDeleteConfirm !== null && (
        <div className="delete-confirm-overlay" onClick={() => setShowDeleteConfirm(null)}>
          <div className="delete-confirm-card" onClick={(e) => e.stopPropagation()}>
            <h3>确认删除？</h3>
            <p>删除后无法恢复，确定要删除这个自定义关卡吗？</p>
            <div className="delete-confirm-actions">
              <button
                className="btn-cancel-delete"
                onClick={() => setShowDeleteConfirm(null)}
              >
                取消
              </button>
              <button
                className="btn-confirm-delete"
                onClick={() => {
                  if (showDeleteConfirm !== null) {
                    onDeleteLevel(showDeleteConfirm);
                    setShowDeleteConfirm(null);
                  }
                }}
              >
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}

      {showTutorial && (
        <Tutorial
          steps={tutorialSteps}
          onClose={() => setShowTutorial(false)}
        />
      )}
    </div>
  );
}
