import { RecoveryAction } from "./dataStore";

interface DataRecoveryNoticeProps {
  recovery: RecoveryAction;
  message: string;
  onDismiss: () => void;
}

function getRecoveryIcon(recovery: RecoveryAction): string {
  switch (recovery.type) {
    case "migration":
      return "📦";
    case "recovery":
      return "🔄";
    case "fallback":
      if (recovery.reason === "storageUnavailable") return "🔒";
      return "⚠️";
    case "corrupted":
      return "❌";
    default:
      return "ℹ️";
  }
}

function getRecoveryTitle(recovery: RecoveryAction): string {
  switch (recovery.type) {
    case "migration":
      return "数据已迁移";
    case "recovery":
      return "数据已恢复";
    case "fallback":
      if (recovery.reason === "storageUnavailable") return "存储不可用";
      return "数据已重置";
    case "corrupted":
      return "数据损坏";
    default:
      return "提示";
  }
}

function getRecoveryType(recovery: RecoveryAction): "info" | "warning" | "error" {
  switch (recovery.type) {
    case "migration":
    case "recovery":
      return "info";
    case "fallback":
      if (recovery.reason === "storageUnavailable") return "warning";
      return "warning";
    case "corrupted":
      return "error";
    default:
      return "info";
  }
}

export default function DataRecoveryNotice({
  recovery,
  message,
  onDismiss,
}: DataRecoveryNoticeProps) {
  if (recovery.type === "none" || recovery.type === "firstVisit" || !message) {
    return null;
  }

  const type = getRecoveryType(recovery);
  const icon = getRecoveryIcon(recovery);
  const title = getRecoveryTitle(recovery);

  return (
    <div className={`data-recovery-notice ${type}`}>
      <div className="recovery-notice-icon">{icon}</div>
      <div className="recovery-notice-content">
        <div className="recovery-notice-title">{title}</div>
        <div className="recovery-notice-message">{message}</div>
      </div>
      <button
        className="recovery-notice-close"
        onClick={onDismiss}
        aria-label="关闭"
      >
        ×
      </button>
    </div>
  );
}
