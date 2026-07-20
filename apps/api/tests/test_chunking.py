from app.services.chunking import chunk_text


def test_chunk_text_splits_long_document_with_overlap():
    text = "段落一。" * 40 + "\n\n" + "段落二。" * 40
    chunks = chunk_text(text, chunk_size=120, chunk_overlap=20)

    assert len(chunks) >= 2
    assert all(chunk.text.strip() for chunk in chunks)
    assert all(chunk.index == i for i, chunk in enumerate(chunks))


def test_chunk_text_returns_single_chunk_for_short_text():
    chunks = chunk_text("短文档内容", chunk_size=500, chunk_overlap=50)

    assert len(chunks) == 1
    assert chunks[0].text == "短文档内容"
    assert chunks[0].index == 0


def test_chunk_text_ignores_empty_input():
    assert chunk_text("   \n\n  ") == []
