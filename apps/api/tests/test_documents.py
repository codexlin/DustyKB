from pathlib import Path

from app.services.documents import extract_text


def test_extract_text_from_markdown_bytes():
    content = "# 标题\n\n内容一行".encode("utf-8")
    text = extract_text("notes.md", content)
    assert "标题" in text
    assert "内容一行" in text


def test_extract_text_rejects_unknown_extension(tmp_path: Path):
    try:
        extract_text("data.bin", b"abc")
        assert False, "expected ValueError"
    except ValueError as exc:
        assert "Unsupported" in str(exc)
