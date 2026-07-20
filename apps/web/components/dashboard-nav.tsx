"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";

import { useDashboard } from "@/components/dashboard/dashboard-provider";
import { DASHBOARD_NAV_ITEMS } from "@/components/dashboard/nav-items";
import { TruncatedText } from "@/components/dashboard/shared";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function NavLinks({
  pathname,
  hrefFor,
  onNavigate,
  compact = false,
}: {
  pathname: string;
  hrefFor: (href: string) => string;
  onNavigate?: () => void;
  compact?: boolean;
}) {
  return (
    <nav className={cn("flex flex-col gap-2", compact && "gap-1.5")}>
      {DASHBOARD_NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        const active = pathname.endsWith(item.href);
        return (
          <Link
            key={item.href}
            href={hrefFor(item.href)}
            onClick={onNavigate}
            className={cn(
              "group relative flex min-h-11 items-start gap-3 border-2 border-primary/25 bg-background/65 px-3 py-3 text-left transition hover:-translate-y-0.5 hover:border-primary/60 hover:bg-secondary",
              "shadow-[3px_3px_0_rgba(67,45,27,0.08)]",
              active && "border-primary bg-accent text-primary shadow-[6px_6px_0_rgba(67,45,27,0.16)]",
            )}
          >
            <span
              className={cn(
                "flex size-8 shrink-0 items-center justify-center border border-primary/30 bg-card font-mono text-[10px] text-muted-foreground",
                active && "border-primary bg-background text-primary",
              )}
            >
              {item.code}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2 font-mono text-xs font-semibold uppercase tracking-[0.14em]">
                <Icon className="size-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </span>
              {!compact ? (
                <span className="mt-1 block min-h-10 text-xs leading-5 text-muted-foreground">
                  {item.description}
                </span>
              ) : null}
            </span>
            {active && !compact ? (
              <span className="absolute -right-2 top-3 border border-primary/50 bg-background px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.16em] text-primary">
                Open
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}

export function DashboardNav() {
  const pathname = usePathname();
  const { selectedKb, selectedKbId, kbLoading } = useDashboard();
  const [menuOpen, setMenuOpen] = useState(false);
  const currentKbId = selectedKbId || selectedKb?.id || "";
  const hrefFor = (href: string) => (currentKbId ? `/kb/${currentKbId}${href}` : href);
  const kbLabel = selectedKb?.name ?? (kbLoading ? "恢复中..." : "未选择文库");

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [menuOpen]);

  return (
    <>
      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 border-b-4 border-double border-primary/60 bg-card/95 px-3 py-2 shadow-[0_6px_0_rgba(67,45,27,0.1)] backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-7xl items-center gap-2">
          <Link href={hrefFor("/workspace")} className="shrink-0 border-2 border-primary/50 bg-background px-2.5 py-1.5 shadow-[3px_3px_0_rgba(67,45,27,0.12)]">
            <p className="font-heading text-base font-semibold leading-none text-primary">DustyKB</p>
          </Link>
          <div className="min-w-0 flex-1 border border-primary/20 bg-background/60 px-2 py-1.5">
            <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground">当前文库</p>
            <p className="min-w-0 truncate text-xs font-medium text-foreground">
              <TruncatedText text={kbLabel} />
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-11 shrink-0 rounded-none border-2 border-primary/50"
            aria-label={menuOpen ? "关闭菜单" : "打开菜单"}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          </Button>
        </div>
      </header>

      {/* Mobile drawer */}
      {menuOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-[#332313]/35"
            aria-label="关闭菜单遮罩"
            onClick={() => setMenuOpen(false)}
          />
          <div className="absolute inset-y-0 right-0 flex w-[min(20rem,88vw)] flex-col border-l-4 border-primary/60 bg-card p-4 shadow-[-8px_0_0_rgba(67,45,27,0.12)]">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="font-heading text-lg font-semibold text-primary">菜单</p>
                <p className="text-xs text-muted-foreground">选择要进入的页面</p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="size-11 rounded-none"
                aria-label="关闭菜单"
                onClick={() => setMenuOpen(false)}
              >
                <X className="size-5" />
              </Button>
            </div>
            <NavLinks pathname={pathname} hrefFor={hrefFor} onNavigate={() => setMenuOpen(false)} compact />
            <div className="mt-auto border-x border-y-2 border-dashed border-primary/25 bg-muted/50 p-3 text-xs leading-5 text-muted-foreground">
              刷新或分享链接时，会停留在当前文库。
            </div>
          </div>
        </div>
      ) : null}

      {/* Desktop sidebar */}
      <aside className="sticky top-0 z-20 hidden border-b-4 border-double border-primary/60 bg-card/95 px-5 py-6 shadow-[0_8px_0_rgba(67,45,27,0.12)] backdrop-blur lg:flex lg:min-h-screen lg:w-72 lg:flex-col lg:border-b-0 lg:border-r-4">
        <div className="flex flex-col items-stretch gap-4">
          <Link href={hrefFor("/workspace")} className="group shrink-0">
            <div className="relative border-2 border-primary/60 bg-background px-4 py-3 shadow-[6px_6px_0_rgba(67,45,27,0.16)] transition group-hover:-translate-y-0.5 group-hover:shadow-[8px_8px_0_rgba(67,45,27,0.16)]">
              <div className="absolute -right-2 -top-2 rotate-3 border-2 border-primary/50 bg-accent px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.18em] text-primary">
                KB
              </div>
              <p className="font-heading text-xl font-semibold leading-none text-primary">DustyKB</p>
              <p className="mt-1 text-xs text-muted-foreground">落灰文库 · 随问随查</p>
              <div className="mt-3 border-t border-dashed border-primary/35 pt-2 text-xs text-muted-foreground">
                把文档变成可追问的知识
              </div>
            </div>
          </Link>

          <div className="border border-primary/25 bg-background/55 px-3 py-2 text-muted-foreground shadow-[3px_3px_0_rgba(67,45,27,0.08)]">
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-primary">当前文库</p>
            <p className="mt-1 min-w-0 text-sm text-foreground">
              <TruncatedText text={kbLabel} />
            </p>
          </div>

          <NavLinks pathname={pathname} hrefFor={hrefFor} />

          <div className="border-x border-y-2 border-dashed border-primary/25 bg-muted/50 p-3 text-xs leading-5 text-muted-foreground">
            刷新或分享链接时，会停留在当前文库。
          </div>
        </div>
      </aside>
    </>
  );
}
