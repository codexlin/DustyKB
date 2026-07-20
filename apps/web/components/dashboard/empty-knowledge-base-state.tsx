"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Archive, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createKnowledgeBase } from "@/lib/api";
import { useDashboard } from "@/components/dashboard/dashboard-provider";

export function EmptyKnowledgeBaseState() {
  const router = useRouter();
  const { refreshKbs, setSelectedKbId } = useDashboard();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      const kb = await createKnowledgeBase(name.trim(), description.trim());
      await refreshKbs();
      setSelectedKbId(kb.id);
      toast.success("知识库已创建", { description: kb.name });
      router.replace(`/kb/${kb.id}/workspace`, { scroll: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : "创建知识库失败";
      toast.error("创建知识库失败", { description: message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="relative z-10 mx-auto flex min-h-screen w-full max-w-3xl items-center px-4 py-10 sm:px-6">
      <Card className="w-full border-4 border-double border-primary/60 bg-card/95 shadow-[12px_12px_0_rgba(67,45,27,0.14)]">
        <CardHeader className="space-y-4 text-center">
          <div className="mx-auto flex size-14 items-center justify-center border-2 border-primary/50 bg-background shadow-[5px_5px_0_rgba(67,45,27,0.12)]">
            <Archive className="size-7 text-primary" />
          </div>
          <div>
            <CardTitle className="font-heading text-3xl">还没有文库</CardTitle>
            <CardDescription className="mt-2 text-sm leading-6">
              先建一个文库，再收录资料，就可以开始提问了。
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={onCreate}>
            <div className="space-y-1.5">
              <Label htmlFor="empty-kb-name">文库名称</Label>
              <Input
                id="empty-kb-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="rounded-none border-primary/30 bg-background/70 font-mono"
                placeholder="例如：产品手册"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="empty-kb-desc">说明</Label>
              <Input
                id="empty-kb-desc"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                className="rounded-none border-primary/30 bg-background/70 font-mono"
                placeholder="一句话说明（可选）"
              />
            </div>
            <Button
              type="submit"
              disabled={busy}
              className="w-full rounded-none border border-primary/40 font-mono uppercase tracking-[0.14em]"
            >
              {busy ? <Loader2 className="animate-spin" /> : <Sparkles />}
              {busy ? "创建中" : "创建第一个文库"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
