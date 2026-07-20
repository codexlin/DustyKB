from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional

from pydantic import BaseModel, Field


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class KnowledgeBase(BaseModel):
    id: str
    name: str
    description: str = ""
    owner_id: str = ""
    created_at: str = Field(default_factory=utc_now_iso)
    doc_count: int = 0


class AuthStatus(BaseModel):
    required: bool
    authenticated: bool
    owner_id: str = ""


class DocumentRecord(BaseModel):
    id: str
    kb_id: str
    filename: str
    content_type: str
    size: int
    chunk_count: int = 0
    status: str = "ready"
    error_message: str = ""
    progress_stage: str = ""
    progress_current: int = 0
    progress_total: int = 0
    created_at: str = Field(default_factory=utc_now_iso)


class CreateKBRequest(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    description: str = ""


class QueryRequest(BaseModel):
    kb_id: str
    question: str = Field(min_length=1, max_length=2000)
    top_k: Optional[int] = None


class QueryFeedbackRequest(BaseModel):
    feedback: str = Field(pattern="^(helpful|not_helpful)$")


class ServiceStatus(BaseModel):
    name: str
    ok: bool
    latency_ms: Optional[float] = None
    message: str = ""


class SystemStatus(BaseModel):
    app_name: str
    models: dict[str, Any]
    retrieval: dict[str, Any]
    chunking: dict[str, Any]
    storage: dict[str, Any]
    services: list[ServiceStatus]


class SourceCitation(BaseModel):
    doc_id: str
    filename: str
    chunk_index: int
    score: float
    text: str
    content_type: str = "text"
    parser: str = ""
    page: Optional[int] = None
    section: Optional[str] = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    dense_score: Optional[float] = None
    bm25_score: Optional[float] = None
    rrf_score: Optional[float] = None
    vector_score: Optional[float] = None


class DocumentChunk(BaseModel):
    doc_id: str
    filename: str
    chunk_index: int
    text: str
    content_type: str = "text"
    parser: str = ""
    page: Optional[int] = None
    section: Optional[str] = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class DocumentPreview(BaseModel):
    doc: DocumentRecord
    text: str
    offset: int = 0
    limit: int = 5000
    total_chars: int = 0
    next_offset: Optional[int] = None
    truncated: bool = False


class QueryResponse(BaseModel):
    answer: str
    sources: list[SourceCitation]
    model: str
    latency_ms: Optional[float] = None
    query_log_id: Optional[str] = None
    feedback: Optional[str] = None


class QueryLogRecord(BaseModel):
    id: str
    kb_id: str
    question: str
    answer: str
    sources: list[SourceCitation]
    model: str
    latency_ms: float
    feedback: Optional[str] = None
    feedback_at: Optional[str] = None
    created_at: str


class ApiEnvelope(BaseModel):
    data: Any = None
    error: Optional[str] = None
