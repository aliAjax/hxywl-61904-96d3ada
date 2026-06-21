import { useState, useEffect, useCallback } from "react";
import {
  dataStore,
  GameData,
  RecoveryAction,
  DataStoreEvent,
  LoadResult,
} from "./dataStore";
import { LevelDef } from "./levels";

export interface UseDataStoreResult {
  data: GameData;
  recovery: RecoveryAction;
  recoveryMessage: string;
  showRecoveryNotice: boolean;
  dismissRecoveryNotice: () => void;
  resetAllData: () => void;
  refreshData: () => void;
  isReady: boolean;
}

export function useDataStore(): UseDataStoreResult {
  const [loadResult, setLoadResult] = useState<LoadResult | null>(null);
  const [showRecoveryNotice, setShowRecoveryNotice] = useState(false);
  const [isReady, setIsReady] = useState(false);

  const loadData = useCallback(() => {
    try {
      const result = dataStore.load();
      setLoadResult(result);
      if (result.recovery.type !== "none") {
        setShowRecoveryNotice(true);
      }
      setIsReady(true);
      return result;
    } catch {
      const fallbackData = dataStore.reset();
      const recovery: RecoveryAction = { type: "fallback" };
      setLoadResult({ data: fallbackData, recovery });
      setShowRecoveryNotice(true);
      setIsReady(true);
      return { data: fallbackData, recovery };
    }
  }, []);

  useEffect(() => {
    loadData();

    const handleStoreEvent = (event: DataStoreEvent) => {
      if (event.type === "dataSaved" || event.type === "dataReset") {
        setLoadResult((prev) =>
          prev
            ? { ...prev, data: event.data! }
            : null
        );
      }
      if (event.type === "recoveryPerformed" || event.type === "migrationPerformed") {
        setShowRecoveryNotice(true);
      }
    };

    return dataStore.addListener(handleStoreEvent);
  }, [loadData]);

  const dismissRecoveryNotice = useCallback(() => {
    setShowRecoveryNotice(false);
  }, []);

  const resetAllData = useCallback(() => {
    const confirmed = window.confirm(
      "确定要重置所有游戏数据吗？\n\n这将清除您的所有通关记录、星级评价和自定义关卡，且无法恢复。"
    );
    if (confirmed) {
      dataStore.reset();
      loadData();
    }
  }, [loadData]);

  const refreshData = useCallback(() => {
    loadData();
  }, [loadData]);

  const data = loadResult?.data ?? {
    version: 2,
    meta: { createdAt: Date.now(), updatedAt: Date.now() },
    progress: {},
    customLevels: [] as LevelDef[],
    tutorialCompleted: false,
  };

  const recovery = loadResult?.recovery ?? { type: "none" };
  const recoveryMessage = dataStore.getRecoveryMessage(recovery);

  return {
    data,
    recovery,
    recoveryMessage,
    showRecoveryNotice,
    dismissRecoveryNotice,
    resetAllData,
    refreshData,
    isReady,
  };
}
