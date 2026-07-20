import { Archive, Database, FileText, MessageSquare, type LucideIcon } from "lucide-react";

export type DashboardNavItem = {
  href: "/workspace" | "/documents" | "/history" | "/system";
  code: string;
  label: string;
  description: string;
  eyebrow: string;
  icon: LucideIcon;
};

export const DASHBOARD_NAV_ITEMS: DashboardNavItem[] = [
  {
    href: "/workspace",
    code: "01",
    label: "问答台",
    description: "对着当前文库提问，答案旁附上原文依据，方便核对。",
    eyebrow: "ASK",
    icon: MessageSquare,
  },
  {
    href: "/documents",
    code: "02",
    label: "文库",
    description: "收录资料、翻看原文；解析更新后可一键重新索引。",
    eyebrow: "SHELF",
    icon: FileText,
  },
  {
    href: "/history",
    code: "03",
    label: "档案",
    description: "翻阅过往问答，回看当时引用的证据片段。",
    eyebrow: "ARCHIVE",
    icon: Archive,
  },
  {
    href: "/system",
    code: "04",
    label: "看板",
    description: "查看服务是否正常，以及模型与检索相关配置。",
    eyebrow: "BOARD",
    icon: Database,
  },
];

export function getDashboardNavItem(pathname: string) {
  return (
    DASHBOARD_NAV_ITEMS.find((item) => pathname.endsWith(item.href)) ?? DASHBOARD_NAV_ITEMS[0]
  );
}
