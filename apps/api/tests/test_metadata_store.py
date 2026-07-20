import uuid

import psycopg
import pytest

from app.config import get_settings
from app.schemas import DocumentRecord
from app.services.store import MetadataStore


def postgres_available(database_url: str) -> bool:
    try:
        with psycopg.connect(database_url) as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT 1")
        return True
    except psycopg.Error:
        return False


def test_metadata_store_persists_kb_and_documents_in_postgres():
    settings = get_settings()
    if not postgres_available(settings.database_url):
        pytest.skip("PostgreSQL is not available")

    store = MetadataStore(settings)
    marker = str(uuid.uuid4())
    kb = store.create_kb(f"metadata-test-{marker}", "postgres metadata")
    try:
        loaded = store.get_kb(kb.id)
        assert loaded is not None
        assert loaded.name == kb.name
        assert loaded.doc_count == 0

        doc = DocumentRecord(
            id=str(uuid.uuid4()),
            kb_id=kb.id,
            filename=f"{marker}.md",
            content_type="text/markdown",
            size=42,
            chunk_count=2,
        )
        store.add_doc(doc)

        docs = store.list_docs(kb.id)
        assert [item.id for item in docs] == [doc.id]
        loaded_doc = store.get_doc(doc.id)
        assert loaded_doc is not None
        assert loaded_doc.id == doc.id
        assert loaded_doc.kb_id == doc.kb_id
        assert loaded_doc.filename == doc.filename
        assert loaded_doc.chunk_count == doc.chunk_count
        assert store.get_kb(kb.id).doc_count == 1

        deleted = store.delete_doc(doc.id)
        assert deleted is not None
        assert deleted.id == doc.id
        assert store.list_docs(kb.id) == []
        assert store.get_kb(kb.id).doc_count == 0

        with psycopg.connect(settings.database_url) as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT name FROM knowledge_bases WHERE id = %s", (kb.id,))
                row = cur.fetchone()
        assert row == (kb.name,)
    finally:
        with psycopg.connect(settings.database_url) as conn:
            with conn.cursor() as cur:
                cur.execute("DELETE FROM knowledge_bases WHERE id = %s", (kb.id,))
            conn.commit()
