import { Suspense } from "react";

import { DashboardNav } from "@/components/dashboard-nav";
import { DashboardProvider } from "@/components/dashboard/dashboard-provider";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <DashboardProvider>
        <div className="min-h-screen lg:flex">
          <DashboardNav />
          <div className="min-w-0 flex-1">{children}</div>
        </div>
      </DashboardProvider>
    </Suspense>
  );
}
