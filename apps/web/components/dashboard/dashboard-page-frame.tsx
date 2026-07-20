"use client";

import { AlertCircle } from "lucide-react";
import type { ReactNode } from "react";

import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export function DashboardPageFrame({
  kbCount,
  docCount = 0,
  turnCount = 0,
  error,
  children,
}: {
  kbCount: number;
  docCount?: number;
  turnCount?: number;
  error?: string | null;
  children: ReactNode;
}) {
  return (
    <main className="relative z-10 mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-5 px-4 py-6 sm:px-6 lg:px-8">
      <DashboardHeader kbCount={kbCount} docCount={docCount} turnCount={turnCount} />

      {error ? (
        <Alert variant="destructive" className="bg-card/90 backdrop-blur">
          <AlertCircle className="size-4" />
          <AlertTitle>请求失败</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {children}
    </main>
  );
}
