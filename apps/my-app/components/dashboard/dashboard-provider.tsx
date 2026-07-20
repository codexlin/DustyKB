/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useParams, usePathname, useRouter } from "next/navigation";

import { listKnowledgeBases, type KnowledgeBase } from "@/lib/api";

const LAST_SELECTED_KB_KEY = "ledgerkb:last-selected-kb-id";
const DASHBOARD_SECTIONS = new Set(["workspace", "documents", "history", "system"]);

function getSectionFromPathname(pathname: string) {
  const section = pathname.split("/").filter(Boolean).at(-1) ?? "workspace";
  return DASHBOARD_SECTIONS.has(section) ? section : "workspace";
}

function getRememberedKbId() {
  if (typeof window === "undefined") {
    return "";
  }
  return window.localStorage.getItem(LAST_SELECTED_KB_KEY) ?? "";
}

type DashboardContextValue = {
  kbs: KnowledgeBase[];
  selectedKbId: string;
  selectedKb: KnowledgeBase | null;
  kbLoading: boolean;
  kbError: string | null;
  refreshKbs: () => Promise<KnowledgeBase[]>;
  setSelectedKbId: (kbId: string) => void;
};

const DashboardContext = createContext<DashboardContextValue | null>(null);

export function DashboardProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams<{ kbId?: string }>();
  const routeKbId = typeof params.kbId === "string" ? params.kbId : "";
  const [kbs, setKbs] = useState<KnowledgeBase[]>([]);
  const [selectedKbId, setSelectedKbIdState] = useState(routeKbId);
  const [kbLoading, setKbLoading] = useState(true);
  const [kbError, setKbError] = useState<string | null>(null);
  const pendingRouteKbIdRef = useRef<string | null>(null);

  const selectedKb = useMemo(
    () => kbs.find((item) => item.id === selectedKbId) ?? null,
    [kbs, selectedKbId],
  );

  const writeSelectedKbId = useCallback(
    (kbId: string) => {
      pendingRouteKbIdRef.current = kbId || null;
      setSelectedKbIdState(kbId);

      if (kbId) {
        window.localStorage.setItem(LAST_SELECTED_KB_KEY, kbId);
      } else {
        window.localStorage.removeItem(LAST_SELECTED_KB_KEY);
      }

      const section = getSectionFromPathname(pathname);
      router.replace(kbId ? `/kb/${kbId}/${section}` : "/workspace", { scroll: false });
    },
    [pathname, router],
  );

  const refreshKbs = useCallback(async () => {
    setKbLoading(true);
    setKbError(null);
    try {
      const data = await listKnowledgeBases();
      setKbs(data);
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : "知识库加载失败";
      setKbError(message);
      throw err;
    } finally {
      setKbLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshKbs().catch(() => {
      // Provider exposes kbError; pages decide how to present the error.
    });
  }, [refreshKbs]);

  useEffect(() => {
    if (kbLoading) return;

    if (!kbs.length) {
      if (selectedKbId) {
        writeSelectedKbId("");
      }
      return;
    }

    const validIds = new Set(kbs.map((item) => item.id));
    const pendingRouteKbId = pendingRouteKbIdRef.current;

    if (pendingRouteKbId && routeKbId === pendingRouteKbId) {
      pendingRouteKbIdRef.current = null;
    } else if (pendingRouteKbId && selectedKbId === pendingRouteKbId) {
      return;
    }

    if (routeKbId && validIds.has(routeKbId)) {
      if (selectedKbId !== routeKbId) {
        setSelectedKbIdState(routeKbId);
        window.localStorage.setItem(LAST_SELECTED_KB_KEY, routeKbId);
      }
      return;
    }

    const rememberedKbId = getRememberedKbId();
    const fallbackKbId = validIds.has(rememberedKbId)
      ? rememberedKbId
      : validIds.has(selectedKbId)
        ? selectedKbId
        : kbs[0].id;

    if (fallbackKbId !== selectedKbId || routeKbId !== fallbackKbId) {
      writeSelectedKbId(fallbackKbId);
    }
  }, [kbLoading, kbs, routeKbId, selectedKbId, writeSelectedKbId]);

  const value = useMemo(
    () => ({
      kbs,
      selectedKbId,
      selectedKb,
      kbLoading,
      kbError,
      refreshKbs,
      setSelectedKbId: writeSelectedKbId,
    }),
    [kbError, kbLoading, kbs, refreshKbs, selectedKb, selectedKbId, writeSelectedKbId],
  );

  return <DashboardContext.Provider value={value}>{children}</DashboardContext.Provider>;
}

export function useDashboard() {
  const context = useContext(DashboardContext);
  if (!context) {
    throw new Error("useDashboard must be used inside DashboardProvider");
  }
  return context;
}
