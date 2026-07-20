"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { KeyRound, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { clearAccessToken, getAuthStatus, getAccessToken, setAccessToken } from "@/lib/api";

export function AccessGate({ children }: { children: ReactNode }) {
  const [checking, setChecking] = useState(true);
  const [required, setRequired] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      try {
        const status = await getAuthStatus();
        if (cancelled) return;
        setRequired(status.required);
        setUnlocked(!status.required || status.authenticated);
      } catch (err) {
        if (cancelled) return;
        // If status itself fails with a stored bad token, still show unlock when token exists.
        setRequired(Boolean(getAccessToken()));
        setUnlocked(false);
        setError(err instanceof Error ? err.message : "无法检查访问状态");
      } finally {
        if (!cancelled) setChecking(false);
      }
    }

    boot();
    return () => {
      cancelled = true;
    };
  }, []);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setAccessToken(token);
    try {
      const status = await getAuthStatus();
      if (status.required && !status.authenticated) {
        clearAccessToken();
        setUnlocked(false);
        setError("口令不正确");
        return;
      }
      setRequired(status.required);
      setUnlocked(true);
    } catch (err) {
      clearAccessToken();
      setUnlocked(false);
      setError(err instanceof Error ? err.message : "解锁失败");
    } finally {
      setSubmitting(false);
    }
  }

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
      </div>
    );
  }

  if (!required || unlocked) {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-md space-y-5 border-2 border-[#4b351f] bg-[#f3e5c3] p-6 shadow-[8px_8px_0_rgba(67,45,27,0.18)]"
      >
        <div className="space-y-2">
          <p className="font-mono text-xs uppercase tracking-[0.16em] text-[#6f5636]">DustyKB</p>
          <h1 className="font-display text-3xl text-[#332313]">输入访问口令</h1>
          <p className="text-sm leading-6 text-[#6f5636]">
            此知识库已开启访问保护，请输入管理员提供的口令后继续。
          </p>
        </div>
        <div className="space-y-2">
          <label htmlFor="access-token" className="text-xs font-medium text-[#4b351f]">
            访问口令
          </label>
          <Input
            id="access-token"
            type="password"
            autoComplete="current-password"
            value={token}
            onChange={(event) => setToken(event.target.value)}
            className="rounded-none border-[#4b351f] bg-[#fff8e8]"
            placeholder="请输入口令"
            required
          />
        </div>
        {error ? <p className="text-sm text-[#8a2f26]">{error}</p> : null}
        <Button type="submit" disabled={submitting || !token.trim()} className="w-full rounded-none font-mono">
          {submitting ? <Loader2 className="animate-spin" /> : <KeyRound />}
          进入
        </Button>
      </form>
    </div>
  );
}
