from pathlib import Path
import zipfile

from app.services.documents import extract_text, parse_document


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


def test_parse_markdown_preserves_sections():
    parsed = parse_document("notes.md", b"# Intro\n\nHello\n\n## Details\n\nWorld")

    assert [block.section for block in parsed.blocks] == ["Intro", "Details"]
    assert all(block.parser == "markdown" for block in parsed.blocks)
    assert "Hello" in parsed.text
    assert "World" in parsed.text


def test_parse_csv_as_table_block():
    parsed = parse_document("sales.csv", b"Region,Actual\nNorth,2.8M\nSouth,1.5M\n")

    assert len(parsed.blocks) == 1
    block = parsed.blocks[0]
    assert block.content_type == "table"
    assert block.parser == "csv"
    assert "| Region | Actual |" in block.text
    assert "| North | 2.8M |" in block.text
    assert block.metadata["rows"] == 2


def test_parse_tsv_as_table_block():
    parsed = parse_document("sales.tsv", b"Region\tActual\nNorth\t2.8M\n")

    block = parsed.blocks[0]
    assert block.parser == "tsv"
    assert block.metadata["delimiter"] == "\t"
    assert "| North | 2.8M |" in block.text


def test_parse_xlsx_as_table_block(tmp_path: Path):
    path = tmp_path / "sample.xlsx"
    with zipfile.ZipFile(path, "w") as archive:
        archive.writestr(
            "xl/workbook.xml",
            """
            <workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
              xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
              <sheets><sheet name="Ledger" sheetId="1" r:id="rId1"/></sheets>
            </workbook>
            """,
        )
        archive.writestr(
            "xl/worksheets/sheet1.xml",
            """
            <worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
              <sheetData>
                <row>
                  <c t="inlineStr"><is><t>Account</t></is></c>
                  <c t="inlineStr"><is><t>Balance</t></is></c>
                </row>
                <row>
                  <c t="inlineStr"><is><t>Cash</t></is></c>
                  <c><v>1200</v></c>
                </row>
              </sheetData>
            </worksheet>
            """,
        )

    parsed = parse_document("ledger.xlsx", path.read_bytes())

    assert len(parsed.blocks) == 1
    block = parsed.blocks[0]
    assert block.parser == "xlsx"
    assert block.section == "Ledger"
    assert "| Account | Balance |" in block.text
    assert "| Cash | 1200 |" in block.text
