"use client";

import { AlertTriangle, CheckCircle2, Clock3, Download, Eye, FileText, Loader2, RefreshCw, Trash2, UploadCloud } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { EmptyState, formatDateTime, RetroLoading, TruncatedText } from "@/components/dashboard/shared";
import type { UploadQueueItem } from "@/components/dashboard/use-document-controls";
import { getDocumentDownloadUrl, type DocumentChunk, type DocumentPreview, type DocumentRecord, type KnowledgeBase } from "@/lib/api";
import { cn } from "@/lib/utils";

function documentStatusMeta(status: string) {
  if (status === "ready") {
    return {
      label: "ready",
      icon: CheckCircle2,
      className: "border-[#6f8f4e]/50 bg-[#e4efd6] text-[#315c38]",
    };
  }
  if (status === "processing") {
    return {
      label: "processing",
      icon: Clock3,
      className: "border-primary/50 bg-primary/10 text-primary",
    };
  }
  if (status === "failed") {
    return {
      label: "failed",
      icon: AlertTriangle,
      className: "border-destructive/50 bg-destructive/10 text-destructive",
    };
  }
  return {
    label: status,
    icon: FileText,
    className: "border-primary/30 text-muted-foreground",
  };
}

function queueStatusMeta(status: UploadQueueItem["status"]) {
  if (status === "ready") return { label: "Ready", className: "border-[#6f8f4e]/50 text-[#315c38]" };
  if (status === "failed") return { label: "Failed", className: "border-destructive/50 text-destructive" };
  if (status === "indexing") return { label: "Indexing", className: "border-primary/50 text-primary" };
  return { label: "Uploading", className: "border-primary/40 text-primary" };
}

export function DocumentPanel({
  docs,
  selectedKb,
  selectedKbId,
  selectedDocId,
  docPreview,
  docChunks,
  detailLoading = false,
  detailLayout = "stack",
  uploadQueue = [],
  processingCount = 0,
  busy,
  loading = false,
  onUpload,
  onInspectDoc,
  onReindexDoc,
  onDeleteDoc,
  onLoadMorePreview,
}: {
  docs: DocumentRecord[];
  selectedKb: KnowledgeBase | null;
  selectedKbId: string;
  selectedDocId: string | null;
  docPreview: DocumentPreview | null;
  docChunks: DocumentChunk[];
  detailLoading?: boolean;
  detailLayout?: "side" | "stack";
  uploadQueue?: UploadQueueItem[];
  processingCount?: number;
  busy: string | null;
  loading?: boolean;
  onUpload: (files: FileList | null) => void;
  onInspectDoc: (doc: DocumentRecord) => void;
  onReindexDoc: (doc: DocumentRecord) => void;
  onDeleteDoc: (docId: string) => void;
  onLoadMorePreview: (docId: string) => void;
}) {
  const selectedDoc = docs.find((doc) => doc.id === selectedDocId) ?? docPreview?.doc ?? null;
  const activeUploadCount = uploadQueue.filter((item) => item.status === "uploading" || item.status === "indexing").length;
  const activeIngestCount = Math.max(activeUploadCount, processingCount);
  const showIngestStatus = uploadQueue.length > 0 || processingCount > 0;

  return (
    <Card className="flex min-h-[calc(100vh-17rem)] flex-col border-2 border-primary/40 bg-card/90 shadow-[7px_7px_0_rgba(67,45,27,0.12)] backdrop-blur">
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FileText className="size-4 text-primary" /> 文档
            </CardTitle>
            <CardDescription>{selectedKb?.name ?? "请先选择知识库"}</CardDescription>
          </div>
          <Badge variant="outline" className="rounded-none font-mono">{docs.length}</Badge>
        </div>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col space-y-4">
        <Label
          htmlFor="doc-upload"
          className={cn(
            "flex min-h-32 cursor-pointer flex-col items-center justify-center gap-3 rounded-none border-2 border-dashed border-primary/40 bg-secondary/50 p-5 text-center transition hover:border-primary/70 hover:bg-secondary",
            (!selectedKbId || busy === "upload") && "pointer-events-none opacity-60",
          )}
        >
          <Input
            id="doc-upload"
            className="sr-only"
            type="file"
            multiple
            accept=".txt,.md,.markdown,.pdf,.csv"
            disabled={!selectedKbId || busy === "upload"}
            onChange={(event) => {
              onUpload(event.target.files);
              event.currentTarget.value = "";
            }}
          />
          <span className="border border-primary/30 bg-background p-3 shadow-[4px_4px_0_rgba(67,45,27,0.1)]">
            {busy === "upload" ? (
              <Loader2 className="size-5 animate-spin text-primary" />
            ) : (
              <UploadCloud className="size-5 text-primary" />
            )}
          </span>
          <span className="space-y-1">
            <span className="block font-medium">
              {busy === "upload" ? "入库中..." : "上传 TXT / Markdown / PDF"}
            </span>
            <span className="block text-xs text-muted-foreground">
              文件会写入本地 uploads，chunk 和向量进入 Qdrant。
            </span>
          </span>
        </Label>

        {showIngestStatus ? (
          <div className="space-y-3 border border-primary/25 bg-background/65 p-3 shadow-[3px_3px_0_rgba(67,45,27,0.08)]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-primary">
                  Ingest Queue
                </p>
                <p className="text-xs text-muted-foreground">
                  {activeUploadCount || processingCount
                    ? "文档正在上传或写入向量索引，列表会自动刷新。"
                    : "最近上传已完成，状态会保留在这里方便确认。"}
                </p>
              </div>
              <Badge variant="outline" className="rounded-none font-mono">
                {activeIngestCount ? `${activeIngestCount} active` : "done"}
              </Badge>
            </div>
            {uploadQueue.length ? (
              <div className="space-y-1.5">
                {uploadQueue.map((item) => {
                  const meta = queueStatusMeta(item.status);
                  return (
                    <div key={item.id} className="flex items-center justify-between gap-3 border border-primary/15 bg-card/55 px-2 py-1.5">
                      <div className="min-w-0">
                        <p className="truncate text-xs font-medium">{item.filename}</p>
                        {item.message ? (
                          <p className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">{item.message}</p>
                        ) : null}
                      </div>
                      <Badge variant="outline" className={cn("shrink-0 rounded-none font-mono", meta.className)}>
                        {(item.status === "uploading" || item.status === "indexing") ? <Loader2 className="size-3 animate-spin" /> : null}
                        {meta.label}
                      </Badge>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>
        ) : null}

        <div
          className={cn(
            "grid min-h-0 flex-1 gap-3",
            detailLayout === "side" && "xl:grid-cols-[minmax(0,1fr)_minmax(280px,0.9fr)]",
          )}
        >
        <ScrollArea className="h-full min-h-0 pr-3">
          <div className="relative min-h-full">
            {loading ? (
              <RetroLoading label="Loading documents" />
            ) : null}
            <div className="space-y-2">
            {!loading ? docs.map((doc) => {
              const isSelected = selectedDocId === doc.id;
              const statusMeta = documentStatusMeta(doc.status);
              const StatusIcon = statusMeta.icon;
              return (
                <div
                  key={doc.id}
                  className={cn(
                    "space-y-3 border border-primary/25 bg-background/65 p-3 shadow-[3px_3px_0_rgba(67,45,27,0.08)]",
                    isSelected && "border-primary bg-accent/35",
                  )}
                >
                  <div className="space-y-2">
                    <p className="min-w-0 text-sm font-medium">
                      <TruncatedText text={doc.filename} />
                    </p>
                    <p className="font-mono text-xs text-muted-foreground">
                      {doc.chunk_count} chunks · {(doc.size / 1024).toFixed(1)} KB · {formatDateTime(doc.created_at)}
                    </p>
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                        <Badge variant="outline" className={cn("rounded-none font-mono", statusMeta.className)}>
                          {doc.status === "processing" ? (
                            <Loader2 className="size-3 animate-spin" />
                          ) : (
                            <StatusIcon className="size-3" />
                          )}
                          {statusMeta.label}
                        </Badge>
                        {doc.error_message ? (
                          <span className="line-clamp-1 min-w-0 text-xs text-destructive">{doc.error_message}</span>
                        ) : null}
                        {doc.status === "failed" ? (
                          <Button
                            type="button"
                            size="xs"
                            variant="destructive"
                            className="rounded-none font-mono"
                            disabled={busy === `reindex-${doc.id}`}
                            onClick={() => onReindexDoc(doc)}
                          >
                            {busy === `reindex-${doc.id}` ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                            重试
                          </Button>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <Button
                          type="button"
                          size="icon-sm"
                          variant={isSelected ? "secondary" : "outline"}
                          disabled={detailLoading && isSelected}
                          onClick={() => onInspectDoc(doc)}
                          aria-label={`查看 ${doc.filename}`}
                        >
                          {detailLoading && isSelected ? <Loader2 className="animate-spin" /> : <Eye />}
                        </Button>
                        <a
                          className="inline-flex size-7 items-center justify-center rounded-[min(var(--radius-md),12px)] border border-border bg-background transition hover:bg-muted"
                          href={getDocumentDownloadUrl(doc.id)}
                          aria-label={`下载 ${doc.filename}`}
                        >
                          <Download className="size-4" />
                        </a>
                        <Button
                          type="button"
                          size="icon-sm"
                          variant="outline"
                          disabled={busy === `reindex-${doc.id}` || doc.status === "processing"}
                          onClick={() => onReindexDoc(doc)}
                          aria-label={`重新索引 ${doc.filename}`}
                        >
                          {busy === `reindex-${doc.id}` ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                        </Button>
                        <Button
                          type="button"
                          size="icon-sm"
                          variant="destructive"
                          disabled={busy === `delete-${doc.id}`}
                          onClick={() => onDeleteDoc(doc.id)}
                          aria-label={`删除 ${doc.filename}`}
                        >
                          {busy === `delete-${doc.id}` ? (
                            <Loader2 className="animate-spin" />
                          ) : (
                            <Trash2 />
                          )}
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            }) : null}
            {!loading && !docs.length ? <EmptyState text="还没有文档，上传后即可提问。" /> : null}
            </div>
          </div>
        </ScrollArea>
        <aside className="min-h-0 border border-primary/25 bg-background/55 p-3 shadow-[4px_4px_0_rgba(67,45,27,0.08)]">
          {!selectedDoc ? (
            <div className="flex min-h-48 items-center justify-center border border-dashed border-primary/25 bg-card/50 p-5 text-center font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">
              选择左侧文档查看详情
            </div>
          ) : detailLoading ? (
            <RetroLoading label="Loading document detail" />
          ) : (
            <div className="flex h-full min-h-0 flex-col gap-3">
              <div className="space-y-2 border-b border-primary/20 pb-3">
                {(() => {
                  const statusMeta = documentStatusMeta(selectedDoc.status);
                  const StatusIcon = statusMeta.icon;
                  return (
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                          Document Detail
                        </p>
                        <h3 className="mt-1 min-w-0 text-sm font-semibold">
                          <TruncatedText text={selectedDoc.filename} />
                        </h3>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <Badge variant="outline" className={cn("rounded-none font-mono", statusMeta.className)}>
                          {selectedDoc.status === "processing" ? (
                            <Loader2 className="size-3 animate-spin" />
                          ) : (
                            <StatusIcon className="size-3" />
                          )}
                          {statusMeta.label}
                        </Badge>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="rounded-none font-mono uppercase tracking-[0.14em]"
                          onClick={() => onInspectDoc(selectedDoc)}
                        >
                          关闭
                        </Button>
                      </div>
                    </div>
                  );
                })()}
                {selectedDoc.status === "failed" && selectedDoc.error_message ? (
                  <div className="space-y-2 border border-destructive/25 bg-destructive/5 p-2">
                    <p className="text-xs leading-5 text-destructive">{selectedDoc.error_message}</p>
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      className="w-full rounded-none font-mono uppercase tracking-[0.14em]"
                      disabled={busy === `reindex-${selectedDoc.id}`}
                      onClick={() => onReindexDoc(selectedDoc)}
                    >
                      {busy === `reindex-${selectedDoc.id}` ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                      重试索引
                    </Button>
                  </div>
                ) : null}
                <div className="grid grid-cols-2 gap-2 font-mono text-[11px] text-muted-foreground">
                  <span>上传：{formatDateTime(selectedDoc.created_at)}</span>
                  <span>状态：{selectedDoc.status}</span>
                  <span>大小：{(selectedDoc.size / 1024).toFixed(1)} KB</span>
                  <span>Chunk：{selectedDoc.chunk_count}</span>
                </div>
                <div className="flex gap-1">
                  <a
                    className="inline-flex h-8 items-center justify-center gap-1 rounded-[min(var(--radius-md),12px)] border border-border bg-background px-2 text-xs transition hover:bg-muted"
                    href={getDocumentDownloadUrl(selectedDoc.id)}
                  >
                    <Download className="size-3.5" />
                    下载
                  </a>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="rounded-none font-mono"
                    disabled={busy === `reindex-${selectedDoc.id}` || selectedDoc.status === "processing"}
                    onClick={() => onReindexDoc(selectedDoc)}
                  >
                    {busy === `reindex-${selectedDoc.id}` ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                    重建
                  </Button>
                </div>
              </div>

              <div className="min-h-0 flex-1 space-y-3 overflow-hidden">
                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                      原文预览
                    </p>
                    {docPreview ? (
                      <span className="font-mono text-[11px] text-muted-foreground">
                        {docPreview.text.length.toLocaleString()} / {docPreview.total_chars.toLocaleString()} chars
                      </span>
                    ) : null}
                  </div>
                  <ScrollArea className="h-44 border border-primary/20 bg-card/60 p-2">
                    <pre className="whitespace-pre-wrap font-mono text-xs leading-5 text-muted-foreground">
                      {docPreview?.text || "暂无可预览文本"}
                    </pre>
                  </ScrollArea>
                  {docPreview?.truncated ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-full rounded-none font-mono uppercase tracking-[0.14em]"
                      disabled={busy === `preview-more-${selectedDoc.id}`}
                      onClick={() => onLoadMorePreview(selectedDoc.id)}
                    >
                      {busy === `preview-more-${selectedDoc.id}` ? <Loader2 className="animate-spin" /> : null}
                      加载更多原文
                    </Button>
                  ) : null}
                </div>

                <div className="space-y-2">
                  <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                    Chunks · {docChunks.length}
                  </p>
                  <ScrollArea className="h-56 pr-2">
                    <div className="space-y-2">
                      {docChunks.map((chunk) => (
                        <details key={`${chunk.doc_id}-${chunk.chunk_index}`} className="border border-primary/20 bg-card/60 p-2">
                          <summary className="cursor-pointer font-mono text-xs text-primary">
                            chunk {chunk.chunk_index}
                          </summary>
                          <p className="mt-2 whitespace-pre-wrap font-mono text-xs leading-5 text-muted-foreground">
                            {chunk.text}
                          </p>
                        </details>
                      ))}
                      {!docChunks.length ? <p className="font-mono text-xs text-muted-foreground">暂无 chunk 数据。</p> : null}
                    </div>
                  </ScrollArea>
                </div>
              </div>
            </div>
          )}
        </aside>
        </div>
      </CardContent>
    </Card>
  );
}
