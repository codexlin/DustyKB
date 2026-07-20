"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { EmptyKnowledgeBaseState } from "@/components/dashboard/empty-knowledge-base-state";
import { EmptyState } from "@/components/dashboard/shared";
import { useDashboard } from "@/components/dashboard/dashboard-provider";

export function LegacyDashboardRedirect({ section }: { section: "workspace" | "documents" | "history" | "system" }) {
  const router = useRouter();
  const { kbs, kbLoading, selectedKbId } = useDashboard();
  const targetKbId = selectedKbId || kbs[0]?.id || "";

  useEffect(() => {
    if (kbLoading || !targetKbId) return;
    router.replace(`/kb/${targetKbId}/${section}`, { scroll: false });
  }, [kbLoading, router, section, targetKbId]);

  if (!kbLoading && !kbs.length) {
    return <EmptyKnowledgeBaseState />;
  }

  return <EmptyState text={kbLoading ? "正在恢复最近的知识库..." : "正在进入知识库工作区..."} />;
}
