"use client";

import { useEffect, useState, type FormEvent, type KeyboardEvent, type SyntheticEvent } from "react";
import Link from "next/link";
import { Archive, ChevronDown, FileText, Loader2, MessageSquare, Search, Square } from "lucide-react";

import { HighlightText, SourceMatchNote } from "@/components/highlight-text";
import { MarkdownAnswer } from "@/components/markdown-answer";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { QualityPanel } from "@/components/dashboard/shared";
import type { KnowledgeBase, QueryResult } from "@/lib/api";
import { cn } from "@/lib/utils";

export type ChatTurn = {
  id: string;
  question: string;
  result?: QueryResult;
  isComplete?: boolean;
  cancelled?: boolean;
  error?: string;
};

function answerPreview(text: string, max = 96) {
  const compact = text.replace(/\s+/g, " ").trim();
  if (compact.length <= max) return compact;
  return `${compact.slice(0, max)}…`;
}

type ChatGuide = {
  title: string;
  description: string;
  headerHint: string;
  placeholder: string;
  ctaHref?: string;
  ctaLabel?: string;
  tone: "welcome" | "nudge" | "wait" | "ready";
  canAsk: boolean;
};

function resolveChatGuide({
  kbCount,
  selectedKb,
  selectedKbId,
  docCount,
  readyDocCount,
  processingDocCount,
  loadingDocs,
}: {
  kbCount: number;
  selectedKb: KnowledgeBase | null;
  selectedKbId: string;
  docCount: number;
  readyDocCount: number;
  processingDocCount: number;
  loadingDocs: boolean;
}): ChatGuide {
  if (kbCount === 0) {
    return {
      title: "先给知识安个家吧",
      description: "建一个文库，就像开一排书架——之后放进去的资料，都能在这里追问。",
      headerHint: "问答台还空着，从建文库开始",
      placeholder: "建好文库后，再来聊你的问题…",
      ctaHref: "/documents",
      ctaLabel: "建一个文库",
      tone: "welcome",
      canAsk: false,
    };
  }

  if (!selectedKbId || !selectedKb) {
    return {
      title: "选一本要翻的书",
      description: "右侧点一下文库，问答台就会跟着切换——一次只对着一份资料说话。",
      headerHint: "选好文库，再开始提问",
      placeholder: "选好文库后，就可以提问了…",
      tone: "nudge",
      canAsk: false,
    };
  }

  if (loadingDocs && docCount === 0) {
    return {
      title: "正在翻开这本文库…",
      description: "资料目录马上就好，稍等片刻就能提问。",
      headerHint: `正在打开「${selectedKb.name}」`,
      placeholder: "马上就好…",
      tone: "wait",
      canAsk: false,
    };
  }

  if (docCount === 0) {
    return {
      title: "书架还是空的",
      description: `「${selectedKb.name}」里还没有资料。先放进几份文档，问答才有据可依。`,
      headerHint: `「${selectedKb.name}」还没有收录资料`,
      placeholder: "收录几份资料后，再来提问…",
      ctaHref: `/kb/${selectedKbId}/documents`,
      ctaLabel: "去收录资料",
      tone: "nudge",
      canAsk: false,
    };
  }

  if (readyDocCount === 0 && processingDocCount > 0) {
    return {
      title: "资料正在整理中",
      description: "我们在把文档拆成可检索的片段，好了之后就能按原文回答你。",
      headerHint: `「${selectedKb.name}」正在整理资料`,
      placeholder: "整理好后，再来提问…",
      ctaHref: `/kb/${selectedKbId}/documents`,
      ctaLabel: "看看进度",
      tone: "wait",
      canAsk: false,
    };
  }

  if (readyDocCount === 0) {
    return {
      title: "这份资料还读不进去",
      description: "文库里有文档，但还不能用来回答。去文库页看一眼状态，必要时重新整理一下。",
      headerHint: `「${selectedKb.name}」里的资料还没准备好`,
      placeholder: "资料就绪后，再来提问…",
      ctaHref: `/kb/${selectedKbId}/documents`,
      ctaLabel: "去文库看看",
      tone: "nudge",
      canAsk: false,
    };
  }

  const docLabel = readyDocCount === 1 ? "1 份资料" : `${readyDocCount} 份资料`;
  return {
    title: "今天想问点什么？",
    description: `「${selectedKb.name}」里已有 ${docLabel} 就绪。直接提问就好，答案旁边会附上出处，方便你核对。`,
    headerHint: `对着「${selectedKb.name}」提问，答案会附上原文出处`,
    placeholder: "例如：这份文档里怎么说的？",
    tone: "ready",
    canAsk: true,
  };
}

function ChatEmptyGuide({ guide }: { guide: ChatGuide }) {
  const ToneIcon =
    guide.tone === "welcome" ? Archive : guide.tone === "wait" ? Loader2 : guide.tone === "ready" ? MessageSquare : FileText;

  return (
    <div className="flex flex-col items-center gap-4 border border-dashed border-primary/30 bg-background/45 px-5 py-8 text-center">
      <div className="flex size-11 items-center justify-center border border-primary/25 bg-card/70 shadow-[3px_3px_0_rgba(67,45,27,0.08)]">
        <ToneIcon className={cn("size-5 text-primary", guide.tone === "wait" && "animate-spin")} />
      </div>
      <div className="max-w-sm space-y-2">
        <p className="font-heading text-base font-semibold tracking-tight text-foreground">{guide.title}</p>
        <p className="text-sm leading-6 text-muted-foreground">{guide.description}</p>
      </div>
      {guide.ctaHref && guide.ctaLabel ? (
        <Link
          href={guide.ctaHref}
          className={cn(
            buttonVariants({ variant: "secondary", size: "sm" }),
            "rounded-none border border-primary/30 font-mono",
          )}
        >
          {guide.ctaLabel}
        </Link>
      ) : null}
    </div>
  );
}

export function ChatPanel({
  selectedKb,
  selectedKbId,
  kbCount = 0,
  docCount = 0,
  readyDocCount = 0,
  processingDocCount = 0,
  loadingDocs = false,
  question,
  turns,
  busy,
  expandedSource,
  onQuestionChange,
  onAsk,
  onCancel,
  onFeedback,
  onToggleSource,
}: {
  selectedKb: KnowledgeBase | null;
  selectedKbId: string;
  kbCount?: number;
  docCount?: number;
  readyDocCount?: number;
  processingDocCount?: number;
  loadingDocs?: boolean;
  question: string;
  turns: ChatTurn[];
  busy: string | null;
  expandedSource: string | null;
  onQuestionChange: (value: string) => void;
  onAsk: (event: FormEvent) => void;
  onCancel: () => void;
  onFeedback: (logId: string | null | undefined, feedback: "helpful" | "not_helpful") => void;
  onToggleSource: (sourceId: string | null) => void;
}) {
  const [openTurnId, setOpenTurnId] = useState<string | null>(null);
  const latestTurnId = turns[0]?.id ?? null;
  const isQuerying = busy === "query";
  const guide = resolveChatGuide({
    kbCount,
    selectedKb,
    selectedKbId,
    docCount,
    readyDocCount,
    processingDocCount,
    loadingDocs,
  });
  const canSubmit = Boolean(guide.canAsk && selectedKbId && question.trim() && !isQuerying);

  useEffect(() => {
    if (latestTurnId) setOpenTurnId(latestTurnId);
  }, [latestTurnId]);

  function onToggleTurn(turnId: string, event: SyntheticEvent<HTMLDetailsElement>) {
    const nextOpen = event.currentTarget.open;
    setOpenTurnId(nextOpen ? turnId : openTurnId === turnId ? null : openTurnId);
  }

  function onComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || !(event.metaKey || event.ctrlKey)) return;
    event.preventDefault();
    if (!canSubmit) return;
    event.currentTarget.form?.requestSubmit();
  }

  return (
    <Card className="flex min-h-[min(32rem,calc(100dvh-9rem))] flex-col border-2 border-primary/40 bg-card/90 shadow-[7px_7px_0_rgba(67,45,27,0.12)] backdrop-blur xl:min-h-[calc(100vh-15rem)]">
      <CardHeader className="shrink-0 pb-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="size-4 text-primary" /> 问答
            </CardTitle>
            <CardDescription className="hidden sm:block">{guide.headerHint}</CardDescription>
          </div>
          <Badge variant="secondary" className="rounded-none font-mono tracking-[0.16em]">问答</Badge>
        </div>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
        <ScrollArea className="min-h-0 flex-1 pr-3">
          <div className="space-y-3 pb-2">
            {turns.map((turn) => {
              const sourceCount = turn.result?.sources.length ?? 0;
              const isTurnOpen = openTurnId === turn.id || !turn.isComplete;
              const preview = turn.error
                ? turn.error
                : turn.cancelled
                  ? turn.result?.answer
                    ? `已取消 · ${answerPreview(turn.result.answer)}`
                    : "已取消生成"
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
                          <div className="flex shrink-0 items-center gap-1.5">
                            {turn.cancelled ? (
                              <Badge variant="outline" className="rounded-none font-mono text-destructive">
                                cancelled
                              </Badge>
                            ) : null}
                            {sourceCount ? (
                              <Badge variant="outline" className="rounded-none font-mono">
                                {sourceCount} src
                              </Badge>
                            ) : null}
                          </div>
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
                          ) : turn.cancelled ? (
                            <p className="font-mono text-sm text-muted-foreground">已取消，未生成完整回答。</p>
                          ) : (
                            <p className="flex items-center gap-2 text-sm text-muted-foreground">
                              <Loader2 className="size-4 animate-spin" /> 正在生成...
                            </p>
                          )}
                          {turn.cancelled && turn.result.answer ? (
                            <p className="font-mono text-xs text-muted-foreground">生成已中断，以上为已输出片段。</p>
                          ) : null}
                          {turn.isComplete && !turn.cancelled ? (
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
                                          {source.filename}
                                          {source.section ? ` · ${source.section}` : ""}
                                          {source.page ? ` · 第 ${source.page} 页` : ` · 片段 ${source.chunk_index + 1}`}
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
            {!turns.length ? <ChatEmptyGuide guide={guide} /> : null}
          </div>
        </ScrollArea>

        <form
          className="sticky bottom-0 z-10 shrink-0 overflow-hidden border border-primary/30 bg-background/95 shadow-[3px_3px_0_rgba(67,45,27,0.08)] backdrop-blur supports-[padding:max(0px)]:pb-[max(0px,env(safe-area-inset-bottom))]"
          onSubmit={onAsk}
        >
          <Textarea
            className="min-h-20 resize-none rounded-none border-0 bg-transparent px-3 py-3 text-base font-mono shadow-none focus-visible:border-transparent focus-visible:ring-0 md:min-h-24 md:text-sm"
            value={question}
            onChange={(event) => onQuestionChange(event.target.value)}
            onKeyDown={onComposerKeyDown}
            placeholder={guide.placeholder}
            rows={2}
            disabled={!guide.canAsk}
          />
          <div className="flex items-center justify-between gap-3 border-t border-primary/20 bg-muted/45 px-2 py-2">
            <p className="hidden font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground md:block">
              Enter 换行 · ⌘/Ctrl+Enter 发送
            </p>
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground md:hidden">
              提问
            </p>
            {isQuerying ? (
              <Button
                type="button"
                variant="outline"
                className="min-h-11 rounded-none border-destructive/40 px-4 font-mono uppercase tracking-[0.12em] text-destructive hover:bg-destructive/10 md:min-h-8 md:px-2.5"
                onClick={onCancel}
              >
                <Square className="size-3 fill-current" />
                取消
              </Button>
            ) : (
              <Button
                type="submit"
                className="min-h-11 rounded-none border border-primary/40 px-4 font-mono uppercase tracking-[0.12em] md:min-h-8 md:px-2.5"
                disabled={!canSubmit}
              >
                <Search className="size-3.5" />
                提问
              </Button>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
