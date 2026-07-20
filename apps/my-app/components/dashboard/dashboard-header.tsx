import { Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Stat } from "@/components/dashboard/shared";

export function DashboardHeader({
  kbCount,
  docCount,
  turnCount,
}: {
  kbCount: number;
  docCount: number;
  turnCount: number;
}) {
  return (
    <header className="relative flex flex-col gap-4 border-4 border-double border-primary/70 bg-card/90 p-5 shadow-[10px_10px_0_rgba(67,45,27,0.16)] backdrop-blur md:flex-row md:items-end md:justify-between">
      <div className="absolute right-5 top-5 hidden rotate-6 border-2 border-primary/60 px-3 py-1 font-mono text-xs uppercase tracking-[0.28em] text-primary/80 md:block">
        CATALOG
      </div>
      <div className="space-y-3">
        <Badge variant="secondary" className="w-fit gap-1.5 rounded-none border border-primary/40 bg-secondary px-3 py-1 font-mono uppercase tracking-[0.22em]">
          <Sparkles className="size-3.5" /> LedgerKB
        </Badge>
        <div>
          <h1 className="font-heading text-3xl font-semibold tracking-tight text-foreground md:text-5xl">
            中文知识库工作台
          </h1>
          <p className="mt-2 max-w-2xl border-l-4 border-primary/40 pl-3 text-sm leading-6 text-muted-foreground md:text-base">
            Next.js + FastAPI + PostgreSQL + Qdrant，支持上传、RAG 检索、Rerank、引用来源和问答日志。
          </p>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center md:min-w-72">
        <Stat label="知识库" value={kbCount} />
        <Stat label="当前文档" value={docCount} />
        <Stat label="本轮问答" value={turnCount} />
      </div>
    </header>
  );
}
