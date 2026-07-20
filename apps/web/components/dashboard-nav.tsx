"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Archive, Database, FileText, MessageSquare } from "lucide-react";

import { useDashboard } from "@/components/dashboard/dashboard-provider";
import { TruncatedText } from "@/components/dashboard/shared";
import { cn } from "@/lib/utils";

const navItems = [
  {
    href: "/workspace",
    code: "01",
    label: "问答工作台",
    description: "基于当前知识库提问、生成回答与核对引用",
    icon: MessageSquare,
  },
  {
    href: "/documents",
    code: "02",
    label: "文档入库",
    description: "上传资料、查看原文 chunks、重建向量索引",
    icon: FileText,
  },
  {
    href: "/history",
    code: "03",
    label: "问答档案",
    description: "回溯历史问题、来源证据与质量反馈",
    icon: Archive,
  },
  {
    href: "/system",
    code: "04",
    label: "系统仪表",
    description: "观察模型配置、检索参数与服务健康",
    icon: Database,
  },
];

export function DashboardNav() {
  const pathname = usePathname();
  const { selectedKb, selectedKbId, kbLoading } = useDashboard();
  const currentKbId = selectedKbId || selectedKb?.id || "";
  const hrefFor = (href: string) => (currentKbId ? `/kb/${currentKbId}${href}` : href);

  return (
    <aside className="sticky top-0 z-20 border-b-4 border-double border-primary/60 bg-card/95 px-4 py-3 shadow-[0_8px_0_rgba(67,45,27,0.12)] backdrop-blur lg:min-h-screen lg:w-72 lg:border-b-0 lg:border-r-4 lg:px-5 lg:py-6">
      <div className="mx-auto flex max-w-7xl items-center gap-4 lg:mx-0 lg:flex-col lg:items-stretch">
        <Link href={hrefFor("/workspace")} className="group shrink-0">
          <div className="relative border-2 border-primary/60 bg-background px-4 py-3 shadow-[6px_6px_0_rgba(67,45,27,0.16)] transition group-hover:-translate-y-0.5 group-hover:shadow-[8px_8px_0_rgba(67,45,27,0.16)]">
            <div className="absolute -right-2 -top-2 rotate-3 border-2 border-primary/50 bg-accent px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.18em] text-primary">
              KB
            </div>
            <p className="font-heading text-xl font-semibold leading-none text-primary">DustyKB</p>
            <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
              Archive Console
            </p>
            <div className="mt-3 border-t border-dashed border-primary/35 pt-2 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
              <span className="text-primary">Catalog</span> · RAG System
            </div>
          </div>
        </Link>

        <div className="hidden border border-primary/25 bg-background/55 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground shadow-[3px_3px_0_rgba(67,45,27,0.08)] lg:block">
          <p className="text-primary">Current KB</p>
          <p className="mt-1 min-w-0 normal-case tracking-normal text-foreground">
            <TruncatedText text={selectedKb?.name ?? (kbLoading ? "恢复中..." : "未选择知识库")} />
          </p>
        </div>

        <nav className="flex min-w-0 flex-1 gap-2 overflow-x-auto lg:flex-col lg:overflow-visible">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = pathname.endsWith(item.href);
            return (
              <Link
                key={item.href}
                href={hrefFor(item.href)}
                className={cn(
                  "group relative flex min-w-44 shrink-0 items-start gap-3 border-2 border-primary/25 bg-background/65 px-3 py-3 text-left transition hover:-translate-y-0.5 hover:border-primary/60 hover:bg-secondary lg:w-full",
                  "shadow-[3px_3px_0_rgba(67,45,27,0.08)]",
                  active && "border-primary bg-accent text-primary shadow-[6px_6px_0_rgba(67,45,27,0.16)]",
                )}
              >
                <span className={cn(
                  "flex size-8 shrink-0 items-center justify-center border border-primary/30 bg-card font-mono text-[10px] text-muted-foreground",
                  active && "border-primary bg-background text-primary",
                )}>
                  {item.code}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2 font-mono text-xs font-semibold uppercase tracking-[0.14em]">
                    <Icon className="size-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </span>
                  <span className="mt-1 hidden min-h-10 text-xs leading-5 text-muted-foreground lg:block">
                    {item.description}
                  </span>
                </span>
                {active ? (
                  <span className="absolute -right-2 top-3 hidden border border-primary/50 bg-background px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.16em] text-primary lg:block">
                    Open
                  </span>
                ) : null}
              </Link>
            );
          })}
        </nav>

        <div className="hidden border-x border-y-2 border-dashed border-primary/25 bg-muted/50 p-3 font-mono text-[10px] leading-5 text-muted-foreground lg:block">
          当前知识库已经写入 <span className="text-primary">/kb/[id]</span> 路径，刷新或复制链接都能保持上下文。
        </div>
      </div>
    </aside>
  );
}
