const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export type KnowledgeBase = {
  id: string;
  name: string;
  description: string;
  created_at: string;
  doc_count: number;
};

export type DocumentRecord = {
  id: string;
  kb_id: string;
  filename: string;
  content_type: string;
  size: number;
  chunk_count: number;
  status: string;
  error_message: string;
  progress_stage?: string;
  progress_current?: number;
  progress_total?: number;
  created_at: string;
};

const PROGRESS_STAGE_LABELS: Record<string, string> = {
  queued: "排队中",
  parsing: "解析中",
  chunking: "切分中",
  embedding: "向量化",
  upserting: "写入向量库",
  ready: "完成",
  failed: "失败",
};

export function formatDocumentProgress(doc: Pick<DocumentRecord, "status" | "progress_stage" | "progress_current" | "progress_total" | "error_message" | "chunk_count">) {
  if (doc.status === "failed") {
    return doc.error_message || "索引失败";
  }
  if (doc.status === "ready") {
    return `${doc.chunk_count} chunks ready`;
  }
  const stage = doc.progress_stage || "processing";
  const label = PROGRESS_STAGE_LABELS[stage] || stage;
  const current = doc.progress_current ?? 0;
  const total = doc.progress_total ?? 0;
  if (stage === "embedding" && total > 0) {
    return `${label} ${current}/${total}`;
  }
  if (total > 0 && current > 0) {
    return `${label} ${current}/${total}`;
  }
  return label;
}

export type DocumentChunk = {
  doc_id: string;
  filename: string;
  chunk_index: number;
  text: string;
  content_type: string;
  parser: string;
  page?: number | null;
  section?: string | null;
  metadata: Record<string, unknown>;
};

export type DocumentPreview = {
  doc: DocumentRecord;
  text: string;
  offset: number;
  limit: number;
  total_chars: number;
  next_offset: number | null;
  truncated: boolean;
};

export type SourceCitation = {
  doc_id: string;
  filename: string;
  chunk_index: number;
  score: number;
  text: string;
  content_type: string;
  parser: string;
  page?: number | null;
  section?: string | null;
  metadata: Record<string, unknown>;
  dense_score?: number | null;
  bm25_score?: number | null;
  rrf_score?: number | null;
  vector_score?: number | null;
};

export type QueryResult = {
  answer: string;
  sources: SourceCitation[];
  model: string;
  latency_ms?: number | null;
  query_log_id?: string | null;
  feedback?: "helpful" | "not_helpful" | null;
};

export type QueryLogRecord = QueryResult & {
  id: string;
  kb_id: string;
  question: string;
  latency_ms: number;
  feedback?: "helpful" | "not_helpful" | null;
  feedback_at?: string | null;
  created_at: string;
};

export type ServiceStatus = {
  name: string;
  ok: boolean;
  latency_ms: number | null;
  message: string;
};

export type SystemStatus = {
  app_name: string;
  models: Record<string, string | number | boolean>;
  retrieval: Record<string, string | number | boolean>;
  chunking: Record<string, string | number | boolean>;
  storage: Record<string, string | number | boolean>;
  services: ServiceStatus[];
};

type Envelope<T> = {
  data: T;
  error: string | null;
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, init);
  const payload = (await response.json().catch(() => null)) as Envelope<T> | null;

  if (!response.ok) {
    const detail =
      (payload as { detail?: string } | null)?.detail ||
      payload?.error ||
      `Request failed (${response.status})`;
    throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
  }

  if (!payload) {
    throw new Error("Empty response");
  }

  return payload.data;
}

export function listKnowledgeBases() {
  return request<KnowledgeBase[]>("/api/kb");
}

export function getSystemStatus(deep = false) {
  return request<SystemStatus>(`/api/system/status?deep=${deep}`);
}

export function createKnowledgeBase(name: string, description = "") {
  return request<KnowledgeBase>("/api/kb", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, description }),
  });
}

export function deleteKnowledgeBase(kbId: string) {
  return request<KnowledgeBase>(`/api/kb/${kbId}`, { method: "DELETE" });
}

export function listDocuments(kbId: string) {
  return request<DocumentRecord[]>(`/api/kb/${kbId}/docs`);
}

export function getDocumentPreview(docId: string, offset = 0, limit = 5000) {
  return request<DocumentPreview>(`/api/docs/${docId}/preview?offset=${offset}&limit=${limit}`);
}

export function listDocumentChunks(docId: string) {
  return request<DocumentChunk[]>(`/api/docs/${docId}/chunks`);
}

export function getDocumentDownloadUrl(docId: string) {
  return `${API_BASE}/api/docs/${docId}/download`;
}

export function listQueryLogs(kbId: string, limit = 30) {
  return request<QueryLogRecord[]>(`/api/kb/${kbId}/query-logs?limit=${limit}`);
}

export function updateQueryFeedback(logId: string, feedback: "helpful" | "not_helpful") {
  return request<QueryLogRecord>(`/api/query-logs/${logId}/feedback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ feedback }),
  });
}

export async function uploadDocument(kbId: string, file: File) {
  const form = new FormData();
  form.append("kb_id", kbId);
  form.append("file", file);
  return request<DocumentRecord>("/api/docs/upload", {
    method: "POST",
    body: form,
  });
}

export function deleteDocument(docId: string) {
  return request<DocumentRecord>(`/api/docs/${docId}`, { method: "DELETE" });
}

export function reindexDocument(docId: string) {
  return request<DocumentRecord>(`/api/docs/${docId}/reindex`, { method: "POST" });
}

export function askQuestion(kbId: string, question: string) {
  return request<QueryResult>("/api/query", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kb_id: kbId, question }),
  });
}

export type QueryStreamHandlers = {
  onSources?: (sources: SourceCitation[]) => void;
  onToken?: (token: string) => void;
  onDone?: (result: QueryResult) => void;
  onError?: (message: string) => void;
};

export async function askQuestionStream(
  kbId: string,
  question: string,
  handlers: QueryStreamHandlers,
  options?: { signal?: AbortSignal },
) {
  const response = await fetch(`${API_BASE}/api/query/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kb_id: kbId, question }),
    signal: options?.signal,
  });

  if (!response.ok || !response.body) {
    throw new Error(`Stream request failed (${response.status})`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let boundary = buffer.indexOf("\n\n");
      while (boundary !== -1) {
        const raw = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        handleSseBlock(raw, handlers);
        boundary = buffer.indexOf("\n\n");
      }
    }

    if (buffer.trim()) {
      handleSseBlock(buffer, handlers);
    }
  } catch (error) {
    if (options?.signal?.aborted || (error instanceof DOMException && error.name === "AbortError")) {
      throw new DOMException("The operation was aborted.", "AbortError");
    }
    throw error;
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // stream may already be cancelled
    }
  }
}

export function isAbortError(error: unknown) {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (error instanceof Error && error.name === "AbortError")
  );
}

function handleSseBlock(raw: string, handlers: QueryStreamHandlers) {
  const event = raw
    .split("\n")
    .find((line) => line.startsWith("event:"))
    ?.replace("event:", "")
    .trim();
  const dataLine = raw
    .split("\n")
    .find((line) => line.startsWith("data:"))
    ?.replace("data:", "")
    .trim();

  if (!event || !dataLine) return;
  const data = JSON.parse(dataLine);

  if (event === "sources") {
    handlers.onSources?.(data as SourceCitation[]);
    return;
  }
  if (event === "token") {
    handlers.onToken?.(data as string);
    return;
  }
  if (event === "done") {
    handlers.onDone?.(data as QueryResult);
    return;
  }
  if (event === "error") {
    const message = typeof data?.message === "string" ? data.message : "流式问答失败";
    handlers.onError?.(message);
  }
}
