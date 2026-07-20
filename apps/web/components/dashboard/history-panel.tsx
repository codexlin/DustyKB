"use client";

import { Archive } from "lucide-react";

import { HighlightText, SourceMatchNote } from "@/components/highlight-text";
import { MarkdownAnswer } from "@/components/markdown-answer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { EmptyState, formatDateTime, HistoryListSkeleton, QualityPanel } from "@/components/dashboard/shared";
import type { QueryLogRecord } from "@/lib/api";

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
  return (
    <Card className="flex min-h-[calc(100vh-15rem)] flex-col border-2 border-primary/40 bg-card/90 shadow-[7px_7px_0_rgba(67,45,27,0.12)] backdrop-blur">
      <CardHeader>
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Archive className="size-4 text-primary" /> 问答历史档案
            </CardTitle>
            <CardDescription>
              来自 PostgreSQL 的查询记录，按当前知识库归档。
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Badge variant="outline" className="rounded-none font-mono">
              {queryLogs.length} records
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
          <div className="grid gap-3 md:grid-cols-2">
            {loading ? <div className="md:col-span-2"><HistoryListSkeleton /></div> : null}
            {queryLogs.map((log) => (
              <Card
                key={log.id}
                className="border border-primary/25 bg-background/70 shadow-[4px_4px_0_rgba(67,45,27,0.08)]"
                size="sm"
              >
                <CardHeader>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <CardTitle className="truncate text-sm">{log.question}</CardTitle>
                      <CardDescription className="font-mono text-xs">
                        {formatDateTime(log.created_at)} · {Math.round(log.latency_ms)}ms · {log.model}
                      </CardDescription>
                    </div>
                    <Badge variant="secondary" className="shrink-0 rounded-none font-mono">
                      {log.sources.length} src
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="line-clamp-3">
                    <MarkdownAnswer content={log.answer} enhanced />
                  </div>
                  <QualityPanel
                    latencyMs={log.latency_ms}
                    model={log.model}
                    sources={log.sources}
                    feedback={log.feedback}
                    busy={busy === `feedback-${log.id}`}
                    compact
                    onFeedback={(feedback) => onFeedback(log.id, feedback)}
                  />
                  <div className="space-y-2">
                    {log.sources.map((source, index) => {
                      const sourceId = `history-${log.id}-${source.doc_id}-${source.chunk_index}-${index}`;
                      const isOpen = expandedSource === sourceId;
                      return (
                        <div key={sourceId} className="border border-primary/25 bg-card/60 p-2">
                          <Button
                            type="button"
                            variant="ghost"
                            className="h-auto w-full justify-between gap-2 p-1 text-left"
                            onClick={() => onToggleSource(isOpen ? null : sourceId)}
                          >
                            <span className="min-w-0 truncate text-xs">
                              {source.filename} · chunk {source.chunk_index}
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
                </CardContent>
              </Card>
            ))}
            {!loading && !queryLogs.length ? <EmptyState text="当前知识库还没有历史提问。" /> : null}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
