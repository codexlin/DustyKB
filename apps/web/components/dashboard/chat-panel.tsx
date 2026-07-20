"use client";

import type { FormEvent } from "react";
import { Loader2, MessageSquare, Search } from "lucide-react";

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
  return (
    <Card className="flex min-h-[calc(100vh-15rem)] flex-col border-2 border-primary/40 bg-card/90 shadow-[7px_7px_0_rgba(67,45,27,0.12)] backdrop-blur">
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="size-4 text-primary" /> 问答
            </CardTitle>
            <CardDescription>
              {selectedKb ? "Qdrant Top20 → qwen3-rerank → Qwen 生成" : "请先选择知识库"}
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
            {turns.map((turn) => (
              <Card key={turn.id} className="border border-primary/25 bg-background/70 shadow-[4px_4px_0_rgba(67,45,27,0.08)]" size="sm">
                <CardHeader>
                  <CardTitle className="text-sm">{turn.question}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
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
                          onFeedback={(feedback) => onFeedback(turn.result?.query_log_id, feedback)}
                        />
                      ) : null}
                      <div className="space-y-2">
                        {turn.result.sources.map((source, index) => {
                          const sourceId = `${turn.id}-${source.doc_id}-${source.chunk_index}-${index}`;
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
                                <Badge variant="outline" className="rounded-none font-mono">{source.score.toFixed(3)}</Badge>
                              </Button>
                              {isOpen ? (
                                <div className="mt-2 space-y-2 border-l-4 border-primary/30 bg-muted/60 p-2">
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
                    </>
                  ) : !turn.error ? (
                    <p className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="size-4 animate-spin" /> 正在生成...
                    </p>
                  ) : null}
                </CardContent>
              </Card>
            ))}
            {!turns.length ? <EmptyState text="上传文档后，在这里验证检索与回答质量。" /> : null}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
