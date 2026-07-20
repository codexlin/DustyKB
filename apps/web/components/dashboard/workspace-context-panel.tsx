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
    <Card className="flex min-h-[calc(100vh-15rem)] flex-col border-2 border-primary/40 bg-card/90 shadow-[7px_7px_0_rgba(67,45,27,0.12)] backdrop-blur">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Layers3 className="size-4 text-primary" /> 工作上下文
            </CardTitle>
            <CardDescription>当前知识库、最近文档和管理入口。</CardDescription>
          </div>
          <Badge variant="outline" className="rounded-none font-mono">
            {kbs.length} KB
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="flex min-h-0 flex-1 flex-col gap-4">
        <div className="space-y-3 border border-primary/25 bg-background/65 p-3 shadow-[3px_3px_0_rgba(67,45,27,0.08)]">
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Current KB</p>
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
                  <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">docs</p>
                </div>
                <div className="border border-primary/20 bg-card/60 px-2 py-2">
                  <p className="font-heading text-xl font-semibold">{docs.length}</p>
                  <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">loaded</p>
                </div>
              </div>
            </div>
          ) : (
            <EmptyState text="还没有选择知识库。" />
          )}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Switch KB</p>
            <Link href={documentsHref} className="font-mono text-[11px] text-primary underline-offset-4 hover:underline">
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
                    <span className="block font-mono text-[10px] text-muted-foreground">{kb.doc_count} docs</span>
                  </span>
                  {kb.id === selectedKbId ? <Badge className="rounded-none font-mono">Open</Badge> : null}
                </Button>
              ))}
              {!kbs.length ? <EmptyState text="请先创建知识库。" /> : null}
            </div>
          </ScrollArea>
        </div>

        <Separator />

        <div className="min-h-0 flex-1 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Recent Docs</p>
            <Badge variant="outline" className="rounded-none font-mono">
              {loadingDocs ? "sync" : docs.length}
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
                      <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                        {doc.chunk_count} chunks · {formatDateTime(doc.created_at)}
                      </p>
                    </div>
                    <Badge variant="outline" className="shrink-0 rounded-none font-mono">
                      {doc.status}
                    </Badge>
                  </div>
                </div>
              ))}
              {!loadingDocs && !recentDocs.length ? (
                <div className="space-y-3 border border-dashed border-primary/30 bg-background/45 p-4 text-center">
                  <div className="space-y-1">
                    <p className="font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">
                      No documents indexed
                    </p>
                    <p className="text-xs leading-5 text-muted-foreground">
                      当前知识库还没有可检索文档。
                    </p>
                  </div>
                  <Link
                    href={documentsHref}
                    className={cn(
                      buttonVariants({ variant: "secondary", size: "sm" }),
                      "w-full rounded-none border border-primary/30 font-mono uppercase tracking-[0.14em]",
                    )}
                  >
                    <FileText className="size-3.5" />
                    去文档库上传
                  </Link>
                </div>
              ) : null}
              {loadingDocs ? <EmptyState text="正在同步文档列表..." /> : null}
            </div>
          </ScrollArea>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <Link
            href={documentsHref}
            className={cn(buttonVariants({ variant: "outline" }), "h-auto rounded-none py-2 font-mono text-[11px] uppercase")}
          >
            <FileText className="size-3.5" />
            Docs
          </Link>
          <Link
            href={historyHref}
            className={cn(buttonVariants({ variant: "outline" }), "h-auto rounded-none py-2 font-mono text-[11px] uppercase")}
          >
            <Archive className="size-3.5" />
            Logs
          </Link>
          <Link
            href={systemHref}
            className={cn(buttonVariants({ variant: "outline" }), "h-auto rounded-none py-2 font-mono text-[11px] uppercase")}
          >
            <Settings2 className="size-3.5" />
            Sys
          </Link>
        </div>

        <div className="border-x border-y-2 border-dashed border-primary/25 bg-muted/50 p-3 text-xs leading-5 text-muted-foreground">
          <p className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.14em] text-primary">
            <MessageSquare className="size-3.5" /> Workspace Mode
          </p>
          <p className="mt-1">这里专注提问和验证回答；创建、删除、重建索引等重操作放到文档库中完成。</p>
        </div>
      </CardContent>
    </Card>
  );
}
