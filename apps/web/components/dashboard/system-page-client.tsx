/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { DashboardPageFrame } from "@/components/dashboard/dashboard-page-frame";
import { useDashboard } from "@/components/dashboard/dashboard-provider";
import { SystemPanel } from "@/components/dashboard/system-panel";
import { getSystemStatus, type SystemStatus } from "@/lib/api";

export function SystemPageClient() {
  const { kbs, kbError } = useDashboard();
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshSystemStatus = useCallback(async (deep = false) => {
    setLoading(true);
    try {
      const data = await getSystemStatus(deep);
      setSystemStatus(data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (kbError) {
      setError(kbError);
    }
  }, [kbError]);

  useEffect(() => {
    refreshSystemStatus().catch((err: Error) => setError(err.message));
  }, [refreshSystemStatus]);

  async function onRefreshStatus() {
    setBusy("system-status");
    try {
      await refreshSystemStatus(false);
      toast.success("本地状态已刷新", { description: "未调用模型服务" });
    } catch (err) {
      const message = err instanceof Error ? err.message : "系统状态刷新失败";
      toast.error("系统状态刷新失败", { description: message });
    } finally {
      setBusy(null);
    }
  }

  async function onTestModels() {
    setBusy("model-status");
    try {
      await refreshSystemStatus(true);
      toast.success("模型服务测试完成", { description: "已产生少量模型调用" });
    } catch (err) {
      const message = err instanceof Error ? err.message : "模型服务测试失败";
      toast.error("模型服务测试失败", { description: message });
    } finally {
      setBusy(null);
    }
  }

  return (
    <DashboardPageFrame kbCount={kbs.length} error={error}>
      <SystemPanel
        systemStatus={systemStatus}
        busy={busy}
        loading={loading}
        onRefreshStatus={() => void onRefreshStatus()}
        onTestModels={() => void onTestModels()}
      />
    </DashboardPageFrame>
  );
}
