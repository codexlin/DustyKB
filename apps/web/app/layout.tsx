import type { Metadata } from "next";
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import { IBM_Plex_Mono, Libre_Baskerville, Source_Sans_3 } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";
import { QueryProvider } from "@/components/query-provider";
import { cn } from "@/lib/utils";

const display = Libre_Baskerville({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["400", "700"],
});

const body = Source_Sans_3({
  variable: "--font-body",
  subsets: ["latin"],
});

const mono = IBM_Plex_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "DustyKB · 落灰文库",
  description: "把文档变成可追问的知识",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className={cn("h-full", display.variable, body.variable, mono.variable, "font-sans")}>
      <body className="min-h-full antialiased">
        <QueryProvider>{children}</QueryProvider>
        <Toaster
          position="bottom-center"
          mobileOffset={{ bottom: 16 }}
          icons={{
            success: <CheckCircle2 className="size-4 text-[#315c38]" />,
            error: <XCircle className="size-4 text-[#8a2f26]" />,
            info: <Info className="size-4 text-[#31556f]" />,
            warning: <AlertTriangle className="size-4 text-[#8a6428]" />,
          }}
          toastOptions={{
            classNames: {
              toast:
                "rounded-none! border-2! border-[#4b351f]! bg-[#f3e5c3]! font-mono! text-[#332313]! shadow-[7px_7px_0_rgba(67,45,27,0.22)]!",
              title: "font-mono! text-[13px]! font-semibold! uppercase! tracking-[0.12em]! text-[#332313]!",
              description: "font-sans! text-xs! leading-5! text-[#6f5636]!",
              success: "border-[#315c38]! bg-[#e4efd6]! text-[#18351f]!",
              error: "border-[#8a2f26]! bg-[#f1d4c9]! text-[#4b1b16]!",
              info: "border-[#31556f]! bg-[#dce8ec]! text-[#1d3342]!",
              warning: "border-[#8a6428]! bg-[#f2dfb6]! text-[#4b3513]!",
              closeButton: "rounded-none! border-[#4b351f]! bg-[#f3e5c3]! text-[#332313]!",
            },
          }}
        />
      </body>
    </html>
  );
}
