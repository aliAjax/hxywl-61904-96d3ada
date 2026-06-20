import { useState, useCallback } from "react";
import "./styles.css";
import { levels } from "./levels";
import { Progress, loadProgress, updateLevelResult } from "./progress";
import LevelSelect from "./LevelSelect";
import Game from "./Game";

const GAME_ID = "hxywl-61904";

type View = { kind: "select" } | { kind: "play"; levelId: number };

function App() {
  const [progress, setProgress] = useState<Progress>(loadProgress);
  const [view, setView] = useState<View>({ kind: "select" });

  const handleSelect = useCallback((levelId: number) => {
    setView({ kind: "play", levelId });
  }, []);

  const handleBack = useCallback(() => {
    setView({ kind: "select" });
  }, []);

  const handleComplete = useCallback(
    (levelId: number, stars: number, cleared: boolean) => {
      setProgress((prev) => updateLevelResult(prev, levelId, stars, cleared));
    },
    []
  );

  const handleNext = useCallback(() => {
    setView((v) => {
      if (v.kind === "play") {
        const nextId = v.levelId + 1;
        if (levels.some((l) => l.id === nextId)) {
          return { kind: "play", levelId: nextId };
        }
      }
      return v;
    });
  }, []);

  const currentLevel = levels.find(
    (l) => l.id === (view.kind === "play" ? view.levelId : 0)
  );

  return (
    <main className="game-shell">
      <section className="hero">
        <p>{GAME_ID} · H5Game</p>
        <h1>弹射星球</h1>
        <span>拖动蓄力弹射小球，收集星星抵达终点</span>
      </section>

      {view.kind === "select" && (
        <LevelSelect progress={progress} onSelect={handleSelect} />
      )}

      {view.kind === "play" && currentLevel && (
        <Game
          key={currentLevel.id}
          level={currentLevel}
          progress={progress}
          onBack={handleBack}
          onComplete={handleComplete}
          onNext={handleNext}
        />
      )}
    </main>
  );
}

export default App;
