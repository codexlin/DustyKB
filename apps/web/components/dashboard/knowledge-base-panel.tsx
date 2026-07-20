"use client";

import type { FormEvent } from "react";
import { Database, Loader2, Sparkles, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { EmptyState, TruncatedText } from "@/components/dashboard/shared";
import type { KnowledgeBase } from "@/lib/api";
import { cn } from "@/lib/utils";

export function KnowledgeBasePanel({
  kbs,
  selectedKb,
  selectedKbId,
  kbName,
  kbDesc,
  busy,
  deleteKbConfirmId,
  deleteKbConfirmName,
  onKbNameChange,
  onKbDescChange,
  onSelectKb,
  onCreateKb,
  onRequestDeleteKb,
  onDeleteKb,
  onCancelDeleteKb,
  onDeleteKbConfirmNameChange,
}: {
  kbs: KnowledgeBase[];
  selectedKb: KnowledgeBase | null;
  selectedKbId: string;
  kbName: string;
  kbDesc: string;
  busy: string | null;
  deleteKbConfirmId: string | null;
  deleteKbConfirmName: string;
  onKbNameChange: (value: string) => void;
  onKbDescChange: (value: string) => void;
  onSelectKb: (kbId: string) => void;
  onCreateKb: (event: FormEvent) => void;
  onRequestDeleteKb: () => void;
  onDeleteKb: () => void;
  onCancelDeleteKb: () => void;
  onDeleteKbConfirmNameChange: (value: string) => void;
}) {
  return (
    <Card className="border-2 border-primary/40 bg-card/90 shadow-[7px_7px_0_rgba(67,45,27,0.12)] backdrop-blur">
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Database className="size-4 text-primary" /> 知识库
            </CardTitle>
            <CardDescription>创建或切换当前工作空间</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="rounded-none font-mono">{kbs.length}</Badge>
            <Button
              type="button"
              size="icon-sm"
              variant="destructive"
              disabled={!selectedKb || busy === `delete-kb-${selectedKb.id}`}
              onClick={onRequestDeleteKb}
              aria-label="删除当前知识库"
            >
              {selectedKb && busy === `delete-kb-${selectedKb.id}` ? <Loader2 className="animate-spin" /> : <Trash2 />}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <form className="space-y-3" onSubmit={onCreateKb}>
          <div className="space-y-1.5">
            <Label htmlFor="kb-name">名称</Label>
            <Input
              id="kb-name"
              value={kbName}
              onChange={(event) => onKbNameChange(event.target.value)}
              className="rounded-none border-primary/30 bg-background/70 font-mono"
              placeholder="例如：产品手册"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="kb-desc">说明</Label>
            <Input
              id="kb-desc"
              value={kbDesc}
              onChange={(event) => onKbDescChange(event.target.value)}
              className="rounded-none border-primary/30 bg-background/70 font-mono"
              placeholder="一句话说明（可选）"
            />
          </div>
          <Button className="w-full rounded-none border border-primary/40 font-mono uppercase tracking-[0.14em]" type="submit" disabled={busy === "create-kb"}>
            {busy === "create-kb" ? <Loader2 className="animate-spin" /> : <Sparkles />}
            {busy === "create-kb" ? "创建中" : "新建知识库"}
          </Button>
        </form>

        {selectedKb && deleteKbConfirmId === selectedKb.id ? (
          <div className="space-y-3 border border-destructive/30 bg-destructive/5 p-3">
            <div className="space-y-1">
              <p className="font-mono text-xs font-semibold uppercase tracking-[0.16em] text-destructive">
                删除确认
              </p>
              <p className="text-xs leading-5 text-muted-foreground">
                将删除知识库、文档记录、问答日志、Qdrant 向量和本地上传文件。请输入
                <span className="mx-1 font-mono text-foreground">{selectedKb.name}</span>
                确认。
              </p>
            </div>
            <Input
              value={deleteKbConfirmName}
              onChange={(event) => onDeleteKbConfirmNameChange(event.target.value)}
              className="rounded-none border-destructive/30 bg-background/70 font-mono"
              placeholder={selectedKb.name}
            />
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant="outline"
                className="rounded-none font-mono uppercase tracking-[0.14em]"
                onClick={onCancelDeleteKb}
              >
                取消
              </Button>
              <Button
                type="button"
                variant="destructive"
                className="rounded-none font-mono uppercase tracking-[0.14em]"
                disabled={busy === `delete-kb-${selectedKb.id}`}
                onClick={onDeleteKb}
              >
                {busy === `delete-kb-${selectedKb.id}` ? <Loader2 className="animate-spin" /> : <Trash2 />}
                确认删除
              </Button>
            </div>
          </div>
        ) : null}

        <Separator />

        <ScrollArea className="h-[46vh] pr-3">
          <div className="space-y-2">
            {kbs.map((kb) => (
              <Button
                key={kb.id}
                type="button"
                variant={kb.id === selectedKbId ? "secondary" : "outline"}
                className={cn(
                  "h-auto w-full justify-between gap-3 rounded-none border-l-4 p-3 text-left shadow-[3px_3px_0_rgba(67,45,27,0.08)]",
                  kb.id === selectedKbId && "border-primary bg-accent/70 text-primary",
                )}
                onClick={() => onSelectKb(kb.id)}
              >
                <span className="min-w-0 space-y-1">
                  <span className="block min-w-0 font-medium">
                    <TruncatedText text={kb.name} />
                  </span>
                  <span className="block min-w-0 text-xs text-muted-foreground">
                    <TruncatedText text={kb.description || "暂无说明"} tooltipClassName="normal-case" />
                  </span>
                </span>
                <Badge variant="outline" className="shrink-0 rounded-none font-mono">
                  {kb.doc_count} 文档
                </Badge>
              </Button>
            ))}
            {!kbs.length ? <EmptyState text="还没有知识库，先创建一个。" /> : null}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
