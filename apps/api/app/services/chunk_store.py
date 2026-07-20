from __future__ import annotations

import logging
import uuid
from typing import Any

import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

from app.config import Settings

logger = logging.getLogger(__name__)

_CHUNK_SELECT = """
    SELECT
        c.doc_id,
        d.filename,
        c.chunk_index,
        c.text,
        c.content_type,
        c.parser,
        c.page,
        c.section,
        c.metadata
    FROM document_chunks c
    JOIN documents d ON d.id = c.doc_id
"""


class ChunkStore:
    """PostgreSQL-backed document chunk store (source of truth for listing / BM25)."""

    def __init__(self, settings: Settings) -> None:
        self.database_url = settings.database_url
        self._ensure_tables()

    def _connect(self):
        return psycopg.connect(self.database_url, row_factory=dict_row)

    def _ensure_tables(self) -> None:
        with self._connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    CREATE TABLE IF NOT EXISTS document_chunks (
                        id TEXT PRIMARY KEY,
                        doc_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
                        kb_id TEXT NOT NULL,
                        chunk_index INTEGER NOT NULL,
                        text TEXT NOT NULL,
                        content_type TEXT NOT NULL DEFAULT 'text',
                        parser TEXT NOT NULL DEFAULT '',
                        page INTEGER,
                        section TEXT,
                        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
                        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                        UNIQUE (doc_id, chunk_index)
                    )
                    """
                )
                cur.execute(
                    """
                    CREATE INDEX IF NOT EXISTS idx_document_chunks_kb
                    ON document_chunks (kb_id)
                    """
                )
                cur.execute(
                    """
                    CREATE INDEX IF NOT EXISTS idx_document_chunks_doc
                    ON document_chunks (doc_id, chunk_index)
                    """
                )
            conn.commit()
        logger.info("postgres.chunks.ready")

    @staticmethod
    def _row_to_chunk(row: dict[str, Any]) -> dict[str, Any]:
        metadata = row.get("metadata") or {}
        return {
            "doc_id": row["doc_id"],
            "filename": row["filename"],
            "chunk_index": int(row["chunk_index"]),
            "text": row["text"],
            "content_type": row.get("content_type") or "text",
            "parser": row.get("parser") or "",
            "page": row.get("page"),
            "section": row.get("section"),
            "metadata": metadata,
        }

    def save_chunks_for_doc(
        self,
        *,
        doc_id: str,
        kb_id: str,
        chunks: list[dict[str, Any]],
    ) -> int:
        with self._connect() as conn:
            with conn.cursor() as cur:
                cur.execute("DELETE FROM document_chunks WHERE doc_id = %s", (doc_id,))
                for chunk in chunks:
                    cur.execute(
                        """
                        INSERT INTO document_chunks (
                            id, doc_id, kb_id, chunk_index, text,
                            content_type, parser, page, section, metadata
                        )
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb)
                        """,
                        (
                            str(uuid.uuid4()),
                            doc_id,
                            kb_id,
                            int(chunk["chunk_index"]),
                            chunk["text"],
                            chunk.get("content_type", "text"),
                            chunk.get("parser", ""),
                            chunk.get("page"),
                            chunk.get("section"),
                            Jsonb(chunk.get("metadata", {})),
                        ),
                    )
            conn.commit()
        logger.info("postgres.chunks.save doc_id=%s kb_id=%s count=%s", doc_id, kb_id, len(chunks))
        return len(chunks)

    def delete_by_doc(self, doc_id: str) -> int:
        with self._connect() as conn:
            with conn.cursor() as cur:
                cur.execute("DELETE FROM document_chunks WHERE doc_id = %s", (doc_id,))
                deleted = cur.rowcount
            conn.commit()
        logger.info("postgres.chunks.delete_by_doc doc_id=%s count=%s", doc_id, deleted)
        return deleted

    def delete_by_kb(self, kb_id: str) -> int:
        with self._connect() as conn:
            with conn.cursor() as cur:
                cur.execute("DELETE FROM document_chunks WHERE kb_id = %s", (kb_id,))
                deleted = cur.rowcount
            conn.commit()
        logger.info("postgres.chunks.delete_by_kb kb_id=%s count=%s", kb_id, deleted)
        return deleted

    def list_by_doc(self, doc_id: str) -> list[dict[str, Any]]:
        with self._connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    f"""
                    {_CHUNK_SELECT}
                    WHERE c.doc_id = %s
                    ORDER BY c.chunk_index ASC
                    """,
                    (doc_id,),
                )
                rows = cur.fetchall()
        return [self._row_to_chunk(row) for row in rows]

    def list_by_kb(self, kb_id: str) -> list[dict[str, Any]]:
        with self._connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    f"""
                    {_CHUNK_SELECT}
                    WHERE c.kb_id = %s
                    ORDER BY c.doc_id ASC, c.chunk_index ASC
                    """,
                    (kb_id,),
                )
                rows = cur.fetchall()
        return [self._row_to_chunk(row) for row in rows]
