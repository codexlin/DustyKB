"use client";

import { cn } from "@/lib/utils";

const STOP_WORDS = new Set([
  "什么",
  "怎么",
  "如何",
  "为什么",
  "请问",
  "请",
  "一下",
  "这个",
  "那个",
  "哪些",
  "是否",
  "可以",
  "以及",
  "进行",
  "展示",
  "说明",
  "的是",
  "是什",
  "是什么",
  "ledgerkb",
  "rag",
  "the",
  "and",
  "or",
  "what",
  "how",
  "why",
]);

export function extractKeywords(question: string) {
  const normalized = question
    .replace(/[^\p{Script=Han}\p{Letter}\p{Number}_-]+/gu, " ")
    .trim();
  const candidates = normalized.match(/[\p{Script=Han}]{2,}|[A-Za-z][A-Za-z0-9_-]{1,}/gu) ?? [];
  const expanded = candidates.flatMap((item) => {
    const trimmed = cleanCandidate(item.trim());
    if (!/^[\p{Script=Han}]+$/u.test(trimmed) || trimmed.length <= 2) {
      return [trimmed];
    }

    const grams = new Set<string>([trimmed]);
    for (let index = 0; index <= trimmed.length - 2; index += 2) {
      grams.add(trimmed.slice(index, index + 2));
    }
    return Array.from(grams);
  });

  return Array.from(
    new Set(
      expanded
        .map((item) => item.trim())
        .filter((item) => item.length >= 2)
        .filter((item) => !STOP_WORDS.has(item.toLowerCase())),
    ),
  )
    .sort((a, b) => b.length - a.length)
    .slice(0, 10);
}

export function getMatchedKeywords(text: string, question: string) {
  const lowerText = text.toLowerCase();
  const matched = extractKeywords(question).filter((keyword) => lowerText.includes(keyword.toLowerCase()));
  return filterCoveredKeywords(matched);
}

export function HighlightText({
  text,
  question,
  className,
}: {
  text: string;
  question: string;
  className?: string;
}) {
  const keywords = getMatchedKeywords(text, question);
  if (!keywords.length) {
    return <span className={className}>{text}</span>;
  }

  const pattern = new RegExp(`(${keywords.sort((a, b) => b.length - a.length).map(escapeRegExp).join("|")})`, "giu");
  const parts = text.split(pattern);

  return (
    <span className={className}>
      {parts.map((part, index) => {
        const isHit = keywords.some((keyword) => keyword.toLowerCase() === part.toLowerCase());
        if (!isHit) {
          return <span key={`${part}-${index}`}>{part}</span>;
        }
        return (
          <mark
            key={`${part}-${index}`}
            className="border border-primary/25 bg-[#f4d06f]/70 px-0.5 font-semibold text-[#3c2a18]"
          >
            {part}
          </mark>
        );
      })}
    </span>
  );
}

export function SourceMatchNote({
  text,
  question,
  score,
  className,
}: {
  text: string;
  question: string;
  score: number;
  className?: string;
}) {
  const matchedKeywords = getMatchedKeywords(text, question);

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5 font-mono text-[11px] text-muted-foreground", className)}>
      <span className="border border-primary/20 bg-background/70 px-1.5 py-0.5">
        score {score.toFixed(3)}
      </span>
      {matchedKeywords.length ? (
        <>
          <span>命中</span>
          {matchedKeywords.map((keyword) => (
            <span key={keyword} className="border border-primary/25 bg-[#f4d06f]/60 px-1.5 py-0.5 text-[#3c2a18]">
              {keyword}
            </span>
          ))}
        </>
      ) : (
        <span>未直接命中问题关键词，可能来自语义召回或 Rerank 排序。</span>
      )}
    </div>
  );
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function cleanCandidate(value: string) {
  return value
    .replace(/^(的|请问|请|关于)/u, "")
    .replace(/(是什么|有哪些|为什么|怎么做|如何|什么)$/u, "")
    .trim();
}

function filterCoveredKeywords(keywords: string[]) {
  const sorted = [...keywords].sort((a, b) => b.length - a.length);
  return sorted.filter((keyword, index) => {
    const lowerKeyword = keyword.toLowerCase();
    return !sorted
      .slice(0, index)
      .some((longer) => longer.length > keyword.length && longer.toLowerCase().includes(lowerKeyword));
  });
}
