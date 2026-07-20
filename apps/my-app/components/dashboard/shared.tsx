"use client";

import { Loader2, ThumbsDown, ThumbsUp } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { QueryResult } from "@/lib/api";
import { cn } from "@/lib/utils";

export function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="border border-primary/30 bg-background/65 px-3 py-2 shadow-[3px_3px_0_rgba(67,45,27,0.1)]">
      <p className="font-heading text-2xl font-semibold">{value}</p>
      <p className="font-mono text-xs uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
    </div>
  );
}

export function QualityPanel({
  latencyMs,
  model,
  sources,
  feedback,
  busy,
  compact = false,
  onFeedback,
}: {
  latencyMs?: number | null;
  model: string;
  sources: QueryResult["sources"];
  feedback?: "helpful" | "not_helpful" | null;
  busy?: boolean;
  compact?: boolean;
  onFeedback: (feedback: "helpful" | "not_helpful") => void;
}) {
  const scores = sources.map((source) => source.score);
  const maxScore = scores.length ? Math.max(...scores) : null;
  const minScore = scores.length ? Math.min(...scores) : null;

  return (
    <div className="space-y-2 border border-primary/20 bg-card/55 p-2">
      <div className="flex flex-wrap items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
        <Badge variant="outline" className="rounded-none font-mono">
          {model}
        </Badge>
        <span className="border border-primary/20 bg-background/70 px-1.5 py-0.5">
          {latencyMs == null ? "latency -" : `${Math.round(latencyMs)}ms`}
        </span>
        <span className="border border-primary/20 bg-background/70 px-1.5 py-0.5">
          {sources.length} sources
        </span>
        {maxScore != null && minScore != null ? (
          <span className="border border-primary/20 bg-background/70 px-1.5 py-0.5">
            score {maxScore.toFixed(3)} / {minScore.toFixed(3)}
          </span>
        ) : null}
      </div>
      {!compact ? (
        <p className="text-xs leading-5 text-muted-foreground">
          这些指标用于观察本次回答质量：耗时越低体验越好；source 分数和数量用于判断召回是否稳定。
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button
          type="button"
          variant={feedback === "helpful" ? "secondary" : "outline"}
          size="sm"
          className="rounded-none font-mono"
          disabled={busy}
          onClick={() => onFeedback("helpful")}
        >
          {busy ? <Loader2 className="animate-spin" /> : <ThumbsUp />}
          有帮助
        </Button>
        <Button
          type="button"
          variant={feedback === "not_helpful" ? "secondary" : "outline"}
          size="sm"
          className="rounded-none font-mono"
          disabled={busy}
          onClick={() => onFeedback("not_helpful")}
        >
          {busy ? <Loader2 className="animate-spin" /> : <ThumbsDown />}
          没帮助
        </Button>
      </div>
    </div>
  );
}

export function ConfigBlock({ title, data }: { title: string; data: Record<string, string | number | boolean> }) {
  return (
    <div className="border border-primary/25 bg-background/65 p-3">
      <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">{title}</p>
      <div className="space-y-1.5">
        {Object.entries(data).map(([key, value]) => (
          <div key={key} className="flex items-center justify-between gap-3 border-b border-primary/10 pb-1 last:border-b-0 last:pb-0">
            <span className="font-mono text-[11px] text-muted-foreground">{key}</span>
            <span className="truncate text-right font-mono text-xs text-foreground">{String(value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function EmptyState({ text }: { text: string }) {
  return (
    <div className="border border-dashed border-primary/30 bg-background/45 p-5 text-center font-mono text-sm text-muted-foreground">
      {text}
    </div>
  );
}

export function RetroLoading({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex min-h-64 flex-col items-center justify-center gap-5 border border-dashed border-primary/30 bg-muted/45 p-6 text-center">
      <div className="relative">
        <div className="absolute -inset-3 border border-primary/20 bg-background/35 shadow-[5px_5px_0_rgba(67,45,27,0.08)]" />
        <svg className="relative size-20 text-primary" viewBox="0 0 96 96" role="img" aria-label={label}>
          <rect x="14" y="16" width="68" height="64" fill="currentColor" opacity="0.06" />
          <path
            d="M14 26V16h10M72 16h10v10M82 70v10H72M24 80H14V70"
            fill="none"
            stroke="currentColor"
            strokeLinecap="square"
            strokeWidth="3"
          />
          <g className="animate-pulse">
            <path
              d="M35 28h20l10 10v30H35z"
              fill="hsl(var(--background))"
              stroke="currentColor"
              strokeWidth="3"
            />
            <path d="M55 28v11h10" fill="none" stroke="currentColor" strokeWidth="3" />
            <path d="M42 47h16M42 55h12M42 63h18" stroke="currentColor" strokeLinecap="square" strokeWidth="2" />
          </g>
          <path
            className="animate-[scan_1.8s_ease-in-out_infinite]"
            d="M24 31h48"
            stroke="currentColor"
            strokeLinecap="square"
            strokeWidth="3"
          />
          <style>{`
            @keyframes scan {
              0%, 100% { transform: translateY(0); opacity: .25; }
              50% { transform: translateY(34px); opacity: .9; }
            }
          `}</style>
        </svg>
      </div>
      <div className="space-y-1">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">{label}</p>
        <div className="flex items-center justify-center gap-1.5" aria-hidden="true">
          <span className="size-1.5 animate-pulse border border-primary/40 bg-primary/70 [animation-delay:0ms]" />
          <span className="size-1.5 animate-pulse border border-primary/40 bg-primary/70 [animation-delay:150ms]" />
          <span className="size-1.5 animate-pulse border border-primary/40 bg-primary/70 [animation-delay:300ms]" />
        </div>
      </div>
    </div>
  );
}

export function TruncatedText({
  text,
  className,
  tooltipClassName,
}: {
  text: string;
  className?: string;
  tooltipClassName?: string;
}) {
  return (
    <span className={cn("group relative inline-flex min-w-0 max-w-full", className)}>
      <span className="truncate" title={text}>
        {text}
      </span>
      <span
        className={cn(
          "pointer-events-none absolute left-0 top-full z-50 mt-1 hidden max-w-72 border border-primary/35 bg-background px-2 py-1 font-mono text-[11px] leading-4 text-foreground shadow-[4px_4px_0_rgba(67,45,27,0.12)] group-hover:block",
          tooltipClassName,
        )}
      >
        {text}
      </span>
    </span>
  );
}

function SkeletonLine({ className }: { className?: string }) {
  return <div className={cn("animate-pulse border border-primary/10 bg-muted/70", className)} />;
}

export function HistoryListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="space-y-3 border border-primary/20 bg-background/55 p-4 shadow-[4px_4px_0_rgba(67,45,27,0.06)]">
          <SkeletonLine className="h-4 w-3/4" />
          <SkeletonLine className="h-3 w-1/2" />
          <div className="space-y-2">
            <SkeletonLine className="h-3 w-full" />
            <SkeletonLine className="h-3 w-5/6" />
            <SkeletonLine className="h-3 w-2/3" />
          </div>
          <SkeletonLine className="h-8 w-full" />
        </div>
      ))}
    </div>
  );
}

export function SystemStatusSkeleton() {
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1fr_1.2fr]">
      {Array.from({ length: 3 }).map((_, index) => (
        <div key={index} className="space-y-3 border border-primary/20 bg-background/55 p-3">
          <SkeletonLine className="h-3 w-24" />
          <SkeletonLine className="h-4 w-full" />
          <SkeletonLine className="h-4 w-5/6" />
          <SkeletonLine className="h-4 w-2/3" />
          <SkeletonLine className="h-4 w-4/5" />
        </div>
      ))}
    </div>
  );
}

export function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
