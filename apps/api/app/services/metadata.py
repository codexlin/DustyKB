from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from app.config import Settings
from app.schemas import DocumentRecord, KnowledgeBase


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class MetadataStore:
    """Lightweight JSON metadata store for MVP (swap for Postgres later)."""

    def __init__(self, settings: Settings) -> None:
        self.root = Path(settings.data_dir)
        self.kb_file = self.root / "knowledge_bases.json"
        self.docs_file = self.root / "documents.json"
        self.uploads_dir = self.root / "uploads"
        self.root.mkdir(parents=True, exist_ok=True)
        self.uploads_dir.mkdir(parents=True, exist_ok=True)
        if not self.kb_file.exists():
            self.kb_file.write_text("[]", encoding="utf-8")
        if not self.docs_file.exists():
            self.docs_file.write_text("[]", encoding="utf-8")

    def _read(self, path: Path) -> list[dict]:
        return json.loads(path.read_text(encoding="utf-8"))

    def _write(self, path: Path, rows: list[dict]) -> None:
        path.write_text(
            json.dumps(rows, ensure_ascii=False, indent=2, default=str),
            encoding="utf-8",
        )

    def list_kbs(self) -> list[KnowledgeBase]:
        rows = self._read(self.kb_file)
        docs = self._read(self.docs_file)
        counts: dict[str, int] = {}
        for doc in docs:
            if doc.get("status") == "ready":
                counts[doc["kb_id"]] = counts.get(doc["kb_id"], 0) + 1
        result: list[KnowledgeBase] = []
        for row in rows:
            result.append(
                KnowledgeBase(
                    **{
                        **row,
                        "document_count": counts.get(row["id"], 0),
                    }
                )
            )
        return sorted(result, key=lambda item: item.created_at, reverse=True)

    def get_kb(self, kb_id: str) -> Optional[KnowledgeBase]:
        for item in self.list_kbs():
            if item.id == kb_id:
                return item
        return None

    def create_kb(self, name: str, description: str = "") -> KnowledgeBase:
        rows = self._read(self.kb_file)
        kb = KnowledgeBase(
            id=str(uuid4()),
            name=name.strip(),
            description=description.strip(),
            created_at=utcnow(),
            document_count=0,
        )
        rows.append(kb.model_dump(mode="json"))
        self._write(self.kb_file, rows)
        return kb

    def list_documents(self, kb_id: str) -> list[DocumentRecord]:
        rows = [
            DocumentRecord(**row)
            for row in self._read(self.docs_file)
            if row["kb_id"] == kb_id
        ]
        return sorted(rows, key=lambda item: item.created_at, reverse=True)

    def add_document(self, record: DocumentRecord) -> DocumentRecord:
        rows = self._read(self.docs_file)
        rows.append(record.model_dump(mode="json"))
        self._write(self.docs_file, rows)
        return record

    def update_document(self, record: DocumentRecord) -> DocumentRecord:
        rows = self._read(self.docs_file)
        for index, row in enumerate(rows):
            if row["id"] == record.id:
                rows[index] = record.model_dump(mode="json")
                break
        self._write(self.docs_file, rows)
        return record

    def delete_document(self, kb_id: str, doc_id: str) -> Optional[DocumentRecord]:
        rows = self._read(self.docs_file)
        target: Optional[DocumentRecord] = None
        kept: list[dict] = []
        for row in rows:
            if row["id"] == doc_id and row["kb_id"] == kb_id:
                target = DocumentRecord(**row)
                continue
            kept.append(row)
        self._write(self.docs_file, kept)
        return target

    def upload_path(self, kb_id: str, doc_id: str, filename: str) -> Path:
        folder = self.uploads_dir / kb_id
        folder.mkdir(parents=True, exist_ok=True)
        safe_name = filename.replace("/", "_").replace("\\", "_")
        return folder / f"{doc_id}_{safe_name}"
