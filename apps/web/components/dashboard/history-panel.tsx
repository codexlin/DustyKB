"use client";

import { useState, type SyntheticEvent } from "react";
import { Archive, ChevronDown } from "lucide-react";

import { HighlightText, SourceMatchNote } from "@/components/highlight-text";
import { MarkdownAnswer } from "@/components/markdown-answer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { EmptyState, formatDateTime, HistoryListSkeleton, QualityPanel } from "@/components/dashboard/shared";
import type { QueryLogRecord } from "@/lib/api";

function answerPreview(text: string, max = 96) {
  const compact = text.replace(/\s+/g, " ").trim();
  if (compact.length <= max) return compact;
  return `${compact.slice(0, max)}…`;
}

export function HistoryPanel({
  queryLogs,
  selectedKbId,
  busy,
  loading = false,
  expandedSource,
  onRefresh,
  onFeedback,
  onToggleSource,
}: {
  queryLogs: QueryLogRecord[];
  selectedKbId: string;
  busy: string | null;
  loading?: boolean;
  expandedSource: string | null;
  onRefresh: (kbId: string) => void;
  onFeedback: (logId: string | null | undefined, feedback: "helpful" | "not_helpful") => void;
  onToggleSource: (sourceId: string | null) => void;
}) {
  const [openLogId, setOpenLogId] = useState<string | null>(null);

  function onToggleLog(logId: string, event: SyntheticEvent<HTMLDetailsElement>) {
    const nextOpen = event.currentTarget.open;
    setOpenLogId(nextOpen ? logId : openLogId === logId ? null : openLogId);
  }

  return (
    <Card className="flex min-h-[calc(100vh-15rem)] flex-col border-2 border-primary/40 bg-card/90 shadow-[7px_7px_0_rgba(67,45,27,0.12)] backdrop-blur">
      <CardHeader>
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Archive className="size-4 text-primary" /> 档案
            </CardTitle>
            <CardDescription>
              翻阅当前文库里问过的问题与答案。
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Badge variant="outline" className="rounded-none font-mono">
              {queryLogs.length} 条
            </Badge>
            <Button
              type="button"
              variant="outline"
              className="rounded-none font-mono uppercase tracking-[0.14em]"
              disabled={!selectedKbId}
              onClick={() => onRefresh(selectedKbId)}
            >
              刷新
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="min-h-0 flex-1">
        <ScrollArea className="h-full pr-3">
          <div className="grid items-start gap-3 md:grid-cols-2">
            {loading ? <div className="md:col-span-2"><HistoryListSkeleton /></div> : null}
            {queryLogs.map((log) => (
              <Card
                key={log.id}
                className="h-fit self-start border border-primary/25 bg-background/70 shadow-[4px_4px_0_rgba(67,45,27,0.08)]"
                size="sm"
              >
                <details
                  className="group"
                  open={openLogId === log.id}
                  onToggle={(event) => onToggleLog(log.id, event)}
                >
                  <summary className="flex cursor-pointer list-none items-start gap-2 px-4 py-3 [&::-webkit-details-marker]:hidden">
                    <ChevronDown className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-start justify-between gap-3">
                        <p className="truncate text-sm font-medium">{log.question}</p>
                        <Badge variant="secondary" className="shrink-0 rounded-none font-mono">
                          {log.sources.length} src
                        </Badge>
                      </div>
                      <p className="font-mono text-xs text-muted-foreground">
                        {formatDateTime(log.created_at)} · {Math.round(log.latency_ms)}ms · {log.model}
                      </p>
                      <p className="line-clamp-2 font-mono text-xs leading-5 text-muted-foreground group-open:hidden">
                        {answerPreview(log.answer)}
                      </p>
                    </div>
                  </summary>
                  <CardContent className="space-y-3 border-t border-primary/15 pt-3">
                    <MarkdownAnswer content={log.answer} enhanced />
                    <QualityPanel
                      latencyMs={log.latency_ms}
                      model={log.model}
                      sources={log.sources}
                      feedback={log.feedback}
                      busy={busy === `feedback-${log.id}`}
                      compact
                      onFeedback={(feedback) => onFeedback(log.id, feedback)}
                    />
                    {log.sources.length ? (
                      <details className="group/sources border border-primary/25 bg-card/60">
                        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-2 py-2 [&::-webkit-details-marker]:hidden">
                          <span className="flex items-center gap-2 font-mono text-xs text-muted-foreground">
                            <ChevronDown className="size-3.5 transition-transform group-open/sources:rotate-180" />
                            引用来源
                          </span>
                          <Badge variant="outline" className="rounded-none font-mono">
                            {log.sources.length}
                          </Badge>
                        </summary>
                        <div className="space-y-2 border-t border-primary/15 p-2">
                          {log.sources.map((source, index) => {
                            const sourceId = `history-${log.id}-${source.doc_id}-${source.chunk_index}-${index}`;
                            const isOpen = expandedSource === sourceId;
                            return (
                              <div key={sourceId} className="border border-primary/25 bg-background/70 p-2">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  className="h-auto w-full justify-between gap-2 p-1 text-left"
                                  onClick={() => onToggleSource(isOpen ? null : sourceId)}
                                >
                                  <span className="min-w-0 truncate text-xs">
                                    {source.filename}
                                    {source.page ? ` · 第 ${source.page} 页` : ` · 片段 ${source.chunk_index + 1}`}
                                  </span>
                                  <Badge variant="outline" className="rounded-none font-mono">
                                    {source.score.toFixed(3)}
                                  </Badge>
                                </Button>
                                {isOpen ? (
                                  <div className="mt-2 space-y-2 border-l-4 border-primary/30 bg-muted/60 p-2">
                                    <SourceMatchNote text={source.text} question={log.question} score={source.score} />
                                    <p className="whitespace-pre-wrap font-mono text-xs leading-5 text-muted-foreground">
                                      <HighlightText text={source.text} question={log.question} />
                                    </p>
                                  </div>
                                ) : null}
                              </div>
                            );
                          })}
                        </div>
                      </details>
                    ) : null}
                  </CardContent>
                </details>
              </Card>
            ))}
            {!loading && !queryLogs.length ? <EmptyState text="当前文库还没有问答档案。" /> : null}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
