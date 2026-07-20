"use client";

import { useEffect, useState, type FormEvent, type SyntheticEvent } from "react";
import { ChevronDown, Loader2, MessageSquare, Search } from "lucide-react";

import { HighlightText, SourceMatchNote } from "@/components/highlight-text";
import { MarkdownAnswer } from "@/components/markdown-answer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState, QualityPanel } from "@/components/dashboard/shared";
import type { KnowledgeBase, QueryResult } from "@/lib/api";

export type ChatTurn = {
  id: string;
  question: string;
  result?: QueryResult;
  isComplete?: boolean;
  error?: string;
};

function answerPreview(text: string, max = 96) {
  const compact = text.replace(/\s+/g, " ").trim();
  if (compact.length <= max) return compact;
  return `${compact.slice(0, max)}…`;
}

export function ChatPanel({
  selectedKb,
  selectedKbId,
  question,
  turns,
  busy,
  expandedSource,
  onQuestionChange,
  onAsk,
  onFeedback,
  onToggleSource,
}: {
  selectedKb: KnowledgeBase | null;
  selectedKbId: string;
  question: string;
  turns: ChatTurn[];
  busy: string | null;
  expandedSource: string | null;
  onQuestionChange: (value: string) => void;
  onAsk: (event: FormEvent) => void;
  onFeedback: (logId: string | null | undefined, feedback: "helpful" | "not_helpful") => void;
  onToggleSource: (sourceId: string | null) => void;
}) {
  const [openTurnId, setOpenTurnId] = useState<string | null>(null);
  const latestTurnId = turns[0]?.id ?? null;

  useEffect(() => {
    if (latestTurnId) setOpenTurnId(latestTurnId);
  }, [latestTurnId]);

  function onToggleTurn(turnId: string, event: SyntheticEvent<HTMLDetailsElement>) {
    const nextOpen = event.currentTarget.open;
    setOpenTurnId(nextOpen ? turnId : openTurnId === turnId ? null : openTurnId);
  }

  return (
    <Card className="flex min-h-[calc(100vh-15rem)] flex-col border-2 border-primary/40 bg-card/90 shadow-[7px_7px_0_rgba(67,45,27,0.12)] backdrop-blur">
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="size-4 text-primary" /> 问答
            </CardTitle>
            <CardDescription>
              {selectedKb ? "Dense+BM25 → RRF → qwen3-rerank → Qwen 生成" : "请先选择知识库"}
            </CardDescription>
          </div>
          <Badge variant="secondary" className="rounded-none font-mono tracking-[0.16em]">RAG</Badge>
        </div>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col gap-4">
        <form className="space-y-3" onSubmit={onAsk}>
          <Textarea
            className="rounded-none border-primary/30 bg-background/70 font-mono"
            value={question}
            onChange={(event) => onQuestionChange(event.target.value)}
            placeholder="基于当前知识库提问..."
            rows={4}
            disabled={!selectedKbId}
            required
          />
          <Button className="w-full rounded-none border border-primary/40 font-mono uppercase tracking-[0.14em]" type="submit" disabled={!selectedKbId || busy === "query"}>
            {busy === "query" ? <Loader2 className="animate-spin" /> : <Search />}
            {busy === "query" ? "检索生成中" : "提问"}
          </Button>
        </form>

        <ScrollArea className="min-h-0 flex-1 pr-3">
          <div className="space-y-3">
            {turns.map((turn) => {
              const sourceCount = turn.result?.sources.length ?? 0;
              const isTurnOpen = openTurnId === turn.id || !turn.isComplete;
              const preview = turn.error
                ? turn.error
                : turn.result?.answer
                  ? answerPreview(turn.result.answer)
                  : "正在生成...";

              return (
                <Card
                  key={turn.id}
                  className="border border-primary/25 bg-background/70 shadow-[4px_4px_0_rgba(67,45,27,0.08)]"
                  size="sm"
                >
                  <details
                    className="group"
                    open={isTurnOpen}
                    onToggle={(event) => onToggleTurn(turn.id, event)}
                  >
                    <summary className="flex cursor-pointer list-none items-start gap-2 px-4 py-3 [&::-webkit-details-marker]:hidden">
                      <ChevronDown className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex items-start justify-between gap-3">
                          <p className="text-sm font-medium leading-5">{turn.question}</p>
                          {sourceCount ? (
                            <Badge variant="outline" className="shrink-0 rounded-none font-mono">
                              {sourceCount} src
                            </Badge>
                          ) : null}
                        </div>
                        <p className="line-clamp-2 font-mono text-xs leading-5 text-muted-foreground group-open:hidden">
                          {preview}
                        </p>
                      </div>
                    </summary>

                    <CardContent className="space-y-3 border-t border-primary/15 pt-3">
                      {turn.error ? <p className="text-sm text-destructive">{turn.error}</p> : null}
                      {turn.result ? (
                        <>
                          {turn.result.answer ? (
                            <MarkdownAnswer content={turn.result.answer} enhanced={turn.isComplete} />
                          ) : (
                            <p className="flex items-center gap-2 text-sm text-muted-foreground">
                              <Loader2 className="size-4 animate-spin" /> 正在生成...
                            </p>
                          )}
                          {turn.isComplete ? (
                            <QualityPanel
                              latencyMs={turn.result.latency_ms}
                              model={turn.result.model}
                              sources={turn.result.sources}
                              feedback={turn.result.feedback}
                              busy={busy === `feedback-${turn.result.query_log_id}`}
                              compact
                              onFeedback={(feedback) => onFeedback(turn.result?.query_log_id, feedback)}
                            />
                          ) : null}
                          {sourceCount ? (
                            <details className="group/sources border border-primary/25 bg-card/60">
                              <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-2 py-2 [&::-webkit-details-marker]:hidden">
                                <span className="flex items-center gap-2 font-mono text-xs text-muted-foreground">
                                  <ChevronDown className="size-3.5 transition-transform group-open/sources:rotate-180" />
                                  引用来源
                                </span>
                                <Badge variant="outline" className="rounded-none font-mono">
                                  {sourceCount}
                                </Badge>
                              </summary>
                              <div className="space-y-2 border-t border-primary/15 p-2">
                                {turn.result.sources.map((source, index) => {
                                  const sourceId = `${turn.id}-${source.doc_id}-${source.chunk_index}-${index}`;
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
                                          {source.filename} · chunk {source.chunk_index}
                                          {source.section ? ` · ${source.section}` : ""}
                                          {source.page ? ` · p.${source.page}` : ""}
                                        </span>
                                        <Badge variant="outline" className="rounded-none font-mono">
                                          {source.score.toFixed(3)}
                                        </Badge>
                                      </Button>
                                      {isOpen ? (
                                        <div className="mt-2 space-y-2 border-l-4 border-primary/30 bg-muted/60 p-2">
                                          <div className="flex flex-wrap gap-1.5">
                                            <Badge variant="outline" className="rounded-none font-mono">
                                              {source.content_type || "text"}
                                            </Badge>
                                            {source.parser ? (
                                              <Badge variant="outline" className="rounded-none font-mono">
                                                {source.parser}
                                              </Badge>
                                            ) : null}
                                            {source.dense_score != null ? (
                                              <Badge variant="outline" className="rounded-none font-mono">
                                                dense {source.dense_score.toFixed(3)}
                                              </Badge>
                                            ) : null}
                                            {source.bm25_score != null ? (
                                              <Badge variant="outline" className="rounded-none font-mono">
                                                bm25 {source.bm25_score.toFixed(2)}
                                              </Badge>
                                            ) : null}
                                            {source.rrf_score != null ? (
                                              <Badge variant="outline" className="rounded-none font-mono">
                                                rrf {source.rrf_score.toFixed(4)}
                                              </Badge>
                                            ) : null}
                                          </div>
                                          <SourceMatchNote text={source.text} question={turn.question} score={source.score} />
                                          <p className="whitespace-pre-wrap font-mono text-xs leading-5 text-muted-foreground">
                                            <HighlightText text={source.text} question={turn.question} />
                                          </p>
                                        </div>
                                      ) : null}
                                    </div>
                                  );
                                })}
                              </div>
                            </details>
                          ) : null}
                        </>
                      ) : !turn.error ? (
                        <p className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Loader2 className="size-4 animate-spin" /> 正在生成...
                        </p>
                      ) : null}
                    </CardContent>
                  </details>
                </Card>
              );
            })}
            {!turns.length ? <EmptyState text="上传文档后，在这里验证检索与回答质量。" /> : null}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
