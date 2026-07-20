"use client";

import Link from "next/link";
import { Archive, FileText, Layers3, MessageSquare, Settings2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { EmptyState, formatDateTime, TruncatedText } from "@/components/dashboard/shared";
import type { DocumentRecord, KnowledgeBase } from "@/lib/api";
import { cn } from "@/lib/utils";

export function WorkspaceContextPanel({
  kbs,
  selectedKb,
  selectedKbId,
  docs,
  loadingDocs = false,
  onSelectKb,
}: {
  kbs: KnowledgeBase[];
  selectedKb: KnowledgeBase | null;
  selectedKbId: string;
  docs: DocumentRecord[];
  loadingDocs?: boolean;
  onSelectKb: (kbId: string) => void;
}) {
  const recentDocs = docs.slice(0, 5);
  const documentsHref = selectedKbId ? `/kb/${selectedKbId}/documents` : "/documents";
  const historyHref = selectedKbId ? `/kb/${selectedKbId}/history` : "/history";
  const systemHref = selectedKbId ? `/kb/${selectedKbId}/system` : "/system";

  return (
    <Card className="flex min-h-[min(28rem,calc(100dvh-10rem))] flex-col border-2 border-primary/40 bg-card/90 shadow-[7px_7px_0_rgba(67,45,27,0.12)] backdrop-blur xl:min-h-[calc(100vh-15rem)]">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Layers3 className="size-4 text-primary" /> 工作上下文
            </CardTitle>
            <CardDescription>当前文库与最近收录的资料。</CardDescription>
          </div>
          <Badge variant="outline" className="rounded-none font-mono">
            {kbs.length} 个库
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="flex min-h-0 flex-1 flex-col gap-4">
        <div className="space-y-3 border border-primary/25 bg-background/65 p-3 shadow-[3px_3px_0_rgba(67,45,27,0.08)]">
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">当前文库</p>
          {selectedKb ? (
            <div className="space-y-2">
              <div className="min-w-0">
                <h3 className="text-base font-semibold">
                  <TruncatedText text={selectedKb.name} />
                </h3>
                <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                  {selectedKb.description || "暂无说明"}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2 text-center">
                <div className="border border-primary/20 bg-card/60 px-2 py-2">
                  <p className="font-heading text-xl font-semibold">{selectedKb.doc_count}</p>
                  <p className="text-[10px] text-muted-foreground">文档</p>
                </div>
                <div className="border border-primary/20 bg-card/60 px-2 py-2">
                  <p className="font-heading text-xl font-semibold">{docs.length}</p>
                  <p className="text-[10px] text-muted-foreground">已加载</p>
                </div>
              </div>
            </div>
          ) : (
            <EmptyState text="还没有选择文库。" />
          )}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">切换文库</p>
            <Link href={documentsHref} className="text-[11px] text-primary underline-offset-4 hover:underline">
              管理文档
            </Link>
          </div>
          <ScrollArea className="h-40 pr-2">
            <div className="space-y-1.5">
              {kbs.map((kb) => (
                <Button
                  key={kb.id}
                  type="button"
                  variant={kb.id === selectedKbId ? "secondary" : "outline"}
                  className={cn(
                    "h-auto w-full justify-between gap-2 rounded-none border-l-4 p-2 text-left",
                    kb.id === selectedKbId && "border-primary text-primary",
                  )}
                  onClick={() => onSelectKb(kb.id)}
                >
                  <span className="min-w-0">
                    <span className="block text-xs font-medium">
                      <TruncatedText text={kb.name} />
                    </span>
                    <span className="block text-[10px] text-muted-foreground">{kb.doc_count} 篇文档</span>
                  </span>
                  {kb.id === selectedKbId ? <Badge className="rounded-none font-mono">使用中</Badge> : null}
                </Button>
              ))}
              {!kbs.length ? <EmptyState text="请先创建文库。" /> : null}
            </div>
          </ScrollArea>
        </div>

        <Separator />

        <div className="min-h-0 flex-1 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">最近文档</p>
            <Badge variant="outline" className="rounded-none font-mono">
              {loadingDocs ? "同步中" : docs.length}
            </Badge>
          </div>
          <ScrollArea className="h-48 pr-2">
            <div className="space-y-2">
              {recentDocs.map((doc) => (
                <div key={doc.id} className="border border-primary/20 bg-background/65 p-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-medium">
                        <TruncatedText text={doc.filename} />
                      </p>
                      <p className="mt-1 text-[10px] text-muted-foreground">
                        {doc.chunk_count} 个片段 · {formatDateTime(doc.created_at)}
                      </p>
                    </div>
                    <Badge variant="outline" className="shrink-0 rounded-none font-mono">
                      {doc.status === "ready" ? "就绪" : doc.status === "processing" ? "处理中" : doc.status === "failed" ? "失败" : doc.status}
                    </Badge>
                  </div>
                </div>
              ))}
              {!loadingDocs && !recentDocs.length ? (
                <div className="space-y-3 border border-dashed border-primary/30 bg-background/45 p-4 text-center">
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-foreground">还没有文档</p>
                    <p className="text-xs leading-5 text-muted-foreground">
                      上传几份资料后，就可以开始提问了。
                    </p>
                  </div>
                  <Link
                    href={documentsHref}
                    className={cn(
                      buttonVariants({ variant: "secondary", size: "sm" }),
                      "w-full rounded-none border border-primary/30 font-mono",
                    )}
                  >
                    <FileText className="size-3.5" />
                    去上传文档
                  </Link>
                </div>
              ) : null}
              {loadingDocs ? <EmptyState text="正在加载文档列表…" /> : null}
            </div>
          </ScrollArea>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <Link
            href={documentsHref}
            className={cn(buttonVariants({ variant: "outline" }), "h-auto rounded-none py-2 text-[11px]")}
          >
            <FileText className="size-3.5" />
            文档
          </Link>
          <Link
            href={historyHref}
            className={cn(buttonVariants({ variant: "outline" }), "h-auto rounded-none py-2 text-[11px]")}
          >
            <Archive className="size-3.5" />
            历史
          </Link>
          <Link
            href={systemHref}
            className={cn(buttonVariants({ variant: "outline" }), "h-auto rounded-none py-2 text-[11px]")}
          >
            <Settings2 className="size-3.5" />
            系统
          </Link>
        </div>

        <div className="border-x border-y-2 border-dashed border-primary/25 bg-muted/50 p-3 text-xs leading-5 text-muted-foreground">
          <p className="flex items-center gap-2 text-[11px] font-medium text-primary">
            <MessageSquare className="size-3.5" /> 小提示
          </p>
          <p className="mt-1">这里专注提问；收录与重新索引资料，请到「文库」。</p>
        </div>
      </CardContent>
    </Card>
  );
}
