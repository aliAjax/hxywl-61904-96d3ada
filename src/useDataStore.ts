import { useState, useEffect, useCallback, useRef } from "react";
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

function needsNotice(recovery: RecoveryAction): boolean {
  return recovery.type !== "none" && recovery.type !== "firstVisit";
}

export function useDataStore(): UseDataStoreResult {
  const [loadResult, setLoadResult] = useState<LoadResult | null>(null);
  const [showRecoveryNotice, setShowRecoveryNotice] = useState(false);
  const [isReady, setIsReady] = useState(false);

  const mountedRef = useRef(false);
  const dismissedRef = useRef(false);

  const loadData = useCallback((): LoadResult => {
    const result = dataStore.load();

    setLoadResult(result);
    setIsReady(true);

    if (needsNotice(result.recovery) && !dismissedRef.current) {
      setShowRecoveryNotice(true);
    }

    return result;
  }, []);

  useEffect(() => {
    if (mountedRef.current) return;
    mountedRef.current = true;
    loadData();

    const handleStoreEvent = (event: DataStoreEvent) => {
      if (event.type === "dataSaved" || event.type === "dataReset") {
        setLoadResult((prev) =>
          prev
            ? { ...prev, data: event.data! }
            : null
        );
      }
      if (
        (event.type === "recoveryPerformed" || event.type === "migrationPerformed") &&
        !dismissedRef.current
      ) {
        setShowRecoveryNotice(true);
      }
    };

    return dataStore.addListener(handleStoreEvent);
  }, [loadData]);

  const dismissRecoveryNotice = useCallback(() => {
    setShowRecoveryNotice(false);
    dismissedRef.current = true;
  }, []);

  const resetAllData = useCallback(() => {
    const confirmed = window.confirm(
      "确定要重置所有游戏数据吗？\n\n这将清除您的所有通关记录、星级评价和自定义关卡，且无法恢复。"
    );
    if (confirmed) {
      dataStore.reset();
      dismissedRef.current = false;
      const result = dataStore.forceReload();
      setLoadResult(result);
      setShowRecoveryNotice(false);
    }
  }, []);

  const refreshData = useCallback(() => {
    const result = dataStore.forceReload();
    setLoadResult(result);
    if (needsNotice(result.recovery) && !dismissedRef.current) {
      setShowRecoveryNotice(true);
    }
  }, []);

  const data = loadResult?.data ?? {
    version: 2,
    meta: { createdAt: Date.now(), updatedAt: Date.now() },
    progress: {},
    customLevels: [] as LevelDef[],
    tutorialCompleted: false,
  };

  const recovery = loadResult?.recovery ?? { type: "firstVisit" as const };
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
