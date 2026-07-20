from __future__ import annotations

import logging
import time
from typing import Optional
import uuid

from app.config import Settings
from app.schemas import DocumentRecord, QueryResponse, SourceCitation
from app.services.chunking import chunk_text
from app.services.documents import extract_text
from app.services.llm import ChatClient, EmbeddingClient, RerankClient
from app.services.qdrant_store import QdrantStore
from app.services.store import MetadataStore

logger = logging.getLogger(__name__)


class RagService:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.meta = MetadataStore(settings)
        self.vectors = QdrantStore(settings)
        self.embeddings = EmbeddingClient(settings)
        self.chat = ChatClient(settings)
        self.reranker = RerankClient(settings) if settings.rerank_enabled else None

    def ingest_file(
        self,
        *,
        kb_id: str,
        filename: str,
        content_type: str,
        content: bytes,
    ) -> DocumentRecord:
        started = time.perf_counter()
        logger.info(
            "rag.ingest.start kb_id=%s filename=%s content_type=%s bytes=%s",
            kb_id,
            filename,
            content_type,
            len(content),
        )
        if self.meta.get_kb(kb_id) is None:
            raise ValueError("Knowledge base not found")

        text = extract_text(filename, content).strip()
        logger.info("rag.ingest.extract filename=%s chars=%s", filename, len(text))
        if not text:
            raise ValueError("No extractable text in file")

        chunks = chunk_text(
            text,
            chunk_size=self.settings.chunk_size,
            chunk_overlap=self.settings.chunk_overlap,
        )
        logger.info(
            "rag.ingest.chunk filename=%s chunks=%s chunk_size=%s overlap=%s",
            filename,
            len(chunks),
            self.settings.chunk_size,
            self.settings.chunk_overlap,
        )
        if not chunks:
            raise ValueError("Document produced no chunks")

        self.meta.save_upload(kb_id, filename, content)
        doc = DocumentRecord(
            id=str(uuid.uuid4()),
            kb_id=kb_id,
            filename=filename,
            content_type=content_type or "application/octet-stream",
            size=len(content),
            chunk_count=0,
            status="processing",
        )
        self.meta.add_doc(doc)

        try:
            self._index_chunks(doc=doc, chunks=[(chunk.index, chunk.text) for chunk in chunks])
        except Exception as exc:
            self.meta.update_doc_status(doc.id, status="failed", error_message=str(exc))
            logger.exception("rag.ingest.failed kb_id=%s doc_id=%s", kb_id, doc.id)
            raise RuntimeError(f"Document indexing failed: {exc}") from exc
        saved = self.meta.update_doc_status(doc.id, status="ready", chunk_count=len(chunks), error_message="")
        if saved is None:
            raise RuntimeError("Document metadata disappeared during indexing")
        logger.info(
            "rag.ingest.end kb_id=%s doc_id=%s chunks=%s duration_ms=%.1f",
            kb_id,
            doc.id,
            len(chunks),
            (time.perf_counter() - started) * 1000,
        )
        return saved

    def _index_chunks(self, *, doc: DocumentRecord, chunks: list[tuple[int, str]]) -> None:
        embedding_started = time.perf_counter()
        vectors = self.embeddings.embed_texts([text for _, text in chunks])
        logger.info(
            "rag.index.embed doc_id=%s chunks=%s duration_ms=%.1f",
            doc.id,
            len(vectors),
            (time.perf_counter() - embedding_started) * 1000,
        )
        self.vectors.upsert_chunks(
            kb_id=doc.kb_id,
            doc_id=doc.id,
            filename=doc.filename,
            chunks=chunks,
            vectors=vectors,
        )

    def reindex_document(self, doc_id: str) -> DocumentRecord:
        started = time.perf_counter()
        doc = self.meta.get_doc(doc_id)
        if doc is None:
            raise ValueError("Document not found")
        path = self.meta.upload_path(doc)
        if not path.exists():
            self.meta.update_doc_status(doc_id, status="failed", error_message="Original file not found")
            raise ValueError("Original file not found")

        logger.info("rag.reindex.start doc_id=%s kb_id=%s filename=%s", doc.id, doc.kb_id, doc.filename)
        self.meta.update_doc_status(doc.id, status="processing", error_message="")
        try:
            text = extract_text(doc.filename, path.read_bytes()).strip()
            if not text:
                raise ValueError("No extractable text in file")
            chunks = chunk_text(
                text,
                chunk_size=self.settings.chunk_size,
                chunk_overlap=self.settings.chunk_overlap,
            )
            if not chunks:
                raise ValueError("Document produced no chunks")
            self.vectors.delete_by_doc(doc.id)
            self._index_chunks(doc=doc, chunks=[(chunk.index, chunk.text) for chunk in chunks])
            saved = self.meta.update_doc_status(doc.id, status="ready", chunk_count=len(chunks), error_message="")
        except Exception as exc:
            self.meta.update_doc_status(doc.id, status="failed", error_message=str(exc))
            logger.exception("rag.reindex.failed doc_id=%s", doc.id)
            raise RuntimeError(f"Document reindex failed: {exc}") from exc
        if saved is None:
            raise RuntimeError("Document metadata disappeared during reindex")
        logger.info(
            "rag.reindex.end doc_id=%s chunks=%s duration_ms=%.1f",
            doc.id,
            saved.chunk_count,
            (time.perf_counter() - started) * 1000,
        )
        return saved

    def delete_document(self, doc_id: str) -> DocumentRecord:
        logger.info("rag.delete.start doc_id=%s", doc_id)
        deleted = self.meta.delete_doc(doc_id)
        if deleted is None:
            raise ValueError("Document not found")
        self.vectors.delete_by_doc(doc_id)
        logger.info("rag.delete.end doc_id=%s kb_id=%s", doc_id, deleted.kb_id)
        return deleted

    def build_context(
        self,
        *,
        kb_id: str,
        question: str,
        top_k: Optional[int] = None,
    ) -> tuple[str, list[SourceCitation]]:
        started = time.perf_counter()
        if self.meta.get_kb(kb_id) is None:
            raise ValueError("Knowledge base not found")

        limit = top_k or self.settings.retrieve_top_k
        logger.info("rag.query.embed kb_id=%s question_len=%s", kb_id, len(question))
        query_vector = self.embeddings.embed_query(question)
        search_started = time.perf_counter()
        hits = self.vectors.search(kb_id=kb_id, query_vector=query_vector, top_k=limit)
        logger.info(
            "rag.query.search kb_id=%s requested_top_k=%s hits=%s duration_ms=%.1f",
            kb_id,
            limit,
            len(hits),
            (time.perf_counter() - search_started) * 1000,
        )

        if not hits:
            logger.info("rag.query.empty kb_id=%s duration_ms=%.1f", kb_id, (time.perf_counter() - started) * 1000)
            return "", []

        if self.reranker is not None and len(hits) > 1:
            rerank_input_count = len(hits)
            rerank_started = time.perf_counter()
            try:
                ranked = self.reranker.rerank(
                    query=question,
                    documents=[hit["text"] for hit in hits],
                    top_n=self.settings.rerank_top_k,
                )
                reranked_hits = []
                for original_index, rerank_score in ranked:
                    if original_index >= len(hits):
                        continue
                    hit = dict(hits[original_index])
                    hit["vector_score"] = hit["score"]
                    hit["score"] = rerank_score
                    reranked_hits.append(hit)
                hits = reranked_hits or hits[: self.settings.rerank_top_k]
                logger.info(
                    "rag.query.rerank kb_id=%s input=%s output=%s duration_ms=%.1f",
                    kb_id,
                    rerank_input_count,
                    len(hits),
                    (time.perf_counter() - rerank_started) * 1000,
                )
            except Exception:
                logger.exception(
                    "rag.query.rerank_failed kb_id=%s fallback_top_k=%s",
                    kb_id,
                    self.settings.rerank_top_k,
                )
                hits = hits[: self.settings.rerank_top_k]
        else:
            hits = hits[: self.settings.rerank_top_k]

        context_blocks = []
        sources: list[SourceCitation] = []
        for i, hit in enumerate(hits, start=1):
            context_blocks.append(f"[{i}] 来源: {hit['filename']}\n{hit['text']}")
            sources.append(
                SourceCitation(
                    doc_id=hit["doc_id"],
                    filename=hit["filename"],
                    chunk_index=hit["chunk_index"],
                    score=hit["score"],
                    text=hit["text"],
                )
            )

        logger.info("rag.context.end kb_id=%s sources=%s duration_ms=%.1f", kb_id, len(sources), (time.perf_counter() - started) * 1000)
        return "\n\n".join(context_blocks), sources

    def query(self, *, kb_id: str, question: str, top_k: Optional[int] = None) -> QueryResponse:
        started = time.perf_counter()
        context, sources = self.build_context(kb_id=kb_id, question=question, top_k=top_k)
        if not sources:
            return QueryResponse(
                answer="知识库中暂无相关内容，请先上传文档后再提问。",
                sources=[],
                model=self.settings.chat_model,
            )

        chat_started = time.perf_counter()
        answer = self.chat.answer(question=question, context=context)
        logger.info(
            "rag.query.chat kb_id=%s model=%s answer_len=%s duration_ms=%.1f",
            kb_id,
            self.settings.chat_model,
            len(answer),
            (time.perf_counter() - chat_started) * 1000,
        )
        logger.info("rag.query.end kb_id=%s duration_ms=%.1f", kb_id, (time.perf_counter() - started) * 1000)
        return QueryResponse(answer=answer, sources=sources, model=self.settings.chat_model)
