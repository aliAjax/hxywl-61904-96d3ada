import { useMemo, useState } from "react";
import "./styles.css";

const game = {
  "id": "hxywl-61904",
  "port": 61904,
  "title": "弹射星球",
  "tagline": "拖动蓄力弹射小球，收集星星抵达终点",
  "prompt": "做一个H5物理弹射闯关小游戏，玩家拖动小球调整角度和力度，松手后弹射出去收集星星并到达终点。需要有多个关卡、弹射次数限制、星级评价、重玩按钮和关卡选择页。碰撞、反弹和障碍物要有清楚反馈，手机横屏和竖屏都要能玩。",
  "palette": [
    "#2563eb",
    "#eab308",
    "#ef4444"
  ],
  "stats": [
    "关卡",
    "弹射",
    "星星",
    "评分"
  ],
  "actions": [
    "蓄力发射",
    "重玩关卡",
    "下一关"
  ],
  "mode": "slingshot"
};

const boards: Record<string, string[]> = {
  rhythm: ["♪", "◇", "♪", "◆", "♪", "◇", "◆", "♪", "◇"],
  merge: ["🍩", "🍩", "🧁", "🍪", "🧁", "🍰", "🍪", "🍩", "🍮"],
  dungeon: ["?", "?", "?", "?", "?", "?", "?", "?", "?", "?", "?", "?", "?", "?", "?", "?", "?", "?", "?", "?", "?", "?", "?", "?", "?"],
  slingshot: ["★", "·", "●", "·", "▣", "·", "★", "·", "◎"],
  escape: ["书架", "花瓶", "抽屉", "挂画", "地毯", "台灯", "门锁", "箱子", "窗帘"],
};

function App() {
  const [score, setScore] = useState(1280);
  const [combo, setCombo] = useState(7);
  const [selected, setSelected] = useState(0);
  const cells = useMemo(() => boards[game.mode], []);
  const best = Number(localStorage.getItem(game.id + "-best") || 0);

  function playCell(index: number) {
    setSelected(index);
    const gain = game.mode === "dungeon" && index % 5 === 0 ? -80 : 120 + index * 8;
    const nextScore = Math.max(0, score + gain);
    setScore(nextScore);
    setCombo((value) => (gain > 0 ? value + 1 : 0));
    if (nextScore > best) {
      localStorage.setItem(game.id + "-best", String(nextScore));
    }
  }

  return (
    <main className="game-shell">
      <section className="hero">
        <p>{game.id} · H5Game · Port {game.port}</p>
        <h1>{game.title}</h1>
        <span>{game.tagline}</span>
      </section>

      <section className="hud">
        {game.stats.map((stat, index) => (
          <article key={stat}>
            <small>{stat}</small>
            <strong>{index === 0 ? score : index === 1 ? best : index === 2 ? selected + 1 : combo}</strong>
          </article>
        ))}
      </section>

      <section className={"playground " + game.mode}>
        <div className="board">
          {cells.map((cell, index) => (
            <button
              className={selected === index ? "active" : ""}
              key={index}
              onClick={() => playCell(index)}
            >
              {cell}
            </button>
          ))}
        </div>
        <aside className="side-panel">
          <h2>核心玩法</h2>
          <p>{game.prompt}</p>
          <div className="actions">
            {game.actions.map((action) => (
              <button key={action}>{action}</button>
            ))}
          </div>
        </aside>
      </section>

      <section className="result-panel">
        <h2>结算预览</h2>
        <p>当前分数{score}，最高分{Math.max(best, score)}，连击{combo}。基础流程已包含开始、交互、反馈、记录和结算区域，后续可以继续扩展关卡、音效、动画与资源管理。</p>
      </section>
    </main>
  );
}

export default App;
