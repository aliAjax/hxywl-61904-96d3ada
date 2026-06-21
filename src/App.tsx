import { useState, useCallback, useRef } from "react";
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
  exportLevel,
  importLevel,
  ImportResult,
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
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const handleSaveLevel = useCallback((_savedLevel: LevelDef) => {
    refreshCustomLevels();
  }, [refreshCustomLevels]);

  const handleDeleteLevel = useCallback((levelId: number) => {
    deleteCustomLevel(levelId);
    refreshCustomLevels();
  }, [refreshCustomLevels]);

  const handleExportLevel = useCallback((level: LevelDef) => {
    exportLevel(level);
  }, []);

  const handleImportLevel = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileSelected = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const content = evt.target?.result;
      if (typeof content === "string") {
        const result = importLevel(content);
        setImportResult(result);
        if (result.success) {
          refreshCustomLevels();
        }
      }
    };
    reader.onerror = () => {
      setImportResult({ success: false, error: "文件读取失败" });
    };
    reader.readAsText(file);
    e.target.value = "";
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
          onExportLevel={handleExportLevel}
          onImportLevel={handleImportLevel}
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
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        style={{ display: "none" }}
        onChange={handleFileSelected}
      />

      {importResult && (
        <div className="import-result-overlay" onClick={() => setImportResult(null)}>
          <div className="import-result-card" onClick={(e) => e.stopPropagation()}>
            <h3>{importResult.success ? "✅ 导入成功" : "❌ 导入失败"}</h3>
            {importResult.success && importResult.level && (
              <p>关卡「{importResult.level.name}」已添加到自定义关卡列表</p>
            )}
            {!importResult.success && importResult.error && (
              <p className="import-error-text">{importResult.error}</p>
            )}
            <button
              className="btn-import-result-ok"
              onClick={() => setImportResult(null)}
            >
              确定
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

export default App;
