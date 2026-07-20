/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { DashboardPageFrame } from "@/components/dashboard/dashboard-page-frame";
import { useDashboard } from "@/components/dashboard/dashboard-provider";
import { HistoryPanel } from "@/components/dashboard/history-panel";
import { listQueryLogs, updateQueryFeedback, type QueryLogRecord } from "@/lib/api";

const queryLogsQueryKey = (kbId: string) => ["query-logs", kbId] as const;

export function HistoryPageClient() {
  const { kbs, selectedKbId, kbError } = useDashboard();
  const queryClient = useQueryClient();
  const [expandedSource, setExpandedSource] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const queryLogsQuery = useQuery({
    queryKey: queryLogsQueryKey(selectedKbId),
    queryFn: () => listQueryLogs(selectedKbId),
    enabled: Boolean(selectedKbId),
  });

  useEffect(() => {
    if (kbError) {
      setError(kbError);
    }
  }, [kbError]);

  useEffect(() => {
    setExpandedSource(null);
  }, [selectedKbId]);

  useEffect(() => {
    if (queryLogsQuery.error) {
      setError(queryLogsQuery.error.message);
    }
  }, [queryLogsQuery.error]);

  async function refreshQueryLogs(kbId: string) {
    if (!kbId) return;
    setExpandedSource(null);
    await queryClient.invalidateQueries({ queryKey: queryLogsQueryKey(kbId) });
    await queryClient.fetchQuery({
      queryKey: queryLogsQueryKey(kbId),
      queryFn: () => listQueryLogs(kbId),
    });
  }

  async function onFeedback(logId: string | null | undefined, feedback: "helpful" | "not_helpful") {
    if (!logId) {
      toast.error("暂无可记录的问答日志");
      return;
    }
    setBusy(`feedback-${logId}`);
    try {
      const record = await updateQueryFeedback(logId, feedback);
      queryClient.setQueryData<QueryLogRecord[]>(queryLogsQueryKey(selectedKbId), (items = []) =>
        items.map((item) => (item.id === logId ? { ...item, feedback: record.feedback, feedback_at: record.feedback_at } : item)),
      );
      toast.success(feedback === "helpful" ? "已标记为有帮助" : "已标记为没帮助");
    } catch (err) {
      const message = err instanceof Error ? err.message : "反馈保存失败";
      toast.error("反馈保存失败", { description: message });
    } finally {
      setBusy(null);
    }
  }

  const visibleQueryLogs = selectedKbId ? (queryLogsQuery.data ?? []) : [];

  return (
    <DashboardPageFrame kbCount={kbs.length} error={error}>
      <HistoryPanel
        queryLogs={visibleQueryLogs}
        selectedKbId={selectedKbId}
        busy={busy}
        loading={selectedKbId ? queryLogsQuery.isPending : false}
        expandedSource={expandedSource}
        onRefresh={(kbId) => void refreshQueryLogs(kbId)}
        onFeedback={(logId, feedback) => void onFeedback(logId, feedback)}
        onToggleSource={setExpandedSource}
      />
    </DashboardPageFrame>
  );
}
