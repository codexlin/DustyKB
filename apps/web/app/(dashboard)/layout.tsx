import { Suspense } from "react";

import { AccessGate } from "@/components/access-gate";
import { DashboardNav } from "@/components/dashboard-nav";
import { DashboardProvider } from "@/components/dashboard/dashboard-provider";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <AccessGate>
        <DashboardProvider>
          <div className="min-h-screen lg:flex">
            <DashboardNav />
            <div className="min-w-0 flex-1">{children}</div>
          </div>
        </DashboardProvider>
      </AccessGate>
    </Suspense>
  );
}
