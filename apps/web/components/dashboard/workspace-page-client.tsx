"use client";

import { useCallback, useRef, useState, type FormEvent } from "react";
import { flushSync } from "react-dom";
import { toast } from "sonner";

import { ChatPanel, type ChatTurn } from "@/components/dashboard/chat-panel";
import { DashboardPageFrame } from "@/components/dashboard/dashboard-page-frame";
import { useDocumentControls } from "@/components/dashboard/use-document-controls";
import { useKnowledgeBaseControls } from "@/components/dashboard/use-knowledge-base-controls";
import { WorkspaceContextPanel } from "@/components/dashboard/workspace-context-panel";
import { Button } from "@/components/ui/button";
import { askQuestionStream, isAbortError, listQueryLogs, updateQueryFeedback } from "@/lib/api";
import { cn } from "@/lib/utils";

export function WorkspacePageClient() {
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [expandedSource, setExpandedSource] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mobileTab, setMobileTab] = useState<"chat" | "context">("chat");
  const queryAbortRef = useRef<AbortController | null>(null);

  const kb = useKnowledgeBaseControls({
    setError,
    onDeleted: () => {
      queryAbortRef.current?.abort();
      queryAbortRef.current = null;
      setTurns([]);
    },
  });

  const docs = useDocumentControls({
    selectedKbId: kb.selectedKbId,
    refreshKbs: kb.refreshKbs,
    setError,
  });

  const refreshQueryLogs = useCallback(async (kbId: string) => {
    if (!kbId) return;
    await listQueryLogs(kbId);
  }, []);

  function onCancelQuery() {
    queryAbortRef.current?.abort();
  }

  async function onAsk(event: FormEvent) {
    event.preventDefault();
    const readyDocs = docs.docs.filter((doc) => doc.status === "ready");
    if (!kb.selectedKbId || !question.trim() || busy === "query" || !readyDocs.length) return;

    const turnId = crypto.randomUUID();
    const currentQuestion = question.trim();
    const controller = new AbortController();
    queryAbortRef.current?.abort();
    queryAbortRef.current = controller;

    setQuestion("");
    setTurns((prev) => [{ id: turnId, question: currentQuestion }, ...prev]);
    setBusy("query");
    setError(null);

    try {
      await askQuestionStream(
        kb.selectedKbId,
        currentQuestion,
        {
          onSources: (sources) => {
            setTurns((prev) =>
              prev.map((turn) =>
                turn.id === turnId
                  ? { ...turn, isComplete: false, result: { answer: "", sources, model: "qwen-plus" } }
                  : turn,
              ),
            );
          },
          onToken: (token) => {
            setTurns((prev) =>
              prev.map((turn) =>
                turn.id === turnId
                  ? {
                      ...turn,
                      result: {
                        answer: `${turn.result?.answer ?? ""}${token}`,
                        sources: turn.result?.sources ?? [],
                        model: turn.result?.model ?? "qwen-plus",
                      },
                    }
                  : turn,
              ),
            );
          },
          onDone: (result) => {
            setTurns((prev) =>
              prev.map((turn) => (turn.id === turnId ? { ...turn, isComplete: true, result } : turn)),
            );
          },
          onError: (message) => {
            throw new Error(message);
          },
        },
        { signal: controller.signal },
      );
      await refreshQueryLogs(kb.selectedKbId);
    } catch (err) {
      if (isAbortError(err) || controller.signal.aborted) {
        setTurns((prev) =>
          prev.map((turn) =>
            turn.id === turnId
              ? {
                  ...turn,
                  isComplete: true,
                  cancelled: true,
                  result: turn.result ?? {
                    answer: "",
                    sources: [],
                    model: "qwen-plus",
                  },
                }
              : turn,
          ),
        );
        toast.message("已取消本次生成");
        return;
      }

      const message = err instanceof Error ? err.message : "问答失败";
      setTurns((prev) =>
        prev.map((turn) => (turn.id === turnId ? { ...turn, isComplete: true, error: message } : turn)),
      );
      setError(message);
      toast.error("问答失败", { description: message });
    } finally {
      if (queryAbortRef.current === controller) {
        queryAbortRef.current = null;
      }
      setBusy(null);
    }
  }

  async function onFeedback(logId: string | null | undefined, feedback: "helpful" | "not_helpful") {
    if (!logId) {
      toast.error("暂无可记录的问答日志");
      return;
    }
    setBusy(`feedback-${logId}`);
    try {
      const record = await updateQueryFeedback(logId, feedback);
      setTurns((items) =>
        items.map((turn) =>
          turn.result?.query_log_id === logId
            ? { ...turn, result: { ...turn.result, feedback: record.feedback } }
            : turn,
        ),
      );
      toast.success(feedback === "helpful" ? "已标记为有帮助" : "已标记为没帮助");
    } catch (err) {
      const message = err instanceof Error ? err.message : "反馈保存失败";
      toast.error("反馈保存失败", { description: message });
    } finally {
      setBusy(null);
    }
  }

  return (
    <DashboardPageFrame kbCount={kb.kbs.length} docCount={docs.docs.length} turnCount={turns.length} error={error}>
      <div className="mb-3 grid grid-cols-2 gap-2 xl:hidden">
        <Button
          type="button"
          variant={mobileTab === "chat" ? "default" : "outline"}
          className={cn("min-h-11 rounded-none font-mono", mobileTab === "chat" && "shadow-[3px_3px_0_rgba(67,45,27,0.12)]")}
          onClick={() => setMobileTab("chat")}
        >
          对话
        </Button>
        <Button
          type="button"
          variant={mobileTab === "context" ? "default" : "outline"}
          className={cn("min-h-11 rounded-none font-mono", mobileTab === "context" && "shadow-[3px_3px_0_rgba(67,45,27,0.12)]")}
          onClick={() => setMobileTab("context")}
        >
          上下文
        </Button>
      </div>

      <div className="grid flex-1 gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,0.75fr)]">
        <div className={cn(mobileTab !== "chat" && "hidden xl:block")}>
          <ChatPanel
            selectedKb={kb.selectedKb}
            selectedKbId={kb.selectedKbId}
            kbCount={kb.kbs.length}
            docCount={docs.docs.length}
            readyDocCount={docs.docs.filter((doc) => doc.status === "ready").length}
            processingDocCount={docs.docs.filter((doc) => doc.status === "processing").length}
            loadingDocs={docs.loading}
            question={question}
            turns={turns}
            busy={busy}
            expandedSource={expandedSource}
            onQuestionChange={setQuestion}
            onAsk={onAsk}
            onCancel={onCancelQuery}
            onFeedback={(logId, feedback) => void onFeedback(logId, feedback)}
            onToggleSource={setExpandedSource}
          />
        </div>

        <div className={cn(mobileTab !== "context" && "hidden xl:block")}>
          <WorkspaceContextPanel
            kbs={kb.kbs}
            selectedKb={kb.selectedKb}
            selectedKbId={kb.selectedKbId}
            docs={docs.docs}
            loadingDocs={docs.loading}
            onSelectKb={(nextKbId) => {
              if (nextKbId !== kb.selectedKbId) {
                flushSync(() => {
                  docs.beginKbSwitch(nextKbId);
                  setTurns([]);
                  setExpandedSource(null);
                });
              }
              kb.setSelectedKbId(nextKbId);
              setMobileTab("chat");
            }}
          />
        </div>
      </div>
    </DashboardPageFrame>
  );
}
