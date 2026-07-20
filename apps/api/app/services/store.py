from __future__ import annotations

import json
import logging
import shutil
import uuid
from pathlib import Path
from typing import Optional

import psycopg
from psycopg.rows import dict_row

from app.config import Settings
from app.schemas import DocumentRecord, KnowledgeBase

logger = logging.getLogger(__name__)


class MetadataStore:
    """PostgreSQL-backed metadata store with one-time JSON migration."""

    def __init__(self, settings: Settings) -> None:
        self.database_url = settings.database_url
        self.root = Path(settings.data_dir)
        self.root.mkdir(parents=True, exist_ok=True)
        self.uploads = self.root / "uploads"
        self.uploads.mkdir(parents=True, exist_ok=True)
        self.kb_file = self.root / "knowledge_bases.json"
        self.doc_file = self.root / "documents.json"
        self._ensure_tables()
        self._migrate_json_metadata()

    def _connect(self):
        return psycopg.connect(self.database_url, row_factory=dict_row)

    def _ensure_tables(self) -> None:
        with self._connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    CREATE TABLE IF NOT EXISTS knowledge_bases (
                        id TEXT PRIMARY KEY,
                        name TEXT NOT NULL,
                        description TEXT NOT NULL DEFAULT '',
                        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                    )
                    """
                )
                cur.execute(
                    """
                    CREATE TABLE IF NOT EXISTS documents (
                        id TEXT PRIMARY KEY,
                        kb_id TEXT NOT NULL REFERENCES knowledge_bases(id) ON DELETE CASCADE,
                        filename TEXT NOT NULL,
                        content_type TEXT NOT NULL,
                        size BIGINT NOT NULL,
                        chunk_count INTEGER NOT NULL DEFAULT 0,
                        status TEXT NOT NULL DEFAULT 'ready',
                        error_message TEXT NOT NULL DEFAULT '',
                        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                    )
                    """
                )
                cur.execute(
                    """
                    ALTER TABLE documents
                    ADD COLUMN IF NOT EXISTS error_message TEXT NOT NULL DEFAULT ''
                    """
                )
                cur.execute(
                    """
                    CREATE INDEX IF NOT EXISTS idx_documents_kb_created
                    ON documents (kb_id, created_at DESC)
                    """
                )
            conn.commit()
        logger.info("postgres.metadata.ready")

    def _read_json(self, path: Path) -> list[dict]:
        if not path.exists():
            return []
        return json.loads(path.read_text(encoding="utf-8"))

    def _migrate_json_metadata(self) -> None:
        kb_rows = self._read_json(self.kb_file)
        doc_rows = self._read_json(self.doc_file)
        if not kb_rows and not doc_rows:
            return

        with self._connect() as conn:
            with conn.cursor() as cur:
                for row in kb_rows:
                    cur.execute(
                        """
                        INSERT INTO knowledge_bases (id, name, description, created_at)
                        VALUES (%s, %s, %s, %s)
                        ON CONFLICT (id) DO NOTHING
                        """,
                        (
                            row["id"],
                            row["name"],
                            row.get("description", ""),
                            row.get("created_at"),
                        ),
                    )
                for row in doc_rows:
                    cur.execute(
                        """
                        INSERT INTO documents (
                            id, kb_id, filename, content_type, size, chunk_count, status, error_message, created_at
                        )
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                        ON CONFLICT (id) DO NOTHING
                        """,
                        (
                            row["id"],
                            row["kb_id"],
                            row["filename"],
                            row.get("content_type", "application/octet-stream"),
                            row.get("size", 0),
                            row.get("chunk_count", 0),
                            row.get("status", "ready"),
                            row.get("error_message", ""),
                            row.get("created_at"),
                        ),
                    )
            conn.commit()
        logger.info("postgres.metadata.migrated kbs=%s docs=%s", len(kb_rows), len(doc_rows))

    def list_kbs(self) -> list[KnowledgeBase]:
        with self._connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT
                        kb.id,
                        kb.name,
                        kb.description,
                        kb.created_at::text,
                        COUNT(doc.id)::int AS doc_count
                    FROM knowledge_bases kb
                    LEFT JOIN documents doc ON doc.kb_id = kb.id
                    GROUP BY kb.id, kb.name, kb.description, kb.created_at
                    ORDER BY kb.created_at DESC
                    """
                )
                rows = cur.fetchall()
        return [KnowledgeBase.model_validate(row) for row in rows]

    def get_kb(self, kb_id: str) -> Optional[KnowledgeBase]:
        with self._connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT
                        kb.id,
                        kb.name,
                        kb.description,
                        kb.created_at::text,
                        COUNT(doc.id)::int AS doc_count
                    FROM knowledge_bases kb
                    LEFT JOIN documents doc ON doc.kb_id = kb.id
                    WHERE kb.id = %s
                    GROUP BY kb.id, kb.name, kb.description, kb.created_at
                    """,
                    (kb_id,),
                )
                row = cur.fetchone()
        return KnowledgeBase.model_validate(row) if row else None

    def create_kb(self, name: str, description: str = "") -> KnowledgeBase:
        kb = KnowledgeBase(id=str(uuid.uuid4()), name=name.strip(), description=description.strip())
        with self._connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO knowledge_bases (id, name, description, created_at)
                    VALUES (%s, %s, %s, %s)
                    """,
                    (kb.id, kb.name, kb.description, kb.created_at),
                )
            conn.commit()
        return kb

    def list_docs(self, kb_id: str) -> list[DocumentRecord]:
        with self._connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT
                        id,
                        kb_id,
                        filename,
                        content_type,
                        size,
                        chunk_count,
                        status,
                        error_message,
                        created_at::text
                    FROM documents
                    WHERE kb_id = %s
                    ORDER BY created_at DESC
                    """,
                    (kb_id,),
                )
                rows = cur.fetchall()
        return [DocumentRecord.model_validate(row) for row in rows]

    def get_doc(self, doc_id: str) -> Optional[DocumentRecord]:
        with self._connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT
                        id,
                        kb_id,
                        filename,
                        content_type,
                        size,
                        chunk_count,
                        status,
                        error_message,
                        created_at::text
                    FROM documents
                    WHERE id = %s
                    """,
                    (doc_id,),
                )
                row = cur.fetchone()
        return DocumentRecord.model_validate(row) if row else None

    def add_doc(self, doc: DocumentRecord) -> DocumentRecord:
        with self._connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO documents (
                        id, kb_id, filename, content_type, size, chunk_count, status, error_message, created_at
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                    """,
                    (
                        doc.id,
                        doc.kb_id,
                        doc.filename,
                        doc.content_type,
                        doc.size,
                        doc.chunk_count,
                        doc.status,
                        doc.error_message,
                        doc.created_at,
                    ),
                )
            conn.commit()
        return doc

    def update_doc_status(
        self,
        doc_id: str,
        *,
        status: str,
        chunk_count: Optional[int] = None,
        error_message: str = "",
    ) -> Optional[DocumentRecord]:
        with self._connect() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    UPDATE documents
                    SET
                        status = %s,
                        chunk_count = COALESCE(%s, chunk_count),
                        error_message = %s
                    WHERE id = %s
                    """,
                    (status, chunk_count, error_message, doc_id),
                )
            conn.commit()
        return self.get_doc(doc_id)

    def delete_doc(self, doc_id: str) -> Optional[DocumentRecord]:
        deleted = self.get_doc(doc_id)
        if deleted is None:
            return None
        with self._connect() as conn:
            with conn.cursor() as cur:
                cur.execute("DELETE FROM documents WHERE id = %s", (doc_id,))
            conn.commit()
        upload = self.uploads / deleted.kb_id / deleted.filename
        if upload.exists():
            upload.unlink()
        return deleted

    def delete_kb(self, kb_id: str) -> Optional[KnowledgeBase]:
        deleted = self.get_kb(kb_id)
        if deleted is None:
            return None
        with self._connect() as conn:
            with conn.cursor() as cur:
                cur.execute("DELETE FROM knowledge_bases WHERE id = %s", (kb_id,))
            conn.commit()
        upload_dir = self.uploads / kb_id
        if upload_dir.exists():
            shutil.rmtree(upload_dir)
        return deleted

    def save_upload(self, kb_id: str, filename: str, content: bytes) -> Path:
        folder = self.uploads / kb_id
        folder.mkdir(parents=True, exist_ok=True)
        path = folder / filename
        path.write_bytes(content)
        return path

    def upload_path(self, doc: DocumentRecord) -> Path:
        return self.uploads / doc.kb_id / doc.filename
