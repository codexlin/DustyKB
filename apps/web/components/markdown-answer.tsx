"use client";

import { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { codeToHtml } from "shiki";

import { cn } from "@/lib/utils";

type MarkdownAnswerProps = {
  content: string;
  className?: string;
  enhanced?: boolean;
};

export function MarkdownAnswer({ content, className, enhanced = false }: MarkdownAnswerProps) {
  return (
    <div className={cn("space-y-3 text-sm leading-6", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
        p: ({ children }) => <p className="whitespace-pre-wrap leading-6">{children}</p>,
        ul: ({ children }) => <ul className="ml-5 list-disc space-y-1">{children}</ul>,
        ol: ({ children }) => <ol className="ml-5 list-decimal space-y-1">{children}</ol>,
        li: ({ children }) => <li className="pl-1">{children}</li>,
        strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
        a: ({ children, href }) => (
          <a className="text-primary underline underline-offset-4" href={href} target="_blank" rel="noreferrer">
            {children}
          </a>
        ),
        table: ({ children }) => (
          <div className="overflow-x-auto border border-primary/25 bg-background/60">
            <table className="w-full border-collapse text-left font-mono text-xs">{children}</table>
          </div>
        ),
        th: ({ children }) => (
          <th className="border-b border-primary/25 bg-secondary/70 px-2 py-1 font-semibold">{children}</th>
        ),
        td: ({ children }) => <td className="border-b border-primary/15 px-2 py-1">{children}</td>,
        code({ className: codeClassName, children, ...props }) {
          const match = /language-(\w+)/.exec(codeClassName || "");
          const language = match?.[1];
          if (!language) {
            return (
              <code className="border border-primary/20 bg-muted px-1 py-0.5 font-mono text-[0.85em]" {...props}>
                {children}
              </code>
            );
          }
          return (
            <CodeBlock code={String(children).replace(/\n$/, "")} language={language} enhanced={enhanced} {...props} />
          );
        },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

function CodeBlock({
  code,
  language,
  enhanced,
}: {
  code: string;
  language: string;
  enhanced: boolean;
}) {
  const [html, setHtml] = useState("");
  const [copied, setCopied] = useState(false);
  const normalizedLanguage = useMemo(() => normalizeLanguage(language), [language]);

  useEffect(() => {
    let cancelled = false;
    if (!enhanced) {
      return;
    }

    codeToHtml(code, {
      lang: normalizedLanguage,
      theme: "vitesse-dark",
    })
      .then((value) => {
        if (!cancelled) {
          setHtml(value);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setHtml("");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [code, enhanced, normalizedLanguage]);

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="overflow-hidden border border-primary/35 bg-[#1f261f] shadow-[4px_4px_0_rgba(67,45,27,0.12)]">
      <div className="flex items-center justify-between border-b border-primary/25 bg-[#303a2b] px-3 py-1 font-mono text-[11px] uppercase tracking-[0.18em] text-[#f4e8c7]">
        <span>{language || "code"}</span>
        <div className="flex items-center gap-2">
          <span>{enhanced && html ? "shiki" : "ledgerkb"}</span>
          <button
            type="button"
            onClick={() => void copyCode()}
            className="border border-[#f4e8c7]/35 px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-[#f4e8c7] transition hover:bg-[#f4e8c7] hover:text-[#1f261f]"
          >
            {copied ? "已复制" : "复制"}
          </button>
        </div>
      </div>
      {enhanced && html ? (
        <div
          className="[&_pre]:m-0 [&_pre]:overflow-x-auto [&_pre]:bg-transparent! [&_pre]:p-3 [&_code]:font-mono [&_code]:text-xs [&_code]:leading-5"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ) : (
        <pre className="overflow-x-auto p-3">
          <code className="font-mono text-xs leading-5 text-[#f5e8c7]">{code}</code>
        </pre>
      )}
    </div>
  );
}

function normalizeLanguage(language: string) {
  const aliases: Record<string, string> = {
    py: "python",
    js: "javascript",
    ts: "typescript",
    sh: "bash",
    shell: "bash",
    zsh: "bash",
  };
  return aliases[language.toLowerCase()] ?? language.toLowerCase();
}
