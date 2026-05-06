from app.services.rag.chunking import chunk_text


def test_chunk_text_preserves_markdown_section_metadata():
    text = """
**FACTS:**
The applicant alleges that the respondent entered the warehouse at night.
The CCTV footage and inventory register are material.

**EVIDENCE:**
Exhibit P1 is CCTV footage from the loading bay.
Exhibit P2 is the inventory register.
"""

    chunks = chunk_text(text, {"source": "case_details"}, chunk_size=140, chunk_overlap=20)

    assert chunks
    assert {chunk.metadata["section_title"] for chunk in chunks} >= {"FACTS", "EVIDENCE"}
    assert all(chunk.metadata["source"] == "case_details" for chunk in chunks)
    assert all(chunk.content.strip() for chunk in chunks)
