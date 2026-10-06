import tempfile
import unittest
from pathlib import Path

from ai.knowledge_ingestion import ingest_pdfs


class PdfKnowledgeTests(unittest.TestCase):
    def test_ingestion_requires_existing_sources(self):
        with self.assertRaises(FileNotFoundError):
            ingest_pdfs(["missing.pdf"], Path(tempfile.gettempdir()) / "ezrab-index.json")

    def test_generated_schema_is_stable(self):
        source = Path(__file__).parents[1] / "knowledge" / "pdf_index.json"
        if not source.is_file():
            self.skipTest("PDF fixtures have not been ingested in this checkout")
        import json
        payload = json.loads(source.read_text(encoding="utf-8"))
        self.assertGreaterEqual(len(payload["documents"]), 2)
        counts = {document["source_file"]: sum(entry["source_file"] == document["source_file"] for entry in payload["entries"]) for document in payload["documents"]}
        self.assertEqual(counts["EZRAB_1000_Pertanyaan_Jawaban_Co_Assistant.pdf"], 1000)
        self.assertEqual(counts["EZRAB_200_Pertanyaan_Aneh_Jawaban_Humor.pdf"], 200)
        required = {"id", "document_id", "source_file", "page_number", "question", "answer", "intent", "keywords"}
        self.assertTrue(required.issubset(payload["entries"][0]))


if __name__ == "__main__":
    unittest.main()
