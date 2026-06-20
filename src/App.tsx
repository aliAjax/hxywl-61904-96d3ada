import { useState, useCallback } from "react";
import "./styles.css";
import { levels, LevelDef } from "./levels";
import { Progress, loadProgress, updateLevelResult } from "./progress";
import LevelSelect from "./LevelSelect";
import Game from "./Game";
import LevelEditor from "./LevelEditor";
import {
  loadCustomLevels,
  getNextCustomId,
  createEmptyLevel,
  deleteCustomLevel,
} from "./customLevels";

const GAME_ID = "hxywl-61904";

type View =
  | { kind: "select" }
  | { kind: "play"; levelId: number }
  | { kind: "editor"; levelId?: number; isNew: boolean };

function App() {
  const [progress, setProgress] = useState<Progress>(loadProgress);
  const [view, setView] = useState<View>({ kind: "select" });
  const [customLevels, setCustomLevels] = useState<LevelDef[]>(loadCustomLevels);

  const allLevels = [...levels, ...customLevels];

  const refreshCustomLevels = useCallback(() => {
    setCustomLevels(loadCustomLevels());
  }, []);

  const handleSelect = useCallback((levelId: number) => {
    setView({ kind: "play", levelId });
  }, []);

  const handleBack = useCallback(() => {
    setView({ kind: "select" });
    refreshCustomLevels();
  }, [refreshCustomLevels]);

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

  const handleCreateLevel = useCallback(() => {
    setView({ kind: "editor", isNew: true });
  }, []);

  const handleEditLevel = useCallback((levelId: number) => {
    setView({ kind: "editor", levelId, isNew: false });
  }, []);

  const handleSaveLevel = useCallback(() => {
    refreshCustomLevels();
  }, [refreshCustomLevels]);

  const handleDeleteLevel = useCallback((levelId: number) => {
    deleteCustomLevel(levelId);
    refreshCustomLevels();
  }, [refreshCustomLevels]);

  const currentLevel = allLevels.find(
    (l) => l.id === (view.kind === "play" ? view.levelId : 0)
  );

  const editorLevel =
    view.kind === "editor"
      ? view.isNew
        ? createEmptyLevel(getNextCustomId())
        : customLevels.find((l) => l.id === view.levelId) || createEmptyLevel(getNextCustomId())
      : null;

  return (
    <main className="game-shell">
      <section className="hero">
        <p>{GAME_ID} · H5Game</p>
        <h1>弹射星球</h1>
        <span>拖动蓄力弹射小球，收集星星抵达终点</span>
      </section>

      {view.kind === "select" && (
        <LevelSelect
          progress={progress}
          onSelect={handleSelect}
          onCreateLevel={handleCreateLevel}
          onEditLevel={handleEditLevel}
          onDeleteLevel={handleDeleteLevel}
          customLevels={customLevels}
        />
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

      {view.kind === "editor" && editorLevel && (
        <LevelEditor
          key={view.isNew ? "new-" + getNextCustomId() : "edit-" + view.levelId}
          level={editorLevel}
          onBack={handleBack}
          onSave={handleSaveLevel}
          isNew={view.isNew}
        />
      )}
    </main>
  );
}

export default App;
