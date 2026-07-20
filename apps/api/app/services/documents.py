from __future__ import annotations

import csv
import io
import logging
import re
import zipfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any
from xml.etree import ElementTree as ET

from pypdf import PdfReader

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class ParsedBlock:
    text: str
    content_type: str = "text"
    parser: str = "text"
    page: int | None = None
    section: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class ParsedDocument:
    filename: str
    blocks: list[ParsedBlock]

    @property
    def text(self) -> str:
        return "\n\n".join(block.text for block in self.blocks if block.text.strip())


SUPPORTED_EXTENSIONS = {
    ".txt",
    ".md",
    ".markdown",
    ".pdf",
    ".csv",
    ".tsv",
    ".xlsx",
}


def extract_text(filename: str, content: bytes) -> str:
    return parse_document(filename, content).text


def parse_document(filename: str, content: bytes) -> ParsedDocument:
    suffix = Path(filename).suffix.lower()
    if suffix == ".txt":
        return ParsedDocument(filename=filename, blocks=_parse_text(content, parser="text"))
    if suffix in {".md", ".markdown"}:
        return ParsedDocument(filename=filename, blocks=_parse_markdown(content))
    if suffix == ".csv":
        return ParsedDocument(filename=filename, blocks=[_parse_delimited_table(filename, content, delimiter=",", parser="csv")])
    if suffix == ".tsv":
        return ParsedDocument(filename=filename, blocks=[_parse_delimited_table(filename, content, delimiter="\t", parser="tsv")])
    if suffix == ".pdf":
        return ParsedDocument(filename=filename, blocks=_parse_pdf(content))
    if suffix == ".xlsx":
        return ParsedDocument(filename=filename, blocks=_parse_xlsx(filename, content))
    raise ValueError(
        f"Unsupported file type: {suffix or '(none)'}. Use .txt/.md/.pdf/.csv/.tsv/.xlsx"
    )


def _decode_text(content: bytes) -> str:
    return content.decode("utf-8-sig", errors="ignore")


def _parse_text(content: bytes, *, parser: str) -> list[ParsedBlock]:
    text = _decode_text(content).strip()
    return [ParsedBlock(text=text, content_type="text", parser=parser)] if text else []


def _parse_markdown(content: bytes) -> list[ParsedBlock]:
    text = _decode_text(content).strip()
    if not text:
        return []

    blocks: list[ParsedBlock] = []
    current_title: str | None = None
    current_lines: list[str] = []
    heading_pattern = re.compile(r"^(#{1,6})\s+(.+?)\s*$")

    def flush() -> None:
        body = "\n".join(current_lines).strip()
        if not body:
            return
        blocks.append(
            ParsedBlock(
                text=body,
                content_type="text",
                parser="markdown",
                section=current_title,
            )
        )

    for line in text.splitlines():
        match = heading_pattern.match(line)
        if match:
            flush()
            title = match.group(2).strip()
            current_title = title
            current_lines = [line]
            continue
        current_lines.append(line)
    flush()

    return blocks or [ParsedBlock(text=text, content_type="text", parser="markdown")]


# Han + CJK punctuation / fullwidth forms commonly doubled by broken PDF ToUnicode maps.
_CJK_CHAR = re.compile(r"[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]")
_CJK_DUP = re.compile(r"([\u4e00-\u9fff\u3000-\u303f\uff00-\uffef])\1+")


def normalize_cjk_text(text: str, *, min_dup_ratio: float = 0.35) -> str:
    """Collapse consecutive duplicated CJK glyphs when duplication rate is high.

    Many Chinese PDFs extract as "中中文文" via broken ToUnicode maps. Only rewrite
    when the duplicated-pair rate looks pathological to avoid harming normal 叠词.
    """
    if not text:
        return text
    cjk_chars = _CJK_CHAR.findall(text)
    if len(cjk_chars) < 20:
        return text
    dup_pairs = sum(1 for left, right in zip(cjk_chars, cjk_chars[1:]) if left == right)
    if dup_pairs / max(len(cjk_chars) - 1, 1) < min_dup_ratio:
        return text
    return _CJK_DUP.sub(r"\1", text)


def _parse_pdf(content: bytes) -> list[ParsedBlock]:
    try:
        return _parse_pdf_pymupdf(content)
    except Exception as exc:
        logger.warning("pdf.pymupdf_failed fallback=pypdf error=%s", exc)
        return _parse_pdf_pypdf(content)


def _parse_pdf_pymupdf(content: bytes) -> list[ParsedBlock]:
    import fitz

    document = fitz.open(stream=content, filetype="pdf")
    try:
        page_count = document.page_count
        blocks: list[ParsedBlock] = []
        for index, page in enumerate(document, start=1):
            text = normalize_cjk_text((page.get_text("text") or "").strip())
            if not text:
                continue
            blocks.append(
                ParsedBlock(
                    text=f"## Page {index}\n\n{text}",
                    content_type="text",
                    parser="pymupdf",
                    page=index,
                    section=f"Page {index}",
                    metadata={"page_count": page_count},
                )
            )
        return blocks
    finally:
        document.close()


def _parse_pdf_pypdf(content: bytes) -> list[ParsedBlock]:
    reader = PdfReader(io.BytesIO(content))
    blocks: list[ParsedBlock] = []
    page_count = len(reader.pages)
    for index, page in enumerate(reader.pages, start=1):
        text = normalize_cjk_text((page.extract_text() or "").strip())
        if not text:
            continue
        blocks.append(
            ParsedBlock(
                text=f"## Page {index}\n\n{text}",
                content_type="text",
                parser="pypdf",
                page=index,
                section=f"Page {index}",
                metadata={"page_count": page_count},
            )
        )
    return blocks


def _parse_delimited_table(filename: str, content: bytes, *, delimiter: str, parser: str) -> ParsedBlock:
    rows = list(csv.reader(io.StringIO(_decode_text(content)), delimiter=delimiter))
    return _table_block(
        title=Path(filename).stem,
        rows=rows,
        parser=parser,
        metadata={"delimiter": delimiter},
    )


def _table_block(
    *,
    title: str,
    rows: list[list[str]],
    parser: str,
    section: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> ParsedBlock:
    normalized = [[cell.strip() for cell in row] for row in rows if any(cell.strip() for cell in row)]
    if not normalized:
        return ParsedBlock(
            text="",
            content_type="table",
            parser=parser,
            section=section or title,
            metadata=metadata or {},
        )

    width = max(len(row) for row in normalized)
    padded = [row + [""] * (width - len(row)) for row in normalized]
    headers = padded[0]
    body_rows = padded[1:]
    markdown_lines = [f"# Table: {title}", "", _markdown_table_row(headers)]
    markdown_lines.append(_markdown_table_row(["---"] * width))
    markdown_lines.extend(_markdown_table_row(row) for row in body_rows)

    table_metadata = {
        "rows": len(body_rows),
        "columns": width,
        "headers": headers,
        **(metadata or {}),
    }
    return ParsedBlock(
        text="\n".join(markdown_lines).strip(),
        content_type="table",
        parser=parser,
        section=section or title,
        metadata=table_metadata,
    )


def _markdown_table_row(cells: list[str]) -> str:
    escaped = [cell.replace("|", "\\|").replace("\n", " ") for cell in cells]
    return "| " + " | ".join(escaped) + " |"


def _parse_xlsx(filename: str, content: bytes) -> list[ParsedBlock]:
    with zipfile.ZipFile(io.BytesIO(content)) as archive:
        shared_strings = _xlsx_shared_strings(archive)
        sheet_names = _xlsx_sheet_names(archive)
        sheet_paths = sorted(
            name for name in archive.namelist() if name.startswith("xl/worksheets/sheet") and name.endswith(".xml")
        )
        blocks: list[ParsedBlock] = []
        for index, sheet_path in enumerate(sheet_paths, start=1):
            sheet_name = sheet_names.get(index, f"Sheet {index}")
            rows = _xlsx_sheet_rows(archive, sheet_path, shared_strings)
            block = _table_block(
                title=f"{Path(filename).stem} / {sheet_name}",
                rows=rows,
                parser="xlsx",
                section=sheet_name,
                metadata={"sheet_name": sheet_name, "sheet_index": index},
            )
            if block.text:
                blocks.append(block)
    return blocks


def _xlsx_shared_strings(archive: zipfile.ZipFile) -> list[str]:
    if "xl/sharedStrings.xml" not in archive.namelist():
        return []
    root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
    strings: list[str] = []
    for item in root.iter():
        if _local_name(item.tag) != "si":
            continue
        parts = [node.text or "" for node in item.iter() if _local_name(node.tag) == "t"]
        strings.append("".join(parts))
    return strings


def _xlsx_sheet_names(archive: zipfile.ZipFile) -> dict[int, str]:
    if "xl/workbook.xml" not in archive.namelist():
        return {}
    root = ET.fromstring(archive.read("xl/workbook.xml"))
    names: dict[int, str] = {}
    index = 1
    for sheet in root.iter():
        if _local_name(sheet.tag) == "sheet":
            names[index] = sheet.attrib.get("name", f"Sheet {index}")
            index += 1
    return names


def _xlsx_sheet_rows(
    archive: zipfile.ZipFile,
    sheet_path: str,
    shared_strings: list[str],
) -> list[list[str]]:
    root = ET.fromstring(archive.read(sheet_path))
    rows: list[list[str]] = []
    for row_node in root.iter():
        if _local_name(row_node.tag) != "row":
            continue
        row: list[str] = []
        for cell in row_node:
            if _local_name(cell.tag) != "c":
                continue
            row.append(_xlsx_cell_text(cell, shared_strings))
        rows.append(row)
    return rows


def _xlsx_cell_text(cell: ET.Element, shared_strings: list[str]) -> str:
    cell_type = cell.attrib.get("t")
    value = ""
    for child in cell:
        if _local_name(child.tag) == "v":
            value = child.text or ""
            break
        if _local_name(child.tag) == "is":
            parts = [node.text or "" for node in child.iter() if _local_name(node.tag) == "t"]
            value = "".join(parts)
            break
    if cell_type == "s" and value.isdigit():
        index = int(value)
        return shared_strings[index] if index < len(shared_strings) else ""
    return value


def _local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]
