"use client";

import { Database, Loader2, RefreshCw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfigBlock, EmptyState, SystemStatusSkeleton } from "@/components/dashboard/shared";
import type { SystemStatus } from "@/lib/api";
import { cn } from "@/lib/utils";

export function SystemPanel({
  systemStatus,
  busy,
  loading = false,
  onRefreshStatus,
  onTestModels,
}: {
  systemStatus: SystemStatus | null;
  busy: string | null;
  loading?: boolean;
  onRefreshStatus: () => void;
  onTestModels: () => void;
}) {
  return (
    <Card className="flex min-h-[calc(100vh-15rem)] flex-col border-2 border-primary/40 bg-card/90 shadow-[7px_7px_0_rgba(67,45,27,0.12)] backdrop-blur">
      <CardHeader>
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Database className="size-4 text-primary" /> 系统配置与健康检查
            </CardTitle>
            <CardDescription className="flex flex-wrap items-center gap-2">
              模型、检索、切分和外部服务状态。
            </CardDescription>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              type="button"
              variant="outline"
              className="rounded-none font-mono uppercase tracking-[0.14em]"
              disabled={busy === "system-status" || busy === "model-status"}
              onClick={onRefreshStatus}
            >
              {busy === "system-status" ? <Loader2 className="animate-spin" /> : <RefreshCw />}
              刷新状态
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="rounded-none border border-primary/30 font-mono uppercase tracking-[0.14em]"
              disabled={busy === "system-status" || busy === "model-status"}
              onClick={onTestModels}
            >
              {busy === "model-status" ? <Loader2 className="animate-spin" /> : <RefreshCw />}
              测试模型服务
            </Button>
          </div>
        </div>
        <p className="mt-2 font-mono text-[11px] text-muted-foreground">
          默认只检查 PostgreSQL / Qdrant；测试模型服务会调用 DashScope Embedding / Chat / Rerank，产生少量费用。
        </p>
      </CardHeader>
      <CardContent className="grid min-h-0 flex-1 content-start gap-4 lg:grid-cols-[1fr_1fr_1.2fr]">
        {loading ? (
          <div className="lg:col-span-3">
            <SystemStatusSkeleton />
          </div>
        ) : systemStatus ? (
          <>
            <ConfigBlock title="Models" data={systemStatus.models} />
            <div className="space-y-3">
              <ConfigBlock title="Retrieval" data={systemStatus.retrieval} />
              <ConfigBlock title="Chunking" data={systemStatus.chunking} />
            </div>
            <div className="space-y-3">
              <ConfigBlock title="Storage" data={systemStatus.storage} />
              <div className="border border-primary/25 bg-background/65 p-3">
                <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                  Services
                </p>
                <div className="space-y-2">
                  {systemStatus.services.map((service) => (
                    <div key={service.name} className="flex items-start justify-between gap-3 border border-primary/15 bg-card/60 p-2">
                      <div className="min-w-0">
                        <p className="flex items-center gap-2 font-mono text-xs">
                          <span className={cn("size-2 border border-primary/30", service.ok ? "bg-[#6f8f4e]" : "bg-[#b65b4b]")} />
                          {service.name}
                        </p>
                        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{service.message}</p>
                      </div>
                      <Badge variant="outline" className="shrink-0 rounded-none font-mono">
                        {service.latency_ms == null ? "-" : `${Math.round(service.latency_ms)}ms`}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </>
        ) : (
          <EmptyState text="系统状态加载中，稍后点击健康检查刷新。" />
        )}
      </CardContent>
    </Card>
  );
}
