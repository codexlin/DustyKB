from __future__ import annotations

import logging
import uuid
from typing import Any

import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

from app.config import Settings
from app.schemas import QueryLogRecord, SourceCitation

logger = logging.getLogger(__name__)


class QueryLogStore:
    def __init__(self, settings: Settings) -> None:
        self.database_url = settings.database_url
        self._ensure_table()

    def _connect(self):
        return psycopg.connect(self.database_url, row_factory=dict_row)

    def _ensure_table(self) -> None:
        with self._connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    CREATE TABLE IF NOT EXISTS query_logs (
                        id UUID PRIMARY KEY,
                        kb_id TEXT NOT NULL,
                        question TEXT NOT NULL,
                        answer TEXT NOT NULL,
                        sources JSONB NOT NULL DEFAULT '[]'::jsonb,
                        model TEXT NOT NULL,
                        latency_ms DOUBLE PRECISION NOT NULL,
                        feedback TEXT,
                        feedback_at TIMESTAMPTZ,
                        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                    )
                    """
                )
                cur.execute("ALTER TABLE query_logs ADD COLUMN IF NOT EXISTS feedback TEXT")
                cur.execute("ALTER TABLE query_logs ADD COLUMN IF NOT EXISTS feedback_at TIMESTAMPTZ")
                cur.execute(
                    """
                    CREATE INDEX IF NOT EXISTS idx_query_logs_kb_created
                    ON query_logs (kb_id, created_at DESC)
                    """
                )
            conn.commit()
        logger.info("postgres.query_logs.ready")

    def create(
        self,
        *,
        kb_id: str,
        question: str,
        answer: str,
        sources: list[SourceCitation],
        model: str,
        latency_ms: float,
    ) -> QueryLogRecord:
        log_id = str(uuid.uuid4())
        source_payload = [source.model_dump() for source in sources]
        with self._connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO query_logs (
                        id, kb_id, question, answer, sources, model, latency_ms
                    )
                    VALUES (%s, %s, %s, %s, %s::jsonb, %s, %s)
                    RETURNING
                        id::text,
                        kb_id,
                        question,
                        answer,
                        sources,
                        model,
                        latency_ms,
                        feedback,
                        feedback_at::text,
                        created_at::text
                    """,
                    (
                        log_id,
                        kb_id,
                        question,
                        answer,
                        Jsonb(source_payload),
                        model,
                        latency_ms,
                    ),
                )
                row = cur.fetchone()
            conn.commit()

        logger.info("postgres.query_log.create id=%s kb_id=%s latency_ms=%.1f", log_id, kb_id, latency_ms)
        return self._row_to_record(row)

    def list_by_kb(self, kb_id: str, *, limit: int = 50) -> list[QueryLogRecord]:
        bounded_limit = min(max(limit, 1), 200)
        with self._connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT
                        id::text,
                        kb_id,
                        question,
                        answer,
                        sources,
                        model,
                        latency_ms,
                        feedback,
                        feedback_at::text,
                        created_at::text
                    FROM query_logs
                    WHERE kb_id = %s
                    ORDER BY created_at DESC
                    LIMIT %s
                    """,
                    (kb_id, bounded_limit),
                )
                rows = cur.fetchall()
        logger.info("postgres.query_log.list kb_id=%s count=%s", kb_id, len(rows))
        return [self._row_to_record(row) for row in rows]

    def update_feedback(self, log_id: str, feedback: str) -> QueryLogRecord | None:
        with self._connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    UPDATE query_logs
                    SET feedback = %s, feedback_at = NOW()
                    WHERE id = %s
                    RETURNING
                        id::text,
                        kb_id,
                        question,
                        answer,
                        sources,
                        model,
                        latency_ms,
                        feedback,
                        feedback_at::text,
                        created_at::text
                    """,
                    (feedback, log_id),
                )
                row = cur.fetchone()
            conn.commit()
        logger.info("postgres.query_log.feedback id=%s feedback=%s", log_id, feedback)
        return self._row_to_record(row) if row else None

    def delete_by_kb(self, kb_id: str) -> int:
        with self._connect() as conn:
            with conn.cursor() as cur:
                cur.execute("DELETE FROM query_logs WHERE kb_id = %s", (kb_id,))
                deleted = cur.rowcount
            conn.commit()
        logger.info("postgres.query_log.delete_by_kb kb_id=%s count=%s", kb_id, deleted)
        return deleted

    def _row_to_record(self, row: dict[str, Any]) -> QueryLogRecord:
        sources = [SourceCitation.model_validate(item) for item in row["sources"]]
        return QueryLogRecord(
            id=row["id"],
            kb_id=row["kb_id"],
            question=row["question"],
            answer=row["answer"],
            sources=sources,
            model=row["model"],
            latency_ms=float(row["latency_ms"]),
            feedback=row.get("feedback"),
            feedback_at=row.get("feedback_at"),
            created_at=row["created_at"],
        )
