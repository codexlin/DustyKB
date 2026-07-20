from __future__ import annotations

from functools import lru_cache
import json
import logging
import time
import uuid

import httpx
import psycopg
from fastapi import Depends, FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse

from app.config import Settings, get_settings
from app.logging_config import configure_logging
from app.schemas import ApiEnvelope, CreateKBRequest, DocumentChunk, DocumentPreview, QueryFeedbackRequest, QueryRequest, ServiceStatus, SystemStatus
from app.services.llm import ChatClient, EmbeddingClient, RerankClient
from app.services.documents import extract_text
from app.services.chunk_store import ChunkStore
from app.services.qdrant_store import QdrantStore
from app.services.query_logs import QueryLogStore
from app.services.rag import RagService
from app.services.store import MetadataStore

logger = logging.getLogger(__name__)


@lru_cache
def get_rag_service() -> RagService:
    return RagService(get_settings())


@lru_cache
def get_metadata_store() -> MetadataStore:
    return MetadataStore(get_settings())


def get_meta() -> MetadataStore:
    return get_metadata_store()


@lru_cache
def get_query_log_store() -> QueryLogStore:
    return QueryLogStore(get_settings())


def get_query_logs() -> QueryLogStore:
    return get_query_log_store()


@lru_cache
def get_qdrant_store() -> QdrantStore:
    return QdrantStore(get_settings())


def get_vectors() -> QdrantStore:
    return get_qdrant_store()


@lru_cache
def get_chunk_store() -> ChunkStore:
    return ChunkStore(get_settings())


def get_chunks() -> ChunkStore:
    return get_chunk_store()


def create_app() -> FastAPI:
    configure_logging()
    settings = get_settings()
    app = FastAPI(title=settings.app_name)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.middleware("http")
    async def log_requests(request: Request, call_next):
        request_id = request.headers.get("x-request-id", str(uuid.uuid4()))
        start = time.perf_counter()
        logger.info(
            "request.start id=%s method=%s path=%s client=%s",
            request_id,
            request.method,
            request.url.path,
            request.client.host if request.client else "-",
        )
        try:
            response = await call_next(request)
        except Exception:
            duration_ms = (time.perf_counter() - start) * 1000
            logger.exception(
                "request.error id=%s method=%s path=%s duration_ms=%.1f",
                request_id,
                request.method,
                request.url.path,
                duration_ms,
            )
            raise
        duration_ms = (time.perf_counter() - start) * 1000
        response.headers["x-request-id"] = request_id
        logger.info(
            "request.end id=%s method=%s path=%s status=%s duration_ms=%.1f",
            request_id,
            request.method,
            request.url.path,
            response.status_code,
            duration_ms,
        )
        return response

    @app.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    def check_service(name: str, probe) -> ServiceStatus:
        started = time.perf_counter()
        try:
            message = probe()
            return ServiceStatus(
                name=name,
                ok=True,
                latency_ms=(time.perf_counter() - started) * 1000,
                message=message or "ok",
            )
        except Exception as exc:
            logger.exception("system.status_failed service=%s", name)
            return ServiceStatus(
                name=name,
                ok=False,
                latency_ms=(time.perf_counter() - started) * 1000,
                message=str(exc),
            )

    @app.get(f"{settings.api_prefix}/system/status")
    def system_status(deep: bool = False) -> ApiEnvelope:
        def postgres_probe() -> str:
            with psycopg.connect(settings.database_url) as conn:
                with conn.cursor() as cur:
                    cur.execute("SELECT 1")
            return "connected"

        def qdrant_probe() -> str:
            response = httpx.get(f"{settings.qdrant_url.rstrip('/')}/collections", timeout=5)
            response.raise_for_status()
            return settings.qdrant_collection

        def embedding_probe() -> str:
            vector = EmbeddingClient(settings).embed_query("health check")
            return f"{len(vector)} dimensions"

        def chat_probe() -> str:
            answer = ChatClient(settings).answer(question="请回复 OK", context="健康检查")
            return answer[:40] or "ok"

        def rerank_probe() -> str:
            if not settings.rerank_enabled:
                return "disabled"
            result = RerankClient(settings).rerank(
                query="health check",
                documents=["health check", "unrelated"],
                top_n=1,
            )
            return f"{len(result)} result"

        services = [
            check_service("postgres", postgres_probe),
            check_service("qdrant", qdrant_probe),
        ]
        if deep:
            services.extend(
                [
                    check_service("embedding", embedding_probe),
                    check_service("chat", chat_probe),
                    check_service("rerank", rerank_probe),
                ]
            )
        payload = SystemStatus(
            app_name=settings.app_name,
            models={
                "embedding": settings.embedding_model,
                "embedding_dim": settings.embedding_dim,
                "chat": settings.chat_model,
                "rerank": settings.rerank_model,
                "rerank_enabled": settings.rerank_enabled,
            },
            retrieval={
                "mode": "hybrid" if settings.hybrid_enabled else "dense",
                "retrieve_top_k": settings.retrieve_top_k,
                "bm25_top_k": settings.bm25_top_k,
                "rrf_k": settings.rrf_k,
                "hybrid_enabled": settings.hybrid_enabled,
                "rerank_top_k": settings.rerank_top_k,
            },
            chunking={
                "chunk_size": settings.chunk_size,
                "chunk_overlap": settings.chunk_overlap,
            },
            storage={
                "qdrant_url": settings.qdrant_url,
                "qdrant_collection": settings.qdrant_collection,
                "database": settings.database_url.split("@")[-1] if "@" in settings.database_url else "configured",
                "data_dir": settings.data_dir,
            },
            services=services,
        )
        return ApiEnvelope(data=payload)

    @app.get(f"{settings.api_prefix}/kb")
    def list_kb(meta: MetadataStore = Depends(get_meta)) -> ApiEnvelope:
        kbs = meta.list_kbs()
        logger.info("kb.list count=%s", len(kbs))
        return ApiEnvelope(data=kbs)

    @app.post(f"{settings.api_prefix}/kb")
    def create_kb(
        body: CreateKBRequest,
        meta: MetadataStore = Depends(get_meta),
    ) -> ApiEnvelope:
        kb = meta.create_kb(body.name, body.description)
        logger.info("kb.create kb_id=%s name=%s", kb.id, kb.name)
        return ApiEnvelope(data=kb)

    @app.delete(f"{settings.api_prefix}/kb/{{kb_id}}")
    def delete_kb(
        kb_id: str,
        meta: MetadataStore = Depends(get_meta),
        vectors: QdrantStore = Depends(get_vectors),
        logs: QueryLogStore = Depends(get_query_logs),
        rag: RagService = Depends(get_rag_service),
    ) -> ApiEnvelope:
        kb = meta.get_kb(kb_id)
        if kb is None:
            raise HTTPException(status_code=404, detail="Knowledge base not found")
        vectors.delete_by_kb(kb_id)
        logs.delete_by_kb(kb_id)
        deleted = meta.delete_kb(kb_id)
        rag.bm25_cache.invalidate(kb_id)
        logger.info("kb.delete kb_id=%s name=%s", kb_id, kb.name)
        return ApiEnvelope(data=deleted)

    @app.get(f"{settings.api_prefix}/kb/{{kb_id}}/docs")
    def list_docs(kb_id: str, meta: MetadataStore = Depends(get_meta)) -> ApiEnvelope:
        if meta.get_kb(kb_id) is None:
            raise HTTPException(status_code=404, detail="Knowledge base not found")
        docs = meta.list_docs(kb_id)
        logger.info("docs.list kb_id=%s count=%s", kb_id, len(docs))
        return ApiEnvelope(data=docs)

    @app.post(f"{settings.api_prefix}/docs/upload")
    async def upload_doc(
        kb_id: str = Form(...),
        file: UploadFile = File(...),
        rag: RagService = Depends(get_rag_service),
    ) -> ApiEnvelope:
        content = await file.read()
        logger.info(
            "docs.upload.start kb_id=%s filename=%s content_type=%s size=%s",
            kb_id,
            file.filename,
            file.content_type,
            len(content),
        )
        if not content:
            raise HTTPException(status_code=400, detail="Empty file")
        try:
            doc = rag.ingest_file(
                kb_id=kb_id,
                filename=file.filename or "untitled.txt",
                content_type=file.content_type or "application/octet-stream",
                content=content,
            )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except RuntimeError as exc:
            raise HTTPException(status_code=500, detail=str(exc)) from exc
        logger.info(
            "docs.upload.end kb_id=%s doc_id=%s filename=%s chunks=%s",
            kb_id,
            doc.id,
            doc.filename,
            doc.chunk_count,
        )
        return ApiEnvelope(data=doc)

    @app.delete(f"{settings.api_prefix}/docs/{{doc_id}}")
    def delete_doc(doc_id: str, rag: RagService = Depends(get_rag_service)) -> ApiEnvelope:
        try:
            deleted = rag.delete_document(doc_id)
        except ValueError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        logger.info("docs.delete doc_id=%s kb_id=%s filename=%s", doc_id, deleted.kb_id, deleted.filename)
        return ApiEnvelope(data=deleted)

    @app.post(f"{settings.api_prefix}/docs/{{doc_id}}/reindex")
    def reindex_doc(doc_id: str, rag: RagService = Depends(get_rag_service)) -> ApiEnvelope:
        try:
            doc = rag.reindex_document(doc_id)
        except ValueError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        except RuntimeError as exc:
            raise HTTPException(status_code=500, detail=str(exc)) from exc
        logger.info("docs.reindex doc_id=%s kb_id=%s chunks=%s", doc.id, doc.kb_id, doc.chunk_count)
        return ApiEnvelope(data=doc)

    @app.get(f"{settings.api_prefix}/docs/{{doc_id}}")
    def get_doc(doc_id: str, meta: MetadataStore = Depends(get_meta)) -> ApiEnvelope:
        doc = meta.get_doc(doc_id)
        if doc is None:
            raise HTTPException(status_code=404, detail="Document not found")
        return ApiEnvelope(data=doc)

    @app.get(f"{settings.api_prefix}/docs/{{doc_id}}/chunks")
    def list_doc_chunks(
        doc_id: str,
        meta: MetadataStore = Depends(get_meta),
        chunks: ChunkStore = Depends(get_chunks),
    ) -> ApiEnvelope:
        doc = meta.get_doc(doc_id)
        if doc is None:
            raise HTTPException(status_code=404, detail="Document not found")
        chunk_rows = chunks.list_by_doc(doc_id)
        return ApiEnvelope(data=[DocumentChunk.model_validate(item) for item in chunk_rows])

    @app.get(f"{settings.api_prefix}/docs/{{doc_id}}/preview")
    def preview_doc(
        doc_id: str,
        offset: int = 0,
        limit: int = 5000,
        meta: MetadataStore = Depends(get_meta),
    ) -> ApiEnvelope:
        doc = meta.get_doc(doc_id)
        if doc is None:
            raise HTTPException(status_code=404, detail="Document not found")
        path = meta.upload_path(doc)
        if not path.exists():
            raise HTTPException(status_code=404, detail="Original file not found")
        try:
            text = extract_text(doc.filename, path.read_bytes()).strip()
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        safe_offset = max(offset, 0)
        safe_limit = min(max(limit, 1), 20000)
        total_chars = len(text)
        end = min(safe_offset + safe_limit, total_chars)
        next_offset = end if end < total_chars else None
        return ApiEnvelope(
            data=DocumentPreview(
                doc=doc,
                text=text[safe_offset:end],
                offset=safe_offset,
                limit=safe_limit,
                total_chars=total_chars,
                next_offset=next_offset,
                truncated=next_offset is not None,
            )
        )

    @app.get(f"{settings.api_prefix}/docs/{{doc_id}}/download")
    def download_doc(doc_id: str, meta: MetadataStore = Depends(get_meta)) -> FileResponse:
        doc = meta.get_doc(doc_id)
        if doc is None:
            raise HTTPException(status_code=404, detail="Document not found")
        path = meta.upload_path(doc)
        if not path.exists():
            raise HTTPException(status_code=404, detail="Original file not found")
        return FileResponse(
            path,
            media_type=doc.content_type or "application/octet-stream",
            filename=doc.filename,
        )

    @app.get(f"{settings.api_prefix}/kb/{{kb_id}}/query-logs")
    def list_query_logs(
        kb_id: str,
        limit: int = 50,
        meta: MetadataStore = Depends(get_meta),
        logs: QueryLogStore = Depends(get_query_logs),
    ) -> ApiEnvelope:
        if meta.get_kb(kb_id) is None:
            raise HTTPException(status_code=404, detail="Knowledge base not found")
        records = logs.list_by_kb(kb_id, limit=limit)
        return ApiEnvelope(data=records)

    @app.post(f"{settings.api_prefix}/query")
    def query(
        body: QueryRequest,
        rag: RagService = Depends(get_rag_service),
        logs: QueryLogStore = Depends(get_query_logs),
    ) -> ApiEnvelope:
        logger.info(
            "query.start kb_id=%s question_len=%s top_k=%s",
            body.kb_id,
            len(body.question),
            body.top_k,
        )
        started = time.perf_counter()
        try:
            result = rag.query(kb_id=body.kb_id, question=body.question, top_k=body.top_k)
        except ValueError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        except RuntimeError as exc:
            raise HTTPException(status_code=500, detail=str(exc)) from exc
        latency_ms = (time.perf_counter() - started) * 1000
        try:
            record = logs.create(
                kb_id=body.kb_id,
                question=body.question,
                answer=result.answer,
                sources=result.sources,
                model=result.model,
                latency_ms=latency_ms,
            )
            result.latency_ms = record.latency_ms
            result.query_log_id = record.id
        except Exception:
            logger.exception("query.log_failed kb_id=%s", body.kb_id)
        logger.info(
            "query.end kb_id=%s sources=%s model=%s answer_len=%s latency_ms=%.1f",
            body.kb_id,
            len(result.sources),
            result.model,
            len(result.answer),
            latency_ms,
        )
        return ApiEnvelope(data=result)

    @app.post(f"{settings.api_prefix}/query-logs/{{log_id}}/feedback")
    def update_query_feedback(
        log_id: str,
        body: QueryFeedbackRequest,
        logs: QueryLogStore = Depends(get_query_logs),
    ) -> ApiEnvelope:
        record = logs.update_feedback(log_id, body.feedback)
        if record is None:
            raise HTTPException(status_code=404, detail="Query log not found")
        return ApiEnvelope(data=record)

    @app.post(f"{settings.api_prefix}/query/stream")
    def query_stream(
        body: QueryRequest,
        rag: RagService = Depends(get_rag_service),
        logs: QueryLogStore = Depends(get_query_logs),
    ) -> StreamingResponse:
        def sse(event: str, data: dict | list | str) -> str:
            return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"

        def generate():
            logger.info(
                "query.stream.start kb_id=%s question_len=%s top_k=%s",
                body.kb_id,
                len(body.question),
                body.top_k,
            )
            started = time.perf_counter()
            try:
                context, sources = rag.build_context(
                    kb_id=body.kb_id,
                    question=body.question,
                    top_k=body.top_k,
                )
                yield sse("sources", [source.model_dump() for source in sources])
                if not sources:
                    answer = "知识库中暂无相关内容，请先上传文档后再提问。"
                    yield sse("token", answer)
                else:
                    answer_parts: list[str] = []
                    for token in rag.chat.stream_answer(question=body.question, context=context):
                        answer_parts.append(token)
                        yield sse("token", token)
                    answer = "".join(answer_parts)

                latency_ms = (time.perf_counter() - started) * 1000
                query_log_id = None
                try:
                    record = logs.create(
                        kb_id=body.kb_id,
                        question=body.question,
                        answer=answer,
                        sources=sources,
                        model=settings.chat_model,
                        latency_ms=latency_ms,
                    )
                    query_log_id = record.id
                except Exception:
                    logger.exception("query.stream.log_failed kb_id=%s", body.kb_id)
                logger.info(
                    "query.stream.end kb_id=%s sources=%s answer_len=%s latency_ms=%.1f",
                    body.kb_id,
                    len(sources),
                    len(answer),
                    latency_ms,
                )
                yield sse(
                    "done",
                    {
                        "answer": answer,
                        "sources": [source.model_dump() for source in sources],
                        "model": settings.chat_model,
                        "latency_ms": latency_ms,
                        "query_log_id": query_log_id,
                    },
                )
            except ValueError as exc:
                yield sse("error", {"message": str(exc)})
            except Exception as exc:
                logger.exception("query.stream.error kb_id=%s", body.kb_id)
                yield sse("error", {"message": f"流式问答失败：{exc}"})

        return StreamingResponse(
            generate(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "X-Accel-Buffering": "no",
            },
        )

    return app


app = create_app()
